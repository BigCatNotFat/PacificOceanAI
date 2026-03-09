/**
 * GeminiProvider - 基于 Gemini 原生 REST API 实现
 *
 * 使用 Google Gemini 原生 API（generativelanguage.googleapis.com）
 * 端点：/v1beta/models/{model}:streamGenerateContent?alt=sse&key={API_KEY}
 *
 * Gemini 原生 API 关键特性：
 * - 认证：API Key 放在 URL 查询参数中（?key=...）
 * - 消息格式：contents[].role("user"/"model") + parts[]
 * - 系统提示：systemInstruction 独立字段
 * - 工具调用：tools[].functionDeclarations[]
 * - 工具结果：parts[].functionResponse
 * - 思考过程：thinkingConfig.includeThoughts + parts[].thought 标记
 * - 流式传输：?alt=sse 返回标准 SSE 格式
 */

import type { LLMMessage, LLMConfig, LLMFinalMessage, ContentPart } from '../../../platform/llm/ILLMService';
import { getTextContent } from '../../../platform/llm/ILLMService';
import type { IModelRegistryService } from '../../../platform/llm/IModelRegistryService';
import { BaseLLMProvider, type APIConfig } from './BaseLLMProvider';
import type { IUIStreamService } from '../../../platform/agent/IUIStreamService';

export class GeminiProvider extends BaseLLMProvider {
  /**
   * 缓存 thought_signature：tool call ID → signature
   * Gemini 3 要求在多轮工具调用中回传 thought_signature，否则 400。
   */
  private readonly thoughtSigCache = new Map<string, string>();
  /** 缓存工具调用 ID → 工具名称，用于 functionResponse.name */
  private readonly toolNameCache = new Map<string, string>();

  constructor(
    private readonly modelRegistry: IModelRegistryService,
    private readonly uiStreamService: IUIStreamService,
    private readonly apiConfig: APIConfig
  ) {
    super();
  }

  async chat(messages: LLMMessage[], config: LLMConfig): Promise<LLMFinalMessage> {
    const { endpoint, headers, body } = this.buildRequest(messages, config, true);

    let response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: (config as any).abortSignal
    });

    // 如果 thinkingConfig 不被支持，去掉后重试
    if (!response.ok && body.thinkingConfig) {
      const errorText = await response.text();
      if (errorText.includes('thinkingConfig')) {
        delete body.thinkingConfig;
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: (config as any).abortSignal
        });
      } else {
        throw new Error(`Gemini API 请求失败: ${response.status} ${errorText}`);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API 请求失败: ${response.status} ${errorText}`);
    }

    return await this.parseStreamResponse(response, config);
  }

  async managerChat(messages: LLMMessage[], config: LLMConfig): Promise<LLMFinalMessage> {
    const { endpoint, headers, body } = this.buildRequest(messages, config, false);

    let response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: (config as any).abortSignal
    });

    if (!response.ok && body.thinkingConfig) {
      const errorText = await response.text();
      if (errorText.includes('thinkingConfig')) {
        delete body.thinkingConfig;
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: (config as any).abortSignal
        });
      } else {
        throw new Error(`Gemini API 请求失败: ${response.status} ${errorText}`);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API 请求失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return this.parseNonStreamResponse(data);
  }

  // ==================== 消息格式转换 ====================

  /**
   * 将 LLMMessage[] 转换为 Gemini 原生 contents[] 格式
   *
   * LLMMessage:
   *   { role: "system"|"user"|"assistant"|"tool", content, tool_calls?, tool_call_id? }
   *
   * Gemini contents:
   *   { role: "user"|"model", parts: [{ text }, { functionCall }, { functionResponse }] }
   *   systemInstruction 单独提取
   */
  private toGeminiFormat(messages: LLMMessage[]): {
    systemInstruction: any | null;
    contents: any[];
  } {
    let systemInstruction: any | null = null;
    const contents: any[] = [];

    for (const msg of messages) {
      // system → systemInstruction（取最后一个）
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: getTextContent(msg.content) || '' }] };
        continue;
      }

      // tool result → user 角色 + functionResponse part
      if (msg.role === 'tool') {
        const textContent = getTextContent(msg.content);
        let responseData: any;
        try { responseData = JSON.parse(textContent || '{}'); }
        catch { responseData = { result: textContent || '' }; }

        const tcId = (msg as any).tool_call_id || '';
        const toolName = this.toolNameCache.get(tcId) || tcId;
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: toolName,
              response: responseData
            }
          }]
        });
        continue;
      }

      // assistant with tool_calls → model 角色 + functionCall parts（含 thought_signature 回传）
      if (msg.role === 'assistant' && (msg as any).tool_calls?.length > 0) {
        const parts: any[] = [];
        const textContent = getTextContent(msg.content);
        if (textContent) {
          parts.push({ text: textContent });
        }
        for (const tc of (msg as any).tool_calls) {
          const tcId = tc.id || '';
          const name = tc.function?.name || tc.name || '';
          let args: any;
          if (typeof tc.function?.arguments === 'string') {
            try { args = JSON.parse(tc.function.arguments); }
            catch { args = {}; }
          } else {
            args = tc.function?.arguments || tc.arguments || {};
          }
          const part: any = { functionCall: { name, args } };
          // 回传缓存的 thought_signature（同时写两种命名确保兼容）
          const sig = this.thoughtSigCache.get(tcId);
          if (sig) {
            part.thoughtSignature = sig;
            part.thought_signature = sig;
          }
          parts.push(part);
        }
        contents.push({ role: 'model', parts });
        continue;
      }

      // user → user, assistant → model — 支持多模态 ContentPart[]
      const role = msg.role === 'assistant' ? 'model' : 'user';
      if (Array.isArray(msg.content)) {
        const parts: any[] = [];
        for (const part of msg.content as ContentPart[]) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url') {
            const url = part.image_url.url;
            if (url.startsWith('data:')) {
              const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
              if (match) {
                parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
              }
            } else {
              parts.push({ fileData: { mimeType: 'image/jpeg', fileUri: url } });
            }
          }
        }
        contents.push({ role, parts });
      } else {
        contents.push({ role, parts: [{ text: msg.content || '' }] });
      }
    }

    // Gemini 要求 contents 不能以 model 开头，必须 user 先说
    // 也不能有连续两个相同 role，需要合并
    const merged = this.mergeConsecutiveRoles(contents);

    return { systemInstruction, contents: merged };
  }

  /**
   * Gemini 不允许连续两个相同 role 的 content，需要合并 parts
   */
  private mergeConsecutiveRoles(contents: any[]): any[] {
    if (contents.length === 0) return contents;

    const result: any[] = [contents[0]];
    for (let i = 1; i < contents.length; i++) {
      const prev = result[result.length - 1];
      const curr = contents[i];
      if (prev.role === curr.role) {
        prev.parts = [...prev.parts, ...curr.parts];
      } else {
        result.push(curr);
      }
    }
    return result;
  }

  // ==================== 构建请求 ====================

  private buildRequest(
    messages: LLMMessage[],
    config: LLMConfig,
    stream: boolean
  ): { endpoint: string; headers: Record<string, string>; body: any } {
    const filtered = this.formatMessages(messages);
    const { systemInstruction, contents } = this.toGeminiFormat(filtered);

    const payload: any = { contents };

    if (systemInstruction) {
      payload.systemInstruction = systemInstruction;
    }

    // 生成配置
    payload.generationConfig = {};
    if (typeof config.temperature === 'number') {
      payload.generationConfig.temperature = config.temperature;
    }
    if (typeof config.topP === 'number') {
      payload.generationConfig.topP = config.topP;
    }
    if (typeof config.maxTokens === 'number') {
      payload.generationConfig.maxOutputTokens = config.maxTokens;
    }

    // 思考配置：仅对支持思考的模型启用（Gemini 2.5+ / 3.x 的 flash/pro 系列）
    const modelId = config.modelId.toLowerCase();
    const supportsThinking = /gemini.*(2\.5|3|flash|pro)/.test(modelId)
      && !modelId.includes('nano');
    if (supportsThinking) {
      payload.thinkingConfig = { includeThoughts: true };
    }

    // 工具调用：转换为 Gemini 的 functionDeclarations 格式
    const tools = (config as any).tools;
    if (Array.isArray(tools) && tools.length > 0) {
      const declarations = tools.map((t: any) => {
        const fn = t.function || t;
        return {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters
        };
      });
      payload.tools = [{ functionDeclarations: declarations }];
    }

    // 构建端点 URL
    const normalizedBaseUrl = this.apiConfig.baseUrl.endsWith('/')
      ? this.apiConfig.baseUrl.slice(0, -1)
      : this.apiConfig.baseUrl;

    // 支持两种 base URL 格式：
    // 1. https://generativelanguage.googleapis.com/v1beta (标准)
    // 2. https://generativelanguage.googleapis.com/v1beta/openai (旧格式，需去掉 /openai)
    const base = normalizedBaseUrl.replace(/\/openai\/?$/, '');

    const method = stream ? 'streamGenerateContent' : 'generateContent';
    const sseParam = stream ? '&alt=sse' : '';
    const endpoint = `${base}/models/${config.modelId}:${method}?key=${this.apiConfig.apiKey}${sseParam}`;

    return {
      endpoint,
      headers: { 'Content-Type': 'application/json' },
      body: payload
    };
  }

  // ==================== 解析非流式响应 ====================

  private parseNonStreamResponse(data: any): LLMFinalMessage {
    const candidate = data?.candidates?.[0];
    const parts: any[] = candidate?.content?.parts || [];

    const result: LLMFinalMessage = {
      content: '',
      finishReason: this.mapFinishReason(candidate?.finishReason)
    };

    let thinking = '';
    let content = '';
    const toolCalls: { id: string; name: string; arguments: Record<string, any> }[] = [];

    for (const part of parts) {
      if (part.thought && part.text) {
        thinking += part.text;
      } else if (part.text) {
        content += part.text;
      } else if (part.functionCall) {
        const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const toolName = part.functionCall.name || '';
        toolCalls.push({ id: callId, name: toolName, arguments: part.functionCall.args || {} });
        const sig = part.thoughtSignature ?? part.thought_signature
          ?? part.functionCall?.thoughtSignature ?? part.functionCall?.thought_signature;
        if (sig) {
          this.thoughtSigCache.set(callId, sig);
        }
        this.toolNameCache.set(callId, toolName);
      }
    }

    result.content = content;
    if (thinking) result.thinking = thinking;
    if (toolCalls.length > 0) result.toolCalls = toolCalls;

    if (data.usageMetadata) {
      result.usage = {
        promptTokens: data.usageMetadata.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata.totalTokenCount ?? 0
      };
    }

    return result;
  }

  // ==================== 解析流式响应 ====================

  /**
   * Gemini 流式响应（?alt=sse）格式：
   *   data: {"candidates":[{"content":{"parts":[{"text":"..."}],"role":"model"}}]}
   *   data: {"candidates":[{"content":{"parts":[{"text":"...","thought":true}],"role":"model"}}]}
   *   data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"...","args":{...}}}]}}]}
   *   data: {"usageMetadata":{...},"candidates":[{"finishReason":"STOP",...}]}
   */
  private async parseStreamResponse(
    response: Response,
    config: LLMConfig
  ): Promise<LLMFinalMessage> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法获取响应流');

    const decoder = new TextDecoder();
    const conversationId = config.uiStreamMeta?.conversationId;
    const messageId = config.uiStreamMeta?.messageId;

    let fullContent = '';
    let fullThinking = '';
    const toolCalls: { id: string; name: string; args: any }[] = [];
    let finishReason: LLMFinalMessage['finishReason'];
    let usage: LLMFinalMessage['usage'];

    try {
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trim();
          if (!dataStr || dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const candidate = parsed?.candidates?.[0];
            const parts: any[] = candidate?.content?.parts || [];

            // 先扫描所有 parts 收集 thought_signature（可能和 functionCall 分开到达）
            let chunkSig: string | undefined;
            for (const p of parts) {
              const s = p.thoughtSignature ?? p.thought_signature;
              if (s) { chunkSig = s; break; }
            }

            for (const part of parts) {
              // 思考内容（part.thought === true）
              if (part.thought && part.text) {
                fullThinking += part.text;
                if (this.uiStreamService && messageId) {
                  this.uiStreamService.pushThinking({
                    conversationId, messageId, delta: part.text
                  });
                }
              }
              // 普通文本内容
              else if (part.text) {
                fullContent += part.text;
                if (this.uiStreamService && messageId) {
                  this.uiStreamService.pushContent({
                    conversationId, messageId, delta: part.text
                  });
                }
              }
              // 工具调用（捕获 thought_signature / thoughtSignature 供下一轮回传）
              else if (part.functionCall) {
                const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                const toolName = part.functionCall.name || '';
                toolCalls.push({
                  id: callId,
                  name: toolName,
                  args: part.functionCall.args || {}
                });
                // Gemini REST API 可能用 camelCase(thoughtSignature) 或 snake_case(thought_signature)
                // 可能在 part 上、functionCall 内、或同一 chunk 的其他 part 上
                const sig = part.thoughtSignature ?? part.thought_signature
                  ?? part.functionCall?.thoughtSignature ?? part.functionCall?.thought_signature
                  ?? chunkSig;
                if (sig) {
                  this.thoughtSigCache.set(callId, sig);
                }
                this.toolNameCache.set(callId, toolName);

                if (this.uiStreamService && messageId) {
                  this.uiStreamService.pushToolCall({
                    conversationId, messageId,
                    toolCallId: callId,
                    phase: 'args',
                    name: toolName,
                    argsDelta: JSON.stringify(part.functionCall.args || {})
                  });
                  this.uiStreamService.pushToolCall({
                    conversationId, messageId,
                    toolCallId: callId,
                    phase: 'end'
                  });
                }
              }
            }

            // 完成原因 + 最终兜底扫描签名
            if (candidate?.finishReason) {
              finishReason = this.mapFinishReason(candidate.finishReason);
              // 最终 chunk 可能包含签名，补给缺失签名的工具调用
              if (chunkSig) {
                for (const tc of toolCalls) {
                  if (!this.thoughtSigCache.has(tc.id)) {
                    this.thoughtSigCache.set(tc.id, chunkSig);
                  }
                }
              }
            }

            // 使用统计
            if (parsed.usageMetadata) {
              usage = {
                promptTokens: parsed.usageMetadata.promptTokenCount ?? 0,
                completionTokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: parsed.usageMetadata.totalTokenCount ?? 0
              };
            }
          } catch {
            // JSON 解析失败，跳过
          }
        }
      }

      // 发送完成信号
      if (this.uiStreamService && messageId) {
        if (fullThinking) {
          this.uiStreamService.pushThinking({
            conversationId, messageId, delta: '', done: true
          });
        }
        if (fullContent) {
          this.uiStreamService.pushContent({
            conversationId, messageId, delta: '', done: true
          });
        }
      }

      const result: LLMFinalMessage = {
        content: fullContent,
        finishReason,
        usage
      };

      if (fullThinking) result.thinking = fullThinking;

      if (toolCalls.length > 0) {
        result.toolCalls = toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          arguments: typeof tc.args === 'object' ? tc.args : {}
        }));
      }

      return result;
    } finally {
      reader.releaseLock();
    }
  }

  // ==================== 工具方法 ====================

  private mapFinishReason(reason?: string): LLMFinalMessage['finishReason'] {
    if (!reason) return undefined;
    switch (reason) {
      case 'STOP': return 'stop';
      case 'MAX_TOKENS': return 'length';
      case 'SAFETY': return 'content_filter';
      default: return 'stop';
    }
  }
}
