/**
 * GeminiAdapter - Google Gemini API 适配器
 * 
 * 负责将统一的 LLMConfig 转换为 Gemini 特定的请求格式
 * 当前使用 OpenAI 兼容接口
 */

import type { LLMMessage, LLMConfig } from '../../../platform/llm/ILLMService';
import type { LLMProviderRequest } from '../../../platform/llm/ILLMProviderService';
import type { IModelRegistryService } from '../../../platform/llm/IModelRegistryService';
import { BaseLLMAdapter, type APIConfig } from './BaseLLMAdapter';

export class GeminiAdapter extends BaseLLMAdapter {
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
      console.log('[GeminiAdapter] 已启用思考过程输出', { modelId: config.modelId });
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
      provider: 'gemini'
    };
  }
}

