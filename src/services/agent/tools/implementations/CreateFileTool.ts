/**
 * create_file - 新建文件工具
 *
 * 功能：在 Overleaf 项目中新建文档或文件夹
 * 类型：write（写操作）
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';
import { getAllEntities } from '../utils/FileEntityResolver';

export class CreateFileTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'create_file',
    description: `Create a new file or folder in the Overleaf project.

Use this tool when you need to:
- Create a new .tex chapter/section file
- Create a new .bib bibliography file
- Create a new folder to organise files
- Create any new text document in the project

The file will be created in the project root by default. To create inside a subfolder, provide the full path (e.g. "sections/chapter1.tex") — the tool will resolve the parent folder automatically.

**Notes:**
- Only text documents (.tex, .bib, .bbl, .sty, .cls, .txt, etc.) can be created as docs.
- To write content into the new file after creation, use the \`search_replace\` or \`replace_lines\` tool on the newly created file.
- To create a folder, set \`is_folder\` to true.`,

    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The path of the file/folder to create, relative to the project root. E.g. "sections/intro.tex" or "images" (for a folder).'
        },
        is_folder: {
          type: 'boolean',
          description: 'If true, create a folder instead of a document. Defaults to false.'
        },
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why this file is being created.'
        }
      },
      required: ['file_path']
    },
    needApproval: false,
    modes: ['agent']
  };

  async execute(args: {
    file_path: string;
    is_folder?: boolean;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameter: file_path',
          duration: Date.now() - startTime
        };
      }

      const filePath = args.file_path.replace(/\\/g, '/').replace(/^\/+/, '');
      const isFolder = args.is_folder ?? false;

      const parts = filePath.split('/');
      const name = parts.pop()!;
      const parentPath = parts.join('/');

      console.log('[CreateFileTool] Creating:', { filePath, name, parentPath, isFolder });

      if (!name) {
        return {
          success: false,
          error: 'Invalid file path: name cannot be empty',
          duration: Date.now() - startTime
        };
      }

      let parentFolderId: string | undefined;

      if (parentPath) {
        parentFolderId = await this.resolveOrCreateParentFolders(parentPath);
        if (!parentFolderId) {
          return {
            success: false,
            error: `Failed to resolve parent folder path: "${parentPath}"`,
            duration: Date.now() - startTime
          };
        }
        console.log('[CreateFileTool] Resolved parent folder ID:', parentFolderId);
      }

      if (isFolder) {
        console.log('[CreateFileTool] Calling newFolder:', name, parentFolderId);
        const result = await overleafEditor.fileOps.newFolder(name, parentFolderId);
        console.log('[CreateFileTool] newFolder result:', result);

        // Solution A: Refresh file tree cache after creation so subsequent list_dir/read_file can find the new file
        try {
          await overleafEditor.project.getFileTree();
          console.log('[CreateFileTool] File tree cache refreshed');
        } catch (e) {
          console.warn('[CreateFileTool] Failed to refresh file tree cache:', e);
        }

        return {
          success: true,
          data: {
            type: 'folder',
            name,
            path: filePath,
            id: result._id,
            message: `Successfully created folder "${filePath}"`
          },
          duration: Date.now() - startTime
        };
      } else {
        console.log('[CreateFileTool] Calling newDoc:', name, parentFolderId);
        const result = await overleafEditor.fileOps.newDoc(name, parentFolderId);
        console.log('[CreateFileTool] newDoc result:', result);

        // Solution A: Refresh file tree cache after creation so subsequent list_dir/read_file can find the new file
        try {
          await overleafEditor.project.getFileTree();
          console.log('[CreateFileTool] File tree cache refreshed');
        } catch (e) {
          console.warn('[CreateFileTool] Failed to refresh file tree cache:', e);
        }

        return {
          success: true,
          data: {
            type: 'doc',
            name,
            path: filePath,
            id: result._id,
            message: `Successfully created file "${filePath}". Use search_replace or replace_lines to write content into it.`
          },
          duration: Date.now() - startTime
        };
      }
    } catch (error) {
      return {
        ...this.handleError(error),
        duration: Date.now() - startTime
      };
    }
  }

  getSummary(args: { file_path: string; is_folder?: boolean }): string {
    const type = args.is_folder ? '文件夹' : '文件';
    return `新建${type}: ${args.file_path}`;
  }

  private normalizePath(p: string): string {
    return p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  }

  /**
   * 逐级解析父文件夹路径，不存在则自动创建
   */
  private async resolveOrCreateParentFolders(parentPath: string): Promise<string | undefined> {
    try {
      const entities = await getAllEntities();
      const segments = parentPath.split('/').filter(Boolean);
      let currentParentId: string | undefined;

      for (let i = 0; i < segments.length; i++) {
        const segmentPath = segments.slice(0, i + 1).join('/');
        const existing = entities.find(
          f => f.type === 'folder' && this.normalizePath(f.path) === this.normalizePath(segmentPath)
        );

        if (existing) {
          currentParentId = existing.id;
        } else {
          console.log('[CreateFileTool] Creating parent folder:', segments[i], 'parentId:', currentParentId);
          const result = await overleafEditor.fileOps.newFolder(segments[i], currentParentId);
          currentParentId = result._id;
        }
      }

      return currentParentId;
    } catch (error) {
      console.error('[CreateFileTool] resolveOrCreateParentFolders failed:', error);
      return undefined;
    }
  }
}
