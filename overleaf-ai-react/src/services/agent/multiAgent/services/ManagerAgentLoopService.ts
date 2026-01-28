/**
 * ManagerAgentLoopService - Manager Agent Loop 生命周期管理
 * 
 * 核心职责：
 * - 管理 Manager Agent 的生命周期
 * - 根据不同的意图决定行为（agents 调用、模型调用、工具调用）
 * - 维护每个调用过的 agents 的上下文
 * - 维护总的上下文
 * 
 * 工作流程：
 * 1. 用户提问后创建总的列表，填入 ManagerAgent 的系统提示词和用户问题
 * 2. 调用 LLMService.managerChat（不流式输出，不更新 UI）
 * 3. 根据返回的 call_agent 工具调用结果，调用 AgentLoopService
 * 4. Agent 完成后将上下文拼装到总列表
 * 5. 继续调用 ManagerAgent 直到任务完成
 */

import { Emitter, Event } from '../../../../base/common/event';
import type { ILLMService, LLMConfig, LLMMessage, LLMFinalMessage } from '../../../../platform/llm/ILLMService';
import type { IModelRegistryService } from '../../../../platform/llm/IModelRegistryService';
import type { IUIStreamService } from '../../../../platform/agent/IUIStreamService';
import { AgentLoopService } from './AgentLoopService';
import { VariablePoolService } from './VariablePoolService';
import { MultiAgentToolRegistry, getMultiAgentToolRegistry } from '../tools/MultiAgentToolRegistry';
import { getAgentByName } from '../agents';
import type { IPromptService } from '../../../../platform/agent/IPromptService';
import { overleafEditor } from '../../../editor/OverleafEditor';
import { logger } from '../../../../utils/logger';
import type {
  AgentContext,
  AgentMessage,
  AgentName,
  GlobalConversation,
  GlobalConversationEntry,
  CallAgentArgs
} from '../types';
import { generateMessageId } from '../types';

// ==================== 类型定义 ====================

/**
 * ManagerAgentLoop 配置选项
 */
export interface ManagerAgentLoopOptions {
  /** 模型 ID */
  modelId: string;
  /** 用户问题 */
  userMessage: string;
  /** 会话 ID */
  conversationId?: string;
  /** 最大迭代次数 */
  maxIterations?: number;
  /** UI 流式输出配置 */
  uiStreamConfig?: {
    enabled: boolean;
    conversationId?: string;
    messageId?: string;
  };
}

/**
 * ManagerAgentLoop 执行结果
 */
export interface ManagerAgentLoopResult {
  success: boolean;
  /** 最终输出（给用户看的） */
  finalOutput: string;
  /** 完整的全局对话历史 */
  globalConversation: GlobalConversation;
  /** 错误信息 */
  error?: string;
}

/**
 * 更新事件
 */
export interface ManagerAgentLoopUpdateEvent {
  /** 当前阶段 */
  phase: 'planning' | 'agent_working' | 'completed';
  /** 当前工作的 Agent 名称 */
  currentAgent?: AgentName;
  /** 状态消息 */
  message: string;
  /** 全局对话 */
  globalConversation: GlobalConversation;
}

// ==================== ManagerAgentLoopService 实现 ====================

/**
 * ManagerAgentLoopService - Manager Agent 生命周期管理服务
 */
export class ManagerAgentLoopService {
  private static toLoggableContext(context: AgentContext): any {
    const variables =
      (context as any).variables instanceof Map
        ? Object.fromEntries((context as any).variables.entries())
        : (context as any).variables;
    return { ...context, variables };
  }

  /**
   * 将指定 agent 的上下文“净化”为更适合日志阅读的结构：
   * - 去掉 systemPrompt、messageId、timestamp、status、thinking 等噪音
   * - 仅保留：agentName / iteration / messages(role/content/toolCalls)
   */
  private static toLoggableAgentContext(context: AgentContext): any {
    const messages = (context.messages || []).map((m: any) => {
      const base: any = {
        role: m.role,
        content: m.content
      };

      // tool message：保留 toolName / toolCallId（方便定位来源）
      if (m.role === 'tool') {
        if (m.toolName) base.toolName = m.toolName;
        if (m.toolCallId) base.toolCallId = m.toolCallId;
      }

      // assistant message：保留 toolCalls（仅 name + arguments + result）
      if (Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
        base.toolCalls = m.toolCalls.map((tc: any) => ({
          name: tc.name,
          arguments: tc.arguments,
          result: tc.result
        }));
      }

      return base;
    });

    return {
      agentName: context.agentName,
      iteration: context.iteration,
      messages
    };
  }

  private static printFinalManagerContext(params: {
    conversationId: string;
    reason: 'completed' | 'aborted' | 'error' | 'max_iterations';
    error?: string;
    managerContext: AgentContext;
  }): void {
    try {
      const { conversationId, reason, error, managerContext } = params;
      const ts = new Date().toISOString();

      const lines: string[] = [];
      lines.push('\n' + '='.repeat(88));
      lines.push(
        `[FINAL_MANAGER_CONTEXT] ts=${ts} conversationId=${conversationId} reason=${reason}`
      );
       if (error) lines.push(`[FINAL_MANAGER_CONTEXT] error=${error}`);
      lines.push('-'.repeat(88));
      lines.push(JSON.stringify(ManagerAgentLoopService.toLoggableAgentContext(managerContext), null, 2));
      lines.push('='.repeat(88) + '\n');
      console.log(lines.join('\n'));
    } catch (e) {
      console.log('[ManagerAgentLoopService][FINAL_MANAGER_CONTEXT] failed to print context:', e);
    }
  }

  private static printFinalSelectedAgentContexts(params: {
    conversationId: string;
    reason: 'completed' | 'aborted' | 'error' | 'max_iterations';
    error?: string;
    contexts: Array<{ agentName: AgentName; context: AgentContext }>;
  }): void {
    try {
      const { conversationId, reason, error, contexts } = params;
      const ts = new Date().toISOString();
      const lines: string[] = [];
      lines.push('\n' + '='.repeat(88));
      lines.push(
        `[FINAL_AGENT_CONTEXTS] ts=${ts} conversationId=${conversationId} reason=${reason} agents=${contexts.length}`
      );
      if (error) lines.push(`[FINAL_AGENT_CONTEXTS] error=${error}`);
      lines.push('-'.repeat(88));
      const payload = contexts.map(item => ({
        agentName: item.agentName,
        context: ManagerAgentLoopService.toLoggableAgentContext(item.context)
      }));
      lines.push(JSON.stringify(payload, null, 2));
      lines.push('='.repeat(88) + '\n');
      console.log(lines.join('\n'));
    } catch (e) {
      console.log('[ManagerAgentLoopService][FINAL_AGENT_CONTEXTS] failed to print contexts:', e);
    }
  }

  // ==================== 事件发射器 ====================
  private readonly _onUpdate = new Emitter<ManagerAgentLoopUpdateEvent>();
  public readonly onUpdate: Event<ManagerAgentLoopUpdateEvent> = this._onUpdate.event;

  private readonly _onError = new Emitter<Error>();
  public readonly onError: Event<Error> = this._onError.event;

  // ==================== 内部状态 ====================
  private aborted = false;
  private abortController?: AbortController;
  private finalPrinted = false;
  private activeConversationId?: string;
  private activeGlobalConversation?: GlobalConversation;
  private activeManagerContext?: AgentContext;

  private printFinalOnce(reason: 'completed' | 'aborted' | 'error' | 'max_iterations', error?: string): void {
    if (this.finalPrinted) return;
    if (!this.activeConversationId || !this.activeManagerContext || !this.activeGlobalConversation) {
      return;
    }
    this.finalPrinted = true;

    // 按需求：只打印 manager_agent 的完整上下文，不打印其他 agent
    ManagerAgentLoopService.printFinalManagerContext({
      conversationId: this.activeConversationId,
      reason,
      error,
      managerContext: this.activeManagerContext
    });

    // 同时打印 analyse_agent / edit_agent 的最终上下文（如果有）
    const wanted: AgentName[] = ['analyse_agent', 'edit_agent'];
    const fromGlobal = new Map<AgentName, AgentContext>();
    for (const entry of this.activeGlobalConversation.entries) {
      if (entry.type === 'agent_execution') {
        fromGlobal.set(entry.agentName, entry.context);
      }
    }

    const selected: Array<{ agentName: AgentName; context: AgentContext }> = [];
    for (const agentName of wanted) {
      const ctx = fromGlobal.get(agentName) || this.agentLoopServices.get(agentName)?.getLastContext();
      if (ctx) selected.push({ agentName, context: ctx });
    }

    if (selected.length > 0) {
      ManagerAgentLoopService.printFinalSelectedAgentContexts({
        conversationId: this.activeConversationId,
        reason,
        error,
        contexts: selected
      });
    }
  }

  /** 工具注册表 */
  private readonly toolRegistry: MultiAgentToolRegistry;

  /** Agent Loop 服务实例缓存 */
  private readonly agentLoopServices: Map<AgentName, AgentLoopService> = new Map();

  /** Agent 上下文缓存（用于多轮对话） */
  private readonly agentContextCache: Map<AgentName, AgentContext> = new Map();

  /** 变量池服务 - 用于 Agent 间数据传递 */
  private readonly variablePool: VariablePoolService;

  constructor(
    private readonly llmService: ILLMService,
    private readonly modelRegistry: IModelRegistryService,
    private readonly uiStreamService: IUIStreamService,
    private readonly promptService?: IPromptService,
    toolRegistry?: MultiAgentToolRegistry
  ) {
    this.toolRegistry = toolRegistry || getMultiAgentToolRegistry();
    this.variablePool = new VariablePoolService();
  }

  // ==================== 变量池访问方法 ====================

  /**
   * 获取变量池服务实例（用于外部访问）
   */
  getVariablePool(): VariablePoolService {
    return this.variablePool;
  }

  /**
   * 将纯文本按行添加 [Line N] 前缀，便于模型引用具体行。
   * 格式与 ReadFileTool 保持一致：`[Line 1] <content>`
   */
  private addLineNumberPrefixes(content: string): string {
    const lines = content.split('\n');
    return lines.map((line, idx) => `[Line ${idx + 1}] ${line}`).join('\n');
  }

  // ==================== 公共方法 ====================

  /**
   * 启动 Manager Agent Loop
   */
  async run(options: ManagerAgentLoopOptions): Promise<ManagerAgentLoopResult> {
    const { modelId, userMessage, maxIterations = 10 } = options;
    const conversationId = options.conversationId || `conv_${Date.now()}`;

    logger.debug('[ManagerAgentLoopService] 启动 Manager Agent Loop');
    logger.debug(`[ManagerAgentLoopService] 模型: ${modelId}, 用户问题: ${userMessage}`);

    this.aborted = false;
    this.finalPrinted = false;
    this.activeConversationId = conversationId;

    // 初始化全局对话
    const globalConversation: GlobalConversation = {
      id: conversationId,
      entries: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.activeGlobalConversation = globalConversation;

    // 添加用户消息
    globalConversation.entries.push({
      type: 'user',
      content: userMessage,
      timestamp: Date.now()
    });

    // 获取 Manager Agent 配置
    const managerAgent = getAgentByName('manager_agent');
    if (!managerAgent) {
      throw new Error('未找到 Manager Agent 配置');
    }

    // 初始化 Manager Agent 上下文
    const managerContext: AgentContext = {
      agentName: 'manager_agent',
      systemPrompt: managerAgent.getSystemPrompt(),
      messages: [{
        id: generateMessageId(),
        role: 'user',
        content: this.buildManagerUserMessage(userMessage),
        status: 'completed',
        timestamp: Date.now()
      }],
      status: 'running',
      iteration: 0
    };
    this.activeManagerContext = managerContext;

    try {
      let iteration = 0;

      // Manager Agent Loop
      while (iteration < maxIterations && !this.aborted) {
        logger.debug(`[ManagerAgentLoopService] Manager Agent 第 ${iteration + 1} 轮迭代`);

        // 发送"正在规划"状态
        this.emitUpdate('planning', undefined, '正在规划任务...', globalConversation);

        // 1. 构建 LLM 配置
        const llmConfig = this.buildManagerLLMConfig(modelId);
        this.abortController = new AbortController();
        (llmConfig as any).abortSignal = this.abortController.signal;
        // Gemini 3: tool_calls 需要回传 thought_signature，Provider 依赖 conversationId 做缓存/补全
        (llmConfig as any).uiStreamMeta = {
          conversationId
        };

        // 2. 构建 LLM 消息
        // DeepSeek thinking mode + tool_calls 时要求历史 assistant 消息包含 reasoning_content 字段
        const llmMessages = this.buildLLMMessages(managerContext, {
          includeReasoningContent: !!(llmConfig as any).thinking
        });

        // 3. 调用 LLM（非流式）
        logger.debug('[ManagerAgentLoopService] 调用 managerChat');
        const llmResult = await (this.llmService as any).managerChat(llmMessages, llmConfig);

        if (this.aborted) {
          this.printFinalOnce('aborted', 'Manager Agent 执行已中断');
          return this.buildResult(false, '', globalConversation, 'Manager Agent 执行已中断');
        }

        // 4. 处理 LLM 响应
        const assistantMessage: AgentMessage = {
          id: generateMessageId(),
          role: 'assistant',
          content: llmResult.content,
          thinking: llmResult.thinking,
          status: 'completed',
          timestamp: Date.now()
        };

        if (llmResult.toolCalls && llmResult.toolCalls.length > 0) {
          assistantMessage.toolCalls = llmResult.toolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
            status: 'pending' as const
          }));
        }

        managerContext.messages.push(assistantMessage);

        logger.debug('[ManagerAgentLoopService] Manager Agent 响应:', {
          content: llmResult.content?.substring(0, 100),
          thinking: llmResult.thinking?.substring(0, 100),
          toolCalls: assistantMessage.toolCalls?.map(tc => tc.name)
        });

        // 5. 检查是否有工具调用
        if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
          // 没有工具调用，任务完成
          logger.debug('[ManagerAgentLoopService] Manager Agent 完成（无工具调用）');

          // 添加到全局对话
          globalConversation.entries.push({
            type: 'agent_execution',
            agentName: 'manager_agent',
            context: { ...managerContext },
            timestamp: Date.now()
          });

          // 流式输出最终结果
          if (options.uiStreamConfig?.enabled && options.uiStreamConfig.messageId) {
            await this.streamFinalOutput(llmResult.content, options.uiStreamConfig);
          }

          this.emitUpdate('completed', undefined, '任务完成', globalConversation);

          this.printFinalOnce('completed');
          return this.buildResult(true, llmResult.content, globalConversation);
        }

        // 6. 处理工具调用（call_agent）
        for (const toolCall of assistantMessage.toolCalls) {
          if (toolCall.name === 'call_agent') {
            const callAgentArgs = toolCall.arguments as CallAgentArgs;
            const { agent_name, instruction, inject_variables, output_variable_name } = callAgentArgs;

            logger.debug(`[ManagerAgentLoopService] 调用 Agent: ${agent_name}`);
            logger.debug(`[ManagerAgentLoopService] 指令: ${instruction}`);
            if (inject_variables?.length) {
              logger.debug(`[ManagerAgentLoopService] 注入变量: ${inject_variables.join(', ')}`);
            }

            // 发送"Agent 工作中"状态
            this.emitUpdate('agent_working', agent_name, `${agent_name} 正在工作...`, globalConversation);

            // 构建注入内容
            let injectedContent = '';
            if (inject_variables && inject_variables.length > 0) {
              const injectionResult = this.variablePool.buildInjectionContent({
                variableNames: inject_variables,
                includeMetadata: false
              });
              
              if (injectionResult.success) {
                injectedContent = injectionResult.content;
                logger.debug(`[ManagerAgentLoopService] 成功注入 ${injectionResult.foundVariables.length} 个变量`);
              }
              
              if (injectionResult.missingVariables.length > 0) {
                logger.warn(`[ManagerAgentLoopService] 未找到变量: ${injectionResult.missingVariables.join(', ')}`);
              }
            }

            // 执行 Agent（传入注入内容）
            const agentResult = await this.executeAgent(
              agent_name, 
              instruction, 
              options,
              injectedContent
            );

            // 保存结果到变量池
            const savedVariable = this.variablePool.saveVariable(
              agentResult.summary || agentResult.finalOutput,
              agent_name,
              output_variable_name,
              `Result from ${agent_name}`
            );

            logger.debug(`[ManagerAgentLoopService] 结果已保存到变量: ${savedVariable.name}`);

            // 创建工具响应消息（包含变量信息）
            const toolResultContent = this.variablePool.formatToolResult(savedVariable);
            
            const toolMessage: AgentMessage = {
              id: generateMessageId(),
              role: 'tool',
              content: toolResultContent,
              toolCallId: toolCall.id,
              toolName: 'call_agent',
              status: 'completed',
              timestamp: Date.now()
            };

            managerContext.messages.push(toolMessage);

            // 添加 Agent 执行记录到全局对话
            globalConversation.entries.push({
              type: 'agent_execution',
              agentName: agent_name,
              context: agentResult.context,
              timestamp: Date.now()
            });

            toolCall.status = 'completed';
            toolCall.result = {
              output: agentResult.finalOutput,
              savedVariableName: savedVariable.name
            };
          }
        }

        iteration++;
        managerContext.iteration = iteration;
      }

      // 达到最大迭代次数
      if (iteration >= maxIterations) {
        const limitMessage = `已达到最大迭代次数（${maxIterations}）`;
        logger.debug(`[ManagerAgentLoopService] ${limitMessage}`);
        this.printFinalOnce('max_iterations', limitMessage);
        return this.buildResult(false, limitMessage, globalConversation, limitMessage);
      }

      this.printFinalOnce('completed');
      return this.buildResult(true, '', globalConversation);

    } catch (error) {
      console.error('[ManagerAgentLoopService] 执行错误:', error);
      this._onError.fire(error instanceof Error ? error : new Error(String(error)));
      const errMsg = error instanceof Error ? error.message : String(error);
      this.printFinalOnce('error', errMsg);
      return this.buildResult(
        false,
        '',
        globalConversation,
        errMsg
      );
    }
  }

  /**
   * 中断执行
   */
  abort(): void {
    logger.debug('[ManagerAgentLoopService] 中断执行');
    this.aborted = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }

    // 中断所有 Agent Loop
    for (const service of this.agentLoopServices.values()) {
      service.abort();
    }
    // 手动终止时立即打印最终上下文（只打印一次）
    this.printFinalOnce('aborted', 'Manager Agent 手动终止（abort 调用）');
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this._onUpdate.dispose();
    this._onError.dispose();

    for (const service of this.agentLoopServices.values()) {
      service.dispose();
    }
    this.agentLoopServices.clear();
    this.agentContextCache.clear();
    this.variablePool.clear();
  }

  // ==================== 私有方法 ====================

  /**
   * 构建 Manager Agent 的用户消息
   */
  private buildManagerUserMessage(userMessage: string): string {
    return `<user_query>${userMessage}</user_query>`;
  }

  /**
   * 构建 LLM 消息列表
   */
  private buildLLMMessages(
    context: AgentContext,
    options?: { includeReasoningContent?: boolean }
  ): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // 系统提示词
    messages.push({
      role: 'system',
      content: context.systemPrompt
    });

    // 对话历史
    for (const msg of context.messages) {
      const llmMsg: LLMMessage = {
        role: msg.role,
        content: msg.content
      };

      if (options?.includeReasoningContent && msg.role === 'assistant') {
        // 兼容 DeepSeek thinking mode：history assistant 必须有 reasoning_content（可为空字符串）
        (llmMsg as any).reasoning_content = typeof msg.thinking === 'string' ? msg.thinking : '';
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        llmMsg.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments)
          }
        }));
      }

      if (msg.toolCallId) {
        llmMsg.tool_call_id = msg.toolCallId;
      }

      messages.push(llmMsg);
    }

    return messages;
  }

  /**
   * 构建 Manager Agent 的 LLM 配置
   */
  private buildManagerLLMConfig(modelId: string): LLMConfig {
    const defaultConfig = this.modelRegistry.getDefaultConfig(modelId);
    if (!defaultConfig) {
      throw new Error(`未找到模型配置: ${modelId}`);
    }

    const config: LLMConfig = {
      ...defaultConfig,
      stream: false // Manager Agent 使用非流式
    };

    // 添加 call_agent 工具
    const callAgentTool = this.toolRegistry.getTool('call_agent');
    if (callAgentTool) {
      (config as any).tools = [{
        type: 'function',
        function: {
          name: callAgentTool.name,
          description: callAgentTool.description,
          parameters: callAgentTool.parameters
        }
      }];
      (config as any).tool_choice = 'auto';
    }

    return config;
  }

  /**
   * 执行指定的 Agent
   * 
   * @param agentName - Agent 名称
   * @param instruction - 指令
   * @param options - 执行选项
   * @param injectedVariablesContent - 注入的变量内容（可选）
   */
  private async executeAgent(
    agentName: AgentName,
    instruction: string,
    options: ManagerAgentLoopOptions,
    injectedVariablesContent?: string
  ): Promise<{ context: AgentContext; finalOutput: string; summary?: string }> {
    // 获取 Agent 配置
    const agent = getAgentByName(agentName);
    if (!agent) {
      throw new Error(`未找到 Agent: ${agentName}`);
    }

    // 获取或创建 AgentLoopService
    let agentLoopService = this.agentLoopServices.get(agentName);
    if (!agentLoopService) {
      agentLoopService = new AgentLoopService(
        this.llmService,
        this.modelRegistry,
        this.uiStreamService,
        this.toolRegistry
      );
      this.agentLoopServices.set(agentName, agentLoopService);
    }

    // 订阅更新事件，转发到 UI
    const updateDisposable = agentLoopService.onUpdate((event) => {
      // 转发 Agent 的更新到 UI（流式输出）
      if (options.uiStreamConfig?.enabled && options.uiStreamConfig.messageId) {
        // Agent 的输出会通过 AgentLoopService 内部的 uiStreamService 推送
      }
    });

    try {
      const projectLayoutTag =
        agentName === 'analyse_agent' && this.promptService
          ? await this.promptService.buildProjectLayoutTag()
          : '';

      // 获取当前 .tex 文件内容（仅对 analyse_agent）
      let currentFileTag = '';
      if (agentName === 'analyse_agent') {
        try {
          const fileInfo = await overleafEditor.file.getInfo();
          const fileName = fileInfo?.fileName || '';
          if (fileName.endsWith('.tex')) {
            const content = await overleafEditor.document.getText();
            if (content) {
              const numberedContent = this.addLineNumberPrefixes(content);
              currentFileTag = `<current_file name="${fileName}">
${numberedContent}
</current_file>`;
            }
          }
        } catch (error) {
          console.warn('[ManagerAgentLoopService] 获取当前文件内容失败:', error);
        }
      }

      // 构建用户提示词内容
      const userContentParts: string[] = [];
      
      // 1. 添加注入的变量内容（如果有）
      if (injectedVariablesContent) {
        userContentParts.push(injectedVariablesContent);
      }
      
      // 2. 添加项目布局
      if (projectLayoutTag) {
        userContentParts.push(projectLayoutTag);
      }
      
      // 3. 添加当前文件内容
      if (currentFileTag) {
        userContentParts.push(currentFileTag);
      }
      
      // 4. 添加用户指令
      userContentParts.push(`<query>${instruction}</query>`);

      // 构建初始上下文
      const initialContext: AgentContext = {
        agentName,
        systemPrompt: agent.getSystemPrompt(),
        messages: [{
          id: generateMessageId(),
          role: 'user',
          content: userContentParts.join('\n\n'),
          status: 'completed',
          timestamp: Date.now()
        }],
        status: 'idle',
        iteration: 0,
        variables: new Map()
      };

      // 执行 Agent
      const result = await agentLoopService.run({
        modelId: options.modelId,
        initialContext,
        tools: agent.getTools(),
        maxIterations: 20,
        uiStreamConfig: options.uiStreamConfig
      });

      return {
        context: result.context,
        finalOutput: result.finalOutput,
        summary: result.context.summary
      };

    } finally {
      updateDisposable.dispose();
    }
  }

  /**
   * 流式输出最终结果
   */
  private async streamFinalOutput(
    content: string,
    uiStreamConfig: { enabled: boolean; conversationId?: string; messageId?: string }
  ): Promise<void> {
    if (!content || !uiStreamConfig.messageId) return;

    // 分块输出，模拟流式效果
    const chunkSize = 10;
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      this.uiStreamService.pushContent({
        conversationId: uiStreamConfig.conversationId,
        messageId: uiStreamConfig.messageId,
        delta: chunk
      });
      // 小延迟，让 UI 有时间渲染
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // 发送完成信号
    this.uiStreamService.pushContent({
      conversationId: uiStreamConfig.conversationId,
      messageId: uiStreamConfig.messageId,
      delta: '',
      done: true
    });
  }

  /**
   * 构建执行结果
   */
  private buildResult(
    success: boolean,
    finalOutput: string,
    globalConversation: GlobalConversation,
    error?: string
  ): ManagerAgentLoopResult {
    globalConversation.updatedAt = Date.now();
    return {
      success,
      finalOutput,
      globalConversation,
      error
    };
  }

  /**
   * 发送更新事件
   */
  private emitUpdate(
    phase: ManagerAgentLoopUpdateEvent['phase'],
    currentAgent: AgentName | undefined,
    message: string,
    globalConversation: GlobalConversation
  ): void {
    this._onUpdate.fire({
      phase,
      currentAgent,
      message,
      globalConversation
    });
  }
}

