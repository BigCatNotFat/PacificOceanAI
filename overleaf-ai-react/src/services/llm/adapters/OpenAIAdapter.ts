/**
 * OpenAIAdapter - OpenAI API 适配器
 * 
 * 负责将统一的 LLMConfig 转换为 OpenAI 特定的请求格式
 */

import type { LLMMessage, LLMConfig } from '../../../platform/llm/ILLMService';
import type { LLMProviderRequest } from '../../../platform/llm/ILLMProviderService';
import type { IModelRegistryService } from '../../../platform/llm/IModelRegistryService';
import { BaseLLMAdapter, type APIConfig } from './BaseLLMAdapter';

export class OpenAIAdapter extends BaseLLMAdapter {
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

    // 推理参数（OpenAI o1 系列）
    if (config.reasoningEffort) {
      payload.reasoning_effort = config.reasoningEffort;
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
      provider: 'openai'
    };
  }
}

