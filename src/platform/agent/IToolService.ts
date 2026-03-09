/**
 * IToolService - Platform 层接口定义
 * 
 * 工具注册表与执行器，统一管理所有 Agent 工具。
 */

// ==================== 类型定义 ====================

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 结果数据 */
  data?: any;
  /** 错误消息 */
  error?: string;
  /** 执行耗时（毫秒） */
  duration?: number;
}

/**
 * 工具元信息
 */
export interface ITool {
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
  /** 是否需要用户审批 */
  needApproval: boolean;
  /** 工具可用模式列表 */
  modes: ('agent' | 'chat' | 'normal')[];
  /** 执行函数 */
  execute: (args: any) => Promise<ToolExecutionResult>;
}

// ==================== Service 接口 ====================

/**
 * IToolService - 工具服务接口
 */
export interface IToolService {
  /**
   * 注册工具
   * @param tool - 工具实例
   */
  registerTool(tool: ITool): void;

  /**
   * 获取工具
   * @param name - 工具名称
   * @returns 工具实例，如果不存在则返回 undefined
   */
  getTool(name: string): ITool | undefined;

  /**
   * 执行工具
   * @param name - 工具名称
   * @param args - 工具参数
   * @returns 执行结果
   */
  executeTool(name: string, args: any): Promise<ToolExecutionResult>;

  /**
   * 列出所有工具
   * @returns 工具名称列表
   */
  listTools(): string[];

  /**
   * 列出所有工具的元信息
   * @returns 工具元信息列表
   */
  listToolInfos(): ITool[];

  /**
   * 获取 Agent 模式可用工具
   * @returns Agent 模式工具列表
   */
  getAgentTools(): ITool[];

  /**
   * 获取 Chat 模式可用工具
   * @returns Chat 模式工具列表
   */
  getChatTools(): ITool[];

  /**
   * 获取 Normal 模式可用工具
   * @returns Normal 模式工具列表
   */
  getNormalTools(): ITool[];

  /**
   * 获取所有工具（包括需要审批的）
   * @returns 所有工具列表
   */
  getAllTools(): ITool[];
}

/**
 * IToolService 的服务标识符
 */
export const IToolServiceId: symbol = Symbol('IToolService');
