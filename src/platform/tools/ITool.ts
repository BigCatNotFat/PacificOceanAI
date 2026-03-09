/**
 * ITool - Platform 层工具契约
 * 
 * 定义"一个工具究竟是什么"。这里不实现任何逻辑，只说明工具的"名片"和"能力"。
 * 
 * 职责：
 * - 定义工具元信息（名称、描述、参数 Schema）
 * - 定义工具执行接口
 * - 定义工具能力标记（只读/写入、是否需要审批）
 */

// ==================== 工具上下文 ====================

/**
 * 工具执行上下文
 * 提供工具执行所需的所有服务依赖
 */
export interface IToolContext {
  /** 编辑器服务 - 用于读写文件、操作光标等 */
  editorService: any; // 这里使用 any，实际应该是 IEditorService
  /** 日志服务（可选） */
  logService?: any;
  /** 配置服务（可选） */
  configService?: any;
}

// ==================== 工具结果 ====================

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean;
  
  /** 返回的数据 */
  data?: any;
  
  /** 错误消息（失败时） */
  errorMessage?: string;
  
  /** 用户友好的展示消息 */
  displayMessage?: string;
}

// ==================== 参数 Schema ====================

/**
 * 工具参数 Schema（遵循 JSON Schema 规范）
 */
export interface ToolParametersSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
  description?: string;
}

// ==================== 工具接口 ====================

/**
 * ITool - 工具接口
 * 
 * 每个工具都必须实现此接口
 */
export interface ITool {
  // ========== 元信息 ==========
  
  /** 工具名称 - 供 LLM 调用时使用（如 "read_file", "edit_code"） */
  readonly name: string;
  
  /** 工具描述 - 给 LLM 的自然语言说明 */
  readonly description: string;
  
  /** 参数 Schema - 定义工具接受的参数结构 */
  readonly parametersSchema: ToolParametersSchema;
  
  // ========== 能力标记 ==========
  
  /** 是否需要用户审批（如修改代码） */
  readonly needApproval: boolean;
  
  /** 是否只读（读文件/搜索为 true，修改文件为 false） */
  readonly isReadOnly: boolean;
  
  /** 工具类型分类 */
  readonly category: 'editor' | 'project' | 'external' | 'system';
  
  // ========== 执行接口 ==========
  
  /**
   * 执行工具
   * 
   * @param args - LLM 给出的参数对象（已从 JSON 反序列化）
   * @param context - 执行上下文（提供 IEditorService 等服务）
   * @returns 工具执行结果
   */
  execute(args: any, context: IToolContext): Promise<ToolResult>;
}

// ==================== 工具注册信息 ====================

/**
 * 工具注册信息（用于向 LLM 描述工具）
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
}

/**
 * 从 ITool 提取工具定义（供 Prompt 构建使用）
 */
export function extractToolDefinition(tool: ITool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parametersSchema
  };
}
