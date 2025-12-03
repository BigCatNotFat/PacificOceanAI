import type { Event } from '../../base/common/event';
import type { ToolResult } from '../tools/tool';

export type AgentRole = 'user' | 'assistant' | 'system';

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
}

export interface ToolCall {
  toolId: string;
  input: unknown;
}

export interface IAgentService {
  readonly onDidChangeMessages: Event<AgentMessage[]>;

  getMessages(): AgentMessage[];

  sendUserMessage(content: string): Promise<void>;

  runTool(toolCall: ToolCall): Promise<ToolResult>;
}

export const IAgentServiceId: symbol = Symbol('IAgentService');

