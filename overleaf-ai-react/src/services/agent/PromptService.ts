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
import type { ModelId } from '../../platform/llm/IModelRegistryService';
import type { IToolService } from '../../platform/agent/IToolService';
import { IToolServiceId } from '../../platform/agent/IToolService';

/**
 * PromptService 实现
 */
@injectable(IToolServiceId)
export class PromptService implements IPromptService {
  constructor(
    private readonly toolService: IToolService
  ) {
    console.log('[PromptService] 依赖注入成功', {
      hasToolService: !!toolService
    });
  }

  // ==================== 工具管理 ====================

  /**
   * 根据模式获取可用工具列表
   */
  private getToolsForMode(mode: ChatMode): ToolDefinition[] {
    switch (mode) {
      case 'agent':
        // Agent 模式：所有工具可用
        return this.convertToToolDefinitions(this.toolService.getAllTools());
      
      case 'chat':
        // Chat 模式：只有只读工具
        return this.convertToToolDefinitions(this.toolService.getReadOnlyTools());
      
      case 'normal':
        // Normal 模式：无工具
        return [];
      
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

    // 基础系统信息
    const basePrompt = `You are an AI assistant helping users with LaTeX document editing in Overleaf.

Current time: ${timestamp}
Model: ${modelId}
Mode: ${mode}`;

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

You are in AGENT mode. You have access to tools that can help you complete tasks.

**Important Instructions:**
1. First, think carefully about the user's request in a <thinking> section.
2. Break down complex tasks into steps.
3. Use tools when necessary to accomplish tasks.
4. For code editing operations, you MUST use the appropriate tool (edit_code) instead of just describing changes.
5. Always explain what you're doing in natural language.
6. After tool execution, provide a summary of what was done.

**Tool Usage Rules:**
- Call tools with proper JSON-formatted arguments
- Wait for tool execution results before proceeding
- Some tools (like edit_code) require user approval
- If a tool fails, explain the error and suggest alternatives

**Thinking Process:**
Use <thinking>...</thinking> tags to show your reasoning process. This helps users understand your approach but won't be saved in history.`;

    // 添加工具列表
    if (tools && tools.length > 0) {
      prompt += '\n\n**Available Tools:**\n';
      for (const tool of tools) {
        prompt += `\n- **${tool.name}**: ${tool.description}`;
      }
    }

    return prompt;
  }

  /**
   * Chat 模式的 System Prompt
   */
  private buildChatPrompt(basePrompt: string, tools: ToolDefinition[]): string {
    let prompt = `${basePrompt}

You are in CHAT mode. This is a conversational mode focused on discussion and explanation.

**Instructions:**
1. Engage in natural conversation with the user
2. Provide helpful explanations and suggestions
3. You have access to some read-only tools for information retrieval
4. You cannot directly modify files in this mode
5. If the user wants to make changes, suggest switching to AGENT mode
6. Be concise and clear in your responses

Focus on understanding and explaining concepts, answering questions, and providing guidance.`;

    // 添加只读工具列表
    if (tools.length > 0) {
      prompt += '\n\n**Available Tools (Read-Only):**\n';
      for (const tool of tools) {
        prompt += `\n- **${tool.name}**: ${tool.description}`;
      }
    }

    return prompt;
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

    for (const msg of history) {
      // 跳过 system 消息（已经在最前面添加了）
      if (msg.role === 'system') {
        continue;
      }

      // 构建内容
      let content = msg.content;

      // 可选：包含思考内容（仅用于调试）
      if (includeThinking && msg.thinking && msg.role === 'assistant') {
        content = `<thinking>\n${msg.thinking}\n</thinking>\n\n${content}`;
      }

      const llmMsg: LLMMessage = {
        role: msg.role as LLMMessageRole,
        content
      };

      // 添加工具调用信息
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

      // Tool 消息需要特殊处理
      if (msg.role === 'tool' && msg.toolCalls && msg.toolCalls[0]) {
        llmMsg.tool_call_id = msg.toolCalls[0].id;
        llmMsg.name = msg.toolCalls[0].name;
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
