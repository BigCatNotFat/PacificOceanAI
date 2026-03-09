/**
 * CodexOAuthProvider - 基于 ChatGPT OAuth 订阅的 LLM Provider
 *
 * 通过 ChatGPT 订阅认证调用 OpenAI Codex 模型，使用 Responses API 格式。
 * API 端点为 chatgpt.com/backend-api/codex/responses，与标准 OpenAI API 不同。
 *
 * 所有请求通过 Background Service Worker 代理，避免 CORS 限制。
 */

import type { LLMMessage, LLMConfig, LLMFinalMessage } from '../../../platform/llm/ILLMService';
import type { IModelRegistryService } from '../../../platform/llm/IModelRegistryService';
import { BaseLLMProvider } from './BaseLLMProvider';
import type { IUIStreamService } from '../../../platform/agent/IUIStreamService';

const CODEX_BASE_URL = 'https://chatgpt.com/backend-api';

export interface CodexOAuthConfig {
  accessToken: string;
  chatgptAccountId: string;
}

export class CodexOAuthProvider extends BaseLLMProvider {
  constructor(
    private readonly modelRegistry: IModelRegistryService,
    private readonly uiStreamService: IUIStreamService,
    private readonly oauthConfig: CodexOAuthConfig
  ) {
    super();
  }

  // ==================== 公共方法 ====================

  async chat(messages: LLMMessage[], config: LLMConfig): Promise<LLMFinalMessage> {
    const { endpoint, headers, body } = this.buildRequest(messages, config, true);
    return this.streamViaBackground(endpoint, headers, body, config);
  }

  async managerChat(messages: LLMMessage[], config: LLMConfig): Promise<LLMFinalMessage> {
    const { endpoint, headers, body } = this.buildRequest(messages, config, false);

    const response: any = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'codex-fetch-json', url: endpoint, headers, body: JSON.stringify(body) },
        resolve
      );
    });

    if (!response?.ok) {
      throw new Error(`Codex API 请求失败: ${response?.status || ''} ${response?.body || '未知错误'}`);
    }

    return this.parseNonStreamResponse(response.data);
  }

  // ==================== 通过 Background 代理的流式请求 ====================

  private streamViaBackground(
    endpoint: string,
    headers: Record<string, string>,
    body: any,
    config: LLMConfig
  ): Promise<LLMFinalMessage> {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'codex-fetch-stream' });

      const conversationId = config.uiStreamMeta?.conversationId;
      const messageId = config.uiStreamMeta?.messageId;

      let buffer = '';
      let currentEventType = '';
      let fullContent = '';
      let fullThinking = '';
      let thinkingDone = false;
      let contentDone = false;
      const toolCallsMap = new Map<string, { itemId: string; callId: string; name: string; args: string }>();
      let finishReason: LLMFinalMessage['finishReason'];
      let usage: LLMFinalMessage['usage'];

      const processSSELine = (line: string) => {
        const trimmed = line.trim();

        if (trimmed.startsWith('event:')) {
          currentEventType = trimmed.slice(6).trim();
          return;
        }

        if (!trimmed.startsWith('data:')) return;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') return;

        try {
          const parsed = JSON.parse(dataStr);

          switch (currentEventType) {
            case 'response.reasoning_summary_text.delta': {
              const delta = parsed.delta;
              if (delta) {
                fullThinking += delta;
                if (this.uiStreamService && messageId) {
                  this.uiStreamService.pushThinking({ conversationId, messageId, delta });
                }
              }
              break;
            }

            case 'response.reasoning_summary_text.done': {
              if (this.uiStreamService && messageId && fullThinking && !thinkingDone) {
                thinkingDone = true;
                this.uiStreamService.pushThinking({ conversationId, messageId, delta: '', done: true });
              }
              break;
            }

            case 'response.output_text.delta': {
              const delta = parsed.delta;
              if (delta) {
                fullContent += delta;
                if (this.uiStreamService && messageId) {
                  this.uiStreamService.pushContent({ conversationId, messageId, delta });
                }
              }
              break;
            }

            case 'response.output_text.done': {
              if (this.uiStreamService && messageId && fullContent && !contentDone) {
                contentDone = true;
                this.uiStreamService.pushContent({ conversationId, messageId, delta: '', done: true });
              }
              break;
            }

            case 'response.output_item.added': {
              if (parsed.item?.type === 'function_call') {
                const item = parsed.item;
                const itemId = item.id || `tool_${toolCallsMap.size}`;
                const callId = item.call_id || itemId;
                toolCallsMap.set(itemId, { itemId, callId, name: item.name || '', args: '' });
                if (this.uiStreamService && messageId) {
                  this.uiStreamService.pushToolCall({
                    conversationId, messageId,
                    toolCallId: callId, phase: 'args', name: item.name || ''
                  });
                }
              }
              break;
            }

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
                      toolCallId: existing.callId, phase: 'args',
                      name: existing.name, argsDelta: delta
                    });
                  }
                }
              }
              break;
            }

            case 'response.function_call_arguments.done': {
              const itemId = parsed.item_id;
              if (itemId) {
                const existing = toolCallsMap.get(itemId);
                if (existing && this.uiStreamService && messageId) {
                  this.uiStreamService.pushToolCall({
                    conversationId, messageId,
                    toolCallId: existing.callId, phase: 'end'
                  });
                }
              }
              break;
            }

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
      };

      const buildResult = (): LLMFinalMessage => {
        if (this.uiStreamService && messageId) {
          if (fullThinking && !thinkingDone) {
            this.uiStreamService.pushThinking({ conversationId, messageId, delta: '', done: true });
          }
          if (fullContent && !contentDone) {
            this.uiStreamService.pushContent({ conversationId, messageId, delta: '', done: true });
          }
        }

        const result: LLMFinalMessage = { content: fullContent, finishReason, usage };
        if (fullThinking) result.thinking = fullThinking;

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
      };

      port.onMessage.addListener((msg: any) => {
        if (msg.type === 'data') {
          buffer += msg.chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            processSSELine(line);
          }
        } else if (msg.type === 'end') {
          if (buffer.trim()) processSSELine(buffer);
          resolve(buildResult());
        } else if (msg.type === 'error') {
          reject(new Error(`Codex API 请求失败: ${msg.status || ''} ${msg.body || '未知错误'}`));
        }
      });

      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(`后台连接断开: ${chrome.runtime.lastError.message}`));
        }
      });

      port.postMessage({
        url: endpoint,
        headers,
        body: JSON.stringify(body)
      });
    });
  }

  // ==================== Responses API 消息格式转换 ====================

  private toResponsesInput(messages: LLMMessage[]): any[] {
    const result: any[] = [];

    for (const msg of messages) {
      // system 消息已提取到顶层 instructions 字段，跳过
      if (msg.role === 'system') continue;

      if (msg.role === 'tool') {
        result.push({
          type: 'function_call_output',
          call_id: (msg as any).tool_call_id || '',
          output: msg.content || ''
        });
        continue;
      }

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

      result.push({ role: msg.role, content: msg.content || '' });
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

    // Codex 后端要求 system prompt 放在顶层 instructions 字段
    const systemMessages = filtered.filter(m => m.role === 'system');
    const nonSystemMessages = filtered.filter(m => m.role !== 'system');
    const instructions = systemMessages.map(m => m.content).join('\n') || 'You are a helpful assistant.';

    const input = this.toResponsesInput(nonSystemMessages);

    const effort = config.reasoningEffort || 'medium';

    const payload: any = {
      model: config.modelId,
      instructions,
      input,
      stream,
      store: false,
      reasoning: { effort, summary: 'auto' }
    };

    if (effort === 'none') {
      if (typeof config.temperature === 'number') payload.temperature = config.temperature;
      if (typeof config.topP === 'number') payload.top_p = config.topP;
    }

    // Codex 后端不支持 max_output_tokens 参数，跳过

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
      if (toolChoice) payload.tool_choice = toolChoice;
    }

    return {
      endpoint: `${CODEX_BASE_URL}/codex/responses`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.oauthConfig.accessToken}`,
        'OpenAI-Beta': 'responses=experimental',
        'chatgpt-account-id': this.oauthConfig.chatgptAccountId,
        'originator': 'codex_cli_rs',
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
        if (texts.length > 0) result.thinking = texts.join('\n');
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
}
