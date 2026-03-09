import type { Event } from '../../base/common/event';

/**
 * AI 模型配置（每个模型自包含完整的调用凭证）
 */
export interface AIModelConfig {
  /** 模型唯一标识（同时也是 API 调用时的 model 参数） */
  id: string;
  /** 模型显示名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 供应商类型 */
  provider: 'openai' | 'gemini' | 'codex-oauth';
  /** 该模型使用的 API Key（codex-oauth 模式下为空） */
  apiKey: string;
  /** 该模型使用的 Base URL（codex-oauth 模式下为 chatgpt.com/backend-api） */
  baseUrl: string;
}

/**
 * API 配置
 */
export interface APIConfig {
  /** @deprecated 兼容旧版 */
  apiKey: string;
  /** @deprecated 兼容旧版 */
  baseUrl: string;
  /** 模型列表（每个模型自带凭证） */
  models: AIModelConfig[];
  /** @deprecated 兼容旧版 */
  isVerified?: boolean;
  /** 创建时间 */
  createdAt?: number;
  /** 更新时间 */
  updatedAt?: number;
}

/**
 * 连通性测试结果
 */
export interface ConnectivityTestResult {
  /** 是否成功 */
  success: boolean;
  /** 响应时间（毫秒） */
  latency?: number;
  /** 错误信息 */
  error?: string;
  /** 可用模型列表 */
  availableModels?: string[];
}

/**
 * 配置变化事件
 */
export interface ConfigurationChangeEvent {
  /** 变化的配置键 */
  key: string;
  /** 旧值 */
  oldValue?: any;
  /** 新值 */
  newValue?: any;
}

/**
 * 配置服务接口
 * 
 * 提供 API 配置管理能力，支持：
 * - API Key 和 Base URL 配置
 * - 自定义模型管理
 * - 连通性测试
 * - 配置持久化
 */
export interface IConfigurationService {
  /**
   * 配置变化事件
   */
  readonly onDidChangeConfiguration: Event<ConfigurationChangeEvent>;

  /**
   * 获取 API 配置
   */
  getAPIConfig(): Promise<APIConfig | null>;

  /**
   * 设置 API 配置
   */
  setAPIConfig(config: APIConfig): Promise<void>;

  /**
   * 添加自定义模型
   */
  addModel(model: AIModelConfig): Promise<void>;

  /**
   * 更新模型配置
   */
  updateModel(modelId: string, updates: Partial<AIModelConfig>): Promise<void>;

  /**
   * 删除模型
   */
  removeModel(modelId: string): Promise<void>;

  /**
   * 获取所有模型
   */
  getModels(): Promise<AIModelConfig[]>;

  /**
   * 测试 API 连通性
   */
  testConnectivity(apiKey: string, baseUrl: string): Promise<ConnectivityTestResult>;

  /**
   * 根据连通性测试结果同步模型列表
   */
  syncModelsFromConnectivityResult(availableModels: string[]): Promise<{ added: number; enabled: number; disabled: number }>;

  /**
   * 获取默认配置
   */
  getDefaultConfig(): APIConfig;
}

/**
 * 配置服务标识符
 */
export const IConfigurationServiceId: symbol = Symbol('IConfigurationService');
