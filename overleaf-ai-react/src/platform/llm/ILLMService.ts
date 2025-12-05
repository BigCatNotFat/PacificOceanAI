/**
 * ILLMService - Platform 层接口定义
 * 
 * 底层 LLM 调用的抽象层，屏蔽 OpenAI / Anthropic / Gemini 等不同厂商的 SDK 差异。
 */

import { Event } from '../../base/common/event';

// ==================== 类型定义 ====================

/**
 * LLM 消息角色
 */
export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * LLM 消息（标准格式）
 */
export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
  /**
   * 推理内容（DeepSeek 等推理模型使用）
   * 对应 OpenAI/DeepSeek 协议中的 reasoning_content 字段
   */
  reasoning_content?: string;
  /** 工具调用信息（assistant 消息可能包含） */
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  /** 工具调用 ID（tool 消息需要） */
  tool_call_id?: string;
  /** 工具名称（tool 消息需要） */
  name?: string;
}

/**
 * LLM 配置参数
 */
export interface LLMConfig {
  /** 模型 ID */
  modelId: string;
  /** 温度参数（0-2） */
  temperature?: number;
  /** top_p 采样参数 */
  topP?: number;
  /** 最大生成 tokens */
  maxTokens?: number;
  /**
   * DeepSeek 等模型的推理控制参数。
   * 例如：{ type: 'enabled' } 表示开启推理模式。
   */
  thinking?: {
    type: 'enabled' | 'disabled';
    [key: string]: any;
  };
  /** 推理强度（针对支持推理的模型） */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** 是否启用流式输出 */
  stream?: boolean;
  /** 自定义 API 端点（可选，用于兼容 OpenAI SDK 的自建服务） */
  apiEndpoint?: string;
  /** API 格式类型 */
  apiFormat?: 'openai' | 'openai-compatible' | 'anthropic' | 'custom';
  /**
   * UI 流式刷新相关元信息（可选）
   * 供底层 Provider 在解析流时回调 UIStreamService 使用
   */
  uiStreamMeta?: {
    conversationId?: string;
    /** 当前这轮回答对应的 ChatMessage ID */
    messageId?: string;
  };
  /** 其他厂商特定参数 */
  [key: string]: any;
}

/**
 * 流式增量响应块
 */
export interface LLMDeltaChunk {
  /** 增量内容（逐字/逐句） */
  delta: string;
  /** 增量类型 */
  type: 'content' | 'thinking' | 'tool_call';
  /** 如果是工具调用，包含部分工具调用信息 */
  toolCall?: {
    id?: string;
    name?: string;
    arguments?: string; // 可能是部分 JSON
  };
}

/**
 * 最终完整响应
 */
export interface LLMFinalMessage {
  /** 完整的 assistant 内容 */
  content: string;
  /** 思考内容（如果模型支持） */
  thinking?: string;
  /** 工具调用列表 */
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  /** 使用的 tokens 统计 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 停止原因 */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

/**
 * 流式响应接口（已废弃，仅保留用于兼容）
 */
export interface StreamResponse {
  /**
   * Token 流事件（逐字输出）
   */
  onToken: Event<LLMDeltaChunk>;

  /**
   * 错误事件
   */
  onError: Event<Error>;

  /**
   * 完成事件
   */
  onDone: Event<LLMFinalMessage>;

  /**
   * 取消当前请求
   */
  cancel(): void;
}

// ==================== Service 接口 ====================

/**
 * ILLMService - LLM 调用服务接口
 * 
 * 简化后的接口，只提供一个核心方法。
 * 流式更新由 Provider 内部通过 UIStreamService 实时推送，上层无需关心。
 */
export interface ILLMService {
  /**
   * 调用 LLM（唯一的核心方法）
   * 
   * 工作流程：
   * 1. 根据 config.modelId 判断供应商
   * 2. 选择对应的 Provider
   * 3. 调用 Provider.chat()
   * 4. Provider 内部流式更新 UI（通过 UIStreamService）
   * 5. 返回完整结果
   * 
   * @param messages - 消息列表（历史上下文）
   * @param config - LLM 配置参数（包含 modelId）
   * @returns 完整的最终响应
   */
  chat(
    messages: LLMMessage[],
    config: LLMConfig
  ): Promise<LLMFinalMessage>;
}

/**
 * ILLMService 的服务标识符
 */
export const ILLMServiceId: symbol = Symbol('ILLMService');
