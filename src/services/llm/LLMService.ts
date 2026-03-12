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
import { CodexOAuthProvider } from './adapters/CodexOAuthProvider';
import type { APIConfig } from './adapters/BaseLLMProvider';
import { codexOAuthService } from '../auth/CodexOAuthService';

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
    const { providerType, apiConfig, requestModelId } = await this.resolveModelAndConfig(config.modelId);
    const provider = await this.getProvider(providerType, apiConfig);
    const resolvedConfig = requestModelId === config.modelId
      ? config
      : { ...config, modelId: requestModelId };
    return await provider.chat(messages, resolvedConfig);
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

    const { providerType, apiConfig, requestModelId } = await this.resolveModelAndConfig(config.modelId);
    const provider = await this.getProvider(providerType, apiConfig);
    const resolvedConfig = requestModelId === config.modelId
      ? config
      : { ...config, modelId: requestModelId };
    const result = await provider.managerChat(messages, resolvedConfig);


    return result;
  }

  // ==================== 私有方法 ====================

  /**
   * 解析模型并获取对应的 API 凭证
   * 优先从用户模型配置取凭证，其次查静态注册表 + 旧版全局配置
   */
  private async resolveModelAndConfig(modelId: string): Promise<{ providerType: string; apiConfig: APIConfig; requestModelId: string }> {
    const config = await this.configService.getAPIConfig();
    const userModel = config?.models?.find(m => m.id === modelId && m.enabled);

    // Codex OAuth 模型（使用 ChatGPT 订阅认证，无需 API Key）
    if (userModel?.provider === 'codex-oauth') {
      return {
        providerType: 'codex-oauth',
        apiConfig: { apiKey: '', baseUrl: 'https://chatgpt.com/backend-api' },
        requestModelId: userModel.actualModelId || userModel.id
      };
    }

    // 用户配置的模型（每个模型自带凭证）
    if (userModel?.apiKey) {
      const providerType = userModel.provider; // 直接使用用户配置的 provider（openai/gemini/deepseek/moonshot）
      return {
        providerType,
        apiConfig: { apiKey: userModel.apiKey, baseUrl: userModel.baseUrl },
        requestModelId: userModel.actualModelId || userModel.id
      };
    }

    // 静态注册表中的模型（兼容旧架构）
    const registryInfo = this.modelRegistry.getModelInfo(modelId);
    if (registryInfo) {
      if (config?.apiKey) {
        return {
          providerType: registryInfo.provider,
          apiConfig: { apiKey: config.apiKey, baseUrl: config.baseUrl || 'https://api.openai.com/v1' },
          requestModelId: modelId
        };
      }
      throw new Error(`模型 ${modelId} 在注册表中，但缺少 API Key，请在设置中配置`);
    }

    // 用户配置的模型但没有 apiKey
    if (userModel) {
      throw new Error(`模型 "${userModel.name}" 未配置 API Key，请在设置中补充`);
    }

    throw new Error(`未找到模型: ${modelId}，请在设置中添加该模型`);
  }

  /**
   * 根据供应商类型获取对应的 Provider
   */
  private async getProvider(providerType: string, apiConfig: APIConfig): Promise<any> {
    // Codex OAuth: token 会过期刷新，每次都需要获取最新 token，不使用缓存
    if (providerType === 'codex-oauth') {
      const tokens = await codexOAuthService.getValidTokens();
      if (!tokens) {
        throw new Error('ChatGPT 未登录或登录已过期，请在设置页面重新登录');
      }
      return new CodexOAuthProvider(
        this.modelRegistry,
        this.uiStreamService,
        {
          accessToken: tokens.accessToken,
          chatgptAccountId: tokens.chatgptAccountId
        }
      );
    }

    // 使用 providerType + apiKey 组合作为缓存 key，API 配置变更时自动刷新
    const cacheKey = `${providerType}:${apiConfig.apiKey}`;
    if (this.providerCache.has(cacheKey)) {
      return this.providerCache.get(cacheKey);
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
      case 'builtin':
      case 'deepseek':
      case 'moonshot':
      case 'qwen':
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
    this.providerCache.set(cacheKey, provider);
    
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
