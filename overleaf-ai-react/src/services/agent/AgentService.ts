/**
 * AgentService - Services 层实现
 * 
 * Agent 编排服务实现，负责：
 * - Agent Loop 循环控制
 * - 工具调用决策（自动执行 vs 需要审批）
 * - 工具审批状态管理
 * - 根据模型能力选择工具
 */

import { injectable } from '../../platform/instantiation/descriptors';
import { Emitter } from '../../base/common/event';
import type {
  IAgentService,
  AgentOptions,
  AgentLoopController,
  AgentLoopState
} from '../../platform/agent/IAgentService';
import { IAgentServiceId } from '../../platform/agent/IAgentService';
import type {
  ChatMessage,
  MessageRole,
  ToolCallPendingEvent
} from '../../platform/agent/IChatService';
import type { ILLMService } from '../../platform/llm/ILLMService';
import { ILLMServiceId } from '../../platform/llm/ILLMService';
import type { IPromptService } from '../../platform/agent/IPromptService';
import { IPromptServiceId } from '../../platform/agent/IPromptService';
import type { IToolService, ITool } from '../../platform/agent/IToolService';
import { IToolServiceId } from '../../platform/agent/IToolService';
import type { IModelRegistryService } from '../../platform/llm/IModelRegistryService';
import { IModelRegistryServiceId } from '../../platform/llm/IModelRegistryService';

/**
 * 待审批的工具调用
 */
interface PendingToolCall {
  id: string;
  toolName: string;
  arguments: Record<string, any>;
  messageId: string;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}

/**
 * AgentService 实现
 */
@injectable(ILLMServiceId, IPromptServiceId, IToolServiceId, IModelRegistryServiceId)
export class AgentService implements IAgentService {
  // ==================== 事件发射器 ====================
  private readonly _onDidLoopUpdate = new Emitter<AgentLoopState>();
  public readonly onDidLoopUpdate = this._onDidLoopUpdate.event;

  private readonly _onDidToolCallPending = new Emitter<ToolCallPendingEvent>();
  public readonly onDidToolCallPending = this._onDidToolCallPending.event;

  // ==================== 核心状态 ====================
  
  /** 活跃的 Agent Loops */
  private activeLoops: Map<string, LoopContext> = new Map();
  
  /** Loop ID 计数器 */
  private loopIdCounter: number = 0;

  constructor(
    private readonly llmService: ILLMService,
    private readonly promptService: IPromptService,
    private readonly toolService: IToolService,
    private readonly modelRegistry: IModelRegistryService
  ) {
    console.log('[AgentService] 依赖注入成功');
  }

  // ==================== 公共方法 ====================
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
  async startLoop(
    initialMessages: ChatMessage[],
    options: AgentOptions
  ): Promise<AgentLoopController> {
    const loopId = `loop_${this.loopIdCounter++}`;
    console.log(`[AgentService] 启动 Agent Loop: ${loopId}`, options);

    // 创建事件发射器
    const onDoneEmitter = new Emitter<ChatMessage[]>();
    const onUpdateEmitter = new Emitter<ChatMessage[]>();
    const onErrorEmitter = new Emitter<Error>();

    // 创建 Loop 上下文
    const context: LoopContext = {
      loopId,
      options,
      messages: [...initialMessages],
      iteration: 0,
      status: 'running',
      pendingToolCalls: new Map(),
      aborted: false,
      onDoneEmitter,
      onUpdateEmitter,
      onErrorEmitter
    };

    this.activeLoops.set(loopId, context);

    // 异步执行 Loop
    this.executeLoop(context);

    // 返回控制器
    return {
      id: loopId,
      abort: () => this.abortLoop(loopId),
      onDone: onDoneEmitter.event,
      onUpdate: onUpdateEmitter.event,
      onError: onErrorEmitter.event
    };
  }

  async approveToolCall(loopId: string, toolCallId: string): Promise<void> {
    const context = this.activeLoops.get(loopId);
    if (!context) {
      console.warn(`[AgentService] Loop ${loopId} 不存在`);
      return;
    }

    const pendingCall = context.pendingToolCalls.get(toolCallId);
    if (!pendingCall) {
      console.warn(`[AgentService] 工具调用 ${toolCallId} 不存在`);
      return;
    }

    console.log(`[AgentService] 用户批准工具调用: ${pendingCall.toolName}`);

    try {
      // 执行工具
      const result = await this.toolService.executeTool(
        pendingCall.toolName,
        pendingCall.arguments
      );

      // 移除 pending 记录
      context.pendingToolCalls.delete(toolCallId);

      // 解决 Promise
      pendingCall.resolve(result);
    } catch (error) {
      pendingCall.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async rejectToolCall(loopId: string, toolCallId: string): Promise<void> {
    const context = this.activeLoops.get(loopId);
    if (!context) {
      console.warn(`[AgentService] Loop ${loopId} 不存在`);
      return;
    }

    const pendingCall = context.pendingToolCalls.get(toolCallId);
    if (!pendingCall) {
      console.warn(`[AgentService] 工具调用 ${toolCallId} 不存在`);
      return;
    }

    console.log(`[AgentService] 用户拒绝工具调用: ${pendingCall.toolName}`);

    // 移除 pending 记录
    context.pendingToolCalls.delete(toolCallId);

    // 拒绝 Promise
    pendingCall.reject(new Error('用户拒绝了工具调用'));
  }

  // ==================== 私有方法 ====================

  /**
   * 执行 Agent Loop
   */
  private async executeLoop(context: LoopContext): Promise<void> {
    try {
      const maxIterations = context.options.maxIterations || 10;

      while (context.iteration < maxIterations && !context.aborted) {
        console.log(`[AgentService] Loop ${context.loopId} 第 ${context.iteration + 1} 轮迭代`);

        // 1. 选择可用工具
        const availableTools = this.selectToolsForModel(
          context.options.modelId,
          context.options.mode
        );

        // 2. 构建 Prompt
        const llmMessages = await this.promptService.constructMessages(
          context.messages,
          context.options.mode,
          context.options.contextItems,
          {
            modelId: context.options.modelId,
            tools: availableTools
          }
        );

        // 3. 构建 LLM 配置
        const llmConfig = this.buildLLMConfig(
          context.options.modelId,
          availableTools
        );

        // 4. 调用 LLM
        // 检查最后一条消息是否已经是 assistant 占位消息
        let assistantMessage: ChatMessage;
        const lastMessage = context.messages[context.messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.content && lastMessage.status === 'streaming') {
          // 使用已存在的占位消息
          assistantMessage = lastMessage;
          console.log('[AgentService] 使用已存在的 assistant 占位消息');
        } else {
          // 创建新的 assistant 消息
          assistantMessage = this.createMessage('assistant', '');
          assistantMessage.status = 'streaming';
          context.messages.push(assistantMessage);
          context.onUpdateEmitter.fire([...context.messages]);
          console.log('[AgentService] 创建新的 assistant 消息');
        }
        
        // console.log('[AgentService] LLM 调用参数:', JSON.stringify({
        //   llmMessages,
        //   llmConfig
        // }, null, 2));
        
        const stream = await this.llmService.streamResponse(llmMessages, llmConfig);

        // 5. 等待流式响应完成
        const finalMessage = await this.waitForStreamCompletion(
          stream,
          assistantMessage,
          context
        );

        // 6. 检查是否有工具调用
        if (!finalMessage.toolCalls || finalMessage.toolCalls.length === 0) {
          // 没有工具调用，结束循环
          console.log(`[AgentService] Loop ${context.loopId} 完成（无工具调用）`);
          break;
        }

        // 7. 处理工具调用
        const shouldContinue = await this.handleToolCallsInLoop(
          context,
          finalMessage.toolCalls
        );

        if (!shouldContinue) {
          // 有需要审批的工具，暂停循环等待用户操作
          console.log(`[AgentService] Loop ${context.loopId} 暂停（等待审批）`);
          context.status = 'waiting_approval';
          this.emitLoopState(context);
          return; // 等待 approveToolCall 或 rejectToolCall
        }

        context.iteration++;
      }

      // Loop 完成
      context.status = 'completed';
      this.emitLoopState(context);
      context.onDoneEmitter.fire([...context.messages]);
      this.activeLoops.delete(context.loopId);

    } catch (error) {
      console.error(`[AgentService] Loop ${context.loopId} 错误:`, error);
      context.status = 'error';
      this.emitLoopState(context);
      context.onErrorEmitter.fire(error instanceof Error ? error : new Error(String(error)));
      this.activeLoops.delete(context.loopId);
    }
  }

  /**
   * 等待流式响应完成
   */
  private async waitForStreamCompletion(
    stream: any,
    assistantMessage: ChatMessage,
    context: LoopContext
  ): Promise<ChatMessage> {
    return new Promise((resolve, reject) => {
      // 监听 token 流
      stream.onToken((chunk: any) => {
        if (chunk.type === 'thinking') {
          assistantMessage.thinking = (assistantMessage.thinking || '') + chunk.delta;
        } else if (chunk.type === 'content') {
          assistantMessage.content += chunk.delta;
        }
        context.onUpdateEmitter.fire([...context.messages]);
      });

      // 监听错误
      stream.onError((error: Error) => {
        assistantMessage.status = 'error';
        assistantMessage.error = error.message;
        context.onUpdateEmitter.fire([...context.messages]);
        reject(error);
      });

      // 监听完成
      stream.onDone((finalMsg: any) => {
        assistantMessage.content = finalMsg.content;
        assistantMessage.status = 'completed';
        
        if (finalMsg.thinking) {
          assistantMessage.thinking = finalMsg.thinking;
        }
        
        if (finalMsg.toolCalls) {
          assistantMessage.toolCalls = finalMsg.toolCalls.map((tc: any) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
            status: 'pending'
          }));
        }
        
        context.onUpdateEmitter.fire([...context.messages]);
        resolve(assistantMessage);
      });
    });
  }

  /**
   * 处理工具调用
   * @returns true 继续循环，false 暂停循环等待审批
   */
  private async handleToolCallsInLoop(
    context: LoopContext,
    toolCalls: any[]
  ): Promise<boolean> {
    console.log(`[AgentService] 处理 ${toolCalls.length} 个工具调用`);

    for (const toolCall of toolCalls) {
      const { id: toolCallId, name: toolName, arguments: toolArgs } = toolCall;

      // 获取工具元信息
      const tool = this.toolService.getTool(toolName);
      if (!tool) {
        console.warn(`[AgentService] 未找到工具: ${toolName}`);
        // 添加错误消息
        const errorMessage = this.createMessage('tool', `工具 ${toolName} 不存在`);
        errorMessage.status = 'error';
        context.messages.push(errorMessage);
        continue;
      }

      // 检查是否需要审批
      if (tool.needApproval) {
        console.log(`[AgentService] 工具 ${toolName} 需要用户审批`);

        // 触发审批事件
        this._onDidToolCallPending.fire({
          id: toolCallId,
          toolName,
          arguments: toolArgs,
          targetFile: toolArgs.file_path || toolArgs.fileName || '未知文件',
          summary: this.generateToolCallSummary(toolName, toolArgs),
          messageId: context.messages[context.messages.length - 1]?.id || ''
        });

        // 创建 Promise 等待用户操作
        await new Promise<any>((resolve, reject) => {
          context.pendingToolCalls.set(toolCallId, {
            id: toolCallId,
            toolName,
            arguments: toolArgs,
            messageId: context.messages[context.messages.length - 1]?.id || '',
            resolve,
            reject
          });
        }).then(
          (result) => {
            // 工具执行成功
            const toolMessage = this.createMessage('tool', JSON.stringify(result.data || result));
            toolMessage.toolCalls = [{
              id: toolCallId,
              name: toolName,
              arguments: toolArgs,
              result: result.data,
              status: 'completed'
            }];
            context.messages.push(toolMessage);
            context.onUpdateEmitter.fire([...context.messages]);
          },
          (error) => {
            // 用户拒绝或执行失败
            const errorMessage = this.createMessage('assistant', `用户拒绝了工具调用: ${toolName}`);
            errorMessage.status = 'completed';
            context.messages.push(errorMessage);
            context.onUpdateEmitter.fire([...context.messages]);
          }
        );

        // 有审批流程，暂停循环
        return false;
      } else {
        // 不需要审批，直接执行
        console.log(`[AgentService] 工具 ${toolName} 不需要审批，直接执行`);

        try {
          const result = await this.toolService.executeTool(toolName, toolArgs);
          
          const toolMessage = this.createMessage('tool', JSON.stringify(result.data || result));
          toolMessage.toolCalls = [{
            id: toolCallId,
            name: toolName,
            arguments: toolArgs,
            result: result.data,
            status: 'completed'
          }];
          context.messages.push(toolMessage);
          context.onUpdateEmitter.fire([...context.messages]);
        } catch (error) {
          const errorMessage = this.createMessage('tool', `工具执行失败: ${error}`);
          errorMessage.status = 'error';
          context.messages.push(errorMessage);
          context.onUpdateEmitter.fire([...context.messages]);
        }
      }
    }

    // 所有工具都已处理，继续循环
    return true;
  }

  /**
   * 根据模型能力和模式选择工具
   */
  private selectToolsForModel(modelId: string, mode: string): ITool[] {
    const capabilities = this.modelRegistry.getCapabilities(modelId);

    if (!capabilities?.supportsTools) {
      console.log(`[AgentService] 模型 ${modelId} 不支持工具调用`);
      return [];
    }

    switch (mode) {
      case 'agent':
        return this.toolService.getAllTools();
      case 'chat':
        return this.toolService.getReadOnlyTools();
      case 'normal':
        return [];
      default:
        return [];
    }
  }

  /**
   * 构建 LLM 配置
   */
  private buildLLMConfig(modelId: string, tools: ITool[]): any {
    const defaultConfig = this.modelRegistry.getDefaultConfig(modelId);
    if (!defaultConfig) {
      throw new Error(`未找到模型配置: ${modelId}`);
    }

    const config = {
      ...defaultConfig,
      stream: true
    };

    // 如果有工具，添加工具定义
    if (tools.length > 0) {
      (config as any).tools = tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));
      (config as any).tool_choice = 'auto';
    }

    return config;
  }

  /**
   * 中断 Loop
   */
  private abortLoop(loopId: string): void {
    const context = this.activeLoops.get(loopId);
    if (!context) {
      return;
    }

    console.log(`[AgentService] 中断 Loop: ${loopId}`);
    context.aborted = true;
    context.status = 'aborted';
    this.emitLoopState(context);
    this.activeLoops.delete(loopId);
  }

  /**
   * 发射 Loop 状态
   */
  private emitLoopState(context: LoopContext): void {
    this._onDidLoopUpdate.fire({
      loopId: context.loopId,
      iteration: context.iteration,
      status: context.status,
      currentMessages: [...context.messages]
    });
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
   * 创建消息
   */
  private createMessage(role: MessageRole, content: string): ChatMessage {
    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
    this._onDidLoopUpdate.dispose();
    this._onDidToolCallPending.dispose();
    this.activeLoops.clear();
  }
}

/**
 * Loop 上下文
 */
interface LoopContext {
  loopId: string;
  options: AgentOptions;
  messages: ChatMessage[];
  iteration: number;
  status: 'running' | 'waiting_approval' | 'completed' | 'error' | 'aborted';
  pendingToolCalls: Map<string, PendingToolCall>;
  aborted: boolean;
  onDoneEmitter: Emitter<ChatMessage[]>;
  onUpdateEmitter: Emitter<ChatMessage[]>;
  onErrorEmitter: Emitter<Error>;
}

// 导出服务标识符
export { IAgentServiceId };

