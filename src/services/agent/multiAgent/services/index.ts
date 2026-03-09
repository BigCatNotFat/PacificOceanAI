/**
 * MultiAgent Services 导出
 */

export { AgentLoopService } from './AgentLoopService';
export type { AgentLoopUpdateEvent } from './AgentLoopService';

export { ManagerAgentLoopService } from './ManagerAgentLoopService';
export type { 
  ManagerAgentLoopOptions, 
  ManagerAgentLoopResult, 
  ManagerAgentLoopUpdateEvent 
} from './ManagerAgentLoopService';

export { VariablePoolService } from './VariablePoolService';
export type {
  VariableEntry,
  VariablePoolConfig,
  VariableInjectionOptions,
  VariableInjectionResult
} from './VariablePoolService';

// 重新导出工具注册表（方便使用）
export { MultiAgentToolRegistry, getMultiAgentToolRegistry } from '../tools/MultiAgentToolRegistry';
export type { AvailableToolName } from '../tools/MultiAgentToolRegistry';

