/**
 * AgentService - Services 层实现
 * 
 * 核心职责：
 * - Agent Loop 生命周期管理
 * - 根据意图（agent/chat/normal）决定行为
 * - 模型调用（通过 LLMService）
 * - 工具调用决策（自动执行 vs 需要审批）
 * - 工具审批状态管理
 * 
 * 维护列表三：当前执行视图 (The Working Memory)
 * - 给当前 AI 看的，包含当前轮的思维链细节
 * - 不包含之前轮的细节
 * - 高保真：保留所有细节（Thinking、Tool Output）
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
import type { ILLMService, LLMConfig } from '../../platform/llm/ILLMService';
import { ILLMServiceId } from '../../platform/llm/ILLMService';
import type { IPromptService } from '../../platform/agent/IPromptService';
import { IPromptServiceId } from '../../platform/agent/IPromptService';
import type { IToolService, ITool } from '../../platform/agent/IToolService';
import { IToolServiceId } from '../../platform/agent/IToolService';
import type { IModelRegistryService } from '../../platform/llm/IModelRegistryService';
import { IModelRegistryServiceId } from '../../platform/llm/IModelRegistryService';
import type { IUIStreamService } from '../../platform/agent/IUIStreamService';
import { IUIStreamServiceId } from '../../platform/agent/IUIStreamService';

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
@injectable(ILLMServiceId, IPromptServiceId, IToolServiceId, IModelRegistryServiceId, IUIStreamServiceId)
export class AgentService implements IAgentService {
  // ==================== 内部事件发射器（不对外暴露） ====================
  private readonly _onDidToolCallPending = new Emitter<ToolCallPendingEvent>();

  // ==================== 核心状态 ====================
  
  /** 活跃的 Agent Loops */
  private activeLoops: Map<string, LoopContext> = new Map();
  
  /** Loop ID 计数器 */
  private loopIdCounter: number = 0;

  constructor(
    private readonly llmService: ILLMService,
    private readonly promptService: IPromptService,
    private readonly toolService: IToolService,
    private readonly modelRegistry: IModelRegistryService,
    private readonly uiStreamService: IUIStreamService
  ) {
  }

  // ==================== 公共方法（唯一） ====================
  
  /**
   * 执行 Agent 任务（唯一的公共方法）
   */
  async execute(
    initialMessages: ChatMessage[],
    options: AgentOptions
  ): Promise<AgentLoopController> {
    const loopId = `loop_${this.loopIdCounter++}`;

    // 创建事件发射器
    const onDoneEmitter = new Emitter<ChatMessage[]>();
    const onUpdateEmitter = new Emitter<ChatMessage[]>();
    const onErrorEmitter = new Emitter<Error>();

    // 创建 Loop 上下文
    const context: LoopContext = {
      loopId,
      options,
      messages: [...initialMessages],
      workingMemory: [], // 初始化工作记忆为空
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

    // 返回控制器（包含工具审批方法和事件）
    return {
      id: loopId,
      abort: () => this.abortLoop(loopId),
      approveToolCall: (toolCallId: string) => this.approveToolCall(loopId, toolCallId),
      rejectToolCall: (toolCallId: string) => this.rejectToolCall(loopId, toolCallId),
      onDone: onDoneEmitter.event,
      onUpdate: onUpdateEmitter.event,
      onError: onErrorEmitter.event,
      onToolCallPending: this._onDidToolCallPending.event
    };
  }

  // ==================== 私有方法（通过 controller 调用） ====================

  private async approveToolCall(loopId: string, toolCallId: string): Promise<void> {
    const context = this.activeLoops.get(loopId);
    if (!context) {
      return;
    }

    const pendingCall = context.pendingToolCalls.get(toolCallId);
    if (!pendingCall) {
      return;
    }


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

  private async rejectToolCall(loopId: string, toolCallId: string): Promise<void> {
    const context = this.activeLoops.get(loopId);
    if (!context) {
      return;
    }

    const pendingCall = context.pendingToolCalls.get(toolCallId);
    if (!pendingCall) {
      return;
    }


    // 移除 pending 记录
    context.pendingToolCalls.delete(toolCallId);

    // 拒绝 Promise
    pendingCall.reject(new Error('用户拒绝了工具调用'));
  }

  /**
   * 执行 Agent Loop
   */
  private async executeLoop(context: LoopContext): Promise<void> {
    try {
      const maxIterations = context.options.maxIterations || 100;
      const requestedMaxIterations = maxIterations;

      while (context.iteration < maxIterations && !context.aborted) {

        // 重置当前轮的工作记忆
        context.workingMemory = [];

        // 1. 选择可用工具
        const availableTools = this.selectToolsForModel(
          context.options.modelId,
          context.options.mode
        );

        // 2. 构建 Prompt（基于完整历史，但不包含之前轮的详细 thinking 等）
        const llmMessages = await this.promptService.constructMessages(
          context.messages,
          context.options.mode,
          context.options.contextItems,
          {
            modelId: context.options.modelId,
            includeThinking: false // 不包含历史轮次的 thinking 细节
          }
        );

        // 打印发送给 AI 的提示词
        // 3. 构建 LLM 配置
        const llmConfig = this.buildLLMConfig(
          context.options.modelId,
          availableTools
        );
        const abortController = new AbortController();
        context.abortController = abortController;
        (llmConfig as any).abortSignal = abortController.signal;

        // 4. 调用 LLM（使用新的 chat 接口）
        // 创建 assistant 占位消息
        const assistantMessage = this.createMessage('assistant', '');
        // 只在第一次迭代时使用外部传入的 responseMessageId
        // 后续迭代（工具调用后）应该使用新生成的 ID，避免 ID 冲突导致 UI 重复显示
        if (context.iteration === 0 && context.options.responseMessageId) {
          assistantMessage.id = context.options.responseMessageId;
        }
        assistantMessage.status = 'streaming';
        context.messages.push(assistantMessage);
        context.workingMemory.push(assistantMessage); // 加入工作记忆
        context.onUpdateEmitter.fire([...context.messages]);

        // 将当前回答对应的消息 ID 传递给 LLMConfig，方便底层 Provider 做 UI 流式更新
        (llmConfig as LLMConfig).uiStreamMeta = {
          conversationId: context.loopId,
          messageId: assistantMessage.id
        };
        
        // 5. 调用 LLM（一次性返回完整结果，UI 更新由 Provider 内部实时推送）
        const finalResult = await this.llmService.chat(llmMessages, llmConfig);
        context.abortController = undefined;
        
        // 输出大模型返回的内容到控制台
        if (finalResult.thinking) {
        }
        if (finalResult.content) {
        }
        if (finalResult.toolCalls && finalResult.toolCalls.length > 0) {
          finalResult.toolCalls.forEach((tc: any, index: number) => {
          });
        }
        // 检查是否已被中断
        if (context.aborted) {
          return;
        }
        
        // 6. 更新 assistant 消息
        assistantMessage.content = finalResult.content;
        assistantMessage.status = 'completed';
        
        if (finalResult.thinking) {
          assistantMessage.thinking = finalResult.thinking;
        }
        
        if (finalResult.toolCalls) {
          // 防御：过滤掉无效的工具调用（例如 name 为空）。
          // 否则下一轮 PromptService 会把它写入 messages[].tool_calls 回传给 API，触发 400。
          const validToolCalls = finalResult.toolCalls.filter((tc: any) =>
            typeof tc?.name === 'string' && tc.name.trim().length > 0
          );
          assistantMessage.toolCalls = validToolCalls.map((tc: any) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
            status: 'pending'
          }));
        }
        
        context.onUpdateEmitter.fire([...context.messages]);

        // 7. 检查是否有工具调用
        if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
          // 没有工具调用，结束循环
          break;
        }

        // 8. 处理工具调用
        const shouldContinue = await this.handleToolCallsInLoop(
          context,
          assistantMessage.toolCalls!
        );

        if (!shouldContinue) {
          // 有需要审批的工具，暂停循环等待用户操作
          context.status = 'waiting_approval';
          return; // 等待 controller.approveToolCall 或 controller.rejectToolCall
        }

        context.iteration++;
      }

      // 如果是因为达到最大迭代次数而退出（常见于连续工具调用链），给用户一个明确提示，
      // 避免看起来“突然对话完成但没解释/没收尾”。
      if (!context.aborted && context.iteration >= requestedMaxIterations) {
        const limitMessage = this.createMessage(
          'assistant',
          `已达到最大迭代次数（${requestedMaxIterations}）。为避免连续工具调用导致死循环/资源耗尽，我已停止本轮自动执行。` +
            `\n\n你可以：\n- 继续追问“继续/下一步”，我会在新一轮对话里接着做\n- 或在调用 sendMessage 时提高 maxIterations（谨慎增大）`
        );
        limitMessage.status = 'completed';
        context.messages.push(limitMessage);
        context.onUpdateEmitter.fire([...context.messages]);
      }

      // Loop 完成
      if (!context.aborted) {
        context.status = 'completed';
        
        // 确保所有消息状态都是 completed（避免 UI 一直显示"正在生成"）
        for (const msg of context.messages) {
          if (msg.status === 'streaming' || msg.status === 'pending') {
            msg.status = 'completed';
          }
        }
        
        context.onDoneEmitter.fire([...context.messages]);
      } else {
      }
      this.activeLoops.delete(context.loopId);

    } catch (error) {
      if (!context.aborted) {
        context.status = 'error';
        context.onErrorEmitter.fire(error instanceof Error ? error : new Error(String(error)));
      } else {
      }
      this.activeLoops.delete(context.loopId);
    }
  }

  /**
   * 处理工具调用
   * @returns true 继续循环，false 暂停循环等待审批
   */
  private async handleToolCallsInLoop(
    context: LoopContext,
    toolCalls: any[]
  ): Promise<boolean> {

    // 🔧 工具调用调试开关
    const debugToolCalls =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('overleaf_ai_debug_tool_calls') === '1';

    for (const toolCall of toolCalls) {
      const { id: toolCallId, name: toolName, arguments: toolArgs } = toolCall;

      // 🔧 打印工具调用请求详情
      if (debugToolCalls) {
        if (toolArgs && typeof toolArgs === 'object') {
          const keys = Object.keys(toolArgs);
          for (const key of keys) {
            const val = toolArgs[key];
            const display = typeof val === 'string'
              ? (val.length > 200 ? val.slice(0, 200) + `...(${val.length}字符)` : val)
              : val;
          }
        }
      }

      // 获取工具元信息
      const tool = this.toolService.getTool(toolName);
      if (!tool) {
        // 添加错误消息（必须包含 toolCalls 以提供 tool_call_id）
        const errorMessage = this.createMessage('tool', `工具 ${toolName} 不存在`);
        errorMessage.status = 'error';
        errorMessage.toolCalls = [{
          id: toolCallId,
          name: toolName,
          arguments: toolArgs,
          status: 'error'
        }];
        context.messages.push(errorMessage);
        continue;
      }

      // 检查是否需要审批
      if (tool.needApproval) {

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
            // 输出审批通过的工具执行结果到控制台
            const resultStr = JSON.stringify(result.data || result, null, 2);
            resultStr.split('\n').forEach(line => {
              const truncated = line.length > 76 ? line.substring(0, 73) + '...' : line;
            });
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
            context.workingMemory.push(toolMessage); // 加入工作记忆
            context.onUpdateEmitter.fire([...context.messages]);
          },
          (error) => {
            // 输出工具被拒绝的信息到控制台
            const errorStr = String(error);
            errorStr.split('\n').forEach(line => {
              const truncated = line.length > 76 ? line.substring(0, 73) + '...' : line;
            });
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
        const messageId = context.messages[context.messages.length - 1]?.id || '';

        // 🔧 执行前：与工具 schema 对比参数
        if (debugToolCalls && tool) {
          const schema = tool.parameters;
          const required = schema?.required || [];
          const properties = schema?.properties || {};
          const argKeys = toolArgs ? Object.keys(toolArgs) : [];
          const missingRequired = required.filter((r: string) => !argKeys.includes(r));
          const extraKeys = argKeys.filter((k: string) => !Object.keys(properties).includes(k));

          if (missingRequired.length > 0 || extraKeys.length > 0) {
            if (missingRequired.length > 0) {
            }
            if (extraKeys.length > 0) {
            }
          } else {
          }
        }

        try {
          const result = await this.toolService.executeTool(toolName, toolArgs);
          
          // 输出工具执行结果到控制台
          
          // 提取 preview 字段单独处理，避免被截断
          const data = result.data || result;
          const preview = data?.preview;
          const displayData = preview ? { ...data, preview: '(见下方详细预览)' } : data;
          
          const resultStr = JSON.stringify(displayData, null, 2);
          resultStr.split('\n').forEach(line => {
            const truncated = line.length > 76 ? line.substring(0, 73) + '...' : line;
          });
          
          // 单独打印 preview 内容（不截断）
          if (preview) {
          }
          // 通知 UI：工具执行完成
          this.uiStreamService.pushToolCall({
            messageId,
            toolCallId,
            phase: 'end',
            name: toolName,
            resultDelta: JSON.stringify(result.data || result)
          });

          const toolMessage = this.createMessage('tool', JSON.stringify(result.data || result));
          toolMessage.toolCalls = [{
            id: toolCallId,
            name: toolName,
            arguments: toolArgs,
            result: result.data,
            status: 'completed'
          }];
          context.messages.push(toolMessage);
          context.workingMemory.push(toolMessage); // 加入工作记忆
          context.onUpdateEmitter.fire([...context.messages]);
        } catch (error) {
          // 输出工具执行错误到控制台
          const errorStr = String(error);
          errorStr.split('\n').forEach(line => {
            const truncated = line.length > 76 ? line.substring(0, 73) + '...' : line;
          });
          // 通知 UI：工具执行出错
          this.uiStreamService.pushToolCall({
            messageId,
            toolCallId,
            phase: 'error',
            name: toolName,
            error: String(error)
          });

          // 添加错误消息（必须包含 toolCalls 以提供 tool_call_id）
          const errorMessage = this.createMessage('tool', `工具执行失败: ${error}`);
          errorMessage.status = 'error';
          errorMessage.toolCalls = [{
            id: toolCallId,
            name: toolName,
            arguments: toolArgs,
            status: 'error'
          }];
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

    // 注册表未找到时，默认认为支持工具调用
    if (capabilities && !capabilities.supportsTools) {
      return [];
    }

    switch (mode) {
      case 'agent':
        return this.toolService.getAgentTools();
      case 'chat':
        return this.toolService.getChatTools();
      case 'normal':
        return this.toolService.getNormalTools();
      default:
        return [];
    }
  }

  /**
   * 构建 LLM 配置
   */
  private buildLLMConfig(modelId: string, tools: ITool[]): LLMConfig {
    const defaultConfig = this.modelRegistry.getDefaultConfig(modelId) || {
      modelId,
      temperature: 1.0,
      topP: 1.0,
      maxTokens: 16384,
      maxTokensParamName: 'max_completion_tokens' as const
    };

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


    if (context.abortController) {
      try {
        context.abortController.abort();
      } catch (error) {
      }
      context.abortController = undefined;
    }

    context.aborted = true;
    context.status = 'aborted';
    this.activeLoops.delete(loopId);
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
  
  /** 完整对话历史（所有轮次，包括 system + context） */
  messages: ChatMessage[];
  
  /** 当前轮的工作记忆（列表三：The Working Memory）
   * 只包含当前轮次产生的内容，给 AI 看的高保真视图
   * 包含：当前 assistant 消息、thinking、tool calls、tool results
   */
  workingMemory: ChatMessage[];
  
  iteration: number;
  status: 'running' | 'waiting_approval' | 'completed' | 'error' | 'aborted';
  pendingToolCalls: Map<string, PendingToolCall>;
  aborted: boolean;
  abortController?: AbortController;
  onDoneEmitter: Emitter<ChatMessage[]>;
  onUpdateEmitter: Emitter<ChatMessage[]>;
  onErrorEmitter: Emitter<Error>;
}

// 导出服务标识符
export { IAgentServiceId };
