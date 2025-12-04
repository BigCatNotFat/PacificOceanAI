/**
 * IPromptService - Platform 层接口定义
 * 
 * 负责"脏活累活"：把用户的输入、历史记录、模式（Agent/Chat/Normal）、
 * 上下文文件内容组装成 LLM 能理解的消息格式。
 */

import { ChatMessage, ChatMode, ContextItem } from './IChatService';
import { ModelId } from '../llm/IModelRegistryService';

// ==================== 类型定义 ====================

/**
 * LLM 消息角色
 */
export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * LLM 消息（标准格式，用于调用 LLM API）
 */
export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
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
 * 工具定义（用于 Agent 模式）
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Prompt 构建选项
 */
export interface PromptBuildOptions {
  /** 模型 ID */
  modelId: ModelId;
  /** 自定义 System Prompt（覆盖默认） */
  systemPromptOverride?: string;
  /** 是否包含思考内容（默认 false，只在调试时使用） */
  includeThinking?: boolean;
}

// ==================== Service 接口 ====================

/**
 * IPromptService - Prompt 构建服务接口
 */
export interface IPromptService {
  /**
   * 构建消息列表
   * 
   * @param history - 对话历史（ChatMessage 格式）
   * @param mode - 聊天模式
   * @param context - 上下文条目（文件、选中片段等），可选
   * @param options - 构建选项
   * @returns LLM 消息列表
   */
  constructMessages(
    history: ChatMessage[],
    mode: ChatMode,
    context: ContextItem[] | undefined,
    options: PromptBuildOptions
  ): Promise<LLMMessage[]>;

  /**
   * 构建 System Prompt
   * 
   * @param mode - 聊天模式
   * @param modelId - 模型 ID
   * @returns System Prompt 字符串
   */
  buildSystemPrompt(
    mode: ChatMode,
    modelId: ModelId
  ): string;

  /**
   * 处理上下文条目，将其转换为可插入 prompt 的文本
   * 
   * @param context - 上下文条目
   * @param maxTokens - 最大允许 tokens（用于截断）
   * @returns 格式化的上下文文本
   */
  formatContext(
    context: ContextItem[],
    maxTokens?: number
  ): Promise<string>;
}

/**
 * IPromptService 的服务标识符
 */
export const IPromptServiceId: symbol = Symbol('IPromptService');
