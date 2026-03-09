/**
 * ITool - 工具接口定义
 * 
 * 所有工具必须实现此接口，定义统一的工具规范
 */

/**
 * 工具元数据定义
 */
export interface ToolMetadata {
  /** 工具名称（唯一标识） */
  name: string;
  
  /** 工具描述（用于 LLM 提示词） */
  description: string;
  
  /** 参数定义（JSON Schema 格式） */
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  
  /** 是否需要用户审批 */
  needApproval: boolean;
  
  /** 
   * 工具可用模式列表
   * - 'agent': Agent 模式可用（完全自动化）
   * - 'chat': Chat 模式可用（只读/安全操作）
   * - 'normal': Normal 模式可用（基本对话）
   * 
   * 一个工具可以在多个模式下使用
   */
  modes: ('agent' | 'chat' | 'normal')[];
  
}

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
 * 工具接口
 * 
 * 所有工具必须实现此接口
 */
export interface ITool {
  /**
   * 获取工具元数据
   */
  getMetadata(): ToolMetadata;
  
  /**
   * 执行工具
   * @param args - 工具参数
   * @returns 执行结果
   */
  execute(args: any): Promise<ToolExecutionResult>;
  
  /**
   * 验证参数（可选）
   * @param args - 工具参数
   * @returns 是否有效
   */
  validate?(args: any): boolean;
  
  /**
   * 生成执行摘要（可选，用于审批界面展示）
   * @param args - 工具参数
   * @returns 摘要文本
   */
  getSummary?(args: any): string;
}
