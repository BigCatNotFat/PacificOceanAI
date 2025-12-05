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
}

/**
 * Agent Loop 控制器
 */
export interface AgentLoopController {
  /** Loop ID */
  id: string;
  /** 中断 Loop */
  abort(): void;
  /** Loop 完成事件 */
  onDone: Event<ChatMessage[]>;
  /** Loop 更新事件（每轮迭代） */
  onUpdate: Event<ChatMessage[]>;
  /** Loop 错误事件 */
  onError: Event<Error>;
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
 */
export interface IAgentService {
  /**
   * 启动 Agent Loop
   * @param initialMessages - 初始消息列表（包含用户问题）
   * @param options - Agent 选项
   * @returns AgentLoopController - 用于控制循环的句柄
   */
  startLoop(
    initialMessages: ChatMessage[],
    options: AgentOptions
  ): Promise<AgentLoopController>;

  /**
   * 批准工具调用（由外部触发）
   * @param loopId - Loop ID
   * @param toolCallId - 工具调用 ID
   */
  approveToolCall(loopId: string, toolCallId: string): Promise<void>;

  /**
   * 拒绝工具调用
   * @param loopId - Loop ID
   * @param toolCallId - 工具调用 ID
   */
  rejectToolCall(loopId: string, toolCallId: string): Promise<void>;

  /**
   * Agent Loop 状态更新事件
   */
  onDidLoopUpdate: Event<AgentLoopState>;

  /**
   * 工具调用待审批事件
   */
  onDidToolCallPending: Event<ToolCallPendingEvent>;
}

/**
 * IAgentService 的服务标识符
 */
export const IAgentServiceId: symbol = Symbol('IAgentService');

