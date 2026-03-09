/**
 * AnthropicProvider - Anthropic Claude API 提供者
 *
 * 职责：
 * - 完整的 Anthropic Claude 客户端实现
 * - 接收历史上下文（messages + config）
 * - 内部构建请求并发送给 Anthropic API
 * - 流式接收响应，实时解析
 * - 每收到一个 chunk，立即通过 UIStreamService 更新 UI
 * - 等流式完成后，返回完整的最终结果
 * 
 * Anthropic 特性：
 * - API 格式与 OpenAI 不同
 * - system 消息需要单独提取
 * - 使用 x-api-key 而非 Authorization
 * - 流式响应格式不同
 */

import type { LLMMessage, LLMConfig, LLMFinalMessage, ContentPart } from '../../../platform/llm/ILLMService';
import { getTextContent } from '../../../platform/llm/ILLMService';
import type { IModelRegistryService } from '../../../platform/llm/IModelRegistryService';
import { BaseLLMProvider, type APIConfig } from './BaseLLMProvider';
import type { IUIStreamService } from '../../../platform/agent/IUIStreamService';

export class AnthropicProvider extends BaseLLMProvider {
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
    console.log('[AnthropicProvider] chat() called', {
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
      throw new Error(`Anthropic API 请求失败: ${response.status} ${errorText}`);
    }

    // 3. 流式解析响应
    return await this.parseStreamResponse(response, config);
  }

  /**
   * Manager 聊天接口 - 用于 MultiAgent 模式的 ManagerAgent
   * 
   * 与 chat 的区别：
   * - 不流式输出
   * - 不更新 UI
   * - 只返回结果
   */
  async managerChat(messages: LLMMessage[], config: LLMConfig): Promise<LLMFinalMessage> {
    console.log('[AnthropicProvider] managerChat() called', {
      messageCount: messages.length,
      modelId: config.modelId
    });

    // 1. 构建请求（非流式）
    const { endpoint, headers, body } = this.buildRequest(messages, config, false);

    // 2. 发送 HTTP 请求
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: (config as any).abortSignal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API 请求失败: ${response.status} ${errorText}`);
    }

    // 3. 解析非流式响应
    const data = await response.json();
    return this.parseNonStreamResponse(data);
  }

  /**
   * 解析非流式响应
   */
  private parseNonStreamResponse(data: any): LLMFinalMessage {
    const result: LLMFinalMessage = {
      content: '',
      finishReason: data.stop_reason as LLMFinalMessage['finishReason']
    };

    // 处理内容块
    if (data.content && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          result.content += block.text || '';
        } else if (block.type === 'tool_use') {
          if (!result.toolCalls) result.toolCalls = [];
          result.toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input || {}
          });
        }
      }
    }

    // 处理使用统计
    if (data.usage) {
      result.usage = {
        promptTokens: data.usage.input_tokens ?? 0,
        completionTokens: data.usage.output_tokens ?? 0,
        totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0)
      };
    }

    return result;
  }

  /**
   * 构建 Anthropic 请求配置（内部方法）
   * 
   * Anthropic 特殊处理：
   * - system 消息需要单独提取
   * - 工具格式不同
   */
  private buildRequest(
    messages: LLMMessage[],
    config: LLMConfig,
    stream: boolean = true
  ): { endpoint: string; headers: Record<string, string>; body: any } {
    // Anthropic API 格式与 OpenAI 不同
    // 需要将 system 消息提取出来作为单独的参数
    const systemMessage = messages.find(m => m.role === 'system');
    const filteredMessages = this.formatMessages(
      messages.filter(m => m.role !== 'system')
    );

    // 转换多模态内容为 Anthropic 格式
    const conversationMessages = filteredMessages.map((msg: any) => {
      if (Array.isArray(msg.content)) {
        const anthropicContent = (msg.content as ContentPart[]).map(part => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text };
          }
          if (part.type === 'image_url') {
            const url: string = part.image_url.url;
            if (url.startsWith('data:')) {
              const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
              if (match) {
                return {
                  type: 'image',
                  source: { type: 'base64', media_type: match[1], data: match[2] }
                };
              }
            }
            return { type: 'image', source: { type: 'url', url } };
          }
          return { type: 'text', text: '' };
        });
        return { ...msg, content: anthropicContent };
      }
      return msg;
    });

    const payload: any = {
      model: config.modelId,
      messages: conversationMessages,
      max_tokens: config.maxTokens || 4096,
      stream
    };

    if (systemMessage) {
      payload.system = getTextContent(systemMessage.content);
    }

    if (typeof config.temperature === 'number') {
      payload.temperature = config.temperature;
    }
    if (typeof config.topP === 'number') {
      payload.top_p = config.topP;
    }

    // Anthropic 的工具调用格式
    const tools = (config as any).tools;
    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools.map((tool: any) => ({
        name: tool.function?.name || tool.name,
        description: tool.function?.description || tool.description,
        input_schema: tool.function?.parameters || tool.parameters
      }));
    }

    // 确保 API 端点格式正确
    const normalizedBaseUrl = this.apiConfig.baseUrl.endsWith('/') 
      ? this.apiConfig.baseUrl.slice(0, -1) 
      : this.apiConfig.baseUrl;

    return {
      endpoint: config.apiEndpoint || `${normalizedBaseUrl}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiConfig.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: payload
    };
  }

  /**
   * 解析流式响应（内部方法）
   * 
   * Anthropic 流式格式：
   * - 事件类型：message_start, content_block_start, content_block_delta, content_block_stop, message_stop
   * - 使用 SSE 格式
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
    // 使用 index 作为稳定 key：避免流式 chunk 缺失 id 时将同一 tool call 拆成两条
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
          if (!trimmed) continue;
          
          // Anthropic 使用 SSE 格式
          if (trimmed.startsWith('event:')) {
            // 事件类型行，暂时跳过
            continue;
          }
          
          if (!trimmed.startsWith('data: ')) continue;

          const dataStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(dataStr);
            
            // 处理不同的事件类型
            const eventType = parsed.type;
            
            if (eventType === 'content_block_delta') {
              const delta = parsed.delta;
              
              // 文本内容
              if (delta?.type === 'text_delta' && delta.text) {
                const text = String(delta.text);
                fullContent += text;
                
                if (this.uiStreamService && messageId) {
                  this.uiStreamService.pushContent({
                    conversationId,
                    messageId,
                    delta: text
                  });
                }
              }
              
              // 工具调用
              if (delta?.type === 'input_json_delta' && delta.partial_json) {
                // Anthropic 的工具调用是增量 JSON
                // 需要累积完整的 JSON 字符串
                // TODO: 实现工具调用增量累积
              }
            }
            
            if (eventType === 'content_block_start') {
              const contentBlock = parsed.content_block;
              if (contentBlock?.type === 'tool_use') {
                // 开始工具调用
                const id = contentBlock.id;
                const name = contentBlock.name;
                toolCallsMap.set(id, { id, name, args: '' });
              }
            }
            
            if (eventType === 'message_delta') {
              // 消息元数据更新
              if (parsed.delta?.stop_reason) {
                finishReason = parsed.delta.stop_reason;
              }
              if (parsed.usage) {
                usage = {
                  promptTokens: 0,
                  completionTokens: parsed.usage.output_tokens ?? 0,
                  totalTokens: parsed.usage.output_tokens ?? 0
                };
              }
            }
            
            if (eventType === 'message_start') {
              // 消息开始，包含输入 token 统计
              if (parsed.message?.usage) {
                const u = parsed.message.usage;
                usage = {
                  promptTokens: u.input_tokens ?? 0,
                  completionTokens: 0,
                  totalTokens: u.input_tokens ?? 0
                };
              }
            }
          } catch (err) {
            console.warn('[AnthropicProvider] 解析流数据失败:', err);
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
          .filter(tc => typeof tc.name === 'string' && tc.name.trim().length > 0)
          .map(tc => {
            let parsedArgs: Record<string, any> = {};
            if (tc.args) {
              try {
                parsedArgs = JSON.parse(tc.args);
              } catch {
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

