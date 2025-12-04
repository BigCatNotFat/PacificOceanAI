/**
 * ChatService - Services 层实现
 * 
 * 核心对话编排服务，负责：
 * - 状态管理（消息列表、处理状态）
 * - Agent 循环（LLM 调用 -> 工具检测 -> 工具执行 -> 继续调用）
 * - 工具审批流程
 * 
 * 使用示例：
 * ```typescript
 * const chatService = new ChatService();
 * 
 * // 监听消息更新
 * chatService.onDidMessageUpdate((messages) => {
 *   console.log('消息更新:', messages);
 * });
 * 
 * // 监听工具审批请求
 * chatService.onDidToolCallPending((event) => {
 *   console.log('工具需要审批:', event.toolName);
 *   // 显示审批弹窗...
 *   // 用户点击批准后：
 *   chatService.approveToolCall(event.id);
 * });
 * 
 * // 发送消息
 * await chatService.sendMessage('帮我读取第三行', {
 *   modelId: 'gpt-4',
 *   mode: 'agent',
 *   contextItems: []
 * });
 * ```
 */

import { injectable } from '../../platform/instantiation/descriptors';
import { Emitter, Event } from '../../base/common/event';
import type {
  IChatService,
  ChatMessage,
  ChatOptions,
  MessageRole,
  ToolCallPendingEvent,
  ToolCall
} from '../../platform/agent/IChatService';
import { IChatServiceId } from '../../platform/agent/IChatService';
import type {
  IModelRegistryService,
  ModelCapabilities,
  ModelConfig
} from '../../platform/llm/IModelRegistryService';
import { IModelRegistryServiceId } from '../../platform/llm/IModelRegistryService';
import type { IPromptService } from '../../platform/agent/IPromptService';
import { IPromptServiceId } from '../../platform/agent/IPromptService';
import type { IToolService } from '../../platform/agent/IToolService';
import { IToolServiceId } from '../../platform/agent/IToolService';
import type { ILLMService } from '../../platform/llm/ILLMService';
import { ILLMServiceId } from '../../platform/llm/ILLMService';

/**
 * ChatService 实现
 */
@injectable(ILLMServiceId, IPromptServiceId, IToolServiceId, IModelRegistryServiceId)
export class ChatService implements IChatService {
  // ==================== 事件发射器 ====================
  private readonly _onDidMessageUpdate = new Emitter<ChatMessage[]>();
  public readonly onDidMessageUpdate: Event<ChatMessage[]> = this._onDidMessageUpdate.event;

  private readonly _onDidToolCallPending = new Emitter<ToolCallPendingEvent>();
  public readonly onDidToolCallPending: Event<ToolCallPendingEvent> = this._onDidToolCallPending.event;

  // ==================== 核心状态 ====================
  
  /** 当前活跃会话的消息列表（仅内存中的视图） */
  private _messages: ChatMessage[] = [];

  /** 防止重复提交和并发请求 */
  private _isProcessing: boolean = false;

  /** 当前正在进行的 LLM 流，用于 abort */
  private _currentStream?: any; // StreamResponse 类型暂时用 any

  /** 存放等待用户审批的工具调用 */
  private _pendingToolCalls: Map<string, PendingToolCall> = new Map();

  /** 当前消息 ID 计数器 */
  private _messageIdCounter: number = 0;

  /** 当前对话的选项（用于继续 Agent Loop） */
  private _currentOptions?: ChatOptions;

  constructor(
    private readonly llmService: ILLMService,
    private readonly promptService: IPromptService,
    private readonly toolService: IToolService,
    private readonly modelRegistry: IModelRegistryService
  ) {
    console.log('[ChatService] 依赖注入成功', {
      hasLLMService: !!llmService,
      hasPromptService: !!promptService,
      hasToolService: !!toolService,
      hasModelRegistry: !!modelRegistry
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
    
    // 保存当前选项，用于后续的 Agent Loop
    this._currentOptions = options;

    try {
      // 1. 写入用户消息
      const userMessage = this.createMessage('user', input);
//       {
//   "id": "msg_0",
//   "role": "user",
//   "content": "帮我读取第三行",
//   "status": "pending",
//   "timestamp": 1716300000000  // 当前时间的毫秒时间戳
// }
      this._messages.push(userMessage);
      console.log(JSON.stringify(this._messages, null, 2)); // 打印当前数组内容
// [
//   {
//     "id": "msg_0",
//     "role": "user",
//     "content": "帮我读取第三行",
//     "status": "pending",
//     "timestamp": 1716300000000
//   }
// ]

      this._onDidMessageUpdate.fire([...this._messages]);//通知外界（通常是前端 UI），消息列表已经更新了，请立刻刷新显示。

      // 2. 获取模型能力和默认配置
      const modelCapabilities = this.modelRegistry.getCapabilities(options.modelId);
      const modelConfig = this.modelRegistry.getDefaultConfig(options.modelId);
      
      // 检查模型是否存在
      if (!modelCapabilities || !modelConfig) {
        throw new Error(`未找到模型: ${options.modelId}`);
      }

      // 根据模式检查模型能力
      if (options.mode === 'agent' && !modelCapabilities.supportsTools) {
        console.warn(`[ChatService] 模型 ${options.modelId} 不支持工具调用，但当前模式为 agent`);
      }

      console.log('[ChatService] 模型能力:', modelCapabilities);
      console.log('[ChatService] 默认配置:', modelConfig);

      userMessage.status = 'completed'; 
        // 再次通知 UI 更新（让用户消息停止转圈）
      this._onDidMessageUpdate.fire([...this._messages]);
      // 3. 构建 Prompt
      const llmMessages = await this.promptService.constructMessages(
        this._messages,
        options.mode,
        options.contextItems,
        { modelId: options.modelId }
      );
      console.log('[ChatService] 构建的 LLM 消息数量:', llmMessages.length);
      console.log('[ChatService] System Prompt 预览:', llmMessages[0]?.content.substring(0, 100) + '...');
      console.log('============== [Debug: startAgentLoop 之前] ==============');
      
      // 打印 options：查看当前的模式、模型ID、上下文参数
      console.log('[ChatService] Options:', JSON.stringify(options, null, 2));
      
      // 打印 llmMessages：查看最终发给 LLM 的完整消息列表（包含 system prompt）
      console.log('[ChatService] LLM Messages:', JSON.stringify(llmMessages, null, 2));
      
      console.log('==========================================================');
      // 4. 启动 Agent Loop
      await this.startAgentLoop(options, llmMessages);

    } catch (error) {
      console.error('[ChatService] sendMessage error:', error);
      const errorMessage = this.createMessage('assistant', '抱歉，发生了错误');
      errorMessage.status = 'error';
      errorMessage.error = error instanceof Error ? error.message : String(error);
      this._messages.push(errorMessage);
      this._onDidMessageUpdate.fire([...this._messages]);
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * 中断当前正在进行的 LLM 流式生成
   */
  abort(): void {
    console.log('[ChatService] 中断请求');
    
    // 取消 LLM 流
    if (this._currentStream) {
      if (typeof this._currentStream.cancel === 'function') {
        this._currentStream.cancel();
      }
      this._currentStream = undefined;
    }

    // 更新最后一条消息为已中断
    if (this._messages.length > 0) {
      const lastMessage = this._messages[this._messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.status === 'streaming') {
        lastMessage.status = 'aborted';
        lastMessage.content += '\n\n[已中断]';
        lastMessage.thinking = undefined; // 清除思考内容
        this._onDidMessageUpdate.fire([...this._messages]);
      }
    }

    this._isProcessing = false;
  }

  /**
   * 批准工具调用
   */
  async approveToolCall(toolCallId: string): Promise<void> {
    const pendingCall = this._pendingToolCalls.get(toolCallId);
    if (!pendingCall) {
      console.warn('[ChatService] 未找到待审批的工具调用:', toolCallId);
      return;
    }

    // 移除 pending 记录
    this._pendingToolCalls.delete(toolCallId);

    try {
      console.log('[ChatService] 用户批准工具调用:', pendingCall.toolName);
      
      // 执行工具
      const result = await this.toolService.executeTool(
        pendingCall.toolName,
        pendingCall.arguments
      );
      console.log('[ChatService] 工具执行结果:', result);

      // 将工具执行结果封装为一条 ToolMessage
      const toolMessage = this.createMessage('tool', JSON.stringify(result.data || result));
      toolMessage.toolCalls = [{
        id: toolCallId,
        name: pendingCall.toolName,
        arguments: pendingCall.arguments,
        result: result.data,
        status: result.success ? 'completed' : 'error'
      }];
      this._messages.push(toolMessage);
      this._onDidMessageUpdate.fire([...this._messages]);

      // 继续 Agent Loop - 将工具执行结果作为新的上下文发送给 LLM
      if (this._currentOptions) {
        await this.continueAgentLoop(this._currentOptions);
      } else {
        console.warn('[ChatService] 未找到当前 options，无法继续 Agent Loop');
      }

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
    const pendingCall = this._pendingToolCalls.get(toolCallId);
    if (!pendingCall) {
      console.warn('[ChatService] 未找到待审批的工具调用:', toolCallId);
      return;
    }

    // 移除 pending 记录
    this._pendingToolCalls.delete(toolCallId);

    // 添加一条系统消息说明用户拒绝了该操作
    const rejectMessage = this.createMessage('assistant', `用户拒绝了工具调用: ${pendingCall.toolName}`);
    rejectMessage.status = 'completed';
    this._messages.push(rejectMessage);
    this._onDidMessageUpdate.fire([...this._messages]);

    // 可选：将该信息作为上下文再次发给 LLM，让其给出替代方案
  }

  // ==================== 私有方法 ====================

  /**
   * 启动 Agent Loop（第一轮）
   * @param options - 聊天选项
   * @param llmMessages - 已构建好的 LLM 消息列表（包含 system prompt 和历史）
   */
  private async startAgentLoop(options: ChatOptions, llmMessages: any[]): Promise<void> {
    // 创建 assistant 消息占位符
    const assistantMessage = this.createMessage('assistant', '');
    assistantMessage.status = 'streaming';
    this._messages.push(assistantMessage);
    this._onDidMessageUpdate.fire([...this._messages]);

    // 调用 LLM 服务
    if (llmMessages.length > 0) {
      try {
        // 获取模型配置
        const modelConfig = this.modelRegistry.getDefaultConfig(options.modelId);
        
        // 调用流式 API
        const stream = await this.llmService.streamResponse(llmMessages, {
          modelId: options.modelId,
          temperature: modelConfig?.temperature,
          topP: modelConfig?.topP,
          maxTokens: modelConfig?.maxTokens,
          stream: true
        });

        // 存储当前流，用于 abort
        this._currentStream = stream;

        // 监听 token 流
        stream.onToken((chunk) => {
          if (chunk.type === 'thinking') {
            // 更新思考内容
            assistantMessage.thinking = (assistantMessage.thinking || '') + chunk.delta;
          } else if (chunk.type === 'content') {
            // 更新回答内容
            assistantMessage.content += chunk.delta;
          }
          this._onDidMessageUpdate.fire([...this._messages]);
        });

        // 监听错误
        stream.onError((error) => {
          console.error('[ChatService] LLM 流式调用错误:', error);
          assistantMessage.status = 'error';
          assistantMessage.error = error.message;
          this._onDidMessageUpdate.fire([...this._messages]);
        });

        // 监听完成
        stream.onDone(async (finalMessage) => {
          console.log('[ChatService] LLM 流式调用完成:', finalMessage);
          
          // 更新最终内容
          assistantMessage.content = finalMessage.content;
          assistantMessage.status = 'completed';
          assistantMessage.thinking = undefined; // 清除思考内容
          
          // 检查是否有工具调用
          if (finalMessage.toolCalls && finalMessage.toolCalls.length > 0) {
            console.log('[ChatService] 检测到工具调用:', finalMessage.toolCalls);
            
            // 将工具调用信息添加到 assistant 消息中
            assistantMessage.toolCalls = finalMessage.toolCalls.map(tc => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
              status: 'pending'
            }));
            
            // 处理工具调用
            await this.handleToolCalls(finalMessage.toolCalls, options);
          }
          
          this._onDidMessageUpdate.fire([...this._messages]);
          this._currentStream = undefined;
        });

      } catch (error) {
        console.error('[ChatService] 启动 LLM 流式调用失败:', error);
        assistantMessage.status = 'error';
        assistantMessage.error = error instanceof Error ? error.message : String(error);
        this._onDidMessageUpdate.fire([...this._messages]);
      }
    } else {
      console.warn('[ChatService] llmService 未初始化或消息为空，使用模拟响应');
      // 备用：模拟 LLM 流式响应
      await this.simulateStreamResponse(assistantMessage, options, llmMessages);
    }
  }

  /**
   * 处理工具调用
   * 
   * 完整流程：
   * 1. LLM 返回工具调用 -> handleToolCalls
   * 2. 遍历每个工具调用
   * 3. 检查工具元信息（needApproval）
   * 4a. 如果需要审批：
   *     - 存储到 _pendingToolCalls
   *     - 触发 onDidToolCallPending 事件
   *     - UI 显示审批弹窗
   *     - 用户点击批准 -> approveToolCall
   *     - 执行工具 -> 继续 Agent Loop
   * 4b. 如果不需要审批：
   *     - 直接执行工具 (executeToolDirectly)
   *     - 继续 Agent Loop
   * 5. Agent Loop：将工具结果作为新消息发给 LLM
   * 6. LLM 返回最终回答或更多工具调用
   * 
   * @param toolCalls - 工具调用列表
   * @param options - 聊天选项
   */
  private async handleToolCalls(toolCalls: any[], options: ChatOptions): Promise<void> {
    console.log('[ChatService] 开始处理工具调用，共 %d 个', toolCalls.length);
    
    for (const toolCall of toolCalls) {
      const { id: toolCallId, name: toolName, arguments: toolArgs } = toolCall;
      
      console.log(`[ChatService] 处理工具: ${toolName} (${toolCallId})`);
      
      // 获取工具元信息
      let tool = this.toolService.getTool(toolName);
      
      if (!tool) {
        console.warn(`[ChatService] 未找到工具: ${toolName}，使用 mock 工具`);
        // 使用 mock 工具
        tool = this.createMockTool(toolName);
      }
      
      // 检查是否需要审批
      if (tool.needApproval) {
        console.log(`[ChatService] 工具 ${toolName} 需要用户审批`);
        
        // 存储待审批的工具调用
        this._pendingToolCalls.set(toolCallId, {
          id: toolCallId,
          toolName,
          arguments: toolArgs,
          messageId: this._messages[this._messages.length - 1]?.id || ''
        });
        
        // 触发工具调用待审批事件
        this._onDidToolCallPending.fire({
          id: toolCallId,
          toolName,
          arguments: toolArgs,
          targetFile: toolArgs.file_path || toolArgs.fileName || '未知文件',
          summary: this.generateToolCallSummary(toolName, toolArgs),
          messageId: this._messages[this._messages.length - 1]?.id || ''
        });
        
        // 等待用户审批，这里不继续执行
        // 用户点击批准后会调用 approveToolCall
      } else {
        console.log(`[ChatService] 工具 ${toolName} 不需要审批，直接执行`);
        
        // 直接执行工具
        await this.executeToolDirectly(toolCallId, toolName, toolArgs, options);
      }
    }
  }

  /**
   * 直接执行工具（不需要审批的工具）
   */
  private async executeToolDirectly(
    toolCallId: string,
    toolName: string,
    toolArgs: any,
    options: ChatOptions
  ): Promise<void> {
    try {
      // 执行工具
      const result = await this.toolService.executeTool(toolName, toolArgs);
      
      console.log(`[ChatService] 工具 ${toolName} 执行结果:`, result);
      
      // 将工具执行结果封装为一条 ToolMessage
      const toolMessage = this.createMessage('tool', JSON.stringify(result.data || result));
      toolMessage.toolCalls = [{
        id: toolCallId,
        name: toolName,
        arguments: toolArgs,
        result: result.data,
        status: result.success ? 'completed' : 'error'
      }];
      this._messages.push(toolMessage);
      this._onDidMessageUpdate.fire([...this._messages]);
      
      // 继续 Agent Loop - 将工具结果作为新上下文发给 LLM
      await this.continueAgentLoop(options);
      
    } catch (error) {
      console.error(`[ChatService] 工具 ${toolName} 执行失败:`, error);
      
      const errorMessage = this.createMessage('tool', `工具执行失败: ${error}`);
      errorMessage.status = 'error';
      this._messages.push(errorMessage);
      this._onDidMessageUpdate.fire([...this._messages]);
    }
  }

  /**
   * 继续 Agent Loop
   * 在工具执行完成后，将结果作为新的上下文发送给 LLM
   */
  private async continueAgentLoop(options: ChatOptions): Promise<void> {
    console.log('[ChatService] 继续 Agent Loop...');
    
    // 重新构建 prompt（包含工具执行结果）
    const llmMessages = await this.promptService.constructMessages(
      this._messages,
      options.mode,
      options.contextItems,
      { modelId: options.modelId }
    );
    
    // 启动新一轮 LLM 调用
    await this.startAgentLoop(options, llmMessages);
  }

  /**
   * 创建 Mock 工具
   */
  private createMockTool(toolName: string): any {
    return {
      name: toolName,
      description: `Mock tool for ${toolName}`,
      parameters: { type: 'object', properties: {} },
      needApproval: toolName.includes('edit') || toolName.includes('insert') || toolName.includes('delete'),
      type: 'read',
      execute: async (args: any) => ({
        success: true,
        data: { message: `Mock 工具 ${toolName} 执行成功`, args }
      })
    };
  }

  /**
   * 生成工具调用摘要
   */
  private generateToolCallSummary(toolName: string, args: any): string {
    switch (toolName) {
      case 'read_third_line':
        return '读取第三行文本';
      case 'insert_at_cursor':
        return `插入文本: "${args.text || 'aabb'}"`;
      case 'edit_code':
        return `修改文件 ${args.file_path || '未知'}`;
      case 'read_file':
        return `读取文件 ${args.file_path || '未知'}`;
      default:
        return `执行工具 ${toolName}`;
    }
  }

  /**
   * 模拟流式响应（临时实现）
   * @param message - 当前 assistant 消息
   * @param options - 聊天选项
   * @param llmMessages - 已构建的 LLM 消息（未来将发送给 LLM API）
   */
  private async simulateStreamResponse(message: ChatMessage, options: ChatOptions, llmMessages: any[]): Promise<void> {
    // 模拟思考内容
    message.thinking = '正在分析用户的问题...';
    this._onDidMessageUpdate.fire([...this._messages]);

    await this.sleep(500);

    message.thinking += '\n思考完成，准备生成回答。';
    this._onDidMessageUpdate.fire([...this._messages]);

    await this.sleep(500);

    // 模拟回答内容（显示提示词构建情况）
    const response = `收到你的消息！\n\n当前模式：${options.mode}\n当前模型：${options.modelId}\n会话ID：${options.conversationId || '无'}\n\n提示词构建情况：\n- LLM 消息数量：${llmMessages.length}\n- 包含 System Prompt：${llmMessages.length > 0 ? '是' : '否'}\n- 历史消息数：${llmMessages.filter(m => m.role !== 'system').length}`;
    
    // 逐字输出（模拟流式）
    for (let i = 0; i < response.length; i++) {
      message.content += response[i];
      this._onDidMessageUpdate.fire([...this._messages]);
      await this.sleep(20);
    }

    message.status = 'completed';
    message.thinking = undefined; // 完成后清除思考内容
    this._onDidMessageUpdate.fire([...this._messages]);

    // 如果是 agent 模式，模拟一个工具调用请求
    if (options.mode === 'agent') {
      await this.sleep(500);
      this.simulateToolCallRequest(message);
    }
  }

  /**
   * 模拟工具调用请求（临时实现）
   */
  private simulateToolCallRequest(message: ChatMessage): void {
    const toolCallId = `tool_${Date.now()}`;
    const toolName = 'edit_code';
    const toolArguments = {
      file: 'example.tex',
      operation: 'replace',
      target: 'title',
      newValue: 'Hello World'
    };

    // 存储待审批的工具调用
    this._pendingToolCalls.set(toolCallId, {
      id: toolCallId,
      toolName,
      arguments: toolArguments,
      messageId: message.id
    });

    // 触发工具调用待审批事件
    this._onDidToolCallPending.fire({
      id: toolCallId,
      toolName,
      arguments: toolArguments,
      targetFile: 'example.tex',
      summary: '将标题修改为 "Hello World"',
      messageId: message.id
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
   * 延时工具函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this._onDidMessageUpdate.dispose();
    this._onDidToolCallPending.dispose();
    this._messages = [];
    this._pendingToolCalls.clear();
  }
}

/**
 * 待审批的工具调用
 */
interface PendingToolCall {
  id: string;
  toolName: string;
  arguments: Record<string, any>;
  messageId: string;
}

// 导出服务标识符
export { IChatServiceId };
