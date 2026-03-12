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
 * 
 * 注意：maxTokens 对支持 thinking/reasoning 的模型尤其重要
 * 因为思考过程会消耗大量 token，4096 可能导致响应被截断
 */
const DEFAULT_MODEL_CONFIG: Omit<ModelConfig, 'modelId'> = {
  temperature: 1.0,
  topP: 1.0,
  maxTokens: 16384,  // 增加默认值，避免思考过程被截断
  maxTokensParamName: 'max_tokens'
};

/**
 * 部分模型信息（用于注册时）
 */
type PartialModelInfo = {
  id: ModelId;
  name: string;
  provider: 'openai' | 'openai-compatible' | 'anthropic' | 'gemini' | 'deepseek' | 'moonshot' | 'qwen' | 'other';
  description?: string;
  capabilities?: Partial<ModelCapabilities>;
  defaultConfig?: Partial<Omit<ModelConfig, 'modelId'>>;
  knowledgeCutoff?: string;
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
      },
      knowledgeCutoff: '2023-10'
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

    // OpenAI o3 系列 (2025)
    this.registerModel({
      id: 'o3-mini',
      name: 'o3 Mini',
      provider: 'openai',
      description: 'OpenAI o3 轻量推理模型，2025年1月发布',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 200000,
        maxOutputTokens: 100000,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384,
        maxTokensParamName: 'max_completion_tokens'
      },
      knowledgeCutoff: '2024-10'
    });

    this.registerModel({
      id: 'o3',
      name: 'o3',
      provider: 'openai',
      description: 'OpenAI o3 旗舰推理模型，2025年4月发布，超越 o1',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 200000,
        maxOutputTokens: 100000,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384,
        maxTokensParamName: 'max_completion_tokens'
      },
      knowledgeCutoff: '2024-10'
    });

    this.registerModel({
      id: 'o4-mini',
      name: 'o4 Mini',
      provider: 'openai',
      description: 'OpenAI o4-mini 推理模型，2025年4月发布',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 200000,
        maxOutputTokens: 100000,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384,
        maxTokensParamName: 'max_completion_tokens'
      },
      knowledgeCutoff: '2024-10'
    });

    // OpenAI GPT-4.1 系列 (2025年4月)
    this.registerModel({
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      provider: 'openai',
      description: 'OpenAI GPT-4.1，1M 上下文窗口，2025年4月发布',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 1000000,
        maxOutputTokens: 32768,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384,
        maxTokensParamName: 'max_completion_tokens'
      },
      knowledgeCutoff: '2024-12'
    });

    this.registerModel({
      id: 'gpt-4.1-mini',
      name: 'GPT-4.1 Mini',
      provider: 'openai',
      description: 'GPT-4.1 轻量版本，1M 上下文窗口',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 1000000,
        maxOutputTokens: 32768,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384,
        maxTokensParamName: 'max_completion_tokens'
      },
      knowledgeCutoff: '2024-12'
    });

    this.registerModel({
      id: 'gpt-4.1-nano',
      name: 'GPT-4.1 Nano',
      provider: 'openai',
      description: 'GPT-4.1 超轻量版本，极速响应',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 1000000,
        maxOutputTokens: 32768,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384,
        maxTokensParamName: 'max_completion_tokens'
      },
      knowledgeCutoff: '2024-12'
    });

    // OpenAI GPT-5 系列 (2025年下半年 - 2026)
    this.registerModel({
      id: 'gpt-5.2',
      name: 'GPT-5.2',
      provider: 'openai',
      description: 'GPT-5.2 高级前沿模型，2025年12月发布，强推理和长上下文',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 256000,
        maxOutputTokens: 32768,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384,
        maxTokensParamName: 'max_completion_tokens'
      },
      knowledgeCutoff: '2025-06'
    });

    this.registerModel({
      id: 'gpt-5.3',
      name: 'GPT-5.3',
      provider: 'openai',
      description: 'GPT-5.3，2026年初发布',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 256000,
        maxOutputTokens: 32768,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384,
        maxTokensParamName: 'max_completion_tokens'
      },
      knowledgeCutoff: '2025-09'
    });

    this.registerModel({
      id: 'gpt-5.4',
      name: 'GPT-5.4',
      provider: 'openai',
      description: 'GPT-5.4 最新旗舰模型，1M 上下文窗口，2026年3月发布',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 1000000,
        maxOutputTokens: 65536,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 32768,
        maxTokensParamName: 'max_completion_tokens'
      },
      knowledgeCutoff: '2025-12'
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
        maxTokens: 8192  // 增加到模型最大输出能力
      },
      knowledgeCutoff: '2024-04'
    });

    this.registerModel({
      id: 'claude-haiku-4-5-20251001',
      name: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
      description: 'claude-haiku-4-5-20251001',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 200000,
        maxOutputTokens: 16384,  // 支持推理的模型需要更多输出空间
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'claude-haiku-4-5-20251001',
        maxTokens: 16384  // 增加以支持完整的思考过程
      },
      knowledgeCutoff: '2024-07'
    });

    // Google Gemini 系列
    this.registerModel({
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash',
      provider: 'gemini',
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
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'gemini',
      description: 'Google 高性能模型，超大上下文窗口',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 2000000,
        maxOutputTokens: 65536,  // Gemini 2.5 Pro 支持更大的输出
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'gemini-2.5-pro',
        temperature: 1.0,
        topP: 0.95,
        maxTokens: 32768  // 增加以支持完整的思考过程
      },
      knowledgeCutoff: '2024-11'
    });
    
    // 🔑 新增：Gemini 2.5 Flash - 快速模型，支持思考输出
    this.registerModel({
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'gemini',
      description: 'Google 快速模型，支持思考过程输出',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,  // 支持 thinking_config
        maxContextTokens: 1000000,
        maxOutputTokens: 65536,  // 支持更大的输出
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'gemini-2.5-flash',
        temperature: 1.0,
        topP: 0.95,
        maxTokens: 32768  // 增加以支持完整的思考过程
      },
      knowledgeCutoff: '2024-11'
    });
    
    this.registerModel({
      id: 'gemini-3-pro-preview',
      name: 'gemini-3-pro-preview',
      provider: 'gemini',
      description: 'Google 高性能模型，超大上下文窗口',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 2000000,
        maxOutputTokens: 65536,  // 支持更大的输出
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'gemini-3-pro-preview',
        temperature: 1.0,
        topP: 0.95,
        maxTokens: 32768  // 增加以支持完整的思考过程
      }
    });

    this.registerModel({
      id: 'gemini-3-flash-preview',
      name: 'Gemini 3 Flash Preview',
      provider: 'gemini',
      description: 'Google 最新 Flash 预览版模型',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 1000000,
        maxOutputTokens: 65536,  // 支持更大的输出
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'gemini-3-flash-preview',
        temperature: 1.0,
        topP: 0.95,
        maxTokens: 32768  // 增加以支持完整的思考过程
      }
    });

    this.registerModel({
      id: 'gemini-3.1-pro-preview',
      name: 'Gemini 3.1 Pro Preview',
      provider: 'gemini',
      description: 'Google 最新旗舰模型，1M 上下文，推理性能大幅提升',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 1048576,
        maxOutputTokens: 65536,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'gemini-3.1-pro-preview',
        temperature: 1.0,
        topP: 0.95,
        maxTokens: 32768
      },
      knowledgeCutoff: '2025-01'
    });

    // ==================== DeepSeek 系列 ====================
    this.registerModel({
      id: 'deepseek-chat',
      name: 'DeepSeek Chat (V3)',
      provider: 'deepseek',
      description: 'DeepSeek-V3 对话模型，671B MoE 参数，性价比极高',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 128000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2024-12'
    });

    this.registerModel({
      id: 'deepseek-reasoner',
      name: 'DeepSeek Reasoner (R1)',
      provider: 'deepseek',
      description: 'DeepSeek-R1 推理模型，支持 chain-of-thought 深度推理',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 128000,
        maxOutputTokens: 64000,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        temperature: 0.1,
        maxTokens: 16384,
        thinking: {
          type: 'enabled'
        }
      },
      knowledgeCutoff: '2025-01'
    });

    this.registerModel({
      id: 'deepseek-chat-v3.2',
      name: 'DeepSeek Chat (V3.2)',
      provider: 'deepseek',
      description: 'DeepSeek-V3.2，2025年9月更新，性能大幅提升',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 128000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-06'
    });

    this.registerModel({
      id: 'deepseek-reasoner-v3.2',
      name: 'DeepSeek Reasoner (V3.2)',
      provider: 'deepseek',
      description: 'DeepSeek V3.2 推理模式，基于 deepseek-chat 启用 thinking',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 128000,
        maxOutputTokens: 64000,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        modelId: 'deepseek-chat',
        temperature: 0.1,
        maxTokens: 16384,
        thinking: {
          type: 'enabled'
        }
      },
      knowledgeCutoff: '2025-06'
    });

    this.registerModel({
      id: 'deepseek-v3.2-speciale',
      name: 'DeepSeek V3.2 Speciale',
      provider: 'deepseek',
      description: 'DeepSeek V3.2 Speciale，API 专属推理增强模型，2025年12月发布',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 128000,
        maxOutputTokens: 64000,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        temperature: 0.1,
        maxTokens: 16384,
        thinking: {
          type: 'enabled'
        }
      },
      knowledgeCutoff: '2025-09'
    });

    // ==================== Moonshot / Kimi 系列 ====================
    this.registerModel({
      id: 'moonshot-v1-8k',
      name: 'Moonshot V1 8K',
      provider: 'moonshot',
      description: 'Moonshot 通用模型，8K 上下文窗口',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 8192,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      knowledgeCutoff: '2024-06'
    });

    this.registerModel({
      id: 'moonshot-v1-32k',
      name: 'Moonshot V1 32K',
      provider: 'moonshot',
      description: 'Moonshot 通用模型，32K 上下文窗口',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 32768,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      knowledgeCutoff: '2024-06'
    });

    this.registerModel({
      id: 'moonshot-v1-128k',
      name: 'Moonshot V1 128K',
      provider: 'moonshot',
      description: 'Moonshot 通用模型，128K 上下文窗口',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 131072,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      knowledgeCutoff: '2024-06'
    });

    this.registerModel({
      id: 'kimi-k1.5',
      name: 'Kimi K1.5',
      provider: 'moonshot',
      description: 'Kimi K1.5 多模态模型，500B 参数，128K 上下文，2025年1月发布',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 128000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2024-12'
    });

    this.registerModel({
      id: 'kimi-k2-0905-preview',
      name: 'Kimi K2',
      provider: 'moonshot',
      description: 'Kimi K2 MoE 模型，1T 参数 / 32B 激活，256K 上下文，2025年9月',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 262144,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-06'
    });

    this.registerModel({
      id: 'kimi-k2-turbo-preview',
      name: 'Kimi K2 Turbo',
      provider: 'moonshot',
      description: 'Kimi K2 Turbo 快速模型，256K 上下文',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 262144,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-06'
    });

    this.registerModel({
      id: 'kimi-k2-thinking',
      name: 'Kimi K2 Thinking',
      provider: 'moonshot',
      description: 'Kimi K2 深度推理模型，支持 200-300 步工具调用，2025年11月发布',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 262144,
        maxOutputTokens: 16384,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384
      },
      knowledgeCutoff: '2025-09'
    });

    this.registerModel({
      id: 'kimi-k2.5',
      name: 'Kimi K2.5',
      provider: 'moonshot',
      description: 'Kimi K2.5 最新旗舰模型，1T MoE 参数，原生多模态，Agent Swarm 技术，2026年1月发布',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 262144,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384,
        fixedTopP: 0.95,         // K2.5 top_p 固定为 0.95，不可修改
        skipTemperature: true    // K2.5 temperature 由服务端控制，不发送
      },
      knowledgeCutoff: '2025-12'
    });

    this.registerModel({
      id: 'kimi-latest',
      name: 'Kimi Latest',
      provider: 'moonshot',
      description: 'Kimi 最新版本动态别名，始终指向 Moonshot 最新模型',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 131072,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384
      },
      knowledgeCutoff: '2025-12'
    });

    // ==================== Qwen / 通义千问 系列 (2025) ====================

    // --- Qwen 商业 API 模型 (DashScope OpenAI 兼容) ---

    this.registerModel({
      id: 'qwen-max',
      name: 'Qwen Max',
      provider: 'qwen',
      description: '通义千问旗舰模型，超强推理与生成能力，32K 上下文',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 32768,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2024-12'
    });

    this.registerModel({
      id: 'qwen-max-latest',
      name: 'Qwen Max Latest',
      provider: 'qwen',
      description: '通义千问旗舰模型最新版本动态别名',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 32768,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-01'
    });

    this.registerModel({
      id: 'qwen-plus',
      name: 'Qwen Plus',
      provider: 'qwen',
      description: '通义千问增强模型，均衡性能与速度，131K 上下文',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2024-12'
    });

    this.registerModel({
      id: 'qwen-plus-latest',
      name: 'Qwen Plus Latest',
      provider: 'qwen',
      description: '通义千问增强模型最新版本动态别名',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-01'
    });

    this.registerModel({
      id: 'qwen-turbo',
      name: 'Qwen Turbo',
      provider: 'qwen',
      description: '通义千问高速模型，超快响应，131K 上下文',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2024-12'
    });

    this.registerModel({
      id: 'qwen-turbo-latest',
      name: 'Qwen Turbo Latest',
      provider: 'qwen',
      description: '通义千问高速模型最新版本动态别名',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-01'
    });

    this.registerModel({
      id: 'qwen-long',
      name: 'Qwen Long',
      provider: 'qwen',
      description: '通义千问长文本模型，适合超长文档分析与总结',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 1000000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2024-12'
    });

    // --- Qwen3 系列 (2025年4月发布) ---

    this.registerModel({
      id: 'qwen3-235b-a22b',
      name: 'Qwen3 235B-A22B',
      provider: 'qwen',
      description: 'Qwen3 旗舰 MoE 模型，235B 总参数 / 22B 激活，支持混合推理模式',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-04'
    });

    this.registerModel({
      id: 'qwen3-32b',
      name: 'Qwen3 32B',
      provider: 'qwen',
      description: 'Qwen3 32B 密集模型，高性能推理与生成',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-04'
    });

    this.registerModel({
      id: 'qwen3-30b-a3b',
      name: 'Qwen3 30B-A3B',
      provider: 'qwen',
      description: 'Qwen3 超稀疏 MoE 模型，30B 总参数 / 3B 激活，极致性价比',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-04'
    });

    this.registerModel({
      id: 'qwen3-14b',
      name: 'Qwen3 14B',
      provider: 'qwen',
      description: 'Qwen3 14B 密集模型，均衡性能',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-04'
    });

    this.registerModel({
      id: 'qwen3-8b',
      name: 'Qwen3 8B',
      provider: 'qwen',
      description: 'Qwen3 8B 模型，轻量高效',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-04'
    });

    this.registerModel({
      id: 'qwen3-4b',
      name: 'Qwen3 4B',
      provider: 'qwen',
      description: 'Qwen3 4B 轻量模型，适合端侧部署',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-04'
    });

    this.registerModel({
      id: 'qwen3-1.7b',
      name: 'Qwen3 1.7B',
      provider: 'qwen',
      description: 'Qwen3 1.7B 超轻量模型',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 32768,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-04'
    });

    this.registerModel({
      id: 'qwen3-0.6b',
      name: 'Qwen3 0.6B',
      provider: 'qwen',
      description: 'Qwen3 0.6B 极小模型，边缘设备部署',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 32768,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-04'
    });

    // --- Qwen3-Max (2025年9月迭代) ---

    this.registerModel({
      id: 'qwen3-max',
      name: 'Qwen3 Max',
      provider: 'qwen',
      description: 'Qwen3 Max 旗舰商用模型，256K 上下文，超过1万亿参数',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 256000,
        maxOutputTokens: 16384,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384
      },
      knowledgeCutoff: '2025-09'
    });

    // --- Qwen3-Next (2025年9月) ---

    this.registerModel({
      id: 'qwen3-next',
      name: 'Qwen3 Next',
      provider: 'qwen',
      description: 'Qwen3 Next 下一代模型，2025年9月发布',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-09'
    });

    // --- Qwen3-Omni (2025年9月，多模态) ---

    this.registerModel({
      id: 'qwen3-omni',
      name: 'Qwen3 Omni',
      provider: 'qwen',
      description: 'Qwen3 Omni 全模态模型，支持文本、图像、音频、视频输入输出',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-09'
    });

    // --- Qwen 视觉语言 (VL) 系列 ---

    this.registerModel({
      id: 'qwen-vl-max',
      name: 'Qwen VL Max',
      provider: 'qwen',
      description: '通义千问视觉旗舰模型，强大的图文理解能力',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 32768,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2024-12'
    });

    this.registerModel({
      id: 'qwen-vl-plus',
      name: 'Qwen VL Plus',
      provider: 'qwen',
      description: '通义千问视觉增强模型，性价比高',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 32768,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2024-12'
    });

    this.registerModel({
      id: 'qwen2.5-vl-72b-instruct',
      name: 'Qwen2.5 VL 72B',
      provider: 'qwen',
      description: 'Qwen2.5 VL 72B 指令模型，高精度视觉理解',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-01'
    });

    this.registerModel({
      id: 'qwen2.5-vl-32b-instruct',
      name: 'Qwen2.5 VL 32B',
      provider: 'qwen',
      description: 'Qwen2.5 VL 32B 指令模型，均衡视觉理解',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-03'
    });

    // --- Qwen 编程 (Coder) 系列 ---

    this.registerModel({
      id: 'qwen3-coder-plus',
      name: 'Qwen3 Coder Plus',
      provider: 'qwen',
      description: 'Qwen3 编程增强模型，1M 上下文，65K 输出，代码生成与分析',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 1000000,
        maxOutputTokens: 65536,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 16384
      },
      knowledgeCutoff: '2025-06'
    });

    this.registerModel({
      id: 'qwen3-coder-flash',
      name: 'Qwen3 Coder Flash',
      provider: 'qwen',
      description: 'Qwen3 编程快速模型，高效代码辅助',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-06'
    });

    // --- Qwen2.5-Omni (2025年3月，端到端多模态) ---

    this.registerModel({
      id: 'qwen2.5-omni-7b',
      name: 'Qwen2.5 Omni 7B',
      provider: 'qwen',
      description: 'Qwen2.5 Omni 7B，支持文本/图像/视频/音频输入输出，实时语音对话',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 32768,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-03'
    });

    // --- Qwen Flash 系列 (低延迟) ---

    this.registerModel({
      id: 'qwen-flash',
      name: 'Qwen Flash',
      provider: 'qwen',
      description: '通义千问极速模型，最低延迟',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-06'
    });

    // --- Qwen 数学系列 ---

    this.registerModel({
      id: 'qwen-math-plus',
      name: 'Qwen Math Plus',
      provider: 'qwen',
      description: '通义千问数学增强模型，专精数学推理与解题',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-06'
    });

    this.registerModel({
      id: 'qwen-math-turbo',
      name: 'Qwen Math Turbo',
      provider: 'qwen',
      description: '通义千问数学快速模型，高效数学推理',
      capabilities: {
        supportsTools: true,
        supportsReasoning: true,
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsSystemPrompt: true,
        supportsStreaming: true
      },
      defaultConfig: {
        maxTokens: 8192
      },
      knowledgeCutoff: '2025-06'
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
      defaultConfig,
      knowledgeCutoff: partialInfo.knowledgeCutoff || '2024-06'
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
