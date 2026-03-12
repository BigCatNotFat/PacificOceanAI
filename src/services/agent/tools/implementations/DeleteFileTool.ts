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
    description: `Delete one or more files or folders in the Overleaf project. Supports batch deletion in a single call.

**Batch mode (recommended):** Provide a \`files\` array to delete multiple files/folders at once.
**Single mode (backward compatible):** Provide target_file directly.

**Warning:** This action is irreversible. The files and their contents will be permanently removed.

Examples:
- Single: target_file="old_chapter.tex"
- Batch: files=[{target_file:"old_chapter.tex"}, {target_file:"deprecated/notes.tex"}]`,
    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'Array of files/folders to delete. Use this for batch deletion.',
          items: {
            type: 'object',
            properties: {
              target_file: {
                type: 'string',
                description: 'The path of the file or folder to delete, relative to the project root.'
              }
            },
            required: ['target_file']
          }
        },
        target_file: {
          type: 'string',
          description: '(Single mode) The path of the file or folder to delete.'
        },
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why these files are being deleted.'
        }
      },
      required: ['explanation']
    },
    needApproval: false,
    modes: ['agent']
  };

  private normalizeToFiles(args: any): Array<{ target_file: string }> {
    if (Array.isArray(args.files) && args.files.length > 0) {
      return args.files;
    }
    if (args.target_file) {
      return [{ target_file: args.target_file }];
    }
    return [];
  }

  private async deleteSingleFile(
    targetFile: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const entity = await findEntityByPath(targetFile);
    if (!entity) {
      return { success: false, error: `[${targetFile}] File or folder not found` };
    }

    await overleafEditor.fileOps.deleteEntity(entity.type, entity.id);

    return {
      success: true,
      data: {
        file: targetFile,
        type: entity.type,
        deleted: true,
        message: `Deleted ${entity.type} "${targetFile}"`
      }
    };
  }

  async execute(args: {
    files?: Array<{ target_file: string }>;
    target_file?: string;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const files = this.normalizeToFiles(args);

      if (files.length === 0) {
        return {
          success: false,
          error: 'Missing required parameters: provide either "files" array or "target_file".',
          duration: Date.now() - startTime
        };
      }

      for (let i = 0; i < files.length; i++) {
        if (!files[i].target_file) {
          return {
            success: false,
            error: `Delete operation ${i + 1}: target_file is required.`,
            duration: Date.now() - startTime
          };
        }
      }

      const results: Array<{ success: boolean; data?: any; error?: string }> = [];

      for (let i = 0; i < files.length; i++) {
        try {
          const result = await this.deleteSingleFile(files[i].target_file);
          results.push(result);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          results.push({ success: false, error: `[${files[i].target_file}] ${msg}` });
        }
      }

      // Single file: keep original return format
      if (files.length === 1) {
        const r = results[0];
        return { success: r.success, data: r.data, error: r.error, duration: Date.now() - startTime };
      }

      // Batch: aggregate
      const successResults = results.filter(r => r.success);
      const errorResults = results.filter(r => !r.success);

      return {
        success: successResults.length > 0,
        data: {
          batchMode: true,
          totalOperations: files.length,
          successCount: successResults.length,
          errorCount: errorResults.length,
          message: `${successResults.length}/${files.length} file(s) deleted successfully.${errorResults.length > 0 ? ` ${errorResults.length} failed.` : ''}`,
          fileResults: results.map(r => r.data || { error: r.error }),
          errors: errorResults.length > 0 ? errorResults.map(r => r.error) : undefined
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

  getSummary(args: any): string {
    const files = this.normalizeToFiles(args);
    if (files.length === 0) return '删除文件';
    if (files.length === 1) return `删除文件: ${files[0].target_file}`;
    return `批量删除 ${files.length} 个文件`;
  }
}
