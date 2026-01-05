/**
 * OpenAIProvider
 *
 * 职责：
 * - 完整的 OpenAI 客户端实现
 * - 接收历史上下文（messages + config）
 * - 内部构建请求并发送给 OpenAI API
 * - 流式接收响应，实时解析
 * - 每收到一个 chunk，立即通过 UIStreamService 更新 UI
 * - 等流式完成后，返回完整的最终结果
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

  /**
   * 唯一公共接口：发送请求并返回完整结果
   * @param messages - 历史上下文消息列表
   * @param config - LLM 配置
   * @returns 完整的最终响应
   */
  async chat(messages: LLMMessage[], config: LLMConfig): Promise<LLMFinalMessage> {
    console.log('[OpenAIProvider] chat() called', {
      messageCount: messages.length,
      hasUIStreamMeta: !!config.uiStreamMeta,
      conversationId: config.uiStreamMeta?.conversationId,
      messageId: config.uiStreamMeta?.messageId,
      hasUIStreamService: !!this.uiStreamService
    });

    // 1. 构建请求
    const { endpoint, headers, body } = this.buildRequest(messages, config);

    // 2. 发送 HTTP 请求（支持上层通过 AbortController 中断）
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

    // 3. 流式解析响应
    return await this.parseStreamResponse(response, config);
  }

  /**
   * 构建 OpenAI 请求配置（内部方法）
   */
  private buildRequest(
    messages: LLMMessage[],
    config: LLMConfig
  ): { endpoint: string; headers: Record<string, string>; body: any } {
    const modelInfo = this.modelRegistry.getModelInfo(config.modelId);
    const maxTokensParamName = 
      (modelInfo?.defaultConfig as any)?.maxTokensParamName || 'max_tokens';

    const payload = this.buildBasePayload(messages, config);

    // 设置 max_tokens 参数
    if (typeof config.maxTokens === 'number') {
      payload[maxTokensParamName] = config.maxTokens;
    }

    // 工具调用
    const tools = (config as any).tools;
    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools;
      const toolChoice = (config as any).tool_choice;
      if (toolChoice) {
        payload.tool_choice = toolChoice;
      }
    }

    // 推理参数（OpenAI o1 系列）
    if (config.reasoningEffort) {
      payload.reasoning_effort = config.reasoningEffort;
    }

    // 确保 API 端点格式正确
    const normalizedBaseUrl = this.apiConfig.baseUrl.endsWith('/') 
      ? this.apiConfig.baseUrl.slice(0, -1) 
      : this.apiConfig.baseUrl;

    return {
      endpoint: config.apiEndpoint || `${normalizedBaseUrl}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiConfig.apiKey}`
      },
      body: payload
    };
  }

  /**
   * 解析流式响应（内部方法）
   */
  private async parseStreamResponse(
    response: Response,
    config: LLMConfig
  ): Promise<LLMFinalMessage> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    const conversationId = config.uiStreamMeta?.conversationId;
    const messageId = config.uiStreamMeta?.messageId;

    // 累积完整内容
    let fullContent = '';
    let fullThinking = '';
    // 使用 index 作为稳定 key：流式传输中 id 可能只在第一个 chunk 出现
    // 如果用 id 作为 key，后续 chunk 缺失 id 会导致同一个 tool call 被拆成两条（name/args 分裂）
    const toolCallsMap = new Map<string, { id: string; name: string; args: string }>();
    
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
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          const dataStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(dataStr);
            const choice = parsed?.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;

            // 处理推理内容（thinking）
            const reasoningDelta = (delta as any)?.reasoning_content;
            if (reasoningDelta) {
              const text = String(reasoningDelta);
              fullThinking += text;

              if (this.uiStreamService && messageId) {
                this.uiStreamService.pushThinking({
                  conversationId,
                  messageId,
                  delta: text
                });
              }
            }

            // 处理普通内容
            if (delta?.content) {
              const text = String(delta.content);
              fullContent += text;

              if (this.uiStreamService && messageId) {
                this.uiStreamService.pushContent({
                  conversationId,
                  messageId,
                  delta: text
                });
              } else {
                console.warn('[OpenAIProvider] Cannot push content - missing service or messageId', {
                  hasService: !!this.uiStreamService,
                  messageId
                });
              }
            }

            // 处理工具调用
            const toolCallsDelta = (delta as any)?.tool_calls;
            if (Array.isArray(toolCallsDelta) && toolCallsDelta.length > 0) {
              for (const tcDelta of toolCallsDelta) {
                const index = tcDelta.index ?? 0;
                const stableKey = `tool_call_${index}`;
                const apiId = tcDelta.id;
                const name = tcDelta.function?.name;
                const argsText = tcDelta.function?.arguments || '';

                let existing = toolCallsMap.get(stableKey);
                if (!existing) {
                  existing = { id: apiId || stableKey, name: name || '', args: '' };
                  toolCallsMap.set(stableKey, existing);
                }

                // 更新 id（第一个 chunk 通常包含真实 id）
                if (apiId) existing.id = apiId;
                if (name) existing.name = name;
                existing.args += argsText;

                if (this.uiStreamService && messageId) {
                  this.uiStreamService.pushToolCall({
                    conversationId,
                    messageId,
                    toolCallId: existing.id,
                    phase: 'args',
                    name: existing.name,
                    argsDelta: argsText
                  });
                }
              }
            }

            // 处理完成原因
            if (choice.finish_reason) {
              finishReason = choice.finish_reason as LLMFinalMessage['finishReason'];
            }

            // 处理使用统计
            if (parsed.usage) {
              usage = {
                promptTokens: parsed.usage.prompt_tokens ?? 0,
                completionTokens: parsed.usage.completion_tokens ?? 0,
                totalTokens: parsed.usage.total_tokens ?? 0
              };
            }
          } catch (err) {
            console.warn('[OpenAIProvider] 解析流数据失败:', err);
          }
        }
      }

      // 发送完成信号给 UI
      if (this.uiStreamService && messageId) {
        if (fullThinking) {
          this.uiStreamService.pushThinking({
            conversationId,
            messageId,
            delta: '',
            done: true
          });
        }
        if (fullContent) {
          this.uiStreamService.pushContent({
            conversationId,
            messageId,
            delta: '',
            done: true
          });
        }
        for (const [, tc] of toolCallsMap) {
          this.uiStreamService.pushToolCall({
            conversationId,
            messageId,
            toolCallId: tc.id,
            phase: 'end'
          });
        }
      }

      // 构建最终结果
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
          // 防御：过滤掉缺失 name 的 tool call，否则下一轮回传会触发 400
          .filter(tc => typeof tc.name === 'string' && tc.name.trim().length > 0)
          .map(tc => {
            let parsedArgs: Record<string, any> = {};
            if (tc.args) {
              try {
                parsedArgs = JSON.parse(tc.args);
              } catch {
                // 常见情况：JSON 被截断（缺少末尾 }）
                try {
                  parsedArgs = JSON.parse(tc.args + '}');
                } catch {
                  parsedArgs = {};
                }
              }
            }
            return {
              id: tc.id,
              name: tc.name,
              arguments: parsedArgs
            };
          });
      }

      return result;
    } finally {
      reader.releaseLock();
    }
  }
}

