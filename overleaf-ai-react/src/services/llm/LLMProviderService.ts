/**
 * LLMProviderService - Services 层实现
 * 
 * LLM 厂商适配服务实现，负责：
 * - 根据模型选择正确的适配器
 * - 构建厂商特定的请求配置
 * - 解析厂商特定的流式响应
 */

import { injectable } from '../../platform/instantiation/descriptors';
import type {
  ILLMProviderService,
  LLMProviderRequest,
  ParsedStreamChunk
} from '../../platform/llm/ILLMProviderService';
import { ILLMProviderServiceId } from '../../platform/llm/ILLMProviderService';
import type { LLMMessage, LLMConfig, LLMDeltaChunk } from '../../platform/llm/ILLMService';
import type { IModelRegistryService } from '../../platform/llm/IModelRegistryService';
import { IModelRegistryServiceId } from '../../platform/llm/IModelRegistryService';
import type { IConfigurationService } from '../../platform/configuration/configuration';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import { OpenAIAdapter } from './adapters/OpenAIAdapter';
import { OpenAICompatibleAdapter } from './adapters/OpenAICompatibleAdapter';
import { AnthropicAdapter } from './adapters/AnthropicAdapter';
import { GeminiAdapter } from './adapters/GeminiAdapter';
import type { BaseLLMAdapter } from './adapters/BaseLLMAdapter';

/**
 * LLMProviderService 实现
 */
@injectable(IModelRegistryServiceId, IConfigurationServiceId)
export class LLMProviderService implements ILLMProviderService {
  /** 适配器缓存 */
  private adapterCache: Map<string, BaseLLMAdapter> = new Map();

  constructor(
    private readonly modelRegistry: IModelRegistryService,
    private readonly configService: IConfigurationService
  ) {
    console.log('[LLMProviderService] 依赖注入成功');
  }

  // ==================== 公共方法 ====================

  async buildRequestConfig(
    messages: LLMMessage[],
    config: LLMConfig
  ): Promise<LLMProviderRequest> {
    console.log('[LLMProviderService] 构建请求配置', {
      modelId: config.modelId,
      messageCount: messages.length
    });

    // 1. 获取 API 配置
    const apiConfig = await this.getAPIConfig();

    // 2. 获取模型信息
    const modelInfo = this.modelRegistry.getModelInfo(config.modelId);
    if (!modelInfo) {
      throw new Error(`未找到模型: ${config.modelId}`);
    }

    // 3. 选择适配器
    const adapter = this.getAdapter(modelInfo.provider);

    // 4. 构建请求
    const request = adapter.buildRequest(messages, config, apiConfig);

    console.log('[LLMProviderService] 请求配置构建完成', {
      endpoint: request.endpoint,
      provider: request.provider
    });

    return request;
  }

  parseStreamChunk(
    dataString: string,
    provider: LLMProviderRequest['provider']
  ): ParsedStreamChunk | null {
    if (!dataString || dataString === '[DONE]') {
      return { done: true, finishReason: 'stop' };
    }

    try {
      const parsed = JSON.parse(dataString);

      // 🔑 每个厂商使用独立的解析方法
      switch (provider) {
        case 'openai':
          return this.parseOpenAIChunk(parsed);
        case 'openai-compatible':
          return this.parseOpenAICompatibleChunk(parsed);
        case 'gemini':
          return this.parseGeminiChunk(parsed);
        case 'anthropic':
          return this.parseAnthropicChunk(parsed);
        default:
          console.warn(`[LLMProviderService] 未知提供商: ${provider}，使用 OpenAI 格式`);
          return this.parseOpenAIChunk(parsed);
      }
    } catch (err) {
      console.warn('[LLMProviderService] 解析流数据失败:', err, dataString);
      return null;
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 获取 API 配置
   */
  private async getAPIConfig(): Promise<{ apiKey: string; baseUrl: string }> {
    const apiConfig = await this.configService.getAPIConfig();
    
    if (!apiConfig || !apiConfig.apiKey) {
      throw new Error('API Key 未配置，请在设置中配置 API Key');
    }

    return {
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl || 'https://api.openai.com/v1'
    };
  }

  /**
   * 获取适配器
   */
  private getAdapter(provider: string): BaseLLMAdapter {
    // 尝试从缓存获取
    if (this.adapterCache.has(provider)) {
      return this.adapterCache.get(provider)!;
    }

    // 创建新适配器
    let adapter: BaseLLMAdapter;
    switch (provider) {
      case 'openai':
        adapter = new OpenAIAdapter(this.modelRegistry);
        break;
      case 'openai-compatible':
        adapter = new OpenAICompatibleAdapter(this.modelRegistry);
        break;
      case 'anthropic':
        adapter = new AnthropicAdapter(this.modelRegistry);
        break;
      case 'gemini':
        adapter = new GeminiAdapter(this.modelRegistry);
        break;
      default:
        console.warn(`[LLMProviderService] 未知提供商: ${provider}，使用 OpenAI 兼容适配器`);
        adapter = new OpenAICompatibleAdapter(this.modelRegistry);
    }

    // 缓存适配器
    this.adapterCache.set(provider, adapter);
    return adapter;
  }

  /**
   * 解析 OpenAI 格式的流数据块
   */
  private parseOpenAIChunk(parsed: any): ParsedStreamChunk | null {
    const choice = parsed.choices?.[0];
    if (!choice) {
      return null;
    }

    const delta = choice.delta;
    const result: ParsedStreamChunk = {};

    // 推理内容（DeepSeek 等）
    const reasoningDelta = (delta as any)?.reasoning_content;
    if (reasoningDelta) {
      result.chunk = {
        delta: String(reasoningDelta),
        type: 'thinking'
      };
    }

    // 普通内容
    if (delta?.content) {
      result.chunk = {
        delta: String(delta.content),
        type: 'content'
      };
    }

    // 工具调用
    const toolCallsDelta = (delta as any)?.tool_calls;
    if (Array.isArray(toolCallsDelta) && toolCallsDelta.length > 0) {
      const tcDelta = toolCallsDelta[0];
      result.chunk = {
        delta: tcDelta.function?.arguments || '',
        type: 'tool_call',
        toolCall: {
          id: tcDelta.id,
          name: tcDelta.function?.name,
          arguments: tcDelta.function?.arguments
        }
      };
    }

    // 完成原因
    if (choice.finish_reason) {
      result.finishReason = choice.finish_reason;
    }

    // 使用统计
    if (parsed.usage) {
      result.usage = {
        promptTokens: parsed.usage.prompt_tokens ?? 0,
        completionTokens: parsed.usage.completion_tokens ?? 0,
        totalTokens: parsed.usage.total_tokens ?? 0
      };
    }

    return result;
  }

  /**
   * 解析 OpenAI Compatible 格式的流数据块（DeepSeek, Ollama 等）
   */
  private parseOpenAICompatibleChunk(parsed: any): ParsedStreamChunk | null {
    const choice = parsed.choices?.[0];
    if (!choice) {
      return null;
    }

    const delta = choice.delta;
    const result: ParsedStreamChunk = {};

    // 推理内容（DeepSeek R1 等）
    const reasoningDelta = (delta as any)?.reasoning_content;
    if (reasoningDelta) {
      result.chunk = {
        delta: String(reasoningDelta),
        type: 'thinking'
      };
    }

    // 普通内容
    if (delta?.content) {
      result.chunk = {
        delta: String(delta.content),
        type: 'content'
      };
    }

    // 工具调用
    const toolCallsDelta = (delta as any)?.tool_calls;
    if (Array.isArray(toolCallsDelta) && toolCallsDelta.length > 0) {
      const tcDelta = toolCallsDelta[0];
      result.chunk = {
        delta: tcDelta.function?.arguments || '',
        type: 'tool_call',
        toolCall: {
          id: tcDelta.id,
          name: tcDelta.function?.name,
          arguments: tcDelta.function?.arguments
        }
      };
    }

    // 完成原因
    if (choice.finish_reason) {
      result.finishReason = choice.finish_reason;
    }

    // 使用统计
    if (parsed.usage) {
      result.usage = {
        promptTokens: parsed.usage.prompt_tokens ?? 0,
        completionTokens: parsed.usage.completion_tokens ?? 0,
        totalTokens: parsed.usage.total_tokens ?? 0
      };
    }

    return result;
  }

  /**
   * 解析 Gemini 格式的流数据块
   */
  private parseGeminiChunk(parsed: any): ParsedStreamChunk | null {
    // Gemini 使用 OpenAI 兼容格式，但有特殊的思考内容标记
    const choice = parsed.choices?.[0];
    if (!choice) {
      return null;
    }

    const delta = choice.delta;
    const result: ParsedStreamChunk = {};

    // 🔑 检查 Gemini 特有的思考内容标记
    // 当 extra_content.google.thought 为 true 时，表示这是思考内容
    const isThinkingContent = delta?.extra_content?.google?.thought === true;

    // 处理内容（区分思考内容和普通内容）
    if (delta?.content) {
      let contentStr = String(delta.content);
      
      // 🔑 检查是否包含 <thought> 或 </thought> 标签
      // 这些标签可能单独出现在某些 chunk 中
      const hasThoughtTag = /<\/?thought>/i.test(contentStr);
      
      if (isThinkingContent || hasThoughtTag) {
        // 🔑 Gemini 思考内容：标记为 'thinking' 类型
        // Gemini 会在 content 中包含 <thought> 标签，我们需要提取其中的内容
        let thinkingText = contentStr;
        
        // 移除 <thought> 和 </thought> 标签（如果存在）
        thinkingText = thinkingText.replace(/<\/?thought>/gi, '');
        
        // 如果移除标签后为空，跳过这个 chunk
        if (!thinkingText.trim()) {
          return null;
        }
        
        result.chunk = {
          delta: thinkingText,
          type: 'thinking'
        };
        
        if (thinkingText.length > 0) {
          console.log('[LLMProviderService] Gemini 思考内容:', thinkingText.substring(0, 50) + '...');
        }
      } else {
        // 🔑 普通内容：额外清理可能泄露的标签
        // 防御性编程：即使不是思考内容，也要移除可能的标签残留
        contentStr = contentStr.replace(/<\/?thought>/gi, '');
        
        if (contentStr.trim()) {
          result.chunk = {
            delta: contentStr,
            type: 'content'
          };
        } else {
          // 如果清理后为空，跳过
          return null;
        }
      }
    }

    // 工具调用
    const toolCallsDelta = (delta as any)?.tool_calls;
    if (Array.isArray(toolCallsDelta) && toolCallsDelta.length > 0) {
      const tcDelta = toolCallsDelta[0];
      result.chunk = {
        delta: tcDelta.function?.arguments || '',
        type: 'tool_call',
        toolCall: {
          id: tcDelta.id,
          name: tcDelta.function?.name,
          arguments: tcDelta.function?.arguments
        }
      };
    }

    // 完成原因
    if (choice.finish_reason) {
      result.finishReason = choice.finish_reason;
    }

    // 使用统计
    if (parsed.usage) {
      result.usage = {
        promptTokens: parsed.usage.prompt_tokens ?? 0,
        completionTokens: parsed.usage.completion_tokens ?? 0,
        totalTokens: parsed.usage.total_tokens ?? 0
      };
    }

    return result;
  }

  /**
   * 解析 Anthropic 格式的流数据块
   */
  private parseAnthropicChunk(parsed: any): ParsedStreamChunk | null {
    // Anthropic 的流格式与 OpenAI 不同
    // TODO: 实现 Anthropic 特定的解析逻辑
    console.warn('[LLMProviderService] Anthropic 流解析暂未实现');
    return null;
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.adapterCache.clear();
  }
}

// 导出服务标识符
export { ILLMProviderServiceId };

