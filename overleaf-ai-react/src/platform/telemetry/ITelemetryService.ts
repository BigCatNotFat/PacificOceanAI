/**
 * ITelemetryService - Platform 层接口定义
 * 
 * 统计服务接口，用于收集用户行为数据。
 * 采用客户端聚合策略，每 120 秒上报一次聚合后的统计数据。
 */

import type { Event } from '../../base/common/event';

// ==================== 类型定义 ====================

/**
 * 聊天统计 - 按模型和模式分组的对话次数
 * 结构: { [modelId]: { [mode]: count } }
 * 
 * @example
 * {
 *   "gpt-4o": { "agent": 5, "chat": 3, "normal": 1 },
 *   "deepseek-reasoner": { "agent": 10 }
 * }
 */
export interface ChatStatistics {
  [modelId: string]: {
    [mode: string]: number; // mode: 'agent' | 'chat' | 'normal'
  };
}

/**
 * 工具统计 - 按工具名分组的成功/失败次数
 * 结构: { [toolName]: { success: count, failed: count } }
 * 
 * @example
 * {
 *   "read_file": { "success": 15, "failed": 2 },
 *   "edit_file": { "success": 8, "failed": 1 }
 * }
 */
export interface ToolStatistics {
  [toolName: string]: {
    success: number;
    failed: number;
  };
}

/**
 * 工具审批统计 - 按工具名分组的批准/拒绝次数
 * 结构: { [toolName]: { approved: count, rejected: count } }
 * 
 * @example
 * {
 *   "read_file": { "approved": 10, "rejected": 2 },
 *   "edit_file": { "approved": 5, "rejected": 8 }
 * }
 */
export interface ToolApprovalStatistics {
  [toolName: string]: {
    approved: number;
    rejected: number;
  };
}

/**
 * 文本操作统计 - 按操作类型分组的使用/接受/拒绝次数
 * 结构: { [action]: { used: count, accepted: count, rejected: count } }
 * 
 * @example
 * {
 *   "polish": { "used": 5, "accepted": 4, "rejected": 1 },
 *   "expand": { "used": 3, "accepted": 2, "rejected": 1 }
 * }
 */
export interface TextActionStatistics {
  [action: string]: { // action: 'polish' | 'expand' | 'condense' | 'translate' | 'custom'
    used: number;
    accepted: number;
    rejected: number;
  };
}

/**
 * 会话统计
 */
export interface SessionStatistics {
  started: number;  // 会话开始次数
  ended: number;    // 会话结束次数
}

/**
 * UI 交互统计
 */
export interface UIStatistics {
  /** 点击新建分支的次数 */
  branchCreated: number;
  /** 当前对话列数量（上报时瞬时统计） */
  paneCount: number;
}

/**
 * 聚合统计数据
 */
export interface AggregatedStatistics {
  /** 聊天统计 */
  chat: ChatStatistics;
  /** 工具统计 */
  tools: ToolStatistics;
  /** 工具审批统计 */
  toolApproval: ToolApprovalStatistics;
  /** 文本操作统计 */
  textActions: TextActionStatistics;
  /** 会话统计 */
  session: SessionStatistics;
  /** UI 交互统计 */
  ui: UIStatistics;
}

/**
 * 上报数据结构
 */
export interface TelemetryPayload {
  /** 用户匿名 ID */
  userId: string;
  /** 会话 ID */
  sessionId: string;
  /** 插件版本 */
  version: string;
  /** 上报时间戳（服务端时间） */
  timestamp: number;
  /** 聚合统计数据 */
  statistics: AggregatedStatistics;
}

/**
 * 上报结果
 */
export interface TelemetryUploadResult {
  /** 是否成功 */
  success: boolean;
  /** 统计的总操作数 */
  totalCount: number;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 统计服务配置
 */
export interface TelemetryConfig {
  /** 上报间隔（毫秒），默认 120000 (2分钟) */
  uploadInterval?: number;
  /** 上报端点 URL，设为 'console' 开启调试模式 */
  endpoint: string;
  /** 插件版本 */
  version: string;
}

// ==================== Service 接口 ====================

/**
 * ITelemetryService - 统计服务接口
 * 
 * 核心功能：
 * - 收集用户行为并在客户端聚合
 * - 定时批量上报（每 120 秒）
 * - 离线队列支持
 * - 页面关闭时使用 sendBeacon 确保数据送达
 */
export interface ITelemetryService {
  /**
   * 记录聊天消息
   * @param modelId - 模型 ID
   * @param mode - 对话模式（agent/chat/normal）
   */
  trackChat(modelId: string, mode: string): void;

  /**
   * 记录工具执行
   * @param toolName - 工具名称
   * @param success - 是否成功
   */
  trackToolExecution(toolName: string, success: boolean): void;

  /**
   * 记录工具审批
   * @param toolName - 工具名称
   * @param approved - 是否批准（true=批准，false=拒绝）
   */
  trackToolApproval(toolName: string, approved: boolean): void;

  /**
   * 记录文本操作使用
   * @param action - 操作类型（polish/expand/condense/translate/custom）
   */
  trackTextActionUsed(action: string): void;

  /**
   * 记录文本操作决策
   * @param action - 操作类型
   * @param accepted - 是否接受（true=接受，false=拒绝）
   */
  trackTextActionDecision(action: string, accepted: boolean): void;

  /**
   * 记录会话开始
   */
  trackSessionStart(): void;

  /**
   * 记录会话结束
   */
  trackSessionEnd(): void;

  /**
   * 记录新建分支（点击新建分支按钮）
   */
  trackBranchCreated(): void;

  /**
   * 设置获取当前对话列数量的回调
   * 在上报时会调用此回调获取瞬时值
   * @param getter - 返回当前 pane 数量的函数
   */
  setPaneCountGetter(getter: () => number): void;

  /**
   * 强制立即上传当前统计数据
   * 通常在页面关闭前调用
   * 
   * @returns Promise<void>
   */
  flush(): Promise<void>;

  /**
   * 设置用户匿名 ID
   * 如果不设置，会自动生成一个 UUID
   * 
   * @param id - 用户匿名 ID
   */
  setUserId(id: string): void;

  /**
   * 获取当前用户匿名 ID
   */
  getUserId(): string;

  /**
   * 启用或禁用统计
   * 禁用后所有 track 调用会被忽略
   * 
   * @param enabled - 是否启用
   */
  setEnabled(enabled: boolean): void;

  /**
   * 检查统计是否启用
   */
  isEnabled(): boolean;

  /**
   * 上报完成事件
   * 每次上报（成功或失败）后触发
   */
  readonly onDidUpload: Event<TelemetryUploadResult>;
}

/**
 * ITelemetryService 的服务标识符
 */
export const ITelemetryServiceId: symbol = Symbol('ITelemetryService');
