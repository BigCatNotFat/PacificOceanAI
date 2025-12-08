/**
 * PromptService - Services 层实现
 * 
 * 负责组装 LLM Prompt，包括：
 * - System Prompt 构建（根据模式和模型）
 * - Context 处理（读取文件、格式化内容）
 * - 历史消息转换与截断
 * - Tool 描述拼接
 */

import { injectable } from '../../platform/instantiation/descriptors';
import type {
  IPromptService,
  LLMMessage,
  ToolDefinition,
  PromptBuildOptions
} from '../../platform/agent/IPromptService';
import { IPromptServiceId } from '../../platform/agent/IPromptService';
import type { ChatMessage, ChatMode, ContextItem } from '../../platform/agent/IChatService';
import type { ModelId, IModelRegistryService } from '../../platform/llm/IModelRegistryService';
import { IModelRegistryServiceId } from '../../platform/llm/IModelRegistryService';
import type { IToolService } from '../../platform/agent/IToolService';
import { IToolServiceId } from '../../platform/agent/IToolService';

/**
 * PromptService 实现
 */
@injectable(IToolServiceId, IModelRegistryServiceId)
export class PromptService implements IPromptService {
  constructor(
    private readonly toolService: IToolService,
    private readonly modelRegistry: IModelRegistryService
  ) {
    console.log('[PromptService] 依赖注入成功', {
      hasToolService: !!toolService,
      hasModelRegistry: !!modelRegistry
    });
  }

  // ==================== 工具管理 ====================

  /**
   * 根据模式获取可用工具列表
   */
  private getToolsForMode(mode: ChatMode): ToolDefinition[] {
    switch (mode) {
      case 'agent':
        // Agent 模式：只返回 Agent 可用的工具
        return this.convertToToolDefinitions(this.toolService.getAgentTools());
      
      case 'chat':
        // Chat 模式：只返回 Chat 可用的工具
        return this.convertToToolDefinitions(this.toolService.getChatTools());
      
      case 'normal':
        // Normal 模式：无工具
        return this.convertToToolDefinitions(this.toolService.getNormalTools());
      
      default:
        return [];
    }
  }

  /**
   * 将 ITool 转换为 ToolDefinition
   */
  private convertToToolDefinitions(tools: any[]): ToolDefinition[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }

  // ==================== 公共方法 ====================

  /**
   * 构建消息列表
   */
  async constructMessages(
    history: ChatMessage[],
    mode: ChatMode,
    context: ContextItem[] | undefined,
    options: PromptBuildOptions
  ): Promise<LLMMessage[]> {
    const messages: LLMMessage[] = [];

    // 1. 构建 System Prompt
    // 如果提供了自定义的 systemPromptOverride，则直接使用
    // 否则根据当前模式和模型ID动态构建 System Prompt（工具列表会在内部自动获取）
    const systemPrompt = options.systemPromptOverride || 
      this.buildSystemPrompt(mode, options.modelId);
    
    messages.push({
      role: 'system',
      content: systemPrompt
    });

    // 2. 添加上下文信息（如果提供）
    if (context && context.length > 0) {
      const contextText = await this.formatContext(context, 10000); // 限制上下文最大 10k tokens
      if (contextText) {
        messages.push({
          role: 'user',
          content: `<context>\n${contextText}\n</context>`
        });
      }
    }

    // 3. 转换历史消息
    const llmHistory = this.convertHistoryToLLMMessages(history, options.includeThinking);
    messages.push(...llmHistory);

    // 4. 截断超长历史（保留最近的消息）
    const truncatedMessages = this.truncateMessages(messages, 100000); // 假设最大 100k tokens

    return truncatedMessages;
  }

  /**
   * 构建 System Prompt
   */
  buildSystemPrompt(mode: ChatMode, modelId: ModelId): string {
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    // 获取模型的知识截止日期
    const modelInfo = this.modelRegistry.getModelInfo(modelId);
    const knowledgeCutoff = modelInfo?.knowledgeCutoff || 'Unknown';

    // 基础系统信息
    const basePrompt = `\
Knowledge cutoff: ${knowledgeCutoff}
You are an AI paper writing assistant powered by ${modelInfo?.name || modelId}, specializing in LaTeX-based academic writing and typesetting. You operate in overleaf.
You are pair paper-writing with a USER to solve their paper writing task. Each time the USER sends a message, we may automatically attach some information about their current state, such as what files they have open, where their cursor is, recently viewed files, edit history in their session so far, and more. This information may or may not be relevant to the paper writing task, it is up for you to decide.
Here is the user's system information:

Current time: ${timestamp}
`;

    // 根据模式获取工具列表
    const tools = this.getToolsForMode(mode);

    switch (mode) {
      case 'agent':
        return this.buildAgentPrompt(basePrompt, tools);
      
      case 'chat':
        return this.buildChatPrompt(basePrompt, tools);
      
      case 'normal':
        return this.buildNormalPrompt(basePrompt);
      
      default:
        return basePrompt;
    }
  }

  /**
   * 格式化上下文
   */
  async formatContext(context: ContextItem[], maxTokens?: number): Promise<string> {
    if (context.length === 0) {
      return '';
    }

    const parts: string[] = [];

    for (const item of context) {
      switch (item.type) {
        case 'file':
          if (item.uri && item.content) {
            parts.push(`File: ${item.uri}\n\`\`\`\n${item.content}\n\`\`\``);
          }
          break;
        
        case 'selection':
          if (item.content) {
            parts.push(`Selected text:\n\`\`\`\n${item.content}\n\`\`\``);
          }
          break;
        
        case 'metadata':
          if (item.metadata) {
            parts.push(`Metadata: ${JSON.stringify(item.metadata, null, 2)}`);
          }
          break;
      }
    }

    let result = parts.join('\n\n');

    // 简单截断（实际应该使用 token 计数）
    if (maxTokens && result.length > maxTokens * 4) {
      result = result.substring(0, maxTokens * 4) + '\n\n[... content truncated ...]';
    }

    return result;
  }

  // ==================== 私有方法 ====================

  /**
   * Agent 模式的 System Prompt
   */
  private buildAgentPrompt(basePrompt: string, tools?: ToolDefinition[]): string {
    let prompt = `${basePrompt}
You are an agent - please keep going until the user's query is completely resolved, before ending your turn and yielding back to the user. Only terminate your turn when you are sure that the problem is solved. Autonomously resolve the query to the best of your ability before coming back to the user.
Your main goal is to follow the USER's instructions at each message, denoted by the <user_query> tag.

<tool_calling>
You have tools at your disposal to solve the writing task. Follow these rules regarding tool calls:
1. ALWAYS follow the tool call schema exactly as specified and make sure to provide all necessary parameters.
2. The conversation may reference tools that are no longer available. NEVER call tools that are not explicitly provided.
3. **NEVER refer to tool names when speaking to the USER.** For example, instead of saying 'I need to use the edit_file tool to edit your file', just say 'I will edit your file'.
4. Only calls tools when they are necessary. If the USER's task is general or you already know the answer, just respond without calling tools.
5. Before calling each tool, first explain to the USER why you are calling it.
</tool_calling>

<making_latex_changes>
When making latex changes, NEVER output latex to the USER, unless requested. Instead use one of the latex edit tools to implement the change.
Use the latex edit tools at most once per turn.
It is *EXTREMELY* important that your generated latex code can be run immediately by the USER. To ensure this, follow these instructions carefully:
1. Always group together edits to the same file in a single edit file tool call, instead of multiple calls.
2. Unless you are appending some small easy to apply edit to a file, or creating a new file, you MUST read the the contents or section of what you're editing before editing it.
3. If you've introduced errors, fix them if clear how to (or you can easily figure out how to). Do not make uneducated guesses. And DO NOT loop more than 3 times on fixing errors on the same file. On the third time, you should stop and ask the user what to do next.
4. If you've suggested a reasonable latex_edit that wasn't followed by the apply model, you should try reapplying the edit.
</making_latex_changes>

<searching_and_reading>
You have tools to search the paperbase and read files. Follow these rules regarding tool calls:
1. If available, heavily prefer the semantic search tool to grep search, file search, and list dir tools.
2. If you need to read a file, prefer to read larger sections of the file at once over multiple smaller calls.
3. If you have found a reasonable place to edit or answer, do not continue calling tools. Edit or answer from the information you have found.
</searching_and_reading>
`;

    // 添加工具列表
    if (tools && tools.length > 0) {
      prompt += '\n\n' + this.formatToolsAsXML(tools);
    }
    prompt += `
You MUST use the following format when citing latex regions or blocks:
\`\`\`startLine:endLine:filepath
// ... existing latex ...
\`\`\`
This is the ONLY acceptable format for latex citations. The format is \`\`\`startLine:endLine:filepath where startLine and endLine are line numbers.

<user_info>
The user's OS version is win32 10.0.26100. The absolute path of the user's workspace is /. 
</user_info>

Answer the user's request using the relevant tool(s), if they are available. Check that all the required parameters for each tool call are provided or can reasonably be inferred from context. IF there are no relevant tools or there are missing values for required parameters, ask the user to supply these values; otherwise proceed with the tool calls. If the user provides a specific value for a parameter (for example provided in quotes), make sure to use that value EXACTLY. DO NOT make up values for or ask about optional parameters. Carefully analyze descriptive terms in the request as they may indicate required parameter values that should be included even if not explicitly quoted.
    
    `;
    return prompt;
  }

  /**
   * Chat 模式的 System Prompt
   */
  private buildChatPrompt(basePrompt: string, tools: ToolDefinition[]): string {
    let prompt = `${basePrompt}
You are in CHAT mode, which is a conversational assistant mode with read-only access to the workspace.
Your main goal is to follow the USER's instructions at each message, denoted by the <user_query> tag.

<tool_calling>
You have read-only tools at your disposal to help analyze the writing task. Follow these rules:
1. ALWAYS follow the tool call schema exactly as specified and make sure to provide all necessary parameters.
2. The conversation may reference tools that are no longer available. NEVER call tools that are not explicitly provided.
3. **NEVER refer to tool names when speaking to the USER.** For example, instead of saying 'I need to use the read_file tool', just say 'Let me read that file'.
4. Only call tools when they are necessary. If the USER's task is general or you already know the answer, just respond without calling tools.
5. Before calling each tool, briefly explain to the USER what you're checking or analyzing.
6. Focus on providing helpful insights and suggestions rather than attempting to make changes.
</tool_calling>

<searching_and_reading>
You have tools to search the paperbase and read files. Follow these rules regarding tool calls:
1. If available, heavily prefer the semantic search tool to grep search, file search, and list dir tools.
2. If you need to read a file, prefer to read larger sections of the file at once over multiple smaller calls.
3. If you have found a reasonable place to edit or answer, do not continue calling tools. Edit or answer from the information you have found.
</searching_and_reading>
`;

    // 添加只读工具列表
    if (tools.length > 0) {
      prompt += '\n\n' + this.formatToolsAsXML(tools);
    }
    prompt += `
You MUST use the following format when citing latex regions or blocks:
\`\`\`startLine:endLine:filepath
// ... existing latex ...
\`\`\`
This is the ONLY acceptable format for latex citations. The format is \`\`\`startLine:endLine:filepath where startLine and endLine are line numbers.

<user_info>
The user's OS version is win32 10.0.26100. The absolute path of the user's workspace is /. 
</user_info>

Answer the user's request using the relevant tool(s), if they are available. Check that all the required parameters for each tool call are provided or can reasonably be inferred from context. IF there are no relevant tools or there are missing values for required parameters, ask the user to supply these values; otherwise proceed with the tool calls. If the user provides a specific value for a parameter (for example provided in quotes), make sure to use that value EXACTLY. DO NOT make up values for or ask about optional parameters. Carefully analyze descriptive terms in the request as they may indicate required parameter values that should be included even if not explicitly quoted.
    
    `;
    return prompt;
  }

  /**
   * 将工具列表格式化为 XML 格式
   * 
   * 输出格式:
   * <functions>
   * <function>{"name": "...", "description": "...", "parameters": {...}}</function>
   * ...
   * </functions>
   */
  private formatToolsAsXML(tools: ToolDefinition[]): string {
    const lines: string[] = ['<functions>'];
    
    for (const tool of tools) {
      const toolJson = JSON.stringify({
        description: tool.description,
        name: tool.name,
        parameters: tool.parameters
      });
      lines.push(`<function>${toolJson}</function>`);
    }
    
    lines.push('</functions>');
    return lines.join('\n');
  }

  /**
   * Normal 模式的 System Prompt
   */
  private buildNormalPrompt(basePrompt: string): string {
    return `${basePrompt}

You are in NORMAL mode. This is a simple Q&A mode.

**Instructions:**
1. Answer the user's question directly and concisely
2. No tool access in this mode
3. Provide brief, focused responses
4. This is a lightweight single-turn interaction

Keep responses clear and to the point.`;
  }

  /**
   * 转换历史消息为 LLM 格式
   */
  private convertHistoryToLLMMessages(
    history: ChatMessage[],
    includeThinking: boolean = false
  ): LLMMessage[] {
    const llmMessages: LLMMessage[] = [];
    const useReasoningField = true;

    for (const msg of history) {
      // 跳过 system 消息（已经在最前面添加了）
      if (msg.role === 'system') {
        continue;
      }

      // 🔑 跳过空内容且没有工具调用的消息
      // 这些通常是 UI 占位消息（如 AgentService 创建的流式占位），不应发送给 LLM
      // 避免某些厂商（如 Gemini）拒绝空消息导致 400 错误
      if (!msg.content?.trim() && (!msg.toolCalls || msg.toolCalls.length === 0)) {
        console.log('[PromptService] 跳过空消息', { role: msg.role, id: msg.id });
        continue;
      }

      // 构建内容
      let content = msg.content;

      // 如果是用户消息，用 <user_query> 标签包裹
      if (msg.role === 'user') {
        content = `<user_query>${content}</user_query>`;
      }

      // 可选：在可见 content 中包含思考内容（仅用于调试）
      // 注意：对于 DeepSeek 等推理模型，真正用于续写的仍然是 reasoning_content 字段
      if (!useReasoningField && includeThinking && msg.thinking && msg.role === 'assistant') {
        content = `<thinking>\n${msg.thinking}\n</thinking>\n\n${content}`;
      }

      const llmMsg: LLMMessage = {
        role: msg.role as LLMMessageRole,
        content
      };

      // 对 assistant 消息添加工具调用信息（OpenAI: 只有 assistant 可以带 tool_calls）
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        llmMsg.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments)
          }
        }));
      }

      // Tool 消息需要特殊处理：只设置 tool_call_id / name，不再设置 tool_calls
      if (msg.role === 'tool' && msg.toolCalls && msg.toolCalls[0]) {
        llmMsg.tool_call_id = msg.toolCalls[0].id;
        llmMsg.name = msg.toolCalls[0].name;
      }

      // 对于带有思考内容的 assistant 消息，将其写入 reasoning_content 字段
      // 以兼容 DeepSeek v3.2 等需要该字段的推理模型（尤其是在使用工具调用时）
      if (useReasoningField && msg.role === 'assistant' && msg.thinking) {
        (llmMsg as any).reasoning_content = msg.thinking;
      }

      llmMessages.push(llmMsg);
    }

    return llmMessages;
  }

  /**
   * 截断消息列表（保留最近的消息）
   */
  private truncateMessages(messages: LLMMessage[], maxTokens: number): LLMMessage[] {
    // 简化实现：假设每个字符约等于 0.25 个 token
    const estimatedTokens = messages.reduce((sum, msg) => sum + msg.content.length * 0.25, 0);

    if (estimatedTokens <= maxTokens) {
      return messages;
    }

    // 保留 system 消息（第一条）
    const systemMessages = messages.filter(m => m.role === 'system');
    let otherMessages = messages.filter(m => m.role !== 'system');

    // 从后往前保留消息，直到接近 token 限制
    let currentTokens = systemMessages.reduce((sum, msg) => sum + msg.content.length * 0.25, 0);
    const kept: LLMMessage[] = [];

    for (let i = otherMessages.length - 1; i >= 0; i--) {
      const msgTokens = otherMessages[i].content.length * 0.25;
      if (currentTokens + msgTokens > maxTokens * 0.9) { // 留 10% 余量
        break;
      }
      kept.unshift(otherMessages[i]);
      currentTokens += msgTokens;
    }

    return [...systemMessages, ...kept];
  }

  /**
   * 释放资源
   */
  dispose(): void {
    // 清理资源
  }
}

// 导出类型
type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';

// 导出服务标识符
export { IPromptServiceId };
