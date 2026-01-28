/**
 * MultiAgentToolRegistry - MultiAgent 模式专用工具注册中心
 * 
 * 核心职责：
 * - 维护 MultiAgent 模式独立的工具列表
 * - 与 Agent 模式的 ToolRegistry 完全独立
 * - 根据工具名称列表获取工具实例
 * 
 * 使用方式：
 * - 传入工具名称列表，自动获取对应的工具
 * - 新增工具步骤：
 *   1. 在 implementations/ 文件夹创建新工具类
 *   2. 在下面的 MULTIAGENT_BUILTIN_TOOLS 数组中添加 new YourNewTool()
 *   3. 完成！
 * 
 * 注意：此注册表与 Agent 模式的 ToolRegistry 是独立的
 * 有些工具可能只在 MultiAgent 模式可用，有些只在 Agent 模式可用
 */

import type { ITool, ToolMetadata } from '../../tools/base/ITool';
import type { MultiAgentTool, MultiAgentToolResult, AgentContext } from '../types';
import { logger } from '../../../../utils/logger';

// ==================== 导入工具实现 ====================
// 从现有的 implementations 文件夹导入工具
// 这些工具可以同时用于 Agent 模式和 MultiAgent 模式

import { ReadFileTool } from '../../tools/implementations/ReadFileTool';
import { ListDirTool } from '../../tools/implementations/ListDirTool';
import { GrepSearchTool } from '../../tools/implementations/GrepSearchTool';
import { ReplaceLinesTool } from '../../tools/implementations/ReplaceLinesTool';
import { SearchReplaceTool } from '../../tools/implementations/SearchReplaceTool';
import { DeleteFileTool } from '../../tools/implementations/DeleteFileTool';
import { PaperSemanticSearchTool } from '../../tools/implementations/PaperSemanticSearchTool';
import { PaperBooleanSearchTool } from '../../tools/implementations/PaperBooleanSearchTool';
import { callAgentTool } from '../../tools/implementations/CallAgentTool';
// 以下工具在 Agent 模式被注释掉了，但在 MultiAgent 模式可以启用
// import { LatexCodebaseSearchTool } from '../../tools/implementations/LatexCodeBaseSearch';
// import { WebSearchTool } from '../../tools/implementations/WebSearchTool';
// import { DiffHistoryTool } from '../../tools/implementations/DiffHistoryTool';
// import { ReapplyTool } from '../../tools/implementations/ReapplyTool';

/**
 * 可用的工具名称类型
 */
export type AvailableToolName =
  // 读取类工具
  | 'read_file'
  | 'list_dir'
  | 'grep_search'
  // 论文搜索工具
  | 'paper_semantic_search'
  | 'paper_boolean_search'
  // 写入类工具
  | 'replace_lines'
  | 'search_replace'
  | 'delete_file'
  // MultiAgent 专用工具
  | 'call_agent'
  // 允许任意字符串以支持动态注册的工具
  | (string & {});

/**
 * MultiAgent 工具注册中心
 */
export class MultiAgentToolRegistry {
  /** 工具存储容器 */
  private tools: Map<string, MultiAgentTool> = new Map();

  /**
   * MultiAgent 模式内置工具列表
   * 
   * ⚠️ 这里的工具是 MultiAgent 模式专用的
   * 与 Agent 模式的 ToolRegistry.BUILTIN_TOOLS 是独立的
   * 
   * 新增工具步骤：
   * 1. 在 implementations/ 文件夹创建新工具类
   * 2. 在这里添加 new YourNewTool()
   * 3. 完成！
   */
  private static readonly MULTIAGENT_BUILTIN_TOOLS: ITool[] = [
    // ==================== 读取类工具 ====================
    new ReadFileTool(),
    new ListDirTool(),
    new GrepSearchTool(),
    
    // ==================== 论文搜索工具 ====================
    new PaperSemanticSearchTool(),
    new PaperBooleanSearchTool(),
    
    // ==================== 写入类工具 ====================
    new ReplaceLinesTool(),
    new SearchReplaceTool(),
    new DeleteFileTool(),
    
    // ==================== 以下工具只在 MultiAgent 模式启用 ====================
    // 如果需要启用，取消注释并导入对应的类
    // new LatexCodebaseSearchTool(),
    // new WebSearchTool(),
    // new DiffHistoryTool(),
    // new ReapplyTool(),
    
    // 👇 新增 MultiAgent 专用工具在这里添加
    // new YourNewTool(),
  ];

  constructor() {
    this.initializeBuiltInTools();
  }

  // ==================== 初始化 ====================

  /**
   * 初始化内置工具
   */
  private initializeBuiltInTools(): void {
    // 注册 ITool 类型的工具
    for (const tool of MultiAgentToolRegistry.MULTIAGENT_BUILTIN_TOOLS) {
      this.registerITool(tool);
    }
    
    // 注册 MultiAgent 专用工具（MultiAgentTool 类型）
    this.registerTool(callAgentTool);
    
    logger.debug(`[MultiAgentToolRegistry] 已注册 ${this.tools.size} 个 MultiAgent 工具`);
  }

  /**
   * 注册 ITool 类型的工具（自动适配为 MultiAgentTool）
   */
  private registerITool(tool: ITool): void {
    const adapted = this.adaptTool(tool);
    this.tools.set(adapted.name, adapted);
  }

  /**
   * 将 ITool 适配为 MultiAgentTool
   */
  private adaptTool(baseTool: ITool): MultiAgentTool {
    const metadata = baseTool.getMetadata();

    return {
      name: metadata.name,
      description: metadata.description,
      parameters: metadata.parameters,
      execute: async (args: any, context?: AgentContext): Promise<MultiAgentToolResult> => {
        try {
          const result = await baseTool.execute(args);
          return {
            success: result.success,
            data: result.data,
            error: result.error,
            duration: result.duration
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    };
  }

  // ==================== 核心方法 ====================

  /**
   * 根据工具名称列表获取工具
   * 
   * @param names - 工具名称列表
   * @returns MultiAgentTool 数组
   * 
   * @example
   * const tools = registry.getToolsByNames(['read_file', 'grep_search']);
   */
  getToolsByNames(names: AvailableToolName[]): MultiAgentTool[] {
    const tools: MultiAgentTool[] = [];

    for (const name of names) {
      const tool = this.getTool(name);
      if (tool) {
        tools.push(tool);
      } else {
        console.warn(`[MultiAgentToolRegistry] 未找到工具: ${name}`);
      }
    }

    return tools;
  }

  /**
   * 获取单个工具
   * 
   * @param name - 工具名称
   * @returns MultiAgentTool 或 undefined
   */
  getTool(name: string): MultiAgentTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有已注册的工具名称
   * 
   * @returns 工具名称列表
   */
  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 获取所有已注册的工具
   * 
   * @returns 工具实例数组
   */
  getAllTools(): MultiAgentTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 检查工具是否存在
   * 
   * @param name - 工具名称
   * @returns 是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  // ==================== 自定义工具注册 ====================

  /**
   * 注册自定义 MultiAgentTool
   * 
   * 用于注册 MultiAgent 专用的工具（如 call_agent）
   * 
   * @param tool - 工具实例
   */
  registerTool(tool: MultiAgentTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[MultiAgentToolRegistry] 工具 "${tool.name}" 已存在，将被覆盖`);
    }
    this.tools.set(tool.name, tool);
    logger.debug(`[MultiAgentToolRegistry] 已注册工具: ${tool.name}`);
  }

  /**
   * 批量注册工具
   * 
   * @param tools - 工具实例数组
   */
  registerTools(tools: MultiAgentTool[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * 取消注册工具
   * 
   * @param name - 工具名称
   * @returns 是否成功删除
   */
  unregisterTool(name: string): boolean {
    const deleted = this.tools.delete(name);
    if (deleted) {
      logger.debug(`[MultiAgentToolRegistry] 已取消注册工具: ${name}`);
    }
    return deleted;
  }

  // ==================== 预定义工具组合 ====================

  /**
   * 获取分析师 Agent 的工具
   * 
   * analyse_agent 使用的工具：read_file, grep_search
   */
  getAnalyseAgentTools(): MultiAgentTool[] {
    return this.getToolsByNames([
      'read_file',
      'grep_search'
    ]);
  }

  /**
   * 获取编辑 Agent 的工具
   * 
   * edit_agent 使用的工具：read_file, replace_lines, search_replace
   */
  getEditAgentTools(): MultiAgentTool[] {
    return this.getToolsByNames([
      'read_file',
      'replace_lines',
      'search_replace'
    ]);
  }

  /**
   * 获取文献搜索 Agent 的工具
   * 
   * paper_search_agent 使用的工具：paper_boolean_search, paper_semantic_search
   */
  getPaperSearchAgentTools(): MultiAgentTool[] {
    return this.getToolsByNames([
      'paper_boolean_search',
      'paper_semantic_search'
    ]);
  }

  /**
   * 获取管理者 Agent 的工具
   * 
   * manager_agent 使用的工具：call_agent
   * 注意：call_agent 需要单独注册，因为它需要依赖 AgentLoopService
   */
  getManagerAgentTools(): MultiAgentTool[] {
    return this.getToolsByNames(['call_agent']);
  }

  // ==================== 统计信息 ====================

  /**
   * 获取统计信息
   */
  getStatistics(): {
    totalTools: number;
    toolNames: string[];
  } {
    return {
      totalTools: this.tools.size,
      toolNames: this.getAllToolNames()
    };
  }

  // ==================== 导出功能 ====================

  /**
   * 导出为 OpenAI Function Calling 格式
   */
  exportToOpenAIFormat(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }> {
    return this.getAllTools().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }
}

// ==================== 全局单例 ====================

let globalInstance: MultiAgentToolRegistry | null = null;

/**
 * 获取全局 MultiAgentToolRegistry 实例
 */
export function getMultiAgentToolRegistry(): MultiAgentToolRegistry {
  if (!globalInstance) {
    globalInstance = new MultiAgentToolRegistry();
  }
  return globalInstance;
}

/**
 * 重置全局实例（主要用于测试）
 */
export function resetMultiAgentToolRegistry(): void {
  globalInstance = null;
}
