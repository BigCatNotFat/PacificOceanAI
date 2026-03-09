/**
 * rename_file - 重命名文件工具
 *
 * 功能：重命名 Overleaf 项目中的文件或文件夹
 * 类型：write（写操作）
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';
import { findEntityByPath } from '../utils/FileEntityResolver';

export class RenameFileTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'rename_file',
    description: `Rename a file or folder in the Overleaf project.

Use this tool when you need to:
- Rename a .tex file (e.g. "chapter1.tex" → "introduction.tex")
- Rename a folder
- Fix a file naming convention

**Important:**
- Provide the current file path and the new name (just the name, not a full path).
- After renaming, any \\input{} or \\include{} references in other files will NOT be automatically updated. You should update them manually using the search_replace tool.`,

    parameters: {
      type: 'object',
      properties: {
        target_file: {
          type: 'string',
          description: 'The current path of the file or folder to rename, relative to the project root.'
        },
        new_name: {
          type: 'string',
          description: 'The new name for the file or folder (just the filename, not a full path). E.g. "introduction.tex"'
        },
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why this file is being renamed.'
        }
      },
      required: ['target_file', 'new_name']
    },
    needApproval: false,
    modes: ['agent']
  };

  async execute(args: {
    target_file: string;
    new_name: string;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameters: target_file, new_name',
          duration: Date.now() - startTime
        };
      }

      const newName = args.new_name.trim();
      if (!newName || newName.includes('/')) {
        return {
          success: false,
          error: 'new_name must be a simple filename without path separators.',
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

      const result = await overleafEditor.fileOps.renameEntity(entity.type, entity.id, newName);

      return {
        success: true,
        data: {
          oldPath: args.target_file,
          oldName: entity.name,
          newName: result.newName,
          type: entity.type,
          message: `Successfully renamed "${entity.name}" to "${result.newName}". Remember to update any \\input{} or \\include{} references.`
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

  getSummary(args: { target_file: string; new_name: string }): string {
    return `重命名: ${args.target_file} → ${args.new_name}`;
  }
}
