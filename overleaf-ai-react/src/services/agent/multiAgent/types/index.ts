/**
 * MultiAgent 模式类型定义
 * 
 * 定义了多 Agent 系统中使用的所有核心类型
 */

import type { LLMMessage, LLMConfig, LLMFinalMessage } from '../../../../platform/llm/ILLMService';

// ==================== Agent 类型定义 ====================

/**
 * Agent 名称枚举
 */
export type AgentName = 'manager_agent' | 'analyse_agent' | 'edit_agent' | 'paper_search_agent';

/**
 * Agent 状态
 */
export type AgentStatus = 'idle' | 'running' | 'waiting_tool' | 'completed' | 'error' | 'aborted';

/**
 * Agent 消息角色
 */
export type AgentMessageRole = 'system' | 'user' | 'assistant' | 'tool';

// ==================== 消息类型定义 ====================

/**
 * Agent 消息 - 单个 Agent 对话中的消息
 */
export interface AgentMessage {
  /** 消息唯一 ID */
  id: string;
  /** 消息角色 */
  role: AgentMessageRole;
  /** 消息内容 */
  content: string;
  /** 思考内容（推理模型使用） */
  thinking?: string;
  /** 工具调用列表 */
  toolCalls?: AgentToolCall[];
  /** 工具调用 ID（tool 角色消息需要） */
  toolCallId?: string;
  /** 工具名称（tool 角色消息需要） */
  toolName?: string;
  /** 消息状态 */
  status: 'pending' | 'streaming' | 'completed' | 'error';
  /** 时间戳 */
  timestamp: number;
}

/**
 * Agent 工具调用
 */
export interface AgentToolCall {
  /** 工具调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, any>;
  /** 工具执行结果 */
  result?: any;
  /** 工具调用状态 */
  status: 'pending' | 'executing' | 'completed' | 'error';
}

// ==================== Agent 上下文定义 ====================

/**
 * Agent 上下文 - 单个 Agent 的完整对话历史
 */
export interface AgentContext {
  /** Agent 名称 */
  agentName: AgentName;
  /** 系统提示词 */
  systemPrompt: string;
  /** 消息列表 */
  messages: AgentMessage[];
  /** Agent 状态 */
  status: AgentStatus;
  /** 迭代次数 */
  iteration: number;
  /** 最终总结（Agent 完成后的摘要） */
  summary?: string;
  /** 变量存储（MultiAgent 内部可选状态） */
  variables?: Map<string, string>;
}

// ==================== 工具定义 ====================

/**
 * MultiAgent 工具定义
 */
export interface MultiAgentTool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数定义（JSON Schema） */
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  /** 执行函数 */
  execute: (args: any, context?: AgentContext) => Promise<MultiAgentToolResult>;
}

/**
 * 工具执行结果
 */
export interface MultiAgentToolResult {
  /** 是否成功 */
  success: boolean;
  /** 结果数据 */
  data?: any;
  /** 错误消息 */
  error?: string;
  /** 执行耗时（毫秒） */
  duration?: number;
}

// ==================== AgentLoop 配置 ====================

/**
 * AgentLoop 启动选项
 */
export interface AgentLoopOptions {
  /** 模型 ID */
  modelId: string;
  /** 初始上下文（包含系统提示词和初始消息） */
  initialContext: AgentContext;
  /** 
   * 工具配置 - 支持两种方式：
   * 1. 工具名称列表（推荐）: ['read_file', 'grep_search']
   * 2. 工具实例列表: [readFileTool, grepSearchTool]
   */
  tools: string[] | MultiAgentTool[];
  /** 最大迭代次数 */
  maxIterations?: number;
  /** UI 流式输出配置 */
  uiStreamConfig?: {
    /** 是否启用流式输出 */
    enabled: boolean;
    /** 会话 ID */
    conversationId?: string;
    /** 消息 ID */
    messageId?: string;
  };
  /** 是否显示思考过程占位符（Manager Agent 使用） */
  showThinkingPlaceholder?: boolean;
}

/**
 * AgentLoop 执行结果
 */
export interface AgentLoopResult {
  /** 是否成功 */
  success: boolean;
  /** 更新后的上下文 */
  context: AgentContext;
  /** 最终输出内容 */
  finalOutput: string;
  /** 错误信息 */
  error?: string;
}

// ==================== 全局对话列表 ====================

/**
 * 用户消息条目
 */
export interface UserMessageEntry {
  type: 'user';
  content: string;
  timestamp: number;
}

/**
 * Agent 执行条目
 */
export interface AgentExecutionEntry {
  type: 'agent_execution';
  agentName: AgentName;
  context: AgentContext;
  timestamp: number;
}

/**
 * 全局对话条目（联合类型）
 */
export type GlobalConversationEntry = UserMessageEntry | AgentExecutionEntry;

/**
 * 全局对话列表 - 维护完整的多 Agent 对话历史
 */
export interface GlobalConversation {
  /** 会话 ID */
  id: string;
  /** 会话标题 */
  title?: string;
  /** 对话条目列表 */
  entries: GlobalConversationEntry[];
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

// ==================== 辅助类型转换 ====================

/**
 * 将 AgentMessage 转换为 LLMMessage
 */
export function agentMessageToLLMMessage(msg: AgentMessage): LLMMessage {
  const llmMsg: LLMMessage = {
    role: msg.role,
    content: msg.content
  };

  if (msg.thinking) {
    llmMsg.reasoning_content = msg.thinking;
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

  if (msg.toolName) {
    llmMsg.name = msg.toolName;
  }

  return llmMsg;
}

/**
 * 将 LLMFinalMessage 转换为 AgentMessage
 */
export function llmFinalMessageToAgentMessage(result: LLMFinalMessage): AgentMessage {
  const msg: AgentMessage = {
    id: generateMessageId(),
    role: 'assistant',
    content: result.content,
    status: 'completed',
    timestamp: Date.now()
  };

  if (result.thinking) {
    msg.thinking = result.thinking;
  }

  if (result.toolCalls && result.toolCalls.length > 0) {
    msg.toolCalls = result.toolCalls.map(tc => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
      status: 'pending' as const
    }));
  }

  return msg;
}

/**
 * 生成消息 ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 生成工具调用 ID
 */
export function generateToolCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

