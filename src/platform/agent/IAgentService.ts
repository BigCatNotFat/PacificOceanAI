/**
 * IAgentService - Platform 层接口定义
 * 
 * Agent 编排服务，负责：
 * - Agent Loop 循环控制
 * - 工具调用决策（自动执行 vs 需要审批）
 * - 工具审批状态管理
 * - 根据模型能力选择工具
 */

import { Event } from '../../base/common/event';
import type { ChatMessage, ChatMode, ContextItem, ToolCallPendingEvent } from './IChatService';

// ==================== 类型定义 ====================

/**
 * Agent 选项
 */
export interface AgentOptions {
  /** 模型 ID */
  modelId: string;
  /** 聊天模式 */
  mode: ChatMode;
  /** 上下文条目 */
  contextItems?: ContextItem[];
  /** 最大迭代次数（防止死循环） */
  maxIterations?: number;
  responseMessageId?: string;
}

/**
 * Agent Loop 控制器
 */
export interface AgentLoopController {
  /** Loop ID */
  id: string;
  
  /** 中断 Loop */
  abort(): void;
  
  /** 批准工具调用 */
  approveToolCall(toolCallId: string): Promise<void>;
  
  /** 拒绝工具调用 */
  rejectToolCall(toolCallId: string): Promise<void>;
  
  /** Loop 完成事件 */
  onDone: Event<ChatMessage[]>;
  
  /** Loop 更新事件（每轮迭代） */
  onUpdate: Event<ChatMessage[]>;
  
  /** Loop 错误事件 */
  onError: Event<Error>;
  
  /** 工具调用待审批事件 */
  onToolCallPending: Event<ToolCallPendingEvent>;
}

/**
 * Agent Loop 状态
 */
export interface AgentLoopState {
  loopId: string;
  iteration: number;
  status: 'running' | 'waiting_approval' | 'completed' | 'error' | 'aborted';
  currentMessages: ChatMessage[];
}

// ==================== Service 接口 ====================

/**
 * IAgentService - Agent 编排服务接口
 * 
 * 简化后只提供一个核心方法，其他操作通过返回的 controller 进行。
 */
export interface IAgentService {
  /**
   * 执行 Agent 任务（唯一的公共方法）
   * 
   * 工作流程：
   * 1. 根据 mode (agent/chat/normal) 决定行为
   * 2. 通过 PromptService 获取提示词
   * 3. 调用 LLM（通过 LLMService）
   * 4. 通过 ToolService 处理工具调用
   * 5. 管理工具审批流程
   * 
   * @param initialMessages - 初始消息列表（包含用户问题）
   * @param options - Agent 选项
   * @returns AgentLoopController - 控制器，包含 abort/approve/reject 等方法
   */
  execute(
    initialMessages: ChatMessage[],
    options: AgentOptions
  ): Promise<AgentLoopController>;
}

/**
 * IAgentService 的服务标识符
 */
export const IAgentServiceId: symbol = Symbol('IAgentService');

