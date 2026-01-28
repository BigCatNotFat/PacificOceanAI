/**
 * LLMService - Services 层实现（重构后）
 * 
 * 新职责（路由层）：
 * - 根据 modelId 判断供应商（通过 ModelRegistryService）
 * - 选择对应的 Provider（OpenAI、Gemini、Anthropic 等）
 * - 准备 Provider 需要的数据（messages + config + apiConfig）
 * - 调用 provider.chat() 获取结果
 * - 返回统一格式的 LLMFinalMessage 给上层
 * 
 * 不再负责：
 * - HTTP 请求（移至各个 Provider 内部）
 * - 流式解析（移至各个 Provider 内部）
 * - UI 更新（Provider 内部通过 UIStreamService 实时更新）
 */

import { injectable } from '../../platform/instantiation/descriptors';
import type {
  ILLMService,
  LLMMessage,
  LLMConfig,
  LLMFinalMessage
} from '../../platform/llm/ILLMService';
import { ILLMServiceId } from '../../platform/llm/ILLMService';
import type { IModelRegistryService } from '../../platform/llm/IModelRegistryService';
import { IModelRegistryServiceId } from '../../platform/llm/IModelRegistryService';
import type { IConfigurationService } from '../../platform/configuration/configuration';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import type { IUIStreamService } from '../../platform/agent/IUIStreamService';
import { IUIStreamServiceId } from '../../platform/agent/IUIStreamService';
import { OpenAIProvider } from './adapters/OpenAIProvider';
import { OpenAICompatibleProvider } from './adapters/OpenAICompatibleProvider';
import { GeminiProvider } from './adapters/GeminiProvider';
import { AnthropicProvider } from './adapters/AnthropicProvider';
import type { APIConfig } from './adapters/BaseLLMProvider';
import { logger } from '../../utils/logger';

/**
 * LLMService 实现
 */
@injectable(IModelRegistryServiceId, IConfigurationServiceId, IUIStreamServiceId)
export class LLMService implements ILLMService {
  /** Provider 缓存 */
  private providerCache = new Map<string, any>();

  constructor(
    private readonly modelRegistry: IModelRegistryService,
    private readonly configService: IConfigurationService,
    private readonly uiStreamService: IUIStreamService
  ) {
    // console.log('[LLMService] 依赖注入成功', {
    //   hasModelRegistry: !!modelRegistry,
    //   hasConfigService: !!configService,
    //   hasUIStreamService: !!uiStreamService
    // });
  }

  // ==================== 公共方法 ====================

  /**
   * 调用 LLM（唯一的公共方法）
   * 
   * 工作流程：
   * 1. 根据 config.modelId 判断供应商
   * 2. 获取 API 配置
   * 3. 选择对应的 Provider
   * 4. 调用 Provider.chat()
   * 5. Provider 内部流式更新 UI（通过 UIStreamService）
   * 6. 返回完整结果
   * 
   * 注意：上层 AgentService 无需关心调用的是哪个模型或供应商
   */
  async chat(
    messages: LLMMessage[],
    config: LLMConfig
  ): Promise<LLMFinalMessage> {
    // console.log('[LLMService] 开始调用 LLM', {
    //   modelId: config.modelId,
    //   messageCount: messages.length
    // });

    // 1. 获取模型信息，判断供应商
    const modelInfo = this.modelRegistry.getModelInfo(config.modelId);
    if (!modelInfo) {
      throw new Error(`未找到模型: ${config.modelId}`);
    }

    // console.log('[LLMService] 模型供应商:', modelInfo.provider);

    // 2. 获取 API 配置
    const apiConfig = await this.getAPIConfig();

    // 3. 根据供应商选择 Provider
    const provider = await this.getProvider(modelInfo.provider, apiConfig);

    // 4. 调用 Provider 的 chat 方法
    const result = await provider.chat(messages, config);

    // console.log('[LLMService] 调用完成', {
    //   contentLength: result.content?.length || 0,
    //   hasThinking: !!result.thinking,
    //   toolCallsCount: result.toolCalls?.length || 0
    // });

    return result;
  }

  /**
   * Manager 聊天接口 - 用于 MultiAgent 模式的 ManagerAgent
   * 
   * 与 chat 的区别：
   * - 不流式输出
   * - 不更新 UI
   * - 只返回结果
   * 
   * @param messages - 消息列表
   * @param config - LLM 配置
   * @returns 完整的最终响应
   */
  async managerChat(
    messages: LLMMessage[],
    config: LLMConfig
  ): Promise<LLMFinalMessage> {
    logger.debug('[LLMService] managerChat 开始调用', {
      modelId: config.modelId,
      messageCount: messages.length
    });

    // 1. 获取模型信息，判断供应商
    const modelInfo = this.modelRegistry.getModelInfo(config.modelId);
    if (!modelInfo) {
      throw new Error(`未找到模型: ${config.modelId}`);
    }

    // 2. 获取 API 配置
    const apiConfig = await this.getAPIConfig();

    // 3. 根据供应商选择 Provider
    const provider = await this.getProvider(modelInfo.provider, apiConfig);

    // 4. 调用 Provider 的 managerChat 方法
    const result = await provider.managerChat(messages, config);

    logger.debug('[LLMService] managerChat 调用完成', {
      contentLength: result.content?.length || 0,
      hasThinking: !!result.thinking,
      toolCallsCount: result.toolCalls?.length || 0
    });

    return result;
  }

  // ==================== 私有方法 ====================

  /**
   * 获取 API 配置
   */
  private async getAPIConfig(): Promise<APIConfig> {
    const config = await this.configService.getAPIConfig();
    if (!config || !config.apiKey) {
      throw new Error('未配置 API Key，请先在设置中配置');
    }

    return {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1'
    };
  }

  /**
   * 根据供应商类型获取对应的 Provider
   */
  private async getProvider(providerType: string, apiConfig: APIConfig): Promise<any> {
    // 检查缓存
    if (this.providerCache.has(providerType)) {
      return this.providerCache.get(providerType);
    }

    // 根据供应商类型创建 Provider
    let provider: any;
    
    switch (providerType) {
      case 'openai':
        provider = new OpenAIProvider(
          this.modelRegistry,
          this.uiStreamService,
          apiConfig
        );
        break;
      
      case 'openai-compatible':
        provider = new OpenAICompatibleProvider(
          this.modelRegistry,
          this.uiStreamService,
          apiConfig
        );
        break;
      
      case 'anthropic':
        provider = new AnthropicProvider(
          this.modelRegistry,
          this.uiStreamService,
          apiConfig
        );
        break;
      
      case 'gemini':
        provider = new GeminiProvider(
          this.modelRegistry,
          this.uiStreamService,
          apiConfig
        );
        break;
      
      default:
        throw new Error(`不支持的供应商类型: ${providerType}`);
    }

    // 缓存 Provider
    this.providerCache.set(providerType, provider);
    
    return provider;
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.providerCache.clear();
  }
}

// 导出服务标识符
export { ILLMServiceId };
