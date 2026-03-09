/**
 * AgentLoopService - 单个 Agent 的生命周期管理
 * 
 * 核心职责：
 * - 管理单个 Agent 的生命周期
 * - 决定模型的调用、工具的调用
 * - 当前 Agent 上下文的管理与输出
 * - 启动 Agent 执行并返回更新后的上下文
 * 
 * 调用方式：
 * - 传入上下文（包含问题、系统提示词）、模型 ID、工具列表
 * - 根据传入信息构建 LLMConfig 参数
 * - 调用 LLMService 的 chat 函数
 * - 正常执行工具调用
 * - 结束后返回更新后的上下文
 */

import { Emitter, Event } from '../../../../base/common/event';
import type { ILLMService, LLMConfig, LLMMessage } from '../../../../platform/llm/ILLMService';
import type { IModelRegistryService } from '../../../../platform/llm/IModelRegistryService';
import type { IUIStreamService } from '../../../../platform/agent/IUIStreamService';
import type {
  AgentContext,
  AgentMessage,
  AgentLoopOptions,
  AgentLoopResult,
  MultiAgentTool,
  AgentToolCall
} from '../types';
import {
  agentMessageToLLMMessage,
  generateMessageId
} from '../types';
import { MultiAgentToolRegistry } from '../tools/MultiAgentToolRegistry';
import { logger } from '../../../../utils/logger';

// ==================== 事件类型定义 ====================

/**
 * Agent Loop 更新事件
 */
export interface AgentLoopUpdateEvent {
  /** Agent 名称 */
  agentName: string;
  /** 当前状态 */
  status: AgentContext['status'];
  /** 当前迭代次数 */
  iteration: number;
  /** 最新消息 */
  latestMessage?: AgentMessage;
  /** 完整上下文 */
  context: AgentContext;
}

// ==================== AgentLoopService 实现 ====================

/**
 * AgentLoopService - 单个 Agent 执行服务
 */
export class AgentLoopService {
  private static toLoggableContext(context: AgentContext): any {
    const variables =
      (context as any).variables instanceof Map
        ? Object.fromEntries((context as any).variables.entries())
        : (context as any).variables;
    return { ...context, variables };
  }

  // 注意：按需求不打印子 agent 的最终上下文（只在 ManagerAgentLoopService 打印 manager_agent）

  // ==================== 事件发射器 ====================
  private readonly _onUpdate = new Emitter<AgentLoopUpdateEvent>();
  public readonly onUpdate: Event<AgentLoopUpdateEvent> = this._onUpdate.event;

  private readonly _onError = new Emitter<Error>();
  public readonly onError: Event<Error> = this._onError.event;

  // ==================== 内部状态 ====================
  private aborted = false;
  private abortController?: AbortController;
  private lastContext?: AgentContext;
  // private finalPrinted = false;

  /** 工具注册表 */
  private readonly toolRegistry: MultiAgentToolRegistry;

  constructor(
    private readonly llmService: ILLMService,
    private readonly modelRegistry: IModelRegistryService,
    private readonly uiStreamService: IUIStreamService,
    toolRegistry?: MultiAgentToolRegistry
  ) {
    this.toolRegistry = toolRegistry || new MultiAgentToolRegistry();
  }

  // ==================== 公共方法 ====================

  /**
   * 启动 Agent 执行
   * 
   * @param options - Agent Loop 配置选项
   * @returns Agent Loop 执行结果
   */
  async run(options: AgentLoopOptions): Promise<AgentLoopResult> {
    const { modelId, initialContext, maxIterations = 20 } = options;
    
    // 解析工具：支持工具名称列表或工具实例列表
    const tools = this.resolveTools(options.tools);
    
    logger.debug(`[AgentLoopService] 启动 Agent: ${initialContext.agentName}`);
    logger.debug(`[AgentLoopService] 模型: ${modelId}, 工具数量: ${tools.length}`);

    // 初始化上下文
    const context: AgentContext = {
      ...initialContext,
      status: 'running',
      iteration: 0,
      variables: initialContext.variables || new Map()
    };
    this.lastContext = context;

    this.aborted = false;
    // 不再打印子 agent 最终上下文

    try {
      // Agent Loop 主循环
      while (context.iteration < maxIterations && !this.aborted) {
        logger.debug(`[AgentLoopService] ${context.agentName} 第 ${context.iteration + 1} 轮迭代`);

        // 为本轮 LLM 调用生成一个“子 messageId”，避免复用同一个 messageId 导致 thinking 被覆盖（plan 模式常见）
        // 约定：rootId::agent_<name>::ts_<ms>::iter_<n>
        // UI 将按 ts 排序，保证多个子 agent 串行执行时“思考/工具”能接着上一段继续展示
        const rootMessageId = options.uiStreamConfig?.messageId;
        const ts = Date.now();
        const streamMessageId =
          options.uiStreamConfig?.enabled && rootMessageId
            ? `${rootMessageId}::agent_${context.agentName}::ts_${ts}::iter_${context.iteration}`
            : undefined;

        // 1. 构建 LLM 消息列表
        const llmMessages = this.buildLLMMessages(context);

        // 2. 构建 LLM 配置
        const llmConfig = this.buildLLMConfig(modelId, tools, options, streamMessageId);
        this.abortController = new AbortController();
        (llmConfig as any).abortSignal = this.abortController.signal;

        // 3. 创建 assistant 占位消息
        const assistantMessage = this.createMessage('assistant', '');
        assistantMessage.status = 'streaming';
        context.messages.push(assistantMessage);

        // 发送更新事件
        this.emitUpdate(context, assistantMessage);

        // 4. 调用 LLM
        const llmResult = await this.llmService.chat(llmMessages, llmConfig);

        // 检查是否已被中断
        if (this.aborted) {
          logger.debug(`[AgentLoopService] ${context.agentName} 已中断`);
          context.status = 'aborted';
          return this.buildResult(false, context, '', 'Agent 执行已中断');
        }

        // 5. 更新 assistant 消息
        assistantMessage.content = llmResult.content;
        assistantMessage.status = 'completed';

        if (llmResult.thinking) {
          assistantMessage.thinking = llmResult.thinking;
        }

        if (llmResult.toolCalls && llmResult.toolCalls.length > 0) {
          // 过滤无效的工具调用
          const validToolCalls = llmResult.toolCalls.filter(
            tc => typeof tc?.name === 'string' && tc.name.trim().length > 0
          );
          assistantMessage.toolCalls = validToolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
            status: 'pending' as const
          }));
        }

        // 发送更新事件
        this.emitUpdate(context, assistantMessage);

        // 6. 检查是否有工具调用
        if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
          // 没有工具调用，Agent 完成
          logger.debug(`[AgentLoopService] ${context.agentName} 完成（无工具调用）`);
          context.status = 'completed';
          context.summary = assistantMessage.content;
          break;
        }

        // 7. 处理工具调用
        await this.handleToolCalls(context, assistantMessage.toolCalls, tools, options, streamMessageId);

        context.iteration++;
      }

      // 如果是外部手动终止（abort），循环会退出到这里
      if (this.aborted) {
        logger.debug(`[AgentLoopService] ${context.agentName} 已中断（loop 退出）`);
        context.status = 'aborted';
        return this.buildResult(false, context, '', 'Agent 执行已中断');
      }

      // 检查是否达到最大迭代次数
      if (context.iteration >= maxIterations && context.status === 'running') {
        logger.debug(`[AgentLoopService] ${context.agentName} 达到最大迭代次数`);
        const limitMessage = this.createMessage(
          'assistant',
          `已达到最大迭代次数（${maxIterations}）。`
        );
        context.messages.push(limitMessage);
        context.status = 'completed';
        context.summary = limitMessage.content;
      }

      // 返回结果
      const result = this.buildResult(
        true,
        context,
        context.summary || context.messages[context.messages.length - 1]?.content || ''
      );
      return result;

    } catch (error) {
      console.error(`[AgentLoopService] ${context.agentName} 执行错误:`, error);
      context.status = 'error';
      this._onError.fire(error instanceof Error ? error : new Error(String(error)));
      const errorMsg = error instanceof Error ? error.message : String(error);
      const result = this.buildResult(
        false,
        context,
        '',
        errorMsg
      );
      return result;
    }
  }

  /**
   * 中断当前执行
   */
  abort(): void {
    logger.debug('[AgentLoopService] 中断执行');
    this.aborted = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
    // 按需求：不在这里打印子 agent 上下文
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this._onUpdate.dispose();
    this._onError.dispose();
  }

  // ==================== 私有方法 ====================

  /**
   * 解析工具配置
   * 
   * 支持两种方式：
   * 1. 工具名称列表：['read_file', 'grep_search']
   * 2. 工具实例列表：[readFileTool, grepSearchTool]
   * 
   * @param tools - 工具配置（名称列表或实例列表）
   * @returns 解析后的工具实例列表
   */
  private resolveTools(tools: string[] | MultiAgentTool[]): MultiAgentTool[] {
    if (tools.length === 0) {
      return [];
    }

    // 检查是否为字符串数组（工具名称列表）
    if (typeof tools[0] === 'string') {
      const toolNames = tools as string[];
      logger.debug(`[AgentLoopService] 解析工具名称列表: ${toolNames.join(', ')}`);
      return this.toolRegistry.getToolsByNames(toolNames);
    }

    // 已经是工具实例列表，直接返回
    return tools as MultiAgentTool[];
  }

  /**
   * 注册自定义工具到工具注册表
   * 
   * @param tool - 工具实例
   */
  registerCustomTool(tool: MultiAgentTool): void {
    this.toolRegistry.registerTool(tool);
  }

  /**
   * 批量注册自定义工具
   * 
   * @param tools - 工具实例数组
   */
  registerCustomTools(tools: MultiAgentTool[]): void {
    this.toolRegistry.registerTools(tools);
  }

  /**
   * 获取工具注册表
   * 
   * @returns 工具注册表实例
   */
  getToolRegistry(): MultiAgentToolRegistry {
    return this.toolRegistry;
  }

  /**
   * 获取最近一次（或当前）的上下文快照，用于 Manager 在最终结束/中断时汇总打印
   */
  getLastContext(): AgentContext | undefined {
    return this.lastContext;
  }

  /**
   * 构建 LLM 消息列表
   */
  private buildLLMMessages(context: AgentContext): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // 添加系统提示词
    messages.push({
      role: 'system',
      content: context.systemPrompt
    });

    // 添加对话历史
    for (const msg of context.messages) {
      messages.push(agentMessageToLLMMessage(msg));
    }

    return messages;
  }

  /**
   * 构建 LLM 配置
   */
  private buildLLMConfig(
    modelId: string,
    tools: MultiAgentTool[],
    options: AgentLoopOptions,
    streamMessageId?: string
  ): LLMConfig {
    const defaultConfig = this.modelRegistry.getDefaultConfig(modelId) || {
      modelId,
      temperature: 1.0,
      topP: 1.0,
      maxTokens: 16384,
      maxTokensParamName: 'max_completion_tokens' as const
    };

    const config: LLMConfig = {
      ...defaultConfig,
      stream: true
    };

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

    // 添加 UI 流式输出配置
    if (options.uiStreamConfig?.enabled) {
      config.uiStreamMeta = {
        conversationId: options.uiStreamConfig.conversationId,
        // 默认 messageId 会被 plan 模式复用；这里允许外部传入子 messageId 来隔离每轮输出
        messageId: streamMessageId || options.uiStreamConfig.messageId
      };
    }

    return config;
  }

  /**
   * 处理工具调用
   */
  private async handleToolCalls(
    context: AgentContext,
    toolCalls: AgentToolCall[],
    tools: MultiAgentTool[],
    options: AgentLoopOptions,
    streamMessageId?: string
  ): Promise<void> {
    logger.debug(`[AgentLoopService] 处理 ${toolCalls.length} 个工具调用`);

    // 🔧 工具调用调试开关
    const debugToolCalls =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('overleaf_ai_debug_tool_calls') === '1';

    for (const toolCall of toolCalls) {
      const { id: toolCallId, name: toolName, arguments: toolArgs } = toolCall;

      // 🔧 打印工具调用请求详情
      if (debugToolCalls) {
        console.group(`%c[ToolCall Debug] 🚀 AgentLoopService 准备执行工具: ${toolName}`, 'color:#9C27B0;font-weight:bold');
        console.log('toolCallId:', toolCallId);
        console.log('所属 Agent:', context.agentName);
        console.log('参数类型:', typeof toolArgs);
        console.log('参数值:', toolArgs);
        if (toolArgs && typeof toolArgs === 'object') {
          const keys = Object.keys(toolArgs);
          console.log('参数 keys:', keys);
          for (const key of keys) {
            const val = toolArgs[key];
            const display = typeof val === 'string'
              ? (val.length > 200 ? val.slice(0, 200) + `...(${val.length}字符)` : val)
              : val;
            console.log(`  📌 ${key} (${typeof val}):`, display);
          }
        }
        console.groupEnd();
      }

      // 查找工具
      const tool = tools.find(t => t.name === toolName);
      if (!tool) {
        console.warn(`[AgentLoopService] 未找到工具: ${toolName}`);
        const errorMessage = this.createToolMessage(
          toolCallId,
          toolName,
          `工具 ${toolName} 不存在`
        );
        errorMessage.status = 'error';
        context.messages.push(errorMessage);
        continue;
      }

      // 🔧 与工具 schema 对比参数
      if (debugToolCalls) {
        const schema = tool.parameters;
        const required = schema?.required || [];
        const properties = schema?.properties || {};
        const argKeys = toolArgs ? Object.keys(toolArgs) : [];
        const missingRequired = required.filter((r: string) => !argKeys.includes(r));
        const extraKeys = argKeys.filter((k: string) => !Object.keys(properties).includes(k));

        if (missingRequired.length > 0 || extraKeys.length > 0) {
          console.group(`%c[ToolCall Debug] ⚠️ 参数与 Schema 不匹配: ${toolName}`, 'color:#F44336;font-weight:bold');
          if (missingRequired.length > 0) {
            console.warn('❌ 缺少必需参数:', missingRequired);
          }
          if (extraKeys.length > 0) {
            console.warn('⚠️ 多余参数 (schema 中未定义):', extraKeys);
          }
          console.log('Schema 定义的参数:', Object.keys(properties));
          console.log('Schema required:', required);
          console.log('实际传入的参数:', argKeys);
          console.groupEnd();
        } else {
          console.log(
            `%c[ToolCall Debug] ✅ ${toolName} 参数与 Schema 匹配`,
            'color:#4CAF50'
          );
        }
      }

      // 更新工具状态为执行中
      toolCall.status = 'executing';
      this.emitUpdate(context);

      // 通知 UI：工具开始执行
      if (options.uiStreamConfig?.enabled && options.uiStreamConfig.messageId) {
        this.uiStreamService.pushToolCall({
          conversationId: options.uiStreamConfig.conversationId,
          // 将工具调用绑定到本轮的子 messageId，避免覆盖上一轮的 tool/thinking 展示
          messageId: streamMessageId || options.uiStreamConfig.messageId,
          toolCallId,
          phase: 'start',
          name: toolName,
          argsDelta: JSON.stringify(toolArgs)
        });
      }

      try {
        // 执行工具
        const result = await tool.execute(toolArgs, context);

        // 打印工具执行结果
        logger.debug(`[AgentLoopService] ✅ 工具 ${toolName} 执行成功`);
        logger.debug('📥 结果:', JSON.stringify(result.data || result, null, 2));

        // 通知 UI：工具执行完成
        if (options.uiStreamConfig?.enabled && options.uiStreamConfig.messageId) {
          this.uiStreamService.pushToolCall({
            conversationId: options.uiStreamConfig.conversationId,
            messageId: streamMessageId || options.uiStreamConfig.messageId,
            toolCallId,
            phase: 'end',
            name: toolName,
            resultDelta: JSON.stringify(result.data || result)
          });
        }

        // 创建工具响应消息
        const toolMessage = this.createToolMessage(
          toolCallId,
          toolName,
          JSON.stringify(result.data || result)
        );
        context.messages.push(toolMessage);

        // 更新工具状态
        toolCall.status = 'completed';
        toolCall.result = result.data;

      } catch (error) {
        console.error(`[AgentLoopService] ❌ 工具 ${toolName} 执行失败:`, error);

        // 通知 UI：工具执行出错
        if (options.uiStreamConfig?.enabled && options.uiStreamConfig.messageId) {
          this.uiStreamService.pushToolCall({
            conversationId: options.uiStreamConfig.conversationId,
            messageId: streamMessageId || options.uiStreamConfig.messageId,
            toolCallId,
            phase: 'error',
            name: toolName,
            error: String(error)
          });
        }

        // 创建错误响应消息
        const errorMessage = this.createToolMessage(
          toolCallId,
          toolName,
          `工具执行失败: ${error}`
        );
        errorMessage.status = 'error';
        context.messages.push(errorMessage);

        // 更新工具状态
        toolCall.status = 'error';
      }

      this.emitUpdate(context);
    }
  }

  /**
   * 创建消息
   */
  private createMessage(role: AgentMessage['role'], content: string): AgentMessage {
    return {
      id: generateMessageId(),
      role,
      content,
      status: 'pending',
      timestamp: Date.now()
    };
  }

  /**
   * 创建工具响应消息
   */
  private createToolMessage(toolCallId: string, toolName: string, content: string): AgentMessage {
    return {
      id: generateMessageId(),
      role: 'tool',
      content,
      toolCallId,
      toolName,
      status: 'completed',
      timestamp: Date.now()
    };
  }

  /**
   * 构建执行结果
   */
  private buildResult(
    success: boolean,
    context: AgentContext,
    finalOutput: string,
    error?: string
  ): AgentLoopResult {
    return {
      success,
      context,
      finalOutput,
      error
    };
  }

  /**
   * 发送更新事件
   */
  private emitUpdate(context: AgentContext, latestMessage?: AgentMessage): void {
    this.lastContext = context;
    this._onUpdate.fire({
      agentName: context.agentName,
      status: context.status,
      iteration: context.iteration,
      latestMessage,
      context
    });
  }
}

