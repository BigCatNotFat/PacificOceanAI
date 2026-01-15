/**
 * IDiffSuggestionService - Diff 建议服务接口
 * 
 * 管理编辑器中的 diff 建议，支持：
 * - 创建单个或批量建议
 * - 接受/拒绝建议
 * - 批量操作（Accept All / Reject All）
 * - 事件通知
 */

import type { Event } from '../../base/common/event';

/**
 * Diff 建议状态
 */
export type DiffSuggestionStatus = 'pending' | 'accepted' | 'rejected';

/**
 * Diff 建议数据结构
 */
export interface DiffSuggestion {
  /** 建议唯一标识 */
  id: string;
  /** 关联的工具调用 ID */
  toolCallId: string;
  /** 目标文件名 */
  targetFile: string;
  /** 起始行号（1-indexed） */
  startLine: number;
  /** 结束行号（1-indexed，inclusive） */
  endLine: number;
  /** 原始内容 */
  oldContent: string;
  /** 新内容 */
  newContent: string;
  /** 建议状态 */
  status: DiffSuggestionStatus;
  /** 创建时间戳 */
  createdAt: number;
}

/**
 * 创建建议的输入参数
 */
export interface CreateSuggestionInput {
  /** 关联的工具调用 ID */
  toolCallId: string;
  /** 目标文件名 */
  targetFile: string;
  /** 起始行号（1-indexed） */
  startLine: number;
  /** 结束行号（1-indexed，inclusive） */
  endLine: number;
  /** 原始内容 */
  oldContent: string;
  /** 新内容 */
  newContent: string;
}

/**
 * 建议决策事件
 */
export interface SuggestionResolvedEvent {
  /** 建议 ID */
  id: string;
  /** 是否接受 */
  accepted: boolean;
  /** 目标文件 */
  targetFile: string;
}

/**
 * Diff 建议服务接口
 */
export interface IDiffSuggestionService {
  /**
   * 创建单个 diff 建议
   * @param input 建议参数
   * @returns 建议 ID
   */
  createSuggestion(input: CreateSuggestionInput): Promise<string>;

  /**
   * 批量创建 diff 建议
   * @param inputs 建议参数数组
   * @returns 建议 ID 数组
   */
  createBatchSuggestions(inputs: CreateSuggestionInput[]): Promise<string[]>;

  /**
   * 接受指定建议
   * @param id 建议 ID
   */
  acceptSuggestion(id: string): Promise<void>;

  /**
   * 拒绝指定建议
   * @param id 建议 ID
   */
  rejectSuggestion(id: string): Promise<void>;

  /**
   * 接受所有待处理的建议
   */
  acceptAll(): Promise<void>;

  /**
   * 拒绝所有待处理的建议
   */
  rejectAll(): Promise<void>;

  /**
   * 获取所有待处理的建议
   */
  getPendingSuggestions(): DiffSuggestion[];

  /**
   * 获取指定建议
   * @param id 建议 ID
   */
  getSuggestion(id: string): DiffSuggestion | undefined;

  /**
   * 清除所有建议
   */
  clearAll(): void;

  /**
   * 建议被决策时触发的事件
   */
  readonly onSuggestionResolved: Event<SuggestionResolvedEvent>;

  /**
   * 释放资源
   */
  dispose(): void;
}

/**
 * 服务标识符
 */
export const IDiffSuggestionServiceId: symbol = Symbol('IDiffSuggestionService');

