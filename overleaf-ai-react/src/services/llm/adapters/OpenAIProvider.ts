/**
 * OpenAIProvider - 基于 Responses API 实现
 *
 * 使用 OpenAI Responses API (/v1/responses) 而非旧的 Chat Completions API，
 * 以支持推理模型的思考过程输出（reasoning summary）。
 *
 * Responses API 关键差异：
 * - 端点：/v1/responses
 * - 消息字段：input（而非 messages）
 * - 推理配置：reasoning.effort + reasoning.summary
 * - token 限制：max_output_tokens（而非 max_completion_tokens）
 * - 工具格式：扁平化（name/description/parameters 直接在对象上）
 * - SSE 事件：带 event: 类型前缀
 */

import type { LLMMessage, LLMConfig, LLMFinalMessage } from '../../../platform/llm/ILLMService';
import type { IModelRegistryService } from '../../../platform/llm/IModelRegistryService';
import { BaseLLMProvider, type APIConfig } from './BaseLLMProvider';
import type { IUIStreamService } from '../../../platform/agent/IUIStreamService';

export class OpenAIProvider extends BaseLLMProvider {
  constructor(
    private readonly modelRegistry: IModelRegistryService,
    private readonly uiStreamService: IUIStreamService,
    private readonly apiConfig: APIConfig
  ) {
    super();
  }

  async chat(messages: LLMMessage[], config: LLMConfig): Promise<LLMFinalMessage> {
    const { endpoint, headers, body } = this.buildRequest(messages, config, true);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: (config as any).abortSignal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API 请求失败: ${response.status} ${errorText}`);
    }

    return await this.parseStreamResponse(response, config);
  }

  async managerChat(messages: LLMMessage[], config: LLMConfig): Promise<LLMFinalMessage> {
    const { endpoint, headers, body } = this.buildRequest(messages, config, false);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: (config as any).abortSignal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API 请求失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return this.parseNonStreamResponse(data);
  }

  // ==================== 构建请求 ====================

  /**
   * 将 Chat Completions 格式的消息转换为 Responses API 的 input 格式
   *
   * Chat Completions:
   *   { role: "system", content }
   *   { role: "assistant", content, tool_calls: [{ id, function: { name, arguments } }] }
   *   { role: "tool", tool_call_id, content }
   *
   * Responses API:
   *   { role: "developer", content }
   *   { role: "assistant", content }
   *   { type: "function_call", call_id, name, arguments }
   *   { type: "function_call_output", call_id, output }
   */
  private toResponsesInput(messages: LLMMessage[]): any[] {
    const result: any[] = [];

    for (const msg of messages) {
      // system → developer
      if (msg.role === 'system') {
        result.push({ role: 'developer', content: msg.content || '' });
        continue;
      }

      // tool result → function_call_output
      if (msg.role === 'tool') {
        result.push({
          type: 'function_call_output',
          call_id: (msg as any).tool_call_id || '',
          output: msg.content || ''
        });
        continue;
      }

      // assistant with tool_calls → split
      if (msg.role === 'assistant' && (msg as any).tool_calls?.length > 0) {
        if (msg.content) {
          result.push({ role: 'assistant', content: msg.content });
        }
        for (const tc of (msg as any).tool_calls) {
          result.push({
            type: 'function_call',
            call_id: tc.id || '',
            name: tc.function?.name || tc.name || '',
            arguments: typeof tc.function?.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function?.arguments || tc.arguments || {})
          });
        }
        continue;
      }

      // user / assistant (normal)
      result.push({
        role: msg.role,
        content: msg.content || ''
      });
    }

    return result;
  }

  private buildRequest(
    messages: LLMMessage[],
    config: LLMConfig,
    stream: boolean
  ): { endpoint: string; headers: Record<string, string>; body: any } {
    const filtered = this.formatMessages(messages);
    const input = this.toResponsesInput(filtered);

    // 确定推理深度
    const effort = config.reasoningEffort || 'medium';

    const payload: any = {
      model: config.modelId,
      input,
      stream,
      reasoning: {
        effort,
        summary: 'auto'
      }
    };

    // OpenAI 规定：GPT-5.2+ 当 reasoning.effort 不为 none 时，
    // 不允许发送 temperature / top_p，否则返回 400
    if (effort === 'none') {
      if (typeof config.temperature === 'number') {
        payload.temperature = config.temperature;
      }
      if (typeof config.topP === 'number') {
        payload.top_p = config.topP;
      }
    }

    if (typeof config.maxTokens === 'number') {
      payload.max_output_tokens = config.maxTokens;
    }

    // 工具调用（Responses API 的工具格式是扁平的）
    const tools = (config as any).tools;
    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools.map((t: any) => {
        const fn = t.function || t;
        return {
          type: 'function',
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
          strict: fn.strict ?? false
        };
      });
      const toolChoice = (config as any).tool_choice;
      if (toolChoice) {
        payload.tool_choice = toolChoice;
      }
    }

    const normalizedBaseUrl = this.apiConfig.baseUrl.endsWith('/')
      ? this.apiConfig.baseUrl.slice(0, -1)
      : this.apiConfig.baseUrl;

    // /v1/responses 端点
    const base = normalizedBaseUrl.replace(/\/v1$/, '');

    return {
      endpoint: `${base}/v1/responses`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiConfig.apiKey}`
      },
      body: payload
    };
  }

  // ==================== 解析非流式响应 ====================

  private parseNonStreamResponse(data: any): LLMFinalMessage {
    const result: LLMFinalMessage = {
      content: '',
      finishReason: data.status === 'completed' ? 'stop' : 'length'
    };

    const output: any[] = data.output || [];

    for (const item of output) {
      if (item.type === 'reasoning' && item.summary) {
        const texts = item.summary
          .filter((s: any) => s.type === 'summary_text')
          .map((s: any) => s.text);
        if (texts.length > 0) {
          result.thinking = texts.join('\n');
        }
      }

      if (item.type === 'message' && item.role === 'assistant') {
        const textParts = (item.content || [])
          .filter((c: any) => c.type === 'output_text')
          .map((c: any) => c.text);
        result.content = textParts.join('');
      }

      if (item.type === 'function_call') {
        if (!result.toolCalls) result.toolCalls = [];
        let parsedArgs: Record<string, any> = {};
        try { parsedArgs = JSON.parse(item.arguments || '{}'); } catch { /* ignore */ }
        result.toolCalls.push({
          id: item.call_id || item.id,
          name: item.name,
          arguments: parsedArgs
        });
      }
    }

    if (data.usage) {
      result.usage = {
        promptTokens: data.usage.input_tokens ?? 0,
        completionTokens: data.usage.output_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0
      };
    }

    return result;
  }

  // ==================== 解析流式响应 ====================

  /**
   * Responses API SSE 事件格式：
   *   event: response.reasoning_summary_text.delta
   *   data: { "delta": "...", ... }
   *
   *   event: response.output_text.delta
   *   data: { "delta": "...", ... }
   *
   *   event: response.function_call_arguments.delta
   *   data: { "delta": "...", "item_id": "...", ... }
   *
   *   event: response.completed
   *   data: { ... full response ... }
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
    let thinkingDone = false;
    let contentDone = false;
    // key = item.id（流式 delta 用的标识符），value.callId = call_id（回传给上层用于匹配工具结果）
    const toolCallsMap = new Map<string, { itemId: string; callId: string; name: string; args: string }>();
    let finishReason: LLMFinalMessage['finishReason'];
    let usage: LLMFinalMessage['usage'];

    try {
      let buffer = '';
      let currentEventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          // 解析 event: 行
          if (trimmed.startsWith('event:')) {
            currentEventType = trimmed.slice(6).trim();
            continue;
          }

          // 解析 data: 行
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (!dataStr || dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);

            switch (currentEventType) {
              // 思考摘要增量
              case 'response.reasoning_summary_text.delta': {
                const delta = parsed.delta;
                if (delta) {
                  fullThinking += delta;
                  if (this.uiStreamService && messageId) {
                    this.uiStreamService.pushThinking({
                      conversationId, messageId, delta
                    });
                  }
                }
                break;
              }

              // 思考摘要完成
              case 'response.reasoning_summary_text.done': {
                if (this.uiStreamService && messageId && fullThinking && !thinkingDone) {
                  thinkingDone = true;
                  this.uiStreamService.pushThinking({
                    conversationId, messageId, delta: '', done: true
                  });
                }
                break;
              }

              // 内容增量
              case 'response.output_text.delta': {
                const delta = parsed.delta;
                if (delta) {
                  fullContent += delta;
                  if (this.uiStreamService && messageId) {
                    this.uiStreamService.pushContent({
                      conversationId, messageId, delta
                    });
                  }
                }
                break;
              }

              // 内容完成
              case 'response.output_text.done': {
                if (this.uiStreamService && messageId && fullContent && !contentDone) {
                  contentDone = true;
                  this.uiStreamService.pushContent({
                    conversationId, messageId, delta: '', done: true
                  });
                }
                break;
              }

              // 新输出项（可能是 function_call）
              case 'response.output_item.added': {
                if (parsed.item?.type === 'function_call') {
                  const item = parsed.item;
                  // item.id 是流式 delta 事件的查找 key
                  // item.call_id 是回传给上层做工具结果匹配的 key
                  const itemId = item.id || `tool_${toolCallsMap.size}`;
                  const callId = item.call_id || itemId;
                  toolCallsMap.set(itemId, {
                    itemId,
                    callId,
                    name: item.name || '',
                    args: ''
                  });
                  if (this.uiStreamService && messageId) {
                    this.uiStreamService.pushToolCall({
                      conversationId, messageId,
                      toolCallId: callId,
                      phase: 'args',
                      name: item.name || ''
                    });
                  }
                }
                break;
              }

              // 工具调用参数增量
              case 'response.function_call_arguments.delta': {
                const delta = parsed.delta || '';
                const itemId = parsed.item_id;
                if (itemId && delta) {
                  const existing = toolCallsMap.get(itemId);
                  if (existing) {
                    existing.args += delta;
                    if (this.uiStreamService && messageId) {
                      this.uiStreamService.pushToolCall({
                        conversationId, messageId,
                        toolCallId: existing.callId,
                        phase: 'args',
                        name: existing.name,
                        argsDelta: delta
                      });
                    }
                  }
                }
                break;
              }

              // 工具调用参数完成
              case 'response.function_call_arguments.done': {
                const itemId = parsed.item_id;
                if (itemId) {
                  const existing = toolCallsMap.get(itemId);
                  if (existing && this.uiStreamService && messageId) {
                    this.uiStreamService.pushToolCall({
                      conversationId, messageId,
                      toolCallId: existing.callId,
                      phase: 'end'
                    });
                  }
                }
                break;
              }

              // 响应完成
              case 'response.completed': {
                const resp = parsed.response || parsed;
                finishReason = resp.status === 'completed' ? 'stop' : 'length';
                if (resp.usage) {
                  usage = {
                    promptTokens: resp.usage.input_tokens ?? 0,
                    completionTokens: resp.usage.output_tokens ?? 0,
                    totalTokens: resp.usage.total_tokens ?? 0
                  };
                }
                break;
              }

              default:
                break;
            }

            currentEventType = '';
          } catch {
            // JSON 解析失败，跳过
          }
        }
      }

      // 兜底：确保发送完成信号（仅在事件中未发送时）
      if (this.uiStreamService && messageId) {
        if (fullThinking && !thinkingDone) {
          this.uiStreamService.pushThinking({
            conversationId, messageId, delta: '', done: true
          });
        }
        if (fullContent && !contentDone) {
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

      if (fullThinking) {
        result.thinking = fullThinking;
      }

      if (toolCallsMap.size > 0) {
        result.toolCalls = Array.from(toolCallsMap.values())
          .filter(tc => tc.name.trim().length > 0)
          .map(tc => {
            let parsedArgs: Record<string, any> = {};
            if (tc.args) {
              try { parsedArgs = JSON.parse(tc.args); }
              catch {
                try { parsedArgs = JSON.parse(tc.args + '}'); }
                catch { parsedArgs = {}; }
              }
            }
            return { id: tc.callId, name: tc.name, arguments: parsedArgs };
          });
      }

      return result;
    } finally {
      reader.releaseLock();
    }
  }
}
