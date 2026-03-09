/**
 * IConversationService - 对话历史管理服务接口
 * 
 * 负责管理多轮对话的持久化存储和切换：
 * - 创建/删除对话
 * - 切换当前对话
 * - 保存/加载对话消息
 * - 自动清理旧对话（保留最近 50 条）
 */

import { Event } from '../../base/common/event';
import type { ChatMessage } from './IChatService';

// ==================== 常量定义 ====================

/** 最大保存的对话数量 */
export const MAX_CONVERSATIONS = 50;

// ==================== 类型定义 ====================

/**
 * 对话元数据（用于列表显示）
 */
export interface ConversationMeta {
  /** 对话唯一 ID */
  id: string;
  /** 对话名称 */
  name: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
  /** 消息数量 */
  messageCount: number;
  /** 预览文本（最后一条用户消息） */
  previewText?: string;
}

/**
 * 完整对话（包含消息列表）
 */
export interface Conversation extends ConversationMeta {
  /** 对话消息列表 */
  messages: ChatMessage[];
}

/**
 * 对话列表变化事件
 */
export interface ConversationListChangeEvent {
  /** 当前对话列表 */
  conversations: ConversationMeta[];
  /** 当前活跃对话 ID */
  currentId: string | null;
}

/**
 * 当前对话变化事件
 */
export interface CurrentConversationChangeEvent {
  /** 新的当前对话 ID */
  conversationId: string | null;
  /** 对话消息（如果加载成功） */
  messages: ChatMessage[];
}

// ==================== Service 接口 ====================

/**
 * IConversationService - 对话历史管理服务接口
 */
export interface IConversationService {
  /**
   * 获取当前对话 ID
   */
  getCurrentConversationId(): string | null;

  /**
   * 获取所有对话元数据列表
   * 按更新时间降序排列
   */
  getConversationList(): Promise<ConversationMeta[]>;

  /**
   * 创建新对话
   * @param name - 可选的对话名称，默认为"新对话"
   * @returns 新对话的 ID
   */
  createConversation(name?: string): Promise<string>;

  /**
   * 切换到指定对话
   * @param conversationId - 目标对话 ID
   * @returns 对话的消息列表
   */
  switchConversation(conversationId: string): Promise<ChatMessage[]>;

  /**
   * 加载指定对话的消息
   * @param conversationId - 对话 ID
   * @returns 对话的消息列表
   */
  loadConversation(conversationId: string): Promise<Conversation | null>;

  /**
   * 保存消息到当前对话
   * @param messages - 消息列表
   */
  saveMessages(messages: ChatMessage[]): Promise<void>;

  /**
   * 更新对话名称
   * @param conversationId - 对话 ID
   * @param name - 新名称
   */
  renameConversation(conversationId: string, name: string): Promise<void>;

  /**
   * 删除对话
   * @param conversationId - 对话 ID
   */
  deleteConversation(conversationId: string): Promise<void>;

  /**
   * 清空所有对话
   */
  clearAllConversations(): Promise<void>;

  /**
   * 根据第一条用户消息自动生成对话名称
   * @param conversationId - 对话 ID
   * @param userMessage - 用户消息内容
   */
  autoGenerateName(conversationId: string, userMessage: string): Promise<void>;

  /**
   * 创建对话分支
   * 复制指定对话的所有消息到一个新对话中
   * @param conversationId - 源对话 ID
   * @param upToMessageId - 可选，复制到指定消息为止（包含该消息）
   * @returns 新分支对话的 ID
   */
  branchConversation(conversationId: string, upToMessageId?: string): Promise<string>;

  // ==================== 事件 ====================

  /**
   * 对话列表变化事件
   * 触发时机：
   * - 创建新对话
   * - 删除对话
   * - 重命名对话
   * - 对话消息更新导致预览文本变化
   */
  onDidConversationListChange: Event<ConversationListChangeEvent>;

  /**
   * 当前对话变化事件
   * 触发时机：
   * - 切换对话
   * - 创建新对话并设为当前
   */
  onDidCurrentConversationChange: Event<CurrentConversationChangeEvent>;
}

/**
 * IConversationService 的服务标识符
 */
export const IConversationServiceId: symbol = Symbol('IConversationService');







