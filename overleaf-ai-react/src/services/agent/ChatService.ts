/**
 * ChatService - Services 层实现
 * 
 * 核心职责：
 * - 维护列表一：用户视图 (The Master List)
 *   · 给用户看的，全量存储
 *   · 包含所有细节：thinking、工具调用参数和结果
 * 
 * - 生成列表二：历史上下文视图 (The Context List)
 *   · 给 AI 看的，有损压缩
 *   · 剔除 thinking，折叠失败的工具调用
 *   · 临时性，不存储，每次请求前计算
 * 
 * - 多会话状态管理（支持并行多列对话）
 * - 事件分发（消息更新、工具审批）
 * - 会话持久化（通过 ConversationService）
 */

import { injectable } from '../../platform/instantiation/descriptors';
import { Emitter, Event } from '../../base/common/event';
import type {
  IChatService,
  ChatMessage,
  ChatOptions,
  MessageRole,
  ToolCallPendingEvent,
  MessageUpdateEvent
} from '../../platform/agent/IChatService';
import { IChatServiceId } from '../../platform/agent/IChatService';
import type { IAgentService, AgentLoopController } from '../../platform/agent/IAgentService';
import { IAgentServiceId } from '../../platform/agent/IAgentService';
import type { IConversationService } from '../../platform/agent/IConversationService';
import { IConversationServiceId } from '../../platform/agent/IConversationService';

/**
 * 单个会话的状态
 */
interface SessionState {
  /** 会话 ID */
  conversationId: string;
  /** 消息列表（用户视图） */
  messages: ChatMessage[];
  /** 是否正在处理 */
  isProcessing: boolean;
  /** 当前 Agent Loop 控制器 */
  currentLoop?: AgentLoopController;
  /** 当前 Loop ID（用于防止旧 Loop 的事件覆盖新消息） */
  currentLoopId?: string;
  /** 消息 ID 计数器 */
  messageIdCounter: number;
  /** 当前这一轮对话在列表一中的起始下标（用于中断时整体回滚） */
  currentTurnStartIndex?: number;
  /** 保存消息的防抖计时器 */
  saveDebounceTimer?: ReturnType<typeof setTimeout>;
}

/**
 * ChatService 实现 - 支持多会话并行
 */
@injectable(IAgentServiceId, IConversationServiceId)
export class ChatService implements IChatService {
  // ==================== 事件发射器 ====================
  private readonly _onDidMessageUpdate = new Emitter<MessageUpdateEvent>();
  public readonly onDidMessageUpdate: Event<MessageUpdateEvent> = this._onDidMessageUpdate.event;

  private readonly _onDidToolCallPending = new Emitter<ToolCallPendingEvent>();
  public readonly onDidToolCallPending: Event<ToolCallPendingEvent> = this._onDidToolCallPending.event;

  // ==================== 核心状态 ====================
  
  /** 按 conversationId 隔离的会话状态 */
  private sessions: Map<string, SessionState> = new Map();

  constructor(
    private readonly agentService: IAgentService,
    private readonly conversationService: IConversationService
  ) {
    console.log('[ChatService] 依赖注入成功', {
      hasAgentService: !!agentService,
      hasConversationService: !!conversationService
    });

    // 监听对话切换事件，加载对应对话的消息到 session
    this.conversationService.onDidCurrentConversationChange((event) => {
      if (!event.conversationId) return;
      
      console.log('[ChatService] 对话切换:', event.conversationId);
      
      // 获取或创建 session
      const session = this.getOrCreateSession(event.conversationId);
      
      // 加载消息到 session
      session.messages = event.messages;
      session.messageIdCounter = event.messages.length;
      
      // 触发更新事件
      this._onDidMessageUpdate.fire({
        conversationId: event.conversationId,
        messages: [...session.messages]
      });
    });

    console.log('[ChatService] 初始化完成');
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 获取或创建会话状态
   */
  private getOrCreateSession(conversationId: string): SessionState {
    let session = this.sessions.get(conversationId);
    if (!session) {
      session = {
        conversationId,
        messages: [],
        isProcessing: false,
        messageIdCounter: 0
      };
      this.sessions.set(conversationId, session);
    }
    return session;
  }

  /**
   * 创建全局唯一的消息 ID
   * 格式：{conversationId}:msg_{counter}_{timestamp}
   */
  private createMessage(session: SessionState, role: MessageRole, content: string): ChatMessage {
    const timestamp = Date.now();
    return {
      id: `${session.conversationId}:msg_${session.messageIdCounter++}_${timestamp}`,
      role,
      content,
      status: 'pending',
      timestamp
    };
  }

  /**
   * 生成列表二：历史上下文视图 (The Context List)
   * 
   * 从列表一（用户视图）生成给 AI 看的压缩版本：
   * 1. 剔除所有 assistant 消息的 thinking 字段
   * 2. 折叠/移除失败的工具调用（可选）
   * 3. 移除中间状态的消息（streaming、aborted 等）
   */
  private buildContextList(messages: ChatMessage[]): ChatMessage[] {
    return messages
      .filter(msg => {
        // 移除中间状态的消息
        if (msg.status === 'streaming' || msg.status === 'pending') {
          return false;
        }
        // 移除失败的消息（可选）
        if (msg.status === 'error' || msg.status === 'aborted') {
          return false;
        }
        return true;
      })
      .map(msg => {
        // 剔除 assistant 消息的 thinking
        if (msg.role === 'assistant') {
          const { thinking, ...rest } = msg;
          return rest;
        }
        return { ...msg };
      });
  }

  /**
   * 防抖保存消息（流式更新时调用）
   */
  private debouncedSaveMessages(session: SessionState): void {
    if (session.saveDebounceTimer) {
      clearTimeout(session.saveDebounceTimer);
    }
    session.saveDebounceTimer = setTimeout(() => {
      this.saveMessagesNow(session);
    }, 1000); // 1 秒防抖
  }

  /**
   * 立即保存消息
   */
  private async saveMessagesNow(session: SessionState): Promise<void> {
    if (session.saveDebounceTimer) {
      clearTimeout(session.saveDebounceTimer);
      session.saveDebounceTimer = undefined;
    }

    try {
      // 确保保存到正确的对话
      const currentConvId = this.conversationService.getCurrentConversationId();
      if (currentConvId === session.conversationId) {
        await this.conversationService.saveMessages(session.messages);

        // 如果是第一条用户消息，自动生成对话名称
        const firstUserMessage = session.messages.find(m => m.role === 'user');
        if (firstUserMessage && session.messages.filter(m => m.role === 'user').length === 1) {
          await this.conversationService.autoGenerateName(session.conversationId, firstUserMessage.content);
        }
      }
    } catch (error) {
      console.error('[ChatService] 保存消息失败:', error);
    }
  }

  // ==================== 公共方法 ====================

  /**
   * 发送消息
   */
  async sendMessage(input: string, options: ChatOptions): Promise<void> {
    const { conversationId } = options;
    if (!conversationId) {
      console.error('[ChatService] conversationId 是必填项');
      return;
    }

    const session = this.getOrCreateSession(conversationId);

    // 防止同一会话的并发请求
    if (session.isProcessing) {
      console.warn(`[ChatService] 会话 ${conversationId} 已有请求正在处理中`);
      return;
    }

    session.isProcessing = true;

    // 记录当前这一轮对话在列表一中的起始位置
    session.currentTurnStartIndex = session.messages.length;

    try {
      // 1. 写入用户消息
      const userMessage = this.createMessage(session, 'user', input);
      userMessage.status = 'completed';
      session.messages.push(userMessage);
      this._onDidMessageUpdate.fire({
        conversationId,
        messages: [...session.messages]
      });

      // 2. 立即创建占位的 assistant 消息
      const assistantPlaceholder = this.createMessage(session, 'assistant', '');
      assistantPlaceholder.status = 'streaming';
      session.messages.push(assistantPlaceholder);
      this._onDidMessageUpdate.fire({
        conversationId,
        messages: [...session.messages]
      });

      console.log('[ChatService] 发送消息:', {
        conversationId,
        mode: options.mode,
        modelId: options.modelId,
        contextItemsCount: options.contextItems?.length || 0,
        userMessageId: userMessage.id,
        assistantPlaceholderId: assistantPlaceholder.id
      });

      // 生成列表二：历史上下文视图
      const contextList = this.buildContextList(session.messages);

      // 3. 执行 Agent 任务
      session.currentLoop = await this.agentService.execute(
        contextList,
        {
          modelId: options.modelId,
          mode: options.mode,
          contextItems: options.contextItems,
          maxIterations: options.maxIterations ?? 100,
          responseMessageId: assistantPlaceholder.id
        }
      );
      
      session.currentLoopId = session.currentLoop.id;
      const loopId = session.currentLoop.id;

      // 4. 监听 Loop 更新
      session.currentLoop.onUpdate((updatedMessages) => {
        if (session.currentLoopId !== loopId) {
          console.warn(`[ChatService] 忽略旧 Loop ${loopId} 的更新事件`);
          return;
        }
        session.messages = updatedMessages;
        this._onDidMessageUpdate.fire({
          conversationId,
          messages: [...session.messages]
        });
        this.debouncedSaveMessages(session);
      });

      // 5. 监听 Loop 完成
      session.currentLoop.onDone((finalMessages) => {
        if (session.currentLoopId !== loopId) {
          console.warn(`[ChatService] 忽略旧 Loop ${loopId} 的完成事件`);
          return;
        }
        session.messages = finalMessages;
        this._onDidMessageUpdate.fire({
          conversationId,
          messages: [...session.messages]
        });
        session.isProcessing = false;
        session.currentTurnStartIndex = undefined;
        
        this.saveMessagesNow(session);
        console.log(`[ChatService] 会话 ${conversationId} 对话完成`);
      });

      // 6. 监听 Loop 错误
      session.currentLoop.onError((error) => {
        if (session.currentLoopId !== loopId) {
          console.warn(`[ChatService] 忽略旧 Loop ${loopId} 的错误事件`);
          return;
        }
        console.error(`[ChatService] 会话 ${conversationId} Agent Loop 错误:`, error);
        
        const errorMessage = this.createMessage(session, 'assistant', `抱歉，发生了错误: ${error.message}`);
        errorMessage.status = 'error';
        session.messages.push(errorMessage);
        this._onDidMessageUpdate.fire({
          conversationId,
          messages: [...session.messages]
        });
        
        session.isProcessing = false;
        session.currentTurnStartIndex = undefined;
      });

      // 7. 监听工具审批事件
      session.currentLoop.onToolCallPending((event) => {
        if (session.currentLoopId !== loopId) {
          console.warn(`[ChatService] 忽略旧 Loop ${loopId} 的工具审批事件`);
          return;
        }
        console.log(`[ChatService] 会话 ${conversationId} 工具调用待审批:`, event);
        this._onDidToolCallPending.fire(event);
      });

    } catch (error) {
      console.error(`[ChatService] 会话 ${conversationId} sendMessage error:`, error);
      
      const errorMessage = this.createMessage(session, 'assistant', '抱歉，发生了错误');
      errorMessage.status = 'error';
      errorMessage.error = error instanceof Error ? error.message : String(error);
      session.messages.push(errorMessage);
      this._onDidMessageUpdate.fire({
        conversationId,
        messages: [...session.messages]
      });
      
      session.isProcessing = false;
      session.currentTurnStartIndex = undefined;
    }
  }

  /**
   * 中断指定会话或所有会话的对话
   */
  abort(conversationId?: string): void {
    if (conversationId) {
      // 中断指定会话
      const session = this.sessions.get(conversationId);
      if (session) {
        this.abortSession(session);
      }
    } else {
      // 中断所有会话
      for (const session of this.sessions.values()) {
        if (session.isProcessing) {
          this.abortSession(session);
        }
      }
    }
  }

  /**
   * 中断单个会话
   */
  private abortSession(session: SessionState): void {
    console.log(`[ChatService] 中断会话 ${session.conversationId}`);
    
    if (session.currentLoop) {
      console.log(`[ChatService] 中断 Loop: ${session.currentLoop.id}`);
      session.currentLoop.abort();
      session.currentLoop = undefined;
      session.currentLoopId = undefined;
    }

    // 回滚当前这一轮对话
    if (typeof session.currentTurnStartIndex === 'number') {
      session.messages = session.messages.slice(0, session.currentTurnStartIndex);
      session.currentTurnStartIndex = undefined;
      this._onDidMessageUpdate.fire({
        conversationId: session.conversationId,
        messages: [...session.messages]
      });
    }

    session.isProcessing = false;
  }

  /**
   * 批准工具调用
   */
  async approveToolCall(conversationId: string, toolCallId: string): Promise<void> {
    const session = this.sessions.get(conversationId);
    if (!session?.currentLoop) {
      console.warn(`[ChatService] 会话 ${conversationId} 未找到当前 Loop`);
      return;
    }

    console.log(`[ChatService] 会话 ${conversationId} 批准工具调用:`, toolCallId);
    
    try {
      await session.currentLoop.approveToolCall(toolCallId);
    } catch (error) {
      console.error(`[ChatService] 会话 ${conversationId} approveToolCall error:`, error);
      
      const errorMessage = this.createMessage(session, 'assistant', `工具执行失败: ${error}`);
      errorMessage.status = 'error';
      session.messages.push(errorMessage);
      this._onDidMessageUpdate.fire({
        conversationId,
        messages: [...session.messages]
      });
    }
  }

  /**
   * 拒绝工具调用
   */
  async rejectToolCall(conversationId: string, toolCallId: string): Promise<void> {
    const session = this.sessions.get(conversationId);
    if (!session?.currentLoop) {
      console.warn(`[ChatService] 会话 ${conversationId} 未找到当前 Loop`);
      return;
    }

    console.log(`[ChatService] 会话 ${conversationId} 拒绝工具调用:`, toolCallId);
    
    await session.currentLoop.rejectToolCall(toolCallId);
    
    // 添加拒绝消息
    const rejectMessage = this.createMessage(session, 'assistant', '你已拒绝该操作。');
    rejectMessage.status = 'completed';
    session.messages.push(rejectMessage);
    this._onDidMessageUpdate.fire({
      conversationId,
      messages: [...session.messages]
    });
  }

  /**
   * 获取指定会话的消息列表
   */
  getMessages(conversationId: string): ChatMessage[] {
    const session = this.sessions.get(conversationId);
    return session ? [...session.messages] : [];
  }

  /**
   * 检查指定会话是否正在生成
   */
  isProcessing(conversationId: string): boolean {
    const session = this.sessions.get(conversationId);
    return session?.isProcessing ?? false;
  }

  /**
   * 清空指定会话的消息
   */
  clearMessages(conversationId: string): void {
    const session = this.sessions.get(conversationId);
    if (session) {
      session.messages = [];
      session.messageIdCounter = 0;
      this._onDidMessageUpdate.fire({
        conversationId,
        messages: []
      });
    }
  }

  /**
   * 释放资源
   */
  dispose(): void {
    // 清理所有会话的定时器
    for (const session of this.sessions.values()) {
      if (session.saveDebounceTimer) {
        clearTimeout(session.saveDebounceTimer);
      }
    }
    
    this._onDidMessageUpdate.dispose();
    this._onDidToolCallPending.dispose();
    this.sessions.clear();
  }
}

// 导出服务标识符
export { IChatServiceId };
