/**
 * IModelRegistryService - Platform 层接口定义
 * 
 * 模型注册表服务，负责提供模型能力信息和默认配置。
 * 这是静态配置的访问层，不涉及运行时模型调用。
 */

// ==================== 类型引用（待实现） ====================
// 这些类型应该在 base/common/llm/modelCapabilities.ts 中定义
// 暂时在这里做简单定义，后续会被 base 层替换

/**
 * 模型标识符
 */
export type ModelId = string;

/**
 * 模型能力描述
 */
export interface ModelCapabilities {
  /** 是否支持工具调用 */
  supportsTools: boolean;
  /** 是否支持推理/思考标签 */
  supportsReasoning: boolean;
  /** 最大上下文长度（tokens） */
  maxContextTokens: number;
  /** 最大输出长度（tokens） */
  maxOutputTokens: number;
  /** 是否支持视觉输入 */
  supportsVision: boolean;
  /** 是否支持 system prompt */
  supportsSystemPrompt: boolean;
  /** 是否支持流式输出 */
  supportsStreaming: boolean;
}

/**
 * 模型配置参数
 */
export interface ModelConfig {
  /** 模型 ID */
  modelId: ModelId;
  /** 温度参数（0-2） */
  temperature?: number;
  /** top_p 采样参数 */
  topP?: number;
  /** 最大生成 tokens */
  maxTokens?: number;
  /** 推理强度（针对支持推理的模型） */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** 其他厂商特定参数 */
  [key: string]: any;
}

/**
 * 模型元信息
 */
export interface ModelInfo {
  /** 模型 ID */
  id: ModelId;
  /** 显示名称 */
  name: string;
  /** 提供商 */
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'other';
  /** 模型能力 */
  capabilities: ModelCapabilities;
  /** 默认配置 */
  defaultConfig: ModelConfig;
  /** 描述 */
  description?: string;
}

// ==================== Service 接口 ====================

/**
 * IModelRegistryService - 模型注册表服务接口
 */
export interface IModelRegistryService {
  /**
   * 获取指定模型的能力信息
   * @param modelId - 模型 ID
   * @returns 模型能力，如果模型不存在则返回 undefined
   */
  getCapabilities(modelId: ModelId): ModelCapabilities | undefined;

  /**
   * 获取指定模型的默认配置
   * @param modelId - 模型 ID
   * @returns 默认配置，如果模型不存在则返回 undefined
   */
  getDefaultConfig(modelId: ModelId): ModelConfig | undefined;

  /**
   * 获取模型完整信息
   * @param modelId - 模型 ID
   * @returns 模型信息，如果模型不存在则返回 undefined
   */
  getModelInfo(modelId: ModelId): ModelInfo | undefined;

  /**
   * 列出所有已注册的模型 ID
   * @returns 模型 ID 列表
   */
  listModels(): ModelId[];

  /**
   * 列出所有模型的完整信息
   * @returns 模型信息列表
   */
  listModelInfos(): ModelInfo[];

  /**
   * 检查模型是否已注册
   * @param modelId - 模型 ID
   * @returns 是否已注册
   */
  hasModel(modelId: ModelId): boolean;
}

/**
 * IModelRegistryService 的服务标识符
 */
export const IModelRegistryServiceId = 'IModelRegistryService';
