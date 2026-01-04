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
  PromptBuildOptions,
  TextActionType
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

  /**
   * 构建文本操作（润色/扩写/缩写/自定义）的消息列表
   * 
   * @param action - 操作类型 ('polish' | 'expand' | 'condense' | 'translate' | 'custom')
   * @param text - 用户选中的原始文本
   * @param customPrompt - 自定义提示词（仅当 action 为 'custom' 时使用）
   * @returns LLM 消息列表（包含 system 和 user 消息）
   */
  buildTextActionPrompt(action: TextActionType, text: string, customPrompt?: string): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // 获取对应操作的 System Prompt
    const systemPrompt = this.getTextActionSystemPrompt(action, customPrompt);
    messages.push({
      role: 'system',
      content: systemPrompt
    });

    // 构建 User 消息
    const userPrompt = this.getTextActionUserPrompt(action, text, customPrompt);
    messages.push({
      role: 'user',
      content: userPrompt
    });

    return messages;
  }

  // ==================== 私有方法 ====================

  // ==================== 文本操作提示词模板 ====================

  /**
   * 获取文本操作的 System Prompt
   */
  private getTextActionSystemPrompt(action: TextActionType, customPrompt?: string): string {
    // 自定义操作使用通用的 system prompt
    if (action === 'custom') {
      return `You are a professional academic writing assistant specializing in LaTeX document editing.

Your task is to follow the user's specific instructions. You may be asked to:
- Process/modify existing text
- Generate new content (formulas, paragraphs, etc.)
- Insert specific LaTeX elements

**Guidelines:**
1. Follow the user's instructions precisely
2. Use proper LaTeX syntax for mathematical expressions, formulas, and special formatting
3. Maintain academic writing style when generating text
4. Ensure all LaTeX commands are syntactically correct
5. Do NOT add explanations or comments about what you did - only output the content
6. Ensure the output is ready to be used directly in a LaTeX document

**Important:**
- Output ONLY the requested content, nothing else
- Do NOT wrap the output in markdown code blocks or quotes
- Do NOT include phrases like "Here is the result" or similar
- For math formulas, use appropriate LaTeX math environments ($ $, $$ $$, \\begin{equation}, etc.)`;
    }

    const prompts: Record<Exclude<TextActionType, 'custom'>, string> = {
      polish: `You are a professional academic writing assistant specializing in LaTeX document editing.

Your task is to POLISH the given text to improve its quality while preserving the original meaning and intent.

**Guidelines:**
1. Improve grammar, syntax, and punctuation
2. Enhance clarity and readability
3. Use more precise and academic vocabulary where appropriate
4. Maintain the original tone and style (formal academic writing)
5. Preserve all LaTeX commands, environments, and formatting exactly as they are
6. Do NOT add new content or change the meaning
7. Do NOT add explanations or comments - only output the polished text
8. If the text contains LaTeX code, ensure all commands remain syntactically correct

**Important:**
- Output ONLY the polished text, nothing else
- Do NOT wrap the output in code blocks or quotes
- Do NOT include phrases like "Here is the polished version" or similar`,

      expand: `You are a professional academic writing assistant specializing in LaTeX document editing.

Your task is to EXPAND the given text by adding more details, explanations, and supporting content while maintaining academic rigor.

**Guidelines:**
1. Add relevant details, examples, or explanations
2. Elaborate on key concepts and arguments
3. Maintain logical flow and coherence with the original text
4. Use appropriate academic vocabulary and formal tone
5. Preserve all existing LaTeX commands and formatting
6. Add new LaTeX formatting (e.g., \\textit{}, \\textbf{}) where appropriate
7. Ensure expanded content is factually consistent with the original
8. Do NOT add explanations about what you did - only output the expanded text

**Important:**
- Output ONLY the expanded text, nothing else
- Do NOT wrap the output in code blocks or quotes
- Do NOT include phrases like "Here is the expanded version" or similar
- The expanded text should be approximately 1.5-2x the original length`,

      condense: `You are a professional academic writing assistant specializing in LaTeX document editing.

Your task is to CONDENSE the given text by removing redundancy and keeping only the essential content while preserving the core meaning.

**Guidelines:**
1. Remove redundant phrases and unnecessary words
2. Combine related sentences where appropriate
3. Keep the most important information and key arguments
4. Maintain clarity and academic tone
5. Preserve all essential LaTeX commands and formatting
6. Remove decorative or optional LaTeX formatting if it helps brevity
7. Ensure the condensed version remains grammatically correct
8. Do NOT add explanations about what you did - only output the condensed text

**Important:**
- Output ONLY the condensed text, nothing else
- Do NOT wrap the output in code blocks or quotes
- Do NOT include phrases like "Here is the condensed version" or similar
- The condensed text should be approximately 50-70% of the original length`,

      translate: `You are a professional academic translator specializing in LaTeX document translation.

Your task is to TRANSLATE the given Chinese text into English while maintaining academic rigor and proper LaTeX formatting.

**Guidelines:**
1. Translate Chinese text into fluent, academic English
2. Preserve the original meaning, tone, and intent accurately
3. Use appropriate academic vocabulary and formal register
4. Maintain proper grammar and sentence structure in English
5. Preserve ALL LaTeX commands, environments, and formatting exactly as they are
6. Keep mathematical expressions, citations, and references unchanged
7. Ensure technical terms are translated accurately using standard academic terminology
8. Do NOT add explanations or comments - only output the translated text
9. If the text is already in English or contains mixed languages, translate only the Chinese portions

**Important:**
- Output ONLY the translated text, nothing else
- Do NOT wrap the output in code blocks or quotes
- Do NOT include phrases like "Here is the translation" or similar
- Preserve the exact formatting and structure of the original text`
    };

    return prompts[action as Exclude<TextActionType, 'custom'>];
  }

  /**
   * 获取文本操作的 User Prompt
   */
  private getTextActionUserPrompt(action: TextActionType, text: string, customPrompt?: string): string {
    // 自定义操作使用用户的自定义提示词
    if (action === 'custom' && customPrompt) {
      // 如果没有选中文本（插入模式），不需要包含 <text> 标签
      if (!text || text.trim().length === 0) {
        return `${customPrompt}

Please generate the content directly. Output ONLY the generated content, nothing else.`;
      }
      
      return `${customPrompt}

<text>
${text}
</text>`;
    }

    const actionDescriptions: Record<Exclude<TextActionType, 'custom'>, string> = {
      polish: 'Polish the following text to improve its quality:',
      expand: 'Expand the following text with more details and explanations:',
      condense: 'Condense the following text to be more concise:',
      translate: 'Translate the following Chinese text into English:'
    };

    return `${actionDescriptions[action as Exclude<TextActionType, 'custom'>]}

<text>
${text}
</text>`;
  }

  // ==================== 聊天模式提示词 ====================

  /**
   * Agent 模式的 System Prompt
   */
  private buildAgentPrompt(basePrompt: string, tools?: ToolDefinition[]): string {
    let prompt = `${basePrompt}
You are an agent - please keep going until the user's query is completely resolved, before ending your turn and yielding back to the user. Only terminate your turn when you are sure that the problem is solved. Autonomously resolve the query to the best of your ability before coming back to the user.
Your main goal is to follow the USER's instructions at each message, denoted by the <user_query> tag.

**Important clarification:** Not all queries require tool usage. For simple conversations, greetings, or questions you can answer directly, respond naturally without calling any tools. Only use tools when the task genuinely requires reading or modifying files.

<tool_calling>
You have tools at your disposal to solve the writing task. Follow these rules regarding tool calls:
1. ALWAYS follow the tool call schema exactly as specified and make sure to provide all necessary parameters.
2. The conversation may reference tools that are no longer available. NEVER call tools that are not explicitly provided.
3. **NEVER refer to tool names when speaking to the USER.** For example, instead of saying 'I need to use the edit_file tool to edit your file', just say 'I will edit your file'.
4. **CRITICAL: Only call tools when they are absolutely necessary for the task!** Examples of when NOT to use tools:
   - Simple greetings or casual conversation (e.g., "你好", "hello", "hi", "谢谢", "好的")
   - General questions that don't require file access (e.g., "什么是LaTeX?", "如何写论文?")
   - Questions you can answer from your knowledge without needing project context
   - When the user hasn't explicitly asked you to do anything with files
5. **Do NOT proactively explore or read files unless the user explicitly asks for it or the task clearly requires file operations.**
6. Before calling each tool, first explain to the USER why you are calling it.
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

<user_info>
The user's OS version is win32 10.0.26100. The absolute path of the user's workspace is /. 
</user_info>

**Response Guidelines:**
- For simple greetings, casual chat, or general knowledge questions: respond directly WITHOUT calling any tools.
- For tasks that genuinely require file operations: use the relevant tool(s) and check that all required parameters are provided.
- IF there are missing values for required parameters, ask the user to supply these values.
- If the user provides a specific value for a parameter (for example provided in quotes), make sure to use that value EXACTLY.
- DO NOT make up values for or ask about optional parameters.
- DO NOT proactively explore the project structure unless the user asks for it.
    
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
