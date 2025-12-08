/**
 * Tools 统一导出
 * 
 * 提供统一的导入路径，简化外部使用
 * 
 * @example
 * // 导入工具注册中心
 * import { ToolRegistry } from '@/services/agent/tools';
 * 
 * // 导入接口和类型
 * import type { ITool, ToolMetadata } from '@/services/agent/tools';
 * 
 * // 导入基类（用于创建新工具）
 * import { BaseTool } from '@/services/agent/tools';
 */

// ==================== 核心导出 ====================

/** 工具注册中心（最常用） */
export { ToolRegistry } from './ToolRegistry';

// ==================== 接口和类型 ====================

/** 工具接口 */
export type { ITool, ToolMetadata, ToolExecutionResult } from './base/ITool';

/** 工具基类 */
export { BaseTool } from './base/BaseTool';

// ==================== 具体工具实现（可选导出） ====================

/** 读取文件工具 */
export { ReadFileTool } from './implementations/ReadFileTool';

/** 编辑代码工具 */
export { EditCodeTool } from './implementations/EditCodeTool';

/** 搜索内容工具 */
export { SearchContentTool } from './implementations/SearchContentTool';

/** 列出文件工具 */
export { ListFilesTool } from './implementations/ListFilesTool';
