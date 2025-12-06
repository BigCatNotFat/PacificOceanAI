/**
 * GeminiProvider - Google Gemini API 提供者
 *
 * 职责：
 * - 完整的 Gemini 客户端实现（使用 OpenAI 兼容接口）
 * - 接收历史上下文（messages + config）
 * - 内部构建请求并发送给 Gemini API
 * - 流式接收响应，实时解析
 * - 每收到一个 chunk，立即通过 UIStreamService 更新 UI
 * - 等流式完成后，返回完整的最终结果
 * 
 * Gemini 特性：
 * - 使用 OpenAI 兼容接口
 * - 支持思考过程（通过 <thought> 标签）
 * - 需要特殊处理 thinking_config
 */

import type { LLMMessage, LLMConfig, LLMFinalMessage } from '../../../platform/llm/ILLMService';
import type { IModelRegistryService } from '../../../platform/llm/IModelRegistryService';
import { BaseLLMProvider, type APIConfig } from './BaseLLMProvider';
import type { IUIStreamService } from '../../../platform/agent/IUIStreamService';

export class GeminiProvider extends BaseLLMProvider {
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
    console.log('[GeminiProvider] chat() called', {
      messageCount: messages.length,
      hasUIStreamMeta: !!config.uiStreamMeta,
      conversationId: config.uiStreamMeta?.conversationId,
      messageId: config.uiStreamMeta?.messageId,
      hasUIStreamService: !!this.uiStreamService
    });

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
      throw new Error(`Gemini API 请求失败: ${response.status} ${errorText}`);
    }

    // 3. 流式解析响应
    return await this.parseStreamResponse(response, config);
  }

  /**
   * 构建 Gemini 请求配置（内部方法）
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

    // 🔑 Gemini 特定参数：启用思考过程输出
    // 如果模型支持推理能力，自动启用 thinking_config
    // 这样可以获得类似 DeepSeek 的 <thought> 标签包裹的思考过程
    if (modelInfo?.capabilities?.supportsReasoning) {
      payload.extra_body = {
        google: {
          thinking_config: {
            include_thoughts: true
          }
        }
      };
      console.log('[GeminiProvider] 已启用思考过程输出', { modelId: config.modelId });
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
   * 
   * Gemini 特殊处理：
   * - 检测 <thought> 标签并将其内容标记为 thinking 类型
   * - 过滤掉标签本身，只保留内容
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
    
    // Gemini 特殊状态：跟踪是否在思考标签内
    let isInThinkingTag = false;

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

            // 处理内容（需要检测 Gemini 的 <thought> 标签）
            if (delta?.content) {
              let text = String(delta.content);
              
              // 检查是否包含 <thought> 标签
              const hasOpenTag = /<thought>/i.test(text);
              const hasCloseTag = /<\/thought>/i.test(text);
              
              // 检测 Gemini 特有的思考内容标记
              const isThinkingContent = (delta as any)?.extra_content?.google?.thought === true;
              
              if (hasOpenTag) {
                isInThinkingTag = true;
                text = text.replace(/<thought>/gi, '');
              }
              if (hasCloseTag) {
                isInThinkingTag = false;
                text = text.replace(/<\/thought>/gi, '');
              }
              
              // 根据是否在思考标签内或标记决定类型
              if (isInThinkingTag || isThinkingContent || hasOpenTag) {
                // 这是思考内容
                if (text.trim()) {
                  fullThinking += text;
                  
                  if (this.uiStreamService && messageId) {
                    this.uiStreamService.pushThinking({
                      conversationId,
                      messageId,
                      delta: text
                    });
                  }
                }
              } else {
                // 普通内容 - 额外清理可能泄露的标签
                text = text.replace(/<\/?thought>/gi, '');
                
                if (text.trim()) {
                  fullContent += text;
                  
                  if (this.uiStreamService && messageId) {
                    this.uiStreamService.pushContent({
                      conversationId,
                      messageId,
                      delta: text
                    });
                  }
                }
              }
            }

            // 处理工具调用
            const toolCallsDelta = (delta as any)?.tool_calls;
            if (Array.isArray(toolCallsDelta) && toolCallsDelta.length > 0) {
              for (const tcDelta of toolCallsDelta) {
                const id = tcDelta.id || `tool_call_${tcDelta.index || 0}`;
                const name = tcDelta.function?.name;
                const argsText = tcDelta.function?.arguments || '';

                let existing = toolCallsMap.get(id);
                if (!existing) {
                  existing = { id, name: name || '', args: '' };
                  toolCallsMap.set(id, existing);
                }

                if (name) existing.name = name;
                existing.args += argsText;

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
            console.warn('[GeminiProvider] 解析流数据失败:', err);
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
        result.toolCalls = Array.from(toolCallsMap.values()).map(tc => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.args ? JSON.parse(tc.args) : {}
        }));
      }

      return result;
    } finally {
      reader.releaseLock();
    }
  }
}

