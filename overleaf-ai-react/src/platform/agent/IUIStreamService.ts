/**
 * IUIStreamService - UI 流式更新服务接口
 *
 * 职责：
 * - 为底层 LLM/Agent 提供简单的「推送增量」接口
 * - 为上层 React UI 暴露事件，便于分别渲染思考内容 / 正文 / 工具调用
 */

import type { Event } from '../../base/common/event';

// ==================== 类型定义 ====================

/**
 * 思考内容增量输入
 */
export interface ThinkingDeltaInput {
  /** 当前会话 ID（可选，预留多会话支持） */
  conversationId?: string;
  /** 目标消息 ID（通常是当前轮的 assistant 消息 ID） */
  messageId: string;
  /** 本次追加的思考文本增量 */
  delta: string;
  /** 是否结束当前思考段 */
  done?: boolean;
}

/**
 * 正文内容增量输入
 */
export interface ContentDeltaInput {
  conversationId?: string;
  messageId: string;
  /** 本次追加的正文文本增量 */
  delta: string;
  /** 是否结束当前正文输出 */
  done?: boolean;
}

/**
 * 工具调用更新阶段
 */
export type ToolCallPhase =
  | 'start'   // 开始显示一个工具调用
  | 'args'    // 参数流式输出
  | 'log'     // 执行过程日志
  | 'result'  // 结果流式输出
  | 'end'     // 工具调用完成
  | 'error';  // 工具调用出错

/**
 * 工具调用增量输入
 */
export interface ToolCallUpdateInput {
  conversationId?: string;
  /** 触发工具调用的消息 ID（通常是 assistant 消息） */
  messageId: string;
  /** 工具调用 ID（来自 LLM 的 tool_call_id） */
  toolCallId: string;
  /** 当前更新所处阶段 */
  phase: ToolCallPhase;
  /** 工具名称（通常在 phase = 'start' 时提供） */
  name?: string;
  /** 参数文本增量（phase = 'args' 时使用） */
  argsDelta?: string;
  /** 执行日志增量（phase = 'log' 时使用） */
  logDelta?: string;
  /** 结果文本增量（phase = 'result' 时使用） */
  resultDelta?: string;
  /** 错误信息（phase = 'error' 时使用） */
  error?: string;
}

/**
 * 思考内容事件（带有累计后的完整内容）
 */
export interface ThinkingUpdateEvent extends ThinkingDeltaInput {
  /** 累计后的完整思考文本 */
  fullText: string;
}

/**
 * 正文内容事件（带有累计后的完整内容）
 */
export interface ContentUpdateEvent extends ContentDeltaInput {
  /** 累计后的完整正文文本 */
  fullText: string;
}

/**
 * 工具调用事件（包含累计后的参数和结果）
 */
export interface ToolCallUpdateEvent extends ToolCallUpdateInput {
  /** 累积后的完整参数字符串（如果有） */
  fullArgs?: string;
  /** 累积后的完整结果字符串（如果有） */
  fullResult?: string;
}

// ==================== Service 接口 ====================

/**
 * IUIStreamService - 面向底层的流式 UI 更新入口
 *
 * 设计目标：
 * - provider / LLMService 只需要调用 pushXXX 方法，不关心具体 UI 结构
 * - UI 通过事件订阅，将数据渲染到「思考区 / 正文区 / 工具区」
 */
export interface IUIStreamService {
  /**
   * 推送思考内容增量
   */
  pushThinking(update: ThinkingDeltaInput): void;

  /**
   * 推送正文内容增量
   */
  pushContent(update: ContentDeltaInput): void;

  /**
   * 推送工具调用相关的增量信息
   */
  pushToolCall(update: ToolCallUpdateInput): void;

  /**
   * 思考内容更新事件
   */
  readonly onDidThinkingUpdate: Event<ThinkingUpdateEvent>;

  /**
   * 正文内容更新事件
   */
  readonly onDidContentUpdate: Event<ContentUpdateEvent>;

  /**
   * 工具调用更新事件
   */
  readonly onDidToolCallUpdate: Event<ToolCallUpdateEvent>;
}

/**
 * IUIStreamService 的服务标识符
 */
export const IUIStreamServiceId: symbol = Symbol('IUIStreamService');

