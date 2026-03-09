/**
 * move_file - 移动文件工具
 *
 * 功能：将 Overleaf 项目中的文件或文件夹移动到另一个文件夹
 * 类型：write（写操作）
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';
import { findEntityByPath, findFolderByPath } from '../utils/FileEntityResolver';

export class MoveFileTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'move_file',
    description: `Move a file or folder to a different location in the Overleaf project.

Use this tool when you need to:
- Reorganize files into folders (e.g. move "chapter1.tex" into "sections/")
- Clean up project structure

**Important:**
- Provide the current file path and the destination folder path.
- The destination folder must already exist, or use "/" for the project root.
- After moving, any \\input{} or \\include{} references in other files will NOT be automatically updated. You should update them manually using the search_replace tool.`,

    parameters: {
      type: 'object',
      properties: {
        target_file: {
          type: 'string',
          description: 'The current path of the file or folder to move, relative to the project root.'
        },
        destination_folder: {
          type: 'string',
          description: 'The destination folder path. Use "/" or "." for the project root.'
        },
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why this file is being moved.'
        }
      },
      required: ['target_file', 'destination_folder']
    },
    needApproval: false,
    modes: ['agent']
  };

  async execute(args: {
    target_file: string;
    destination_folder: string;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameters: target_file, destination_folder',
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

      const destPath = args.destination_folder.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
      let destFolderId: string;

      if (!destPath || destPath === '.' || destPath === '/') {
        const rootId = await overleafEditor.fileOps.getRootFolderId();
        if (!rootId) {
          return {
            success: false,
            error: 'Failed to get root folder ID',
            duration: Date.now() - startTime
          };
        }
        destFolderId = rootId;
      } else {
        const destFolder = await findFolderByPath(destPath);
        if (!destFolder) {
          return {
            success: false,
            error: `Destination folder not found: "${args.destination_folder}". Make sure the folder exists first.`,
            duration: Date.now() - startTime
          };
        }
        destFolderId = destFolder.id;
      }

      await overleafEditor.fileOps.moveEntity(entity.type, entity.id, destFolderId);

      const newPath = destPath ? `${destPath}/${entity.name}` : entity.name;

      return {
        success: true,
        data: {
          oldPath: args.target_file,
          newPath,
          name: entity.name,
          type: entity.type,
          message: `Successfully moved "${entity.name}" to "${args.destination_folder}". Remember to update any \\input{} or \\include{} references.`
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

  getSummary(args: { target_file: string; destination_folder: string }): string {
    return `移动文件: ${args.target_file} → ${args.destination_folder}`;
  }
}
