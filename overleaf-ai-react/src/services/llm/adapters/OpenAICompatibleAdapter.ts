/**
 * OpenAICompatibleAdapter - OpenAI 兼容 API 适配器
 * 
 * 用于 DeepSeek、Gemini 等提供 OpenAI 兼容接口的服务
 */

import type { LLMMessage, LLMConfig } from '../../../platform/llm/ILLMService';
import type { LLMProviderRequest } from '../../../platform/llm/ILLMProviderService';
import type { IModelRegistryService } from '../../../platform/llm/IModelRegistryService';
import { BaseLLMAdapter, type APIConfig } from './BaseLLMAdapter';

export class OpenAICompatibleAdapter extends BaseLLMAdapter {
  constructor(private readonly modelRegistry: IModelRegistryService) {
    super();
  }

  buildRequest(
    messages: LLMMessage[],
    config: LLMConfig,
    apiConfig: APIConfig
  ): LLMProviderRequest {
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

    // 确保 API 端点格式正确
    const normalizedBaseUrl = apiConfig.baseUrl.endsWith('/') 
      ? apiConfig.baseUrl.slice(0, -1) 
      : apiConfig.baseUrl;

    return {
      endpoint: config.apiEndpoint || `${normalizedBaseUrl}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`
      },
      body: payload,
      provider: 'openai-compatible'
    };
  }
}

