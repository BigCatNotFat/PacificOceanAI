/**
 * Agents 导出
 * 
 * 导出所有 MultiAgent 模式的 Agent
 */

// ==================== 基类 ====================
export { BaseAgent } from './BaseAgent';
export type { AgentConfig } from './BaseAgent';

// ==================== 具体 Agent ====================

// 管理者 Agent
export { ManagerAgent, getManagerAgent } from './ManagerAgent';

// 分析师 Agent
export { AnalyseAgent, getAnalyseAgent } from './AnalyseAgent';

// 编辑师 Agent
export { EditAgent, getEditAgent } from './EditAgent';

// 文献搜索 Agent
export { PaperSearchAgent, getPaperSearchAgent } from './PaperSearchAgent';

// ==================== Agent 注册表 ====================

import { ManagerAgent } from './ManagerAgent';
import { AnalyseAgent } from './AnalyseAgent';
import { EditAgent } from './EditAgent';
import { PaperSearchAgent } from './PaperSearchAgent';
import type { AgentName } from '../types';
import type { BaseAgent } from './BaseAgent';

/**
 * Agent 注册表
 * 
 * 根据 Agent 名称获取对应的 Agent 实例
 */
const agentRegistry: Map<AgentName, BaseAgent> = new Map();

/**
 * 初始化 Agent 注册表
 */
function initializeAgentRegistry(): void {
  if (agentRegistry.size > 0) return;
  
  agentRegistry.set('manager_agent', new ManagerAgent());
  agentRegistry.set('analyse_agent', new AnalyseAgent());
  agentRegistry.set('edit_agent', new EditAgent());
  agentRegistry.set('paper_search_agent', new PaperSearchAgent());
}

/**
 * 根据名称获取 Agent
 * 
 * @param name - Agent 名称
 * @returns Agent 实例
 */
export function getAgentByName(name: AgentName): BaseAgent | undefined {
  initializeAgentRegistry();
  return agentRegistry.get(name);
}

/**
 * 获取所有 Agent
 * 
 * @returns 所有 Agent 实例数组
 */
export function getAllAgents(): BaseAgent[] {
  initializeAgentRegistry();
  return Array.from(agentRegistry.values());
}

/**
 * 获取所有 Agent 名称
 * 
 * @returns Agent 名称数组
 */
export function getAllAgentNames(): AgentName[] {
  initializeAgentRegistry();
  return Array.from(agentRegistry.keys());
}

/**
 * 获取可被 ManagerAgent 调用的 Agent 列表
 * 
 * @returns 可调用的 Agent 名称数组（不包括 manager_agent 自己）
 */
export function getCallableAgentNames(): AgentName[] {
  return ['analyse_agent', 'edit_agent', 'paper_search_agent'];
}

