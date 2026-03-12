/**
 * ConversationService - 对话历史管理服务实现
 * 
 * 职责：
 * - 管理多轮对话的创建、切换、删除
 * - 持久化对话消息到 Chrome Storage
 * - 自动清理旧对话（保留最近 50 条）
 * - 自动生成对话名称
 * 
 * 存储结构：
 * - conversations:index - 对话元数据列表（不含消息）
 * - conversation:{id} - 单个对话的完整数据（含消息）
 */

import { injectable } from '../../platform/instantiation/descriptors';
import { Disposable } from '../../base/common/disposable';
import { Emitter, Event } from '../../base/common/event';
import type { IStorageService } from '../../platform/storage/storage';
import { IStorageServiceId } from '../../platform/storage/storage';
import type { ChatMessage } from '../../platform/agent/IChatService';
import type {
  IConversationService,
  Conversation,
  ConversationMeta,
  ConversationListChangeEvent,
  CurrentConversationChangeEvent
} from '../../platform/agent/IConversationService';
import { 
  IConversationServiceId, 
  MAX_CONVERSATIONS 
} from '../../platform/agent/IConversationService';

// ==================== 存储键常量 ====================

const STORAGE_KEYS = {
  /** 对话索引 */
  INDEX: 'conversations:index',
  /** 当前对话 ID */
  CURRENT: 'conversations:current',
  /** 对话数据前缀 */
  CONVERSATION_PREFIX: 'conversation:'
} as const;

/**
 * ConversationService 实现
 */
@injectable(IStorageServiceId)
export class ConversationService extends Disposable implements IConversationService {
  // ==================== 事件发射器 ====================
  private readonly _onDidConversationListChange = new Emitter<ConversationListChangeEvent>();
  public readonly onDidConversationListChange: Event<ConversationListChangeEvent> = 
    this._onDidConversationListChange.event;

  private readonly _onDidCurrentConversationChange = new Emitter<CurrentConversationChangeEvent>();
  public readonly onDidCurrentConversationChange: Event<CurrentConversationChangeEvent> = 
    this._onDidCurrentConversationChange.event;

  // ==================== 内部状态 ====================
  
  /** 当前对话 ID */
  private _currentConversationId: string | null = null;
  
  /** 对话元数据缓存 */
  private _conversationsCache: ConversationMeta[] | null = null;

  /** 是否已初始化 */
  private _initialized = false;

  /** 
   * 临时对话缓存（未持久化的对话）
   * 只有当用户发送第一条消息时才会被持久化到存储
   */
  private _pendingConversations: Map<string, Conversation> = new Map();

  constructor(
    private readonly storageService: IStorageService
  ) {
    super();
    // 异步初始化
    this.initialize();
  }

  /**
   * 初始化服务
   */
  private async initialize(): Promise<void> {
    if (this._initialized) return;
    
    try {
      // 加载当前对话 ID
      this._currentConversationId = await this.storageService.get<string>(
        STORAGE_KEYS.CURRENT, 
        null
      ) ?? null;
      
      // 预加载对话列表
      await this.getConversationList();
      
      this._initialized = true;
    } catch (error) {
    }
  }

  // ==================== 公共方法 ====================

  /**
   * 获取当前对话 ID
   */
  getCurrentConversationId(): string | null {
    return this._currentConversationId;
  }

  /**
   * 获取所有对话元数据列表
   */
  async getConversationList(): Promise<ConversationMeta[]> {
    if (this._conversationsCache) {
      return this._conversationsCache;
    }

    try {
      const list = await this.storageService.get<ConversationMeta[]>(
        STORAGE_KEYS.INDEX, 
        []
      );
      
      // 按更新时间降序排列
      this._conversationsCache = (list || []).sort((a, b) => b.updatedAt - a.updatedAt);
      return this._conversationsCache;
    } catch (error) {
      return [];
    }
  }

  /**
   * 创建新对话（草稿模式）
   * 
   * 注意：新对话不会立即出现在列表中，只在内存中创建"草稿"。
   * 只有当用户发送第一条消息时（通过 saveMessages），对话才会被添加到列表中并持久化。
   * 这样可以避免产生大量空对话。
   */
  async createConversation(name?: string): Promise<string> {
    const id = this.generateId();
    const now = Date.now();
    
    const conversation: Conversation = {
      id,
      name: name || '新对话',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      messages: []
    };

    // 将对话存储到临时缓存中（不持久化，不添加到列表）
    this._pendingConversations.set(id, conversation);

    // 设置为当前对话（只更新内存状态）
    this._currentConversationId = id;

    // 只触发当前对话变化事件（不触发列表变化）
    // UI 会显示空白对话界面
    this._onDidCurrentConversationChange.fire({
      conversationId: id,
      messages: []
    });

    return id;
  }

  /**
   * 切换到指定对话
   */
  async switchConversation(conversationId: string): Promise<ChatMessage[]> {
    try {
      const conversation = await this.loadConversation(conversationId);
      
      if (!conversation) {
        return [];
      }

      // 更新当前对话 ID
      this._currentConversationId = conversationId;
      
      // 只有非临时对话才保存当前对话 ID 到存储
      // 临时对话在刷新后会消失，所以不应该保存
      const isPending = this._pendingConversations.has(conversationId);
      if (!isPending) {
        await this.storageService.set(STORAGE_KEYS.CURRENT, conversationId);
      }

      // 触发事件
      this._onDidCurrentConversationChange.fire({
        conversationId,
        messages: conversation.messages
      });

      return conversation.messages;
    } catch (error) {
      return [];
    }
  }

  /**
   * 加载指定对话的完整数据
   */
  async loadConversation(conversationId: string): Promise<Conversation | null> {
    // 优先从临时缓存中查找（未持久化的对话）
    const pendingConv = this._pendingConversations.get(conversationId);
    if (pendingConv) {
      return pendingConv;
    }

    // 从存储中加载
    try {
      const conversation = await this.storageService.get<Conversation>(
        `${STORAGE_KEYS.CONVERSATION_PREFIX}${conversationId}`
      );
      return conversation || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 保存消息到当前对话
   * 
   * 如果当前对话是草稿（未持久化），会在保存消息时：
   * 1. 根据第一条用户消息自动命名
   * 2. 将对话添加到列表中
   * 3. 持久化到存储
   */
  async saveMessages(messages: ChatMessage[]): Promise<void> {
    if (!this._currentConversationId) {
      // 如果没有当前对话，自动创建一个
      await this.createConversation();
    }

    const conversationId = this._currentConversationId!;

    try {
      // 加载当前对话
      const conversation = await this.loadConversation(conversationId);
      if (!conversation) {
        return;
      }

      // 检查是否是草稿对话（需要首次持久化）
      const isPending = this._pendingConversations.has(conversationId);

      // 更新消息
      conversation.messages = messages;
      conversation.messageCount = messages.length;
      conversation.updatedAt = Date.now();
      
      // 更新预览文本（最后一条用户消息）
      const lastUserMessage = [...messages]
        .reverse()
        .find(m => m.role === 'user');
      if (lastUserMessage) {
        conversation.previewText = this.truncateText(lastUserMessage.content, 50);
      }

      if (isPending) {
        // 从临时缓存中移除
        this._pendingConversations.delete(conversationId);
        
        // 根据第一条用户消息自动命名
        const firstUserMessage = messages.find(m => m.role === 'user');
        if (firstUserMessage && conversation.name === '新对话') {
          conversation.name = this.truncateText(firstUserMessage.content, 20) || '新对话';
        }
        
      }

      // 保存对话数据
      await this.storageService.set(
        `${STORAGE_KEYS.CONVERSATION_PREFIX}${conversationId}`,
        conversation
      );

      // 更新索引中的元数据
      const list = await this.getConversationList();
      const index = list.findIndex(c => c.id === conversationId);
      
      const meta: ConversationMeta = {
        id: conversation.id,
        name: conversation.name,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messageCount,
        previewText: conversation.previewText
      };
      
      if (index !== -1) {
        // 已存在于列表中，更新并移到顶部
        list[index] = meta;
        const updated = list.splice(index, 1)[0];
        list.unshift(updated);
      } else {
        // 首次出现在列表中（草稿对话第一次保存）
        list.unshift(meta);
      }
      
      // 保存索引
      await this.storageService.set(STORAGE_KEYS.INDEX, list);
      
      // 同时保存当前对话 ID（如果之前是草稿对话，这个也没保存）
      if (isPending) {
        await this.storageService.set(STORAGE_KEYS.CURRENT, conversationId);
      }
      
      // 清理旧对话
      await this.cleanupOldConversations(list);
      
      this._conversationsCache = list;

      // 触发列表更新事件
      this._onDidConversationListChange.fire({
        conversations: list,
        currentId: this._currentConversationId
      });
    } catch (error) {
    }
  }

  /**
   * 更新对话名称
   */
  async renameConversation(conversationId: string, name: string): Promise<void> {
    try {
      // 更新对话数据
      const conversation = await this.loadConversation(conversationId);
      if (!conversation) {
        return;
      }

      conversation.name = name;
      conversation.updatedAt = Date.now();

      // 检查是否是临时对话
      const isPending = this._pendingConversations.has(conversationId);
      
      if (isPending) {
        // 临时对话只更新内存
        this._pendingConversations.set(conversationId, conversation);
      } else {
        // 持久化对话需要更新存储
        await this.storageService.set(
          `${STORAGE_KEYS.CONVERSATION_PREFIX}${conversationId}`,
          conversation
        );
      }

      // 更新索引
      const list = await this.getConversationList();
      const index = list.findIndex(c => c.id === conversationId);
      
      if (index !== -1) {
        list[index].name = name;
        list[index].updatedAt = conversation.updatedAt;
        
        // 只有非临时对话才更新存储中的索引
        if (!isPending) {
          await this.storageService.set(STORAGE_KEYS.INDEX, list);
        }
        this._conversationsCache = list;

        this._onDidConversationListChange.fire({
          conversations: list,
          currentId: this._currentConversationId
        });
      }
    } catch (error) {
    }
  }

  /**
   * 删除对话
   */
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      // 检查是否是草稿对话
      const isPending = this._pendingConversations.has(conversationId);
      
      if (isPending) {
        // 草稿对话只需从内存中删除
        this._pendingConversations.delete(conversationId);
        // 草稿对话不在列表中，只需处理当前对话切换
        if (this._currentConversationId === conversationId) {
          const list = await this.getConversationList();
          if (list.length > 0) {
            await this.switchConversation(list[0].id);
          } else {
            this._currentConversationId = null;
            this._onDidCurrentConversationChange.fire({
              conversationId: null,
              messages: []
            });
          }
        }
        return; // 提前返回，草稿对话不在列表中，无需触发列表变化
      }
      
      // 持久化的对话需要从存储中删除
      await this.storageService.remove(
        `${STORAGE_KEYS.CONVERSATION_PREFIX}${conversationId}`
      );

      // 更新索引
      const list = await this.getConversationList();
      const newList = list.filter(c => c.id !== conversationId);
      
      await this.storageService.set(STORAGE_KEYS.INDEX, newList);
      this._conversationsCache = newList;

      // 如果删除的是当前对话，切换到最新的对话
      if (this._currentConversationId === conversationId) {
        if (newList.length > 0) {
          await this.switchConversation(newList[0].id);
        } else {
          this._currentConversationId = null;
          await this.storageService.remove(STORAGE_KEYS.CURRENT);
          
          this._onDidCurrentConversationChange.fire({
            conversationId: null,
            messages: []
          });
        }
      }

      this._onDidConversationListChange.fire({
        conversations: newList,
        currentId: this._currentConversationId
      });

    } catch (error) {
    }
  }

  /**
   * 清空所有对话
   */
  async clearAllConversations(): Promise<void> {
    try {
      // 获取所有对话 ID
      const list = await this.getConversationList();
      
      // 删除所有持久化的对话数据（跳过临时对话）
      for (const conv of list) {
        if (!this._pendingConversations.has(conv.id)) {
          await this.storageService.remove(
            `${STORAGE_KEYS.CONVERSATION_PREFIX}${conv.id}`
          );
        }
      }

      // 清空临时对话缓存
      this._pendingConversations.clear();

      // 清空索引
      await this.storageService.set(STORAGE_KEYS.INDEX, []);
      this._conversationsCache = [];

      // 清空当前对话
      this._currentConversationId = null;
      await this.storageService.remove(STORAGE_KEYS.CURRENT);

      this._onDidConversationListChange.fire({
        conversations: [],
        currentId: null
      });

      this._onDidCurrentConversationChange.fire({
        conversationId: null,
        messages: []
      });

    } catch (error) {
    }
  }

  /**
   * 根据用户消息自动生成对话名称
   */
  async autoGenerateName(conversationId: string, userMessage: string): Promise<void> {
    // 只在对话名称还是默认的"新对话"时才自动生成
    const list = await this.getConversationList();
    const conv = list.find(c => c.id === conversationId);
    
    if (!conv || conv.name !== '新对话') {
      return;
    }

    // 简单的名称生成逻辑：取用户消息的前 20 个字符
    const name = this.truncateText(userMessage, 20) || '新对话';
    await this.renameConversation(conversationId, name);
  }

  /**
   * 创建对话分支（草稿模式）
   * 
   * 复制指定对话的消息到一个新对话中。
   * 新分支对话不会立即出现在列表中，只有当用户在分支中发送新消息时才会持久化。
   * 这样可以避免产生大量未使用的分支对话。
   */
  async branchConversation(conversationId: string, upToMessageId?: string): Promise<string> {
    try {
      // 加载源对话
      const sourceConversation = await this.loadConversation(conversationId);
      if (!sourceConversation) {
        throw new Error(`源对话不存在: ${conversationId}`);
      }

      // 确定要复制的消息
      let messagesToCopy = [...sourceConversation.messages];
      
      if (upToMessageId) {
        // 找到指定消息的索引
        const messageIndex = messagesToCopy.findIndex(m => m.id === upToMessageId);
        if (messageIndex !== -1) {
          // 只复制到指定消息为止（包含该消息）
          messagesToCopy = messagesToCopy.slice(0, messageIndex + 1);
        }
      }

      // 为复制的消息生成新的 ID，避免 ID 冲突
      const copiedMessages = messagesToCopy.map(msg => ({
        ...msg,
        id: `${msg.id}_branch_${Date.now()}`
      }));

      // 生成分支名称
      const branchName = `${sourceConversation.name} (分支)`;

      // 创建新对话
      const newId = this.generateId();
      const now = Date.now();
      
      const newConversation: Conversation = {
        id: newId,
        name: branchName,
        createdAt: now,
        updatedAt: now,
        messageCount: copiedMessages.length,
        messages: copiedMessages,
        previewText: sourceConversation.previewText
      };

      // 将分支对话存储到临时缓存中（草稿模式，不持久化，不添加到列表）
      // 只有当用户在分支中发送新消息时，才会持久化并添加到列表
      this._pendingConversations.set(newId, newConversation);

      // 设置为当前对话
      this._currentConversationId = newId;

      // 只触发当前对话变化事件（不触发列表变化）
      this._onDidCurrentConversationChange.fire({
        conversationId: newId,
        messages: copiedMessages
      });

      return newId;
    } catch (error) {
      throw error;
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 截断文本
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    const trimmed = text.trim().replace(/\n/g, ' ');
    if (trimmed.length <= maxLength) return trimmed;
    return trimmed.substring(0, maxLength) + '...';
  }

  /**
   * 清理旧对话（保留最近 MAX_CONVERSATIONS 条）
   */
  private async cleanupOldConversations(list: ConversationMeta[]): Promise<void> {
    if (list.length <= MAX_CONVERSATIONS) return;

    // 找出需要删除的对话（最旧的）
    const toDelete = list.slice(MAX_CONVERSATIONS);
    
    for (const conv of toDelete) {
      await this.storageService.remove(
        `${STORAGE_KEYS.CONVERSATION_PREFIX}${conv.id}`
      );
    }

    // 截断列表
    list.length = MAX_CONVERSATIONS;
  }

  /**
   * 释放资源
   */
  override dispose(): void {
    this._onDidConversationListChange.dispose();
    this._onDidCurrentConversationChange.dispose();
    this._conversationsCache = null;
    this._pendingConversations.clear();
    super.dispose();
  }
}

// 导出服务标识符
export { IConversationServiceId };




