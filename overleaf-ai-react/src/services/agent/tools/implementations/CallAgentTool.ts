/**
 * call_agent - 调用其他 Agent 工具
 * 
 * 功能：在 MultiAgent 模式下调用其他 Agent 来完成特定任务
 * 类型：MultiAgent 专用工具
 * 
 * 注意：此工具的实际执行逻辑由 ManagerAgentLoopService 处理
 */

import type { MultiAgentTool, MultiAgentToolResult, AgentContext } from '../../multiAgent/types';
import { getCallableAgentNames } from '../../multiAgent/agents';

/**
 * CallAgentTool - 调用其他 Agent 的工具
 * 
 * 这是 MultiAgent 模式中 ManagerAgent 专用的工具
 * 用于调用 analyse_agent、edit_agent、paper_search_agent 等子 Agent
 */
export function createCallAgentTool(): MultiAgentTool {
  return {
    name: 'call_agent',
    description: `Call other Agents to complete specific tasks.

Available Agents:
- analyse_agent: Analyst, specializes in reading and analyzing files, locating issues and formulating solutions
- edit_agent: Editor, specializes in precisely modifying file content according to instructions
- paper_search_agent: Literature Researcher, specializes in searching academic papers

Required parameters:
1. agent_name: Name of the Agent to call
2. instruction: Specific instructions for the Agent
3. explanation: Reason for calling this Agent`,
    parameters: {
      type: 'object',
      properties: {
        agent_name: {
          type: 'string',
          enum: getCallableAgentNames(),
          description: '要调用的 Agent 名称'
        },
        instruction: {
          type: 'string',
          description: '给 Agent 的具体指令，说明要做什么'
        },
        explanation: {
          type: 'string',
          description: '解释为什么要调用这个 Agent'
        }
      },
      required: ['agent_name', 'instruction', 'explanation']
    },
    execute: async (args: {
      agent_name: string;
      instruction: string;
      explanation: string;
    }, context?: AgentContext): Promise<MultiAgentToolResult> => {
      // 实际执行在 ManagerAgentLoopService 的 run 方法中处理
      // 这里只返回占位符结果
      return {
        success: true,
        data: {
          message: 'Agent 调用由 ManagerAgentLoopService 处理'
        }
      };
    }
  };
}

/**
 * 获取 CallAgentTool 实例
 */
export const callAgentTool = createCallAgentTool();

