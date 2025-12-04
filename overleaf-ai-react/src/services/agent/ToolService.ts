/**
 * ToolService - Services 层实现
 * 
 * 工具注册表与执行器，负责：
 * - 管理工具生命周期（注册、查询）
 * - 执行具体工具逻辑
 * - 统一错误处理和日志记录
 */

import { injectable } from '../../platform/instantiation/descriptors';
import type {
  IToolService,
  ITool,
  ToolExecutionResult
} from '../../platform/agent/IToolService';
import { IToolServiceId } from '../../platform/agent/IToolService';

/**
 * ToolService 实现
 */
@injectable()
export class ToolService implements IToolService {
  /** 工具注册表 */
  private readonly _tools: Map<string, ITool> = new Map();

  constructor() {
    console.log('[ToolService] 依赖注入成功');
    // 初始化内置工具
    this.initializeBuiltInTools();
  }

  // ==================== 公共方法 ====================

  registerTool(tool: ITool): void {
    if (this._tools.has(tool.name)) {
      console.warn(`[ToolService] 工具 "${tool.name}" 已存在，将被覆盖`);
    }
    this._tools.set(tool.name, tool);
    console.log(`[ToolService] 已注册工具: ${tool.name} (${tool.type}, 需要审批: ${tool.needApproval})`);
  }

  getTool(name: string): ITool | undefined {
    return this._tools.get(name);
  }

  async executeTool(name: string, args: any): Promise<ToolExecutionResult> {
    const tool = this._tools.get(name);
    
    if (!tool) {
      return {
        success: false,
        error: `工具 "${name}" 不存在`
      };
    }

    console.log(`[ToolService] 执行工具: ${name}`, args);
    const startTime = Date.now();

    try {
      const result = await tool.execute(args);
      const duration = Date.now() - startTime;
      
      console.log(`[ToolService] 工具执行成功: ${name} (耗时 ${duration}ms)`);
      
      return {
        ...result,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`[ToolService] 工具执行失败: ${name}`, error);
      
      return {
        success: false,
        error: errorMessage,
        duration
      };
    }
  }

  listTools(): string[] {
    return Array.from(this._tools.keys());
  }

  listToolInfos(): ITool[] {
    return Array.from(this._tools.values());
  }

  getToolsByType(type: 'read' | 'write' | 'search'): ITool[] {
    return Array.from(this._tools.values()).filter(tool => tool.type === type);
  }

  getReadOnlyTools(): ITool[] {
    return Array.from(this._tools.values()).filter(tool => !tool.needApproval);
  }

  getAllTools(): ITool[] {
    return Array.from(this._tools.values());
  }

  // ==================== 私有方法 ====================

  /**
   * 初始化内置工具
   */
  private initializeBuiltInTools(): void {
    // 1. read_file - 读取文件
    this.registerTool({
      name: 'read_file',
      description: 'Read the content of a file from the Overleaf project',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The path to the file to read'
          }
        },
        required: ['file_path']
      },
      needApproval: false,
      type: 'read',
      execute: async (args) => {
        // TODO: 通过 IEditorService 读取文件
        // const content = await this.editorService.readFile(args.file_path);
        
        // 临时模拟
        return {
          success: true,
          data: {
            file_path: args.file_path,
            content: `% 这是 ${args.file_path} 的内容（模拟）\n\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}`
          }
        };
      }
    });

    // 2. edit_code - 编辑代码（需要审批）
    this.registerTool({
      name: 'edit_code',
      description: 'Edit LaTeX code in a file. This requires user approval.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The path to the file to edit'
          },
          operation: {
            type: 'string',
            enum: ['replace', 'insert', 'delete'],
            description: 'The type of edit operation'
          },
          target: {
            type: 'string',
            description: 'The text or pattern to target'
          },
          new_value: {
            type: 'string',
            description: 'The new value (for replace/insert operations)'
          }
        },
        required: ['file_path', 'operation']
      },
      needApproval: true,
      type: 'write',
      execute: async (args) => {
        // TODO: 通过 IEditorService 应用编辑
        // await this.editorService.applyEdit({
        //   file: args.file_path,
        //   operation: args.operation,
        //   target: args.target,
        //   newValue: args.new_value
        // });
        
        // 临时模拟
        return {
          success: true,
          data: {
            file_path: args.file_path,
            operation: args.operation,
            message: `已成功执行 ${args.operation} 操作`
          }
        };
      }
    });

    // 3. search_content - 搜索内容
    this.registerTool({
      name: 'search_content',
      description: 'Search for text within files in the project',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query'
          },
          file_pattern: {
            type: 'string',
            description: 'Optional file pattern to limit search (e.g., "*.tex")'
          }
        },
        required: ['query']
      },
      needApproval: false,
      type: 'search',
      execute: async (args) => {
        // TODO: 实现真实搜索逻辑
        
        // 临时模拟
        return {
          success: true,
          data: {
            query: args.query,
            results: [
              { file: 'main.tex', line: 10, match: `找到匹配: ${args.query}` },
              { file: 'introduction.tex', line: 5, match: `另一个匹配: ${args.query}` }
            ],
            total: 2
          }
        };
      }
    });

    // 4. list_files - 列出文件
    this.registerTool({
      name: 'list_files',
      description: 'List all files in the Overleaf project',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Optional pattern to filter files (e.g., "*.tex")'
          }
        }
      },
      needApproval: false,
      type: 'read',
      execute: async (args) => {
        // TODO: 通过 IEditorService 获取文件列表
        
        // 临时模拟
        return {
          success: true,
          data: {
            files: [
              'main.tex',
              'introduction.tex',
              'conclusion.tex',
              'references.bib'
            ].filter(f => !args.pattern || f.includes(args.pattern))
          }
        };
      }
    });

    console.log(`[ToolService] 已初始化 ${this._tools.size} 个内置工具`);
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this._tools.clear();
  }
}

// 导出服务标识符
export { IToolServiceId };
