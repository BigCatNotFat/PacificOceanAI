/**
 * delete_file - 删除文件工具
 * 
 * 功能：删除指定路径的文件或文件夹
 * 类型：write（写操作）
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';
import { findEntityByPath } from '../utils/FileEntityResolver';

export class DeleteFileTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'delete_file',
    description: `Delete a file or folder in the Overleaf project. The operation will fail gracefully if the file doesn't exist or cannot be deleted.

**Warning:** This action is irreversible. The file and its contents will be permanently removed.`,
    parameters: {
      type: 'object',
      properties: {
        target_file: {
          type: 'string',
          description: 'The path of the file or folder to delete, relative to the project root.'
        },
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why this tool is being used, and how it contributes to the goal.'
        }
      },
      required: ['target_file']
    },
    needApproval: false,
    modes: ['agent']
  };

  async execute(args: {
    target_file: string;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameter: target_file',
          duration: Date.now() - startTime
        };
      }

      const entity = await findEntityByPath(args.target_file);
      if (!entity) {
        return {
          success: false,
          error: `File or folder not found: "${args.target_file}"`,
          duration: Date.now() - startTime
        };
      }

      await overleafEditor.fileOps.deleteEntity(entity.type, entity.id);

      return {
        success: true,
        data: {
          file: args.target_file,
          type: entity.type,
          deleted: true,
          message: `Successfully deleted ${entity.type} "${args.target_file}"`
        },
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        ...this.handleError(error),
        duration: Date.now() - startTime
      };
    }
  }

  getSummary(args: { target_file: string }): string {
    return `删除文件: ${args.target_file}`;
  }
}
