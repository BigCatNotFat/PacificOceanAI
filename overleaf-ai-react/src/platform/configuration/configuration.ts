import type { Event } from '../../base/common/event';

/**
 * AI 模型配置
 */
export interface AIModelConfig {
  /** 模型唯一标识 */
  id: string;
  /** 模型显示名称 */
  name: string;
  /** 模型描述 */
  description?: string;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * API 配置
 */
export interface APIConfig {
  /** API Key */
  apiKey: string;
  /** Base URL */
  baseUrl: string;
  /** 自定义模型列表 */
  models: AIModelConfig[];
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
   * 获取默认配置
   */
  getDefaultConfig(): APIConfig;
}

/**
 * 配置服务标识符
 */
export const IConfigurationServiceId: symbol = Symbol('IConfigurationService');
