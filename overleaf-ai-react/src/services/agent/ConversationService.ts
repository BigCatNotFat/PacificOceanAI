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
    console.log('[ConversationService] 初始化');
    
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
      console.log('[ConversationService] 初始化完成', {
        currentId: this._currentConversationId,
        conversationCount: this._conversationsCache?.length || 0
      });
    } catch (error) {
      console.error('[ConversationService] 初始化失败:', error);
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
      console.error('[ConversationService] 获取对话列表失败:', error);
      return [];
    }
  }

  /**
   * 创建新对话
   * 
   * 注意：新对话不会立即持久化到存储中，只在内存中创建。
   * 只有当用户发送第一条消息时（通过 saveMessages），对话才会被真正保存。
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

    // 将对话存储到临时缓存中（不持久化）
    this._pendingConversations.set(id, conversation);

    // 更新内存中的对话列表缓存
    const list = await this.getConversationList();
    const meta: ConversationMeta = {
      id: conversation.id,
      name: conversation.name,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messageCount
    };
    
    list.unshift(meta);
    this._conversationsCache = list;

    // 设置为当前对话（只更新内存状态，不保存到存储）
    this._currentConversationId = id;

    // 触发事件（UI 需要更新）
    this._onDidConversationListChange.fire({
      conversations: list,
      currentId: id
    });

    this._onDidCurrentConversationChange.fire({
      conversationId: id,
      messages: []
    });

    console.log('[ConversationService] 创建新对话（临时）:', id);
    return id;
  }

  /**
   * 切换到指定对话
   */
  async switchConversation(conversationId: string): Promise<ChatMessage[]> {
    try {
      const conversation = await this.loadConversation(conversationId);
      
      if (!conversation) {
        console.warn('[ConversationService] 对话不存在:', conversationId);
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

      console.log('[ConversationService] 切换到对话:', conversationId, isPending ? '(临时)' : '');
      return conversation.messages;
    } catch (error) {
      console.error('[ConversationService] 切换对话失败:', error);
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
      console.error('[ConversationService] 加载对话失败:', error);
      return null;
    }
  }

  /**
   * 保存消息到当前对话
   * 
   * 如果当前对话是临时的（未持久化），会在保存消息时一并持久化对话。
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
        console.warn('[ConversationService] 当前对话不存在');
        return;
      }

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

      // 检查是否是临时对话（需要首次持久化）
      const isPending = this._pendingConversations.has(conversationId);
      if (isPending) {
        // 从临时缓存中移除
        this._pendingConversations.delete(conversationId);
        console.log('[ConversationService] 持久化临时对话:', conversationId);
      }

      // 保存对话数据
      await this.storageService.set(
        `${STORAGE_KEYS.CONVERSATION_PREFIX}${conversationId}`,
        conversation
      );

      // 更新索引中的元数据
      const list = await this.getConversationList();
      const index = list.findIndex(c => c.id === conversationId);
      
      if (index !== -1) {
        list[index] = {
          id: conversation.id,
          name: conversation.name,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          messageCount: conversation.messageCount,
          previewText: conversation.previewText
        };
        
        // 将更新的对话移到列表顶部
        const updated = list.splice(index, 1)[0];
        list.unshift(updated);
        
        // 如果是首次持久化，也需要保存索引
        await this.storageService.set(STORAGE_KEYS.INDEX, list);
        
        // 同时保存当前对话 ID（如果之前是临时对话，这个也没保存）
        if (isPending) {
          await this.storageService.set(STORAGE_KEYS.CURRENT, conversationId);
        }
        
        this._conversationsCache = list;

        // 触发列表更新事件
        this._onDidConversationListChange.fire({
          conversations: list,
          currentId: this._currentConversationId
        });
      }
    } catch (error) {
      console.error('[ConversationService] 保存消息失败:', error);
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
        console.warn('[ConversationService] 对话不存在:', conversationId);
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
      console.error('[ConversationService] 重命名对话失败:', error);
    }
  }

  /**
   * 删除对话
   */
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      // 检查是否是临时对话
      const isPending = this._pendingConversations.has(conversationId);
      
      if (isPending) {
        // 临时对话只需从内存中删除
        this._pendingConversations.delete(conversationId);
        console.log('[ConversationService] 删除临时对话:', conversationId);
      } else {
        // 持久化的对话需要从存储中删除
        await this.storageService.remove(
          `${STORAGE_KEYS.CONVERSATION_PREFIX}${conversationId}`
        );
      }

      // 更新索引
      const list = await this.getConversationList();
      const newList = list.filter(c => c.id !== conversationId);
      
      // 只有非临时对话才需要更新存储中的索引
      if (!isPending) {
        await this.storageService.set(STORAGE_KEYS.INDEX, newList);
      }
      this._conversationsCache = newList;

      // 如果删除的是当前对话，切换到最新的对话或创建新对话
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

      console.log('[ConversationService] 删除对话:', conversationId);
    } catch (error) {
      console.error('[ConversationService] 删除对话失败:', error);
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

      console.log('[ConversationService] 清空所有对话');
    } catch (error) {
      console.error('[ConversationService] 清空对话失败:', error);
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
      console.log('[ConversationService] 清理旧对话:', conv.id);
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




