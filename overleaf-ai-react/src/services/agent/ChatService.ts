/**
 * ChatService - Services 层实现（重构后）
 * 
 * 职责简化为：
 * - 会话状态管理
 * - 消息历史管理
 * - 事件分发（消息更新、工具审批）
 * - 会话持久化
 * 
 * 不再负责：
 * - Agent Loop 逻辑（移至 AgentService）
 * - 工具调用决策（移至 AgentService）
 * - LLM 调用（由 AgentService 负责）
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

/**
 * ChatService 实现
 */
@injectable(IAgentServiceId)
export class ChatService implements IChatService {
  // ==================== 事件发射器 ====================
  private readonly _onDidMessageUpdate = new Emitter<ChatMessage[]>();
  public readonly onDidMessageUpdate: Event<ChatMessage[]> = this._onDidMessageUpdate.event;

  private readonly _onDidToolCallPending = new Emitter<ToolCallPendingEvent>();
  public readonly onDidToolCallPending: Event<ToolCallPendingEvent> = this._onDidToolCallPending.event;

  // ==================== 核心状态 ====================
  
  /** 当前活跃会话的消息列表 */
  private _messages: ChatMessage[] = [];

  /** 防止重复提交 */
  private _isProcessing: boolean = false;

  /** 当前 Agent Loop 控制器 */
  private _currentLoop?: AgentLoopController;

  /** 当前消息 ID 计数器 */
  private _messageIdCounter: number = 0;

  constructor(
    private readonly agentService: IAgentService
  ) {
    console.log('[ChatService] 依赖注入成功', {
      hasAgentService: !!agentService
    });

    // 订阅 AgentService 的工具审批事件，转发给 UI
    this.agentService.onDidToolCallPending((event) => {
      this._onDidToolCallPending.fire(event);
    });
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

    try {
      // 1. 写入用户消息
      const userMessage = this.createMessage('user', input);
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
        contextItemsCount: options.contextItems?.length || 0
      });

      // 构造一份用于 Agent Loop 的消息副本，去掉 assistant 的 thinking，避免旧的 reasoning_content 影响新一轮对话
      const loopMessages = this.stripThinkingForLoop(this._messages);
      // const test1 = loopMessages;
      // const test2 = {
      //     modelId: options.modelId,
      //     mode: options.mode,
      //     contextItems: options.contextItems,
      //     maxIterations: 10
      //   };
      // console.log('test1:', JSON.stringify(test1, null, 2));
      // console.log('test2:', JSON.stringify(test2, null, 2));
//       test1: [
//   {
//     "id": "msg_0",
//     "role": "user",
//     "content": "你好",
//     "status": "pending",
//     "timestamp": 1764906453216
//   },
//   {
//     "id": "msg_1",
//     "role": "assistant",
//     "content": "",
//     "status": "streaming",
//     "timestamp": 1764906453216
//   }
// ]
// test2: {
//   "modelId": "deepseek-chat",
//   "mode": "chat",
//   "contextItems": [],
//   "maxIterations": 10
// }
      // 3. 启动 Agent Loop（交给 AgentService）
      this._currentLoop = await this.agentService.startLoop(
        loopMessages,
        {
          modelId: options.modelId,
          mode: options.mode,
          contextItems: options.contextItems,
          maxIterations: 10
        }
      );

      // 3. 监听 Loop 更新
      this._currentLoop.onUpdate((updatedMessages) => {
        this._messages = updatedMessages;
        this._onDidMessageUpdate.fire([...this._messages]);
      });

      // 4. 监听 Loop 完成
      this._currentLoop.onDone((finalMessages) => {
        this._messages = finalMessages;
        this._onDidMessageUpdate.fire([...this._messages]);
        this._isProcessing = false;
        
        // 🔑 不再在这里清理思考内容，而是在发送新消息时清理
        // 这样可以让用户看到当前轮次的完整思考过程
        
        // TODO: 持久化对话时可以选择不保存 thinking 字段
        // await this.conversationStore.save(conversationId, this._messages);
        
        console.log('[ChatService] 对话完成');
      });

      // 5. 监听 Loop 错误
      this._currentLoop.onError((error) => {
        console.error('[ChatService] Agent Loop 错误:', error);
        
        const errorMessage = this.createMessage('assistant', `抱歉，发生了错误: ${error.message}`);
        errorMessage.status = 'error';
        this._messages.push(errorMessage);
        this._onDidMessageUpdate.fire([...this._messages]);
        
        this._isProcessing = false;
      });

    } catch (error) {
      console.error('[ChatService] sendMessage error:', error);
      
      const errorMessage = this.createMessage('assistant', '抱歉，发生了错误');
      errorMessage.status = 'error';
      errorMessage.error = error instanceof Error ? error.message : String(error);
      this._messages.push(errorMessage);
      this._onDidMessageUpdate.fire([...this._messages]);
      
      this._isProcessing = false;
    }
  }

  /**
   * 中断当前正在进行的对话
   */
  abort(): void {
    console.log('[ChatService] 中断请求');
    
    if (this._currentLoop) {
      this._currentLoop.abort();
      this._currentLoop = undefined;
    }

    // 更新最后一条消息为已中断
    if (this._messages.length > 0) {
      const lastMessage = this._messages[this._messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.status === 'streaming') {
        lastMessage.status = 'aborted';
        lastMessage.content += '\n\n[已中断]';
        lastMessage.thinking = undefined;
        this._onDidMessageUpdate.fire([...this._messages]);
      }
    }

    this._isProcessing = false;
  }

  /**
   * 批准工具调用
   */
  async approveToolCall(toolCallId: string): Promise<void> {
    if (!this._currentLoop) {
      console.warn('[ChatService] 未找到当前 Loop');
      return;
    }

    console.log('[ChatService] 批准工具调用:', toolCallId);
    
    try {
      await this.agentService.approveToolCall(this._currentLoop.id, toolCallId);
    } catch (error) {
      console.error('[ChatService] approveToolCall error:', error);
      
      const errorMessage = this.createMessage('assistant', `工具执行失败: ${error}`);
      errorMessage.status = 'error';
      this._messages.push(errorMessage);
      this._onDidMessageUpdate.fire([...this._messages]);
    }
  }

  /**
   * 拒绝工具调用
   */
  async rejectToolCall(toolCallId: string): Promise<void> {
    if (!this._currentLoop) {
      console.warn('[ChatService] 未找到当前 Loop');
      return;
    }

    console.log('[ChatService] 拒绝工具调用:', toolCallId);
    
    await this.agentService.rejectToolCall(this._currentLoop.id, toolCallId);
    
    // 添加拒绝消息
    const rejectMessage = this.createMessage('assistant', '你已拒绝该操作。');
    rejectMessage.status = 'completed';
    this._messages.push(rejectMessage);
    this._onDidMessageUpdate.fire([...this._messages]);
  }

  // ==================== 私有方法 ====================

  /**
   * 为 Agent Loop 构造干净的消息副本（不带 thinking）
   */
  private stripThinkingForLoop(messages: ChatMessage[]): ChatMessage[] {
    return messages.map(msg =>
      msg.role === 'assistant'
        ? { ...msg, thinking: undefined }
        : { ...msg }
    );
  }

  /**
   * 清除历史 assistant 消息中的思考内容
   * 防止在新的用户提问中继续携带过往的 reasoning_content
   */
  private clearHistoryThinking(): void {
    for (const msg of this._messages) {
      if (msg.role === 'assistant') {
        msg.thinking = undefined;
      }
    }
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
   * 释放资源
   */
  dispose(): void {
    this._onDidMessageUpdate.dispose();
    this._onDidToolCallPending.dispose();
    this._messages = [];
    this._currentLoop = undefined;
  }
}

// 导出服务标识符
export { IChatServiceId };
