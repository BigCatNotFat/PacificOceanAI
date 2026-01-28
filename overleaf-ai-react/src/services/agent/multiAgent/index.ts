/**
 * MultiAgent 模块统一导出
 * 
 * 提供多 Agent 系统的所有核心功能
 * 
 * @example
 * // 导入服务
 * import { AgentLoopService, ManagerAgentLoopService, MultiAgentToolRegistry } from '@/services/agent/multiAgent';
 * 
 * // 导入类型
 * import type { AgentContext, AgentLoopOptions, ManagerAgentLoopOptions } from '@/services/agent/multiAgent';
 */

// ==================== 服务 ====================

export { AgentLoopService } from './services/AgentLoopService';
export type { AgentLoopUpdateEvent } from './services/AgentLoopService';

export { ManagerAgentLoopService } from './services/ManagerAgentLoopService';
export type { 
  ManagerAgentLoopOptions, 
  ManagerAgentLoopResult, 
  ManagerAgentLoopUpdateEvent 
} from './services/ManagerAgentLoopService';

// ==================== 工具注册表 ====================

export { 
  MultiAgentToolRegistry, 
  getMultiAgentToolRegistry, 
  resetMultiAgentToolRegistry 
} from './tools/MultiAgentToolRegistry';
export type { AvailableToolName } from './tools/MultiAgentToolRegistry';

// ==================== Agents ====================

export { 
  BaseAgent,
  ManagerAgent, getManagerAgent,
  AnalyseAgent, getAnalyseAgent,
  EditAgent, getEditAgent,
  PaperSearchAgent, getPaperSearchAgent,
  getAgentByName,
  getAllAgents,
  getAllAgentNames,
  getCallableAgentNames
} from './agents';
export type { AgentConfig } from './agents';

// ==================== 类型定义 ====================

export type {
  // Agent 类型
  AgentName,
  AgentStatus,
  AgentMessageRole,
  // 消息类型
  AgentMessage,
  AgentToolCall,
  // 上下文
  AgentContext,
  // 工具
  MultiAgentTool,
  MultiAgentToolResult,
  // 配置
  AgentLoopOptions,
  AgentLoopResult,
  // 全局对话
  UserMessageEntry,
  AgentExecutionEntry,
  GlobalConversationEntry,
  GlobalConversation
} from './types';

// ==================== 辅助函数 ====================

export {
  agentMessageToLLMMessage,
  llmFinalMessageToAgentMessage,
  generateMessageId,
  generateToolCallId
} from './types';

