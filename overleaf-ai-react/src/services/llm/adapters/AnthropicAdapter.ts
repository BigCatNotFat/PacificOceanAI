/**
 * AnthropicAdapter - Anthropic Claude API 适配器
 * 
 * 负责将统一的 LLMConfig 转换为 Anthropic 特定的请求格式
 */

import type { LLMMessage, LLMConfig } from '../../../platform/llm/ILLMService';
import type { LLMProviderRequest } from '../../../platform/llm/ILLMProviderService';
import type { IModelRegistryService } from '../../../platform/llm/IModelRegistryService';
import { BaseLLMAdapter, type APIConfig } from './BaseLLMAdapter';

export class AnthropicAdapter extends BaseLLMAdapter {
  constructor(private readonly modelRegistry: IModelRegistryService) {
    super();
  }

  buildRequest(
    messages: LLMMessage[],
    config: LLMConfig,
    apiConfig: APIConfig
  ): LLMProviderRequest {
    // Anthropic API 格式与 OpenAI 不同
    // 需要将 system 消息提取出来作为单独的参数
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const payload: any = {
      model: config.modelId,
      messages: conversationMessages,
      max_tokens: config.maxTokens || 4096,
      stream: true
    };

    if (systemMessage) {
      payload.system = systemMessage.content;
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
    const normalizedBaseUrl = apiConfig.baseUrl.endsWith('/') 
      ? apiConfig.baseUrl.slice(0, -1) 
      : apiConfig.baseUrl;

    return {
      endpoint: config.apiEndpoint || `${normalizedBaseUrl}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiConfig.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: payload,
      provider: 'anthropic'
    };
  }
}

