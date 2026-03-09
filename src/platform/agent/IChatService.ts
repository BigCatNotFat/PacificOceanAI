/**
 * IChatService - Platform 层接口定义
 * 
 * 核心对话编排服务，负责对外暴露对话的主要操作（发送、停止、审批）。
 * UI 只接触这个接口，不直接操作 LLM 或工具。
 */

import { Event } from '../../base/common/event';

// ==================== 类型定义 ====================

/**
 * 聊天模式
 * - agent: 启用全部工具调用，可进行latex代码编辑等操作，但需要用户同意
 * - chat: 普通对话模式，部分工具启动，修改类的工具不能启用
 * - normal: 单纯的llm对话
 * - plan: 计划模式，使用 ManagerAgentLoopService 进行多 Agent 协作
 */
export type ChatMode = 'agent' | 'chat' | 'normal' | 'plan';

/**
 * 上下文条目类型
 */
export interface ContextItem {
  type: 'file' | 'selection' | 'metadata' | 'reference' | 'image';
  uri?: string;
  content?: string;
  metadata?: Record<string, any>;
  /** 文件引用信息（仅当 type 为 'reference' 时使用） */
  reference?: {
    fileName: string;
    startLine: number;
    endLine: number;
    originalText: string;
  };
  /** 图片 base64 data URL（仅当 type 为 'image' 时使用） */
  imageUrl?: string;
}

/**
 * 聊天选项
 */
export interface ChatOptions {
  /** 选中的模型 ID */
  modelId: string;
  /** 聊天模式 */
  mode: ChatMode;
  /** 选中的文件、代码片段、额外上下文（可选） */
  contextItems?: ContextItem[];
  /**
   * Agent Loop 最大迭代次数（防止连续工具调用导致死循环/资源耗尽）。
   * - 一次迭代 ≈ 调用一次 LLM +（可选）执行工具 + 再进入下一轮
   * - 达到上限后会自动结束本轮对话
   */
  maxIterations?: number;
  /** 会话 ID（必填，用于多会话支持） */
  conversationId: string;
}

/**
 * 消息更新事件（用于多会话支持）
 */
export interface MessageUpdateEvent {
  /** 会话 ID */
  conversationId: string;
  /** 更新后的消息列表 */
  messages: ChatMessage[];
}

/**
 * 聊天消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';

/**
 * 聊天消息
 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** 思考内容（仅在流式生成时展示，不持久化） */
  thinking?: string;
  /** 工具调用信息 */
  toolCalls?: ToolCall[];
  /** 消息状态 */
  status?: 'pending' | 'streaming' | 'completed' | 'error' | 'aborted';
  /** 时间戳 */
  timestamp: number;
  /** 错误信息 */
  error?: string;
  /** 附带的图片列表（base64 data URL），用于多模态输入 */
  images?: string[];
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  status?: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'error';
}

/**
 * 工具调用待审批事件
 */
export interface ToolCallPendingEvent {
  /** 工具调用 ID */
  id: string;
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  arguments: Record<string, any>;
  /** 目标文件（如果适用） */
  targetFile?: string;
  /** 变更摘要 */
  summary?: string;
  /** 消息 ID */
  messageId: string;
}

// ==================== Service 接口 ====================

/**
 * IChatService - 对话编排服务接口
 * 
 * 支持多会话并行：每个会话独立维护消息列表和生成状态
 */
export interface IChatService {
  /**
   * 发送消息
   * @param input - 用户输入的自然语言问题
   * @param options - 聊天选项（必须包含 conversationId）
   * @param images - 可选，用户附带的图片列表（base64 data URL）
   * @returns Promise<void> - 不直接返回回答内容，通过事件推送状态
   */
  sendMessage(input: string, options: ChatOptions, images?: string[]): Promise<void>;

  /**
   * 中断指定会话的 LLM 流式生成
   * @param conversationId - 会话 ID，如果不传则中断所有会话
   */
  abort(conversationId?: string): void;

  /**
   * 批准工具调用
   * @param conversationId - 会话 ID
   * @param toolCallId - 工具调用 ID
   */
  approveToolCall(conversationId: string, toolCallId: string): Promise<void>;

  /**
   * 拒绝工具调用
   * @param conversationId - 会话 ID
   * @param toolCallId - 工具调用 ID
   */
  rejectToolCall(conversationId: string, toolCallId: string): Promise<void>;

  /**
   * 获取指定会话的消息列表
   * @param conversationId - 会话 ID
   * @returns 消息列表
   */
  getMessages(conversationId: string): ChatMessage[];

  /**
   * 加载指定对话的消息到 session 中
   * 用于多列对话场景，当打开一个新的对话时需要主动加载消息
   * @param conversationId - 会话 ID
   * @returns 加载后的消息列表
   */
  loadConversationMessages(conversationId: string): Promise<ChatMessage[]>;

  /**
   * 检查指定会话是否正在生成
   * @param conversationId - 会话 ID
   * @returns 是否正在生成
   */
  isProcessing(conversationId: string): boolean;

  /**
   * 对话消息列表更新事件（携带 conversationId）
   * 
   * 触发时机：
   * - 新的 user/assistant/tool 消息产生
   * - 流式生成过程中 assistant 消息内容发生变化
   * - thinking 内容更新
   */
  onDidMessageUpdate: Event<MessageUpdateEvent>;

  /**
   * 工具调用待审批事件
   * 
   * 当有需要用户审批的工具调用（如 edit_code）时触发。
   * UI 监听此事件以弹出审批弹窗。
   */
  onDidToolCallPending: Event<ToolCallPendingEvent>;
}

/**
 * IChatService 的服务标识符
 */
export const IChatServiceId: symbol = Symbol('IChatService');
