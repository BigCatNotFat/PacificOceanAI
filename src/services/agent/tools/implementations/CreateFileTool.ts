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
import { recentlyCreatedFiles } from '../utils/RecentlyCreatedFilesRegistry';

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

        recentlyCreatedFiles.register({
          name,
          path: filePath,
          id: result._id,
          type: 'folder'
        });

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

        recentlyCreatedFiles.register({
          name,
          path: filePath,
          id: result._id,
          type: 'doc'
        });

        // Wait for the file to appear in Overleaf's state, then open it so
        // subsequent tools (replace_lines, search_replace) can work immediately.
        await this.waitForFileInTree(name, 5000);
        await this.switchToNewFile(name);

        return {
          success: true,
          data: {
            type: 'doc',
            name,
            path: filePath,
            id: result._id,
            message: `Successfully created file "${filePath}". The file is now open in the editor. Use search_replace or replace_lines to write content into it.`
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
   * Poll the bridge's listFiles until the new file appears (or timeout).
   */
  private async waitForFileInTree(fileName: string, timeoutMs = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const files = await overleafEditor.fileOps.listFiles();
        if (files.some(f => f.name === fileName)) {
          console.log('[CreateFileTool] File appeared in tree:', fileName);
          return true;
        }
      } catch { /* ignore */ }
      await new Promise(r => setTimeout(r, 500));
    }
    console.warn('[CreateFileTool] Timed out waiting for file in tree:', fileName);
    return false;
  }

  /**
   * Switch the editor to the newly created file so subsequent tools can
   * read/write it immediately.
   *
   * Waits for both the bridge file name report AND the CodeMirror/DiffAPI to
   * fully transition, matching the logic used by the write tools.
   */
  private async switchToNewFile(fileName: string): Promise<void> {
    try {
      // Capture pre-switch content
      let preSwitchContent: string | null = null;
      try { preSwitchContent = await overleafEditor.document.getText(); } catch { /* ignore */ }

      const switchResult = await overleafEditor.file.switchFile(fileName);
      if (!switchResult.success) {
        console.warn('[CreateFileTool] Could not auto-switch to new file:', switchResult.error);
        return;
      }

      // Phase 1: wait for bridge to report the correct file name
      const start = Date.now();
      while (Date.now() - start < 5000) {
        try {
          const info = await overleafEditor.file.getInfo();
          if (info.fileName === fileName) break;
        } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 200));
      }

      // Phase 2: wait for editor content to change (new file should be empty)
      if (preSwitchContent !== null && preSwitchContent.trim().length > 0) {
        const contentDeadline = Date.now() + 3000;
        while (Date.now() < contentDeadline) {
          try {
            const currentContent = await overleafEditor.document.getText();
            if (currentContent !== preSwitchContent) break;
          } catch { /* ignore */ }
          await new Promise(r => setTimeout(r, 200));
        }
      }

      // Phase 3: stabilisation delay for DiffAPI
      await new Promise(r => setTimeout(r, 600));

      console.log('[CreateFileTool] Switched to new file:', fileName);
    } catch (err) {
      console.warn('[CreateFileTool] switchToNewFile error:', err);
    }
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
