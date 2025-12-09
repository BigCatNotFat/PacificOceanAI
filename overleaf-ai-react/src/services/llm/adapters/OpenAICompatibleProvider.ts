/**
 * OpenAICompatibleProvider - OpenAI 兼容 API 适配器
 *
 * 职责：
 * - 完整的 OpenAI 兼容客户端实现（用于 DeepSeek、Gemini 等）
 * - 接收历史上下文（messages + config）
 * - 内部构建请求并发送给兼容 API
 * - 流式接收响应，实时解析
 * - 每收到一个 chunk，立即通过 UIStreamService 更新 UI
 * - 等流式完成后，返回完整的最终结果
 */

import type { LLMMessage, LLMConfig, LLMFinalMessage } from '../../../platform/llm/ILLMService';
import type { IModelRegistryService } from '../../../platform/llm/IModelRegistryService';
import { BaseLLMProvider, type APIConfig } from './BaseLLMProvider';
import type { IUIStreamService } from '../../../platform/agent/IUIStreamService';

export class OpenAICompatibleProvider extends BaseLLMProvider {
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
    // console.log('[OpenAICompatibleProvider] chat() called', {
    //   messageCount: messages.length,
    //   hasUIStreamMeta: !!config.uiStreamMeta,
    //   conversationId: config.uiStreamMeta?.conversationId,
    //   messageId: config.uiStreamMeta?.messageId,
    //   hasUIStreamService: !!this.uiStreamService
    // });

    // 1. 构建请求
    const { endpoint, headers, body } = this.buildRequest(messages, config);

    // 2. 发送 HTTP 请求
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: (config as any).abortSignal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Compatible API 请求失败: ${response.status} ${errorText}`);
    }

    // 3. 流式解析响应
    return await this.parseStreamResponse(response, config);
  }

  /**
   * 构建 OpenAI 兼容请求配置（内部方法）
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

    // DeepSeek 推理模式的 thinking 参数
    const thinking = (config as any).thinking;
    if (thinking) {
      payload.thinking = thinking;
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

            // 处理推理内容（thinking）- 支持 reasoning_content 和 content 中的 thinking
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
                console.warn('[OpenAICompatibleProvider] Cannot push content - missing service or messageId', {
                  hasService: !!this.uiStreamService,
                  messageId
                });
              }
            }

            // 处理工具调用
            const toolCallsDelta = (delta as any)?.tool_calls;
            if (Array.isArray(toolCallsDelta) && toolCallsDelta.length > 0) {
              for (const tcDelta of toolCallsDelta) {
                // 使用 index 作为稳定的 key（流式传输中 id 可能只在第一个 chunk 出现）
                const index = tcDelta.index ?? 0;
                const stableKey = `tool_call_${index}`;
                const id = tcDelta.id || stableKey;
                const name = tcDelta.function?.name;
                const argsText = tcDelta.function?.arguments || '';

                // 优先使用 stableKey 查找，因为后续 chunk 可能没有 id
                let existing = toolCallsMap.get(stableKey);
                if (!existing) {
                  existing = { id, name: name || '', args: '' };
                  toolCallsMap.set(stableKey, existing);
                  // console.log('[OpenAICompatibleProvider] 新建工具调用:', { stableKey, id, name });
                }

                // 更新 id（第一个 chunk 通常包含真实 id）
                if (tcDelta.id) existing.id = tcDelta.id;
                if (name) existing.name = name;
                existing.args += argsText;
                
                // console.log('[OpenAICompatibleProvider] 工具调用参数累积:', {
                //   stableKey,
                //   name: existing.name,
                //   argsLength: existing.args.length,
                //   latestDelta: argsText.substring(0, 50)
                // });

                if (this.uiStreamService && messageId) {
                  this.uiStreamService.pushToolCall({
                    conversationId,
                    messageId,
                    toolCallId: id,
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
            console.warn('[OpenAICompatibleProvider] 解析流数据失败:', err);
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
        for (const [id] of toolCallsMap) {
          this.uiStreamService.pushToolCall({
            conversationId,
            messageId,
            toolCallId: id,
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
        // console.log('[OpenAICompatibleProvider] 最终工具调用列表:', 
        //   Array.from(toolCallsMap.entries()).map(([key, tc]) => ({
        //     key,
        //     id: tc.id,
        //     name: tc.name,
        //     argsLength: tc.args.length,
        //     argsPreview: tc.args.substring(0, 200)
        //   }))
        // );
        result.toolCalls = Array.from(toolCallsMap.values()).map(tc => {
          let parsedArgs = {};
          if (tc.args) {
            try {
              parsedArgs = JSON.parse(tc.args);
            } catch (parseError) {
              // console.error('[OpenAICompatibleProvider] 工具调用参数 JSON 解析失败:', {
              //   toolName: tc.name,
              //   rawArgs: tc.args,
              //   error: parseError
              // });
              // 尝试修复常见的 JSON 问题（如末尾缺少 }）
              try {
                parsedArgs = JSON.parse(tc.args + '}');
                // console.log('[OpenAICompatibleProvider] 修复后解析成功');
              } catch {
                // 仍然失败，保持空对象
              }
            }
          } else {
            // console.warn('[OpenAICompatibleProvider] 工具调用参数为空:', {
            //   toolName: tc.name,
            //   toolId: tc.id
            // });
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

