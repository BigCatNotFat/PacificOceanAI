/**
 * ModelRegistryService - Services 层实现
 * 
 * 模型注册表服务实现，内部维护所有支持模型的静态配置。
 * 包括 GPT、Claude、Gemini、DeepSeek 等主流模型。
 */

import { injectable } from '../../platform/instantiation/descriptors';
import {
  IModelRegistryService,
  IModelRegistryServiceId,
  ModelId,
  ModelCapabilities,
  ModelConfig,
  ModelInfo
} from '../../platform/llm/IModelRegistryService';

/**
 * 默认模型能力配置
 */
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsTools: true,
  supportsReasoning: false,
  maxContextTokens: 128000,
  maxOutputTokens: 4096,
  supportsVision: false,
  supportsSystemPrompt: true,
  supportsStreaming: true
};

/**
 * 默认模型配置
 */
const DEFAULT_MODEL_CONFIG: Omit<ModelConfig, 'modelId'> = {
  temperature: 1.0,
  topP: 1.0,
  maxTokens: 4096,
  maxTokensParamName: 'max_tokens'
};

/**
 * 部分模型信息（用于注册时）
 */
type PartialModelInfo = {
  id: ModelId;
  name: string;
  provider: 'openai' | 'openai-compatible' | 'anthropic' | 'other';
  description?: string;
  capabilities?: Partial<ModelCapabilities>;
  defaultConfig?: Partial<Omit<ModelConfig, 'modelId'>>;
};

/**
 * ModelRegistryService 实现
 */
@injectable()
export class ModelRegistryService implements IModelRegistryService {
  /** 模型注册表 */
  private readonly _registry: Map<ModelId, ModelInfo> = new Map();

  constructor() {
    this.initializeModels();
  }

  // ==================== 公共方法 ====================

  getCapabilities(modelId: ModelId): ModelCapabilities | undefined {
    return this._registry.get(modelId)?.capabilities;
  }

  getDefaultConfig(modelId: ModelId): ModelConfig | undefined {
    return this._registry.get(modelId)?.defaultConfig;
  }

  getModelInfo(modelId: ModelId): ModelInfo | undefined {
    return this._registry.get(modelId);
  }

  listModels(): ModelId[] {
    return Array.from(this._registry.keys());
  }

  listModelInfos(): ModelInfo[] {
    return Array.from(this._registry.values());
  }

  hasModel(modelId: ModelId): boolean {
    return this._registry.has(modelId);
  }

  // ==================== 私有方法 ====================

  /**
   * 初始化所有模型配置
   * 
   * 注册新模型示例（最简形式）：
   * this.registerModel({
   *   id: 'my-model',
   *   name: 'My Model',
   *   provider: 'other',
   *   description: '我的自定义模型'
   * });
   * // 以上会使用所有默认值：supportsTools: true, maxContextTokens: 128000, temperature: 1.0 等
   * 
   * 只覆盖部分字段示例：
   * this.registerModel({
   *   id: 'my-model',
   *   name: 'My Model',
   *   provider: 'other',
   *   capabilities: {
   *     supportsVision: true,  // 只改这一个字段
   *     maxContextTokens: 200000  // 和这一个字段
   *   },
   *   defaultConfig: {
   *     temperature: 0.7  // 只改温度
   *   }
   * });
   */
  private initializeModels(): void {
    // OpenAI 系列
    this.registerModel({
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      description: 'OpenAI 最新多模态模型，支持视觉和文本',
      capabilities: {
        maxOutputTokens: 16384,
        supportsVision: true
      },
      defaultConfig: {
        maxTokensParamName: 'max_completion_tokens'
      }
      // 其他字段使用默认值：supportsTools: true, maxContextTokens: 128000 等
    });

    this.registerModel({
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'openai',
      description: 'GPT-4o 的轻量版本，更快更便宜',
      capabilities: {
        maxOutputTokens: 16384,
        supportsVision: true
      },
      defaultConfig: {
        maxTokensParamName: 'max_completion_tokens'
      }
      // 默认配置完全使用默认值
    });
    this.registerModel({
      id: 'gpt-5.1',
      name: 'gpt-5.1',
      provider: 'openai',
      description: 'gpt-5.1',
      capabilities: {
        maxOutputTokens: 16384,
        supportsVision: true
      },
      defaultConfig: {
        maxTokensParamName: 'max_completion_tokens'
      }
      // 默认配置完全使用默认值
    });
    this.registerModel({
      id: 'gpt-5',
      name: 'gpt-5',
      provider: 'openai',
      description: 'gpt-5',
      capabilities: {
        maxOutputTokens: 16384,
        supportsVision: true
      },
      defaultConfig: {
        maxTokensParamName: 'max_completion_tokens'
      }
      // 默认配置完全使用默认值
    });
    this.registerModel({
      id: 'o1',
      name: 'o1',
      provider: 'openai',
      description: 'OpenAI 推理模型，具有强大的思考能力',
      capabilities: {
        supportsTools: false, // 不支持工具调用
        supportsReasoning: true,
        maxContextTokens: 200000,
        maxOutputTokens: 100000,
        supportsSystemPrompt: false // 不支持 system prompt
      },
      defaultConfig: {
        maxTokens: 8192,
        maxTokensParamName: 'max_completion_tokens'
      }
    });

    this.registerModel({
      id: 'o1-mini',
      name: 'o1 Mini',
      provider: 'openai',
      description: 'o1 的轻量版本，更快的推理速度',
      capabilities: {
        supportsTools: false,
        supportsReasoning: true,
        maxContextTokens: 128000,
        maxOutputTokens: 65536,
        supportsVision: false,
        supportsSystemPrompt: false,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'o1-mini',
        temperature: 1.0,
        maxTokens: 8192,
        maxTokensParamName: 'max_completion_tokens'
      }
    });

    // Anthropic Claude 系列
    this.registerModel({
      id: 'claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
      description: 'Anthropic 最新模型，平衡性能和速度',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 200000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'claude-3.5-sonnet',
        temperature: 1.0,
        topP: 1.0,
        maxTokens: 4096
      }
    });

    this.registerModel({
      id: 'claude-3-opus',
      name: 'Claude 3 Opus',
      provider: 'anthropic',
      description: 'Claude 3 最强大版本',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 200000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'claude-3-opus',
        temperature: 1.0,
        topP: 1.0,
        maxTokens: 4096
      }
    });

    // Google Gemini 系列
    this.registerModel({
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash',
      provider: 'openai-compatible',
      description: 'Google 最新实验性快速模型',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 1000000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'gemini-2.0-flash-exp',
        temperature: 1.0,
        topP: 0.95,
        maxTokens: 4096
      }
    });

    this.registerModel({
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      provider: 'openai-compatible',
      description: 'Google 高性能模型，超大上下文窗口',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 2000000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'gemini-1.5-pro',
        temperature: 1.0,
        topP: 0.95,
        maxTokens: 4096
      }
    });

    // DeepSeek 系列
    this.registerModel({
      id: 'deepseek-chat',
      name: 'DeepSeek Chat',
      provider: 'openai-compatible',
      description: 'DeepSeek 对话模型，性价比高',
      capabilities: {
        maxContextTokens: 64000
      }
      // 其他所有字段都使用默认值
    });

    this.registerModel({
      id: 'deepseek-reasoner',
      name: 'DeepSeek Reasoner',
      provider: 'openai-compatible',
      description: 'DeepSeek 推理模型，具有强大的思考能力',
      capabilities: {
        supportsTools: false,
        supportsReasoning: true,
        maxContextTokens: 64000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'deepseek-reasoner',
        temperature: 1.0,
        maxTokens: 8192
      }
    });
  }

  /**
   * 注册单个模型（支持部分字段，自动合并默认值）
   */
  private registerModel(partialInfo: PartialModelInfo): void {
    // 合并能力配置（用户提供的字段覆盖默认值）
    const capabilities: ModelCapabilities = {
      ...DEFAULT_CAPABILITIES,
      ...partialInfo.capabilities
    };

    // 合并模型配置（用户提供的字段覆盖默认值）
    const defaultConfig: ModelConfig = {
      modelId: partialInfo.id,
      ...DEFAULT_MODEL_CONFIG,
      ...partialInfo.defaultConfig
    };

    // 构建完整的 ModelInfo
    const fullInfo: ModelInfo = {
      id: partialInfo.id,
      name: partialInfo.name,
      provider: partialInfo.provider,
      description: partialInfo.description,
      capabilities,
      defaultConfig
    };

    this._registry.set(fullInfo.id, fullInfo);
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this._registry.clear();
  }
}

// 导出服务标识符
export { IModelRegistryServiceId };
