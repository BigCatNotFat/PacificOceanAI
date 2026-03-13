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
import type { IPromptService } from '../../platform/agent/IPromptService';
import { IPromptServiceId } from '../../platform/agent/IPromptService';
import type { ILLMService } from '../../platform/llm/ILLMService';
import { ILLMServiceId } from '../../platform/llm/ILLMService';
import type { IModelRegistryService } from '../../platform/llm/IModelRegistryService';
import { IModelRegistryServiceId } from '../../platform/llm/IModelRegistryService';
import type { IUIStreamService } from '../../platform/agent/IUIStreamService';
import { IUIStreamServiceId } from '../../platform/agent/IUIStreamService';
import type { ILiteratureService } from '../../platform/literature/ILiteratureService';
import { ILiteratureServiceId } from '../../platform/literature/ILiteratureService';
import { ManagerAgentLoopService } from './multiAgent/services/ManagerAgentLoopService';

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
  /** 工具调用 ID -> 工具名称的映射（用于统计） */
  toolCallIdToNameMap?: Map<string, string>;
}

/**
 * ChatService 实现 - 支持多会话并行
 */
@injectable(IAgentServiceId, IConversationServiceId, IPromptServiceId, ILLMServiceId, IModelRegistryServiceId, IUIStreamServiceId, ILiteratureServiceId)
export class ChatService implements IChatService {
  // ==================== 事件发射器 ====================
  private readonly _onDidMessageUpdate = new Emitter<MessageUpdateEvent>();
  public readonly onDidMessageUpdate: Event<MessageUpdateEvent> = this._onDidMessageUpdate.event;

  private readonly _onDidToolCallPending = new Emitter<ToolCallPendingEvent>();
  public readonly onDidToolCallPending: Event<ToolCallPendingEvent> = this._onDidToolCallPending.event;

  // ==================== 核心状态 ====================
  
  /** 按 conversationId 隔离的会话状态 */
  private sessions: Map<string, SessionState> = new Map();

  /** ManagerAgentLoopService 实例（用于 plan 模式） */
  private managerAgentLoopService?: ManagerAgentLoopService;

  constructor(
    private readonly agentService: IAgentService,
    private readonly conversationService: IConversationService,
    private readonly promptService: IPromptService,
    private readonly llmService: ILLMService,
    private readonly modelRegistry: IModelRegistryService,
    private readonly uiStreamService: IUIStreamService,
    private readonly literatureService: ILiteratureService
  ) {

    // 监听对话切换事件，加载对应对话的消息到 session
    this.conversationService.onDidCurrentConversationChange((event) => {
      if (!event.conversationId) return;
      
      
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
  /**
   * Ensure no pending/streaming messages linger after failure/abort.
   * This prevents UI from being stuck in "generating" state.
   */
  private clearUIStreamingState(conversationId: string, messageId: string): void {
    // Force UI stream buffers to emit done so React hook can release stale entries.
    this.uiStreamService.pushThinking({ conversationId, messageId, delta: '', done: true });
    this.uiStreamService.pushContent({ conversationId, messageId, delta: '', done: true });
  }

  private finalizeInFlightMessages(
    session: SessionState,
    status: 'error' | 'aborted',
    errorMessage?: string,
    options?: {
      clearStreamingState?: boolean;
      stoppedByUser?: boolean;
    }
  ): void {
    for (const msg of session.messages) {
      // Retry metadata is runtime-only and should not survive failures.
      msg.retryInfo = undefined;

      if (msg.status !== 'pending' && msg.status !== 'streaming') {
        continue;
      }

      const streamContent = this.uiStreamService.getContentBuffer(msg.id);
      const streamThinking = this.uiStreamService.getThinkingBuffer(msg.id);

      if ((!msg.content || msg.content.length === 0) && streamContent) {
        msg.content = streamContent;
      }
      if ((!msg.thinking || msg.thinking.length === 0) && streamThinking) {
        msg.thinking = streamThinking;
      }

      const hasPartialOutput =
        (msg.content?.trim().length ?? 0) > 0 ||
        (msg.thinking?.trim().length ?? 0) > 0;

      if (hasPartialOutput || options?.stoppedByUser) {
        // Keep partial output visible and reusable for follow-up "continue".
        msg.status = 'completed';
        msg.interrupted = true;
        msg.stoppedByUser = options?.stoppedByUser ? true : undefined;
        msg.error = undefined;
      } else {
        msg.status = status;
        msg.stoppedByUser = options?.stoppedByUser ? true : undefined;
        if (status === 'error' && errorMessage && !msg.error) {
          msg.error = errorMessage;
        }
      }

      if (options?.clearStreamingState) {
        this.clearUIStreamingState(session.conversationId, msg.id);
      }
    }
  }

  private markCurrentTurnAsStoppedByUser(session: SessionState): void {
    const startIndex = session.currentTurnStartIndex ?? 0;
    let target = [...session.messages]
      .slice(startIndex)
      .reverse()
      .find((msg) => msg.role === 'assistant' && msg.status !== 'error');

    if (!target) {
      target = this.createMessage(session, 'assistant', '');
      target.status = 'completed';
      session.messages.push(target);
    }

    target.status = 'completed';
    target.interrupted = true;
    target.stoppedByUser = true;
    target.error = undefined;
    this.clearUIStreamingState(session.conversationId, target.id);
  }

  private isContinueRequest(input: string): boolean {
    const normalized = input.trim().toLowerCase();
    return (
      normalized === '继续' ||
      normalized === '继续生成' ||
      normalized === '继续写' ||
      normalized === '接着写' ||
      normalized === 'continue' ||
      normalized === 'go on'
    );
  }

  private buildContinueInstruction(session: SessionState, input: string): string | null {
    if (!this.isContinueRequest(input)) {
      return null;
    }

    const latestAssistantWithOutput = [...session.messages]
      .reverse()
      .find((msg) => msg.role === 'assistant' && (msg.content?.trim().length ?? 0) > 0 && msg.status !== 'error');

    if (!latestAssistantWithOutput?.interrupted) {
      return null;
    }

    const tail = latestAssistantWithOutput.content.slice(-1200);
    return [
      '请从你上一次回答中断的位置继续输出，保持同样语言与格式，不要重复已经输出的内容。',
      '以下是上次回答末尾片段，可用于定位续写起点：',
      tail
    ].join('\n');
  }

  private buildContextList(messages: ChatMessage[]): ChatMessage[] {
    return messages
      .filter(msg => {
        // 移除中间状态的消息
        if (msg.status === 'streaming' || msg.status === 'pending') {
          return false;
        }
        // 移除失败的消息（可选）
        if (msg.status === 'error' || msg.status === 'aborted') {
          if (msg.role === 'tool' && msg.toolCalls && msg.toolCalls.length > 0) {
            return true;
          }
          return false;
        }
        return true;
      })
      .map(msg => {
        // 剔除 assistant 消息的 thinking
        if (msg.role === 'assistant') {
          const { thinking, retryInfo, interrupted, stoppedByUser, ...rest } = msg;
          return rest;
        }
        return { ...msg };
      });
  }

  /**
   * 执行 Plan 模式（使用 ManagerAgentLoopService）
   */
  private async executePlanMode(
    session: SessionState,
    responseMessageId: string,
    options: ChatOptions,
    userInput: string
  ): Promise<void> {
    const conversationId = session.conversationId;

    let updateDisposable: { dispose: () => void } | undefined;
    let errorDisposable: { dispose: () => void } | undefined;

    try {
      // 获取或创建 ManagerAgentLoopService
      if (!this.managerAgentLoopService) {
        this.managerAgentLoopService = new ManagerAgentLoopService(
          this.llmService,
          this.modelRegistry,
          this.uiStreamService,
          this.promptService,
          this.literatureService
        );
      }

      // 获取用户消息
      // 说明：首次加载时可能存在初始化/加载竞态，导致 session.messages 被短暂覆盖为空。
      // 为了稳定性，优先使用本次 sendMessage 的入参作为 userMessage。
      const directUserMessage = (userInput ?? '').trim();
      const lastUserMessage = [...session.messages].reverse().find(m => m.role === 'user' && (m.content ?? '').trim().length > 0);
      const userMessageToUse = directUserMessage || lastUserMessage?.content;
      if (!userMessageToUse) {
        throw new Error('未找到用户消息');
      }

      // 订阅更新事件
      updateDisposable = this.managerAgentLoopService.onUpdate((event) => {
        
        // 更新 assistant 消息内容
        const assistantMsg = session.messages.find(m => m.id === responseMessageId);
        if (assistantMsg) {
          // 如果已经进入 completed/error，就不要再覆盖 UI 文本了
          if (assistantMsg.status && assistantMsg.status !== 'streaming' && assistantMsg.status !== 'pending') {
            return;
          }

          // 显示当前阶段状态
          let statusText = '';
          switch (event.phase) {
            case 'planning':
              statusText = '正在规划...';
              break;
            case 'agent_working':
              statusText = ``;
              break;
            case 'completed':
              statusText = '';
              break;
          }
          
          if (event.phase !== 'completed') {
            assistantMsg.content = statusText;
            this._onDidMessageUpdate.fire({
              conversationId,
              messages: [...session.messages]
            });
          }
        }
      });

      // 订阅错误事件
      errorDisposable = this.managerAgentLoopService.onError((error) => {
      });

      // 执行 ManagerAgentLoop
      const result = await this.managerAgentLoopService.run({
        modelId: options.modelId,
        userMessage: userMessageToUse,
        conversationId,
        maxIterations: options.maxIterations ?? 10,
        uiStreamConfig: {
          enabled: true,
          conversationId,
          messageId: responseMessageId
        }
      });

      // 更新最终结果
      const assistantMsg = session.messages.find(m => m.id === responseMessageId);
      if (assistantMsg) {
        assistantMsg.content = result.finalOutput || (result.success ? '任务已完成' : `执行失败: ${result.error}`);
        assistantMsg.status = result.success ? 'completed' : 'error';
        if (result.error) {
          assistantMsg.error = result.error;
        }
      }

      session.isProcessing = false;
      this._onDidMessageUpdate.fire({
        conversationId,
        messages: [...session.messages]
      });

      session.currentTurnStartIndex = undefined;
      await this.saveMessagesNow(session);


    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      const assistantMsg = session.messages.find(m => m.id === responseMessageId);
      if (assistantMsg) {
        assistantMsg.content = `执行失败: ${errorText}`;
        assistantMsg.status = 'error';
        assistantMsg.error = errorText;
      }

      this.finalizeInFlightMessages(session, 'error', errorText, { clearStreamingState: true });
      session.isProcessing = false;
      this._onDidMessageUpdate.fire({
        conversationId,
        messages: [...session.messages]
      });

      session.currentTurnStartIndex = undefined;
    } finally {
      // 无论成功/失败都必须释放订阅，避免残留回调持续把 UI 写回“正在工作...”
      try { updateDisposable?.dispose(); } catch {}
      try { errorDisposable?.dispose(); } catch {}
    }
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
    }
  }

  // ==================== 公共方法 ====================

  /**
   * 发送消息
   */
  async sendMessage(input: string, options: ChatOptions, images?: string[]): Promise<void> {
    const { conversationId } = options;
    if (!conversationId) {
      return;
    }

    const session = this.getOrCreateSession(conversationId);

    // 防止同一会话的并发请求
    if (session.isProcessing) {
      return;
    }

    session.isProcessing = true;

    // 记录当前这一轮对话在列表一中的起始位置
    session.currentTurnStartIndex = session.messages.length;

    try {
      // ========== 步骤 1：立即添加用户消息（Optimistic UI） ==========
      // 先让用户在 UI 上看到自己的消息，再做异步操作（系统提示词、持久化等）
      const needsSystemPrompt = session.messages.length === 0;

      const userMessage = this.createMessage(session, 'user', input);
      userMessage.status = 'completed';
      if (images && images.length > 0) {
        userMessage.images = images;
      }
      session.messages.push(userMessage);
      this._onDidMessageUpdate.fire({
        conversationId,
        messages: [...session.messages]
      });

      // ========== 步骤 2：立即创建 AI 响应占位符 ==========
      // 这样在首次对话构建 system prompt 的等待期也能显示“正在发送...”
      const assistantPlaceholder = this.createMessage(session, 'assistant', '');
      assistantPlaceholder.status = 'streaming';
      session.messages.push(assistantPlaceholder);
      this._onDidMessageUpdate.fire({
        conversationId,
        messages: [...session.messages]
      });

      // ========== 步骤 3：首次对话时插入系统提示词（在用户消息之前） ==========
      if (needsSystemPrompt) {
        try {
          const systemPrompt = await this.promptService.buildSystemPrompt(
            options.mode || 'agent',
            options.modelId || 'gpt-4'
          );
          
          const systemMessage = this.createMessage(session, 'system', systemPrompt);
          systemMessage.status = 'completed';
          // 插入到用户消息之前，保持 [system, user, ...] 的顺序
          const userMsgIndex = session.messages.indexOf(userMessage);
          session.messages.splice(userMsgIndex, 0, systemMessage);
          
        } catch (error) {
        }
      }

      // ========== 步骤 4：后台保存到本地（不阻塞 UI） ==========
      this.saveMessagesNow(session).then(() => {
      }).catch((error) => {
      });

      // ========== Plan 模式：使用 ManagerAgentLoopService ==========
      if (options.mode === 'plan') {
        await this.executePlanMode(session, assistantPlaceholder.id, options, input);
        return;
      }

      // 生成列表二：历史上下文视图
      const contextList = this.buildContextList(session.messages);
      const continueInstruction = this.buildContinueInstruction(session, input);
      if (continueInstruction) {
        for (let i = contextList.length - 1; i >= 0; i--) {
          if (contextList[i].role === 'user') {
            contextList[i] = {
              ...contextList[i],
              content: `${contextList[i].content}\n\n${continueInstruction}`
            };
            break;
          }
        }
      }

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
          return;
        }
        session.messages = finalMessages;
        session.isProcessing = false;
        this._onDidMessageUpdate.fire({
          conversationId,
          messages: [...session.messages]
        });
        session.currentTurnStartIndex = undefined;
        
        this.saveMessagesNow(session);
      });

      // 6. 监听 Loop 错误
      session.currentLoop.onError((error) => {
        if (session.currentLoopId !== loopId) {
          return;
        }
        // 尝试找到并更新正在流式的消息状态，避免 UI 一直 loading
        const errorText = error instanceof Error ? error.message : String(error);
        this.finalizeInFlightMessages(session, 'error', errorText, { clearStreamingState: true });

        const errorMessage = this.createMessage(session, 'assistant', `抱歉，发生了错误: ${error.message}`);
        errorMessage.status = 'error';
        errorMessage.content = `抱歉，发生了错误: ${errorText}`;
        session.messages.push(errorMessage);
        session.isProcessing = false;
        this._onDidMessageUpdate.fire({
          conversationId,
          messages: [...session.messages]
        });
        
        session.currentTurnStartIndex = undefined;
        
        // 错误时也保存，确保错误状态被持久化
        this.saveMessagesNow(session);
      });

      // 7. 监听工具审批事件
      session.currentLoop.onToolCallPending((event) => {
        if (session.currentLoopId !== loopId) {
          return;
        }
        
        // 记录 toolCallId -> toolName 映射（用于统计）
        if (!session.toolCallIdToNameMap) {
          session.toolCallIdToNameMap = new Map();
        }
        session.toolCallIdToNameMap.set(event.id, event.toolName);
        
        this._onDidToolCallPending.fire(event);
      });

    } catch (error) {
      const errorMessage = this.createMessage(session, 'assistant', '抱歉，发生了错误');
      errorMessage.status = 'error';
      const errorText = error instanceof Error ? error.message : String(error);
      errorMessage.error = errorText;
      session.messages.push(errorMessage);
      this.finalizeInFlightMessages(session, 'error', errorText, { clearStreamingState: true });
      session.isProcessing = false;
      this._onDidMessageUpdate.fire({
        conversationId,
        messages: [...session.messages]
      });
      
      session.currentTurnStartIndex = undefined;
    }
  }

  /**
   * 中断指定会话或所有会话的对话
   */
  abort(conversationId?: string): void {
    // 中断 ManagerAgentLoopService（如果正在运行）
    if (this.managerAgentLoopService) {
      this.managerAgentLoopService.abort();
    }

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
    
    if (session.currentLoop) {
      session.currentLoop.abort();
      session.currentLoop = undefined;
      session.currentLoopId = undefined;
    }

    this.finalizeInFlightMessages(session, 'aborted', undefined, {
      clearStreamingState: true,
      stoppedByUser: true
    });
    this.markCurrentTurnAsStoppedByUser(session);
    session.isProcessing = false;
    session.currentTurnStartIndex = undefined;

    this._onDidMessageUpdate.fire({
      conversationId: session.conversationId,
      messages: [...session.messages]
    });

    // Persist partial output so user can continue after refresh.
    this.saveMessagesNow(session);
  }

  /**
   * 批准工具调用
   */
  async approveToolCall(conversationId: string, toolCallId: string): Promise<void> {
    const session = this.sessions.get(conversationId);
    if (!session?.currentLoop) {
      return;
    }

    
    try {
      await session.currentLoop.approveToolCall(toolCallId);
    } catch (error) {
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
      return;
    }

    
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
   * 加载指定对话的消息到 session 中
   * 用于多列对话场景，当打开一个新的对话时需要主动加载消息
   */
  async loadConversationMessages(conversationId: string): Promise<ChatMessage[]> {
    
    // 检查是否已经有消息（避免重复加载）
    const existingSession = this.sessions.get(conversationId);
    if (existingSession && existingSession.messages.length > 0) {
      return existingSession.messages;
    }
    
    try {
      // 从 ConversationService 加载对话
      const conversation = await this.conversationService.loadConversation(conversationId);
      
      if (!conversation) {
        return [];
      }
      
      // 获取或创建 session
      const session = this.getOrCreateSession(conversationId);
      
      // 加载消息到 session
      session.messages = conversation.messages;
      session.messageIdCounter = conversation.messages.length;
      
      
      // 触发更新事件
      this._onDidMessageUpdate.fire({
        conversationId,
        messages: [...session.messages]
      });
      
      return session.messages;
    } catch (error) {
      return [];
    }
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
    
    // 清理 ManagerAgentLoopService
    if (this.managerAgentLoopService) {
      this.managerAgentLoopService.dispose();
      this.managerAgentLoopService = undefined;
    }
    
    this._onDidMessageUpdate.dispose();
    this._onDidToolCallPending.dispose();
    this.sessions.clear();
  }
}

// 导出服务标识符
export { IChatServiceId };
