/**
 * list_dir - 列出目录内容工具
 * 
 * 功能：列出目录中的文件和子目录
 * 类型：read（只读操作，不需要用户审批）
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';

/**
 * 列出目录工具
 */
export class ListDirTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'list_dir',
    description: `List the contents of a directory. The quick tool to use for discovery, before using more targeted tools like semantic search or file reading. Useful to try to understand the file structure before diving deeper into specific files. Can be used to explore the paperbase.`,
    parameters: {
      type: 'object',
      properties: {
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why this tool is being used, and how it contributes to the goal.'
        },
        relative_workspace_path: {
          type: 'string',
          description: 'Path to list contents of, relative to the workspace root.'
        }
      },
      required: ['relative_workspace_path']
    },
    needApproval: false,
    modes: ['agent', 'chat']
  };

  /**
   * 执行列出目录
   */
  async execute(args: {
    relative_workspace_path: string;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate(args)) {
        console.error('[ListDirTool] 参数验证失败:', {
          receivedArgs: args,
          expectedParams: this.metadata.parameters
        });
        return {
          success: false,
          error: `Missing required parameter: relative_workspace_path. Received args: ${JSON.stringify(args)}`,
          duration: Date.now() - startTime
        };
      }

      this.log(`列出目录: ${args.relative_workspace_path}`);

      // TODO: 实际实现 - 通过文件服务列出目录内容
      const result = this.getMockResult(args);

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        ...this.handleError(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 生成摘要
   */
  getSummary(args: {
    relative_workspace_path: string;
  }): string {
    return `列出目录: ${args.relative_workspace_path}`;
  }

  /**
   * 模拟结果（临时实现）
   */
  private getMockResult(args: any): any {
    return {
      path: args.relative_workspace_path,
      items: [
        { name: 'main.tex', type: 'file', size: 1024 },
        { name: 'chapters', type: 'directory', items_count: 5 },
        { name: 'figures', type: 'directory', items_count: 10 }
      ],
      total_items: 3,
      message: `成功列出目录 ${args.relative_workspace_path}`
    };
  }
}
