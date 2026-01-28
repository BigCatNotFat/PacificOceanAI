/**
 * call_agent - 调用其他 Agent 工具
 * 
 * 功能：在 MultiAgent 模式下调用其他 Agent 来完成特定任务
 * 类型：MultiAgent 专用工具
 * 
 * 新增功能：
 * - inject_variables: 将之前 Agent 的输出变量注入到新 Agent 的提示词中
 * - output_variable_name: 自定义输出变量名
 * 
 * 注意：此工具的实际执行逻辑由 ManagerAgentLoopService 处理
 */

import type { MultiAgentTool, MultiAgentToolResult, AgentContext, CallAgentArgs } from '../../multiAgent/types';
import { getCallableAgentNames } from '../../multiAgent/agents';

/**
 * CallAgentTool - 调用其他 Agent 的工具
 * 
 * 这是 MultiAgent 模式中 ManagerAgent 专用的工具
 * 用于调用 analyse_agent、edit_agent、paper_search_agent 等子 Agent
 * 
 * 变量池功能：
 * - 每个 Agent 执行完成后，结果会自动保存到变量池
 * - 可以通过 inject_variables 参数将之前的结果注入到新 Agent
 * - 支持自定义输出变量名，便于后续引用
 */
export function createCallAgentTool(): MultiAgentTool {
  return {
    name: 'call_agent',
    description: `Call other Agents to complete specific tasks. Supports variable injection for cross-agent data sharing.

Available Agents:
- analyse_agent: Analyst, specializes in reading and analyzing files, locating issues and formulating solutions
- edit_agent: Editor, specializes in precisely modifying file content according to instructions
- paper_search_agent: Literature Researcher, specializes in searching academic papers

Parameters:
1. agent_name (required): Name of the Agent to call
2. instruction (required): Specific instructions for the Agent
3. explanation (required): Reason for calling this Agent
4. inject_variables (optional): Array of variable names to inject into the Agent's prompt. These variables contain results from previous Agent executions.
5. output_variable_name (optional): Custom name for the output variable. If not specified, a name will be auto-generated.

Variable Pool Feature:
- Each Agent's result is automatically saved to a variable (e.g., "$result_analyse_1")
- Use inject_variables to pass previous results to the next Agent
- Example: inject_variables: ["$result_analyse_1"] will include that variable's content in the new Agent's prompt`,
    parameters: {
      type: 'object',
      properties: {
        agent_name: {
          type: 'string',
          enum: getCallableAgentNames(),
          description: 'Name of the Agent to call'
        },
        instruction: {
          type: 'string',
          description: 'Specific instructions for the Agent'
        },
        explanation: {
          type: 'string',
          description: 'Explanation of why this Agent is being called'
        },
        inject_variables: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Array of variable names to inject into the Agent prompt (e.g., ["$result_analyse_1"]). The content of these variables will be automatically included in the Agent\'s user prompt.'
        },
        output_variable_name: {
          type: 'string',
          description: 'Custom name for the output variable (e.g., "$paper_analysis"). If not specified, a name will be auto-generated based on the agent name.'
        }
      },
      required: ['agent_name']
    },
    execute: async (args: CallAgentArgs, context?: AgentContext): Promise<MultiAgentToolResult> => {
      // 实际执行在 ManagerAgentLoopService 的 run 方法中处理
      // 这里只返回占位符结果
      return {
        success: true,
        data: {
          message: 'Agent 调用由 ManagerAgentLoopService 处理',
          inject_variables: args.inject_variables,
          output_variable_name: args.output_variable_name
        }
      };
    }
  };
}

/**
 * 获取 CallAgentTool 实例
 */
export const callAgentTool = createCallAgentTool();

