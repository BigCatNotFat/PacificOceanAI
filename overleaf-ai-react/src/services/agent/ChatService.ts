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
 * - 会话状态管理
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
  ToolCallPendingEvent
} from '../../platform/agent/IChatService';
import { IChatServiceId } from '../../platform/agent/IChatService';
import type { IAgentService, AgentLoopController } from '../../platform/agent/IAgentService';
import { IAgentServiceId } from '../../platform/agent/IAgentService';
import type { IConversationService } from '../../platform/agent/IConversationService';
import { IConversationServiceId } from '../../platform/agent/IConversationService';

/**
 * ChatService 实现
 */
@injectable(IAgentServiceId, IConversationServiceId)
export class ChatService implements IChatService {
  // ==================== 事件发射器 ====================
  private readonly _onDidMessageUpdate = new Emitter<ChatMessage[]>();
  public readonly onDidMessageUpdate: Event<ChatMessage[]> = this._onDidMessageUpdate.event;

  private readonly _onDidToolCallPending = new Emitter<ToolCallPendingEvent>();
  public readonly onDidToolCallPending: Event<ToolCallPendingEvent> = this._onDidToolCallPending.event;

  // ==================== 核心状态 ====================
  
  /** 列表一：用户视图 (The Master List)
   * - 全量存储，给用户看的
   * - 包含所有细节：thinking、工具调用等
   */
  private _messages: ChatMessage[] = [];

  /** 防止重复提交 */
  private _isProcessing: boolean = false;

  /** 当前 Agent Loop 控制器 */
  private _currentLoop?: AgentLoopController;

  /** 当前 Loop ID（用于防止旧 Loop 的事件覆盖新消息） */
  private _currentLoopId?: string;

  /** 当前消息 ID 计数器 */
  private _messageIdCounter: number = 0;
  /** 当前这一轮对话在列表一中的起始下标（用于中断时整体回滚） */
  private _currentTurnStartIndex: number | undefined;

  /** 保存消息的防抖计时器 */
  private _saveDebounceTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly agentService: IAgentService,
    private readonly conversationService: IConversationService
  ) {
    console.log('[ChatService] 依赖注入成功', {
      hasAgentService: !!agentService,
      hasConversationService: !!conversationService
    });

    // 监听对话切换事件，加载对应对话的消息
    this.conversationService.onDidCurrentConversationChange((event) => {
      console.log('[ChatService] 对话切换:', event.conversationId);
      this._messages = event.messages;
      this._messageIdCounter = event.messages.length;
      this._onDidMessageUpdate.fire([...this._messages]);
    });

    console.log('[ChatService] 初始化完成');
  }

  // ==================== 公共方法 ====================

  /**
   * 发送消息
   */
  async sendMessage(input: string, options: ChatOptions): Promise<void> {
    // 防止并发请求
    if (this._isProcessing) {
      console.warn('[ChatService] 已有请求正在处理中');
      return;
    }

    this._isProcessing = true;

    // 记录当前这一轮对话在列表一中的起始位置
    this._currentTurnStartIndex = this._messages.length;

    try {
      // 1. 写入用户消息
      const userMessage = this.createMessage('user', input);
      // 用户消息在发送完成后即视为 completed，确保会被包含在上下文列表中
      userMessage.status = 'completed';
      this._messages.push(userMessage);
      this._onDidMessageUpdate.fire([...this._messages]);

      // 2. 立即创建占位的 assistant 消息，显示"正在发送..."
      const assistantPlaceholder = this.createMessage('assistant', '');
      assistantPlaceholder.status = 'streaming';
      this._messages.push(assistantPlaceholder);
      this._onDidMessageUpdate.fire([...this._messages]);

      console.log('[ChatService] 发送消息:', {
        mode: options.mode,
        modelId: options.modelId,
        contextItemsCount: options.contextItems?.length || 0,
        userMessageId: userMessage.id,
        assistantPlaceholderId: assistantPlaceholder.id
      });

      // 生成列表二：历史上下文视图（给 AI 看的，有损压缩）
      const contextList = this.buildContextList(this._messages);

      console.log('[ChatService] Context list before AgentService.execute:', {
        contextMessageCount: contextList.length,
        contextMessages: contextList.map(m => ({ id: m.id, role: m.role, status: m.status }))
      });

      // 3. 执行 Agent 任务（交给 AgentService）
      this._currentLoop = await this.agentService.execute(
        contextList, // 传递列表二（压缩后的历史）
        {
          modelId: options.modelId,
          mode: options.mode,
          contextItems: options.contextItems,
          maxIterations: 10,
          responseMessageId: assistantPlaceholder.id
        }
      );
      
      // 记录当前 Loop ID
      this._currentLoopId = this._currentLoop.id;

      // 4. 监听 Loop 更新（更新列表一）
      const loopId = this._currentLoop.id;
      this._currentLoop.onUpdate((updatedMessages) => {
        // 检查是否还是当前的 Loop（防止旧 Loop 覆盖新消息）
        if (this._currentLoopId !== loopId) {
          console.warn(`[ChatService] 忽略旧 Loop ${loopId} 的更新事件`);
          return;
        }
        this._messages = updatedMessages;
        this._onDidMessageUpdate.fire([...this._messages]);
        // 防抖保存消息
        this.debouncedSaveMessages();
      });

      // 5. 监听 Loop 完成（更新列表一）
      this._currentLoop.onDone((finalMessages) => {
        // 检查是否还是当前的 Loop
        if (this._currentLoopId !== loopId) {
          console.warn(`[ChatService] 忽略旧 Loop ${loopId} 的完成事件`);
          return;
        }
        this._messages = finalMessages;
        this._onDidMessageUpdate.fire([...this._messages]);
        this._isProcessing = false;
        this._currentTurnStartIndex = undefined;
        
        // 注意：列表一保留所有细节（包括 thinking），给用户看
        // 列表二会在下次请求时动态生成，自动剔除 thinking
        
        // 立即保存消息（完成时不防抖）
        this.saveMessagesNow();
        
        console.log('[ChatService] 对话完成');
      });

      // 6. 监听 Loop 错误
      this._currentLoop.onError((error) => {
        // 检查是否还是当前的 Loop
        if (this._currentLoopId !== loopId) {
          console.warn(`[ChatService] 忽略旧 Loop ${loopId} 的错误事件`);
          return;
        }
        console.error('[ChatService] Agent Loop 错误:', error);
        
        const errorMessage = this.createMessage('assistant', `抱歉，发生了错误: ${error.message}`);
        errorMessage.status = 'error';
        this._messages.push(errorMessage);
        this._onDidMessageUpdate.fire([...this._messages]);
        
        this._isProcessing = false;
        this._currentTurnStartIndex = undefined;
      });

      // 7. 监听工具审批事件（转发给 UI）
      this._currentLoop.onToolCallPending((event) => {
        // 检查是否还是当前的 Loop
        if (this._currentLoopId !== loopId) {
          console.warn(`[ChatService] 忽略旧 Loop ${loopId} 的工具审批事件`);
          return;
        }
        console.log('[ChatService] 工具调用待审批:', event);
        this._onDidToolCallPending.fire(event);
      });

    } catch (error) {
      console.error('[ChatService] sendMessage error:', error);
      
      const errorMessage = this.createMessage('assistant', '抱歉，发生了错误');
      errorMessage.status = 'error';
      errorMessage.error = error instanceof Error ? error.message : String(error);
      this._messages.push(errorMessage);
      this._onDidMessageUpdate.fire([...this._messages]);
      
      this._isProcessing = false;
      this._currentTurnStartIndex = undefined;
    }
  }

  /**
   * 中断当前正在进行的对话
   */
  abort(): void {
    console.log('[ChatService] 中断请求');
    
    if (this._currentLoop) {
      const abortedLoopId = this._currentLoop.id;
      console.log(`[ChatService] 中断 Loop: ${abortedLoopId}`);
      this._currentLoop.abort();
      this._currentLoop = undefined;
      this._currentLoopId = undefined;
    }

    // 回滚当前这一轮对话（从起始下标开始的所有消息全部移除）
    if (typeof this._currentTurnStartIndex === 'number') {
      this._messages = this._messages.slice(0, this._currentTurnStartIndex);
      this._currentTurnStartIndex = undefined;
      this._onDidMessageUpdate.fire([...this._messages]);
    }

    this._isProcessing = false;
  }

  /**
   * 批准工具调用（通过 controller）
   */
  async approveToolCall(toolCallId: string): Promise<void> {
    if (!this._currentLoop) {
      console.warn('[ChatService] 未找到当前 Loop');
      return;
    }

    console.log('[ChatService] 批准工具调用:', toolCallId);
    
    try {
      await this._currentLoop.approveToolCall(toolCallId);
    } catch (error) {
      console.error('[ChatService] approveToolCall error:', error);
      
      const errorMessage = this.createMessage('assistant', `工具执行失败: ${error}`);
      errorMessage.status = 'error';
      this._messages.push(errorMessage);
      this._onDidMessageUpdate.fire([...this._messages]);
    }
  }

  /**
   * 拒绝工具调用（通过 controller）
   */
  async rejectToolCall(toolCallId: string): Promise<void> {
    if (!this._currentLoop) {
      console.warn('[ChatService] 未找到当前 Loop');
      return;
    }

    console.log('[ChatService] 拒绝工具调用:', toolCallId);
    
    await this._currentLoop.rejectToolCall(toolCallId);
    
    // 添加拒绝消息
    const rejectMessage = this.createMessage('assistant', '你已拒绝该操作。');
    rejectMessage.status = 'completed';
    this._messages.push(rejectMessage);
    this._onDidMessageUpdate.fire([...this._messages]);
  }

  // ==================== 私有方法 ====================

  /**
   * 生成列表二：历史上下文视图 (The Context List)
   * 
   * 从列表一（用户视图）生成给 AI 看的压缩版本：
   * 1. 剔除所有 assistant 消息的 thinking 字段
   * 2. 折叠/移除失败的工具调用（可选）
   * 3. 移除中间状态的消息（streaming、aborted 等）
   * 
   * 目的：
   * - 节省 Token
   * - 防止 AI 被上一轮错误的推理路径误导（Attention 污染）
   * - 只保留关键的“用户意图”和“最终结果”
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
          return false; // 或者保留，但简化错误信息
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
   * 创建消息
   */
  private createMessage(role: MessageRole, content: string): ChatMessage {
    return {
      id: `msg_${this._messageIdCounter++}`,
      role,
      content,
      status: 'pending',
      timestamp: Date.now()
    };
  }

  /**
   * 获取列表一（用户视图）
   */
  getMessages(): ChatMessage[] {
    return [...this._messages];
  }

  /**
   * 防抖保存消息（流式更新时调用）
   */
  private debouncedSaveMessages(): void {
    if (this._saveDebounceTimer) {
      clearTimeout(this._saveDebounceTimer);
    }
    this._saveDebounceTimer = setTimeout(() => {
      this.saveMessagesNow();
    }, 1000); // 1 秒防抖
  }

  /**
   * 立即保存消息
   */
  private async saveMessagesNow(): Promise<void> {
    if (this._saveDebounceTimer) {
      clearTimeout(this._saveDebounceTimer);
      this._saveDebounceTimer = undefined;
    }

    try {
      // 保存消息到当前对话
      await this.conversationService.saveMessages(this._messages);

      // 如果是第一条用户消息，自动生成对话名称
      const firstUserMessage = this._messages.find(m => m.role === 'user');
      if (firstUserMessage && this._messages.filter(m => m.role === 'user').length === 1) {
        const conversationId = this.conversationService.getCurrentConversationId();
        if (conversationId) {
          await this.conversationService.autoGenerateName(conversationId, firstUserMessage.content);
        }
      }
    } catch (error) {
      console.error('[ChatService] 保存消息失败:', error);
    }
  }

  /**
   * 清空当前对话消息
   */
  clearMessages(): void {
    this._messages = [];
    this._messageIdCounter = 0;
    this._onDidMessageUpdate.fire([]);
  }

  /**
   * 释放资源
   */
  dispose(): void {
    if (this._saveDebounceTimer) {
      clearTimeout(this._saveDebounceTimer);
    }
    this._onDidMessageUpdate.dispose();
    this._onDidToolCallPending.dispose();
    this._messages = [];
    this._currentLoop = undefined;
  }
}

// 导出服务标识符
export { IChatServiceId };
