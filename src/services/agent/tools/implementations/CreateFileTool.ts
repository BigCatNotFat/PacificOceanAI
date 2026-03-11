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
  /**
   * 本地缓存：记录当前 execute() 批次中创建的文件夹路径 → ID
   * 用于解决 React 状态不同步导致的 "file already exists" 问题
   */
  private folderCache = new Map<string, string>();

  protected metadata: ToolMetadata = {
    name: 'create_file',
    description: `Create one or more new files or folders in the Overleaf project. Supports batch creation in a single call.

**Batch mode (recommended):** Provide a \`files\` array to create multiple files/folders at once.
**Single mode (backward compatible):** Provide file_path directly.

Use this tool when you need to:
- Create new .tex chapter/section files
- Create new .bib bibliography files
- Create new folders to organise files
- Create any new text documents in the project

The file will be created in the project root by default. To create inside a subfolder, provide the full path (e.g. "sections/chapter1.tex") — the tool will resolve the parent folder automatically.

**Notes:**
- Only text documents (.tex, .bib, .bbl, .sty, .cls, .txt, etc.) can be created as docs.
- To write content into the new file after creation, use the \`search_replace\` or \`replace_lines\` tool on the newly created file.
- To create a folder, set \`is_folder\` to true.

Examples:
- Single: file_path="sections/intro.tex"
- Batch: files=[{file_path:"sections/intro.tex"}, {file_path:"sections/method.tex"}, {file_path:"images", is_folder:true}]`,

    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'Array of files/folders to create. Use this for batch creation.',
          items: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'The path of the file/folder to create, relative to the project root.'
              },
              is_folder: {
                type: 'boolean',
                description: 'If true, create a folder instead of a document. Defaults to false.'
              }
            },
            required: ['file_path']
          }
        },
        file_path: {
          type: 'string',
          description: '(Single mode) The path of the file/folder to create.'
        },
        is_folder: {
          type: 'boolean',
          description: '(Single mode) If true, create a folder instead of a document.'
        },
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why these files are being created.'
        }
      },
      required: ['explanation']
    },
    needApproval: false,
    modes: ['agent']
  };

  private normalizeToFiles(args: any): Array<{ file_path: string; is_folder?: boolean }> {
    if (Array.isArray(args.files) && args.files.length > 0) {
      return args.files;
    }
    if (args.file_path) {
      return [{ file_path: args.file_path, is_folder: args.is_folder }];
    }
    return [];
  }

  private async createSingleFile(
    fileOp: { file_path: string; is_folder?: boolean }
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const filePath = fileOp.file_path.replace(/\\/g, '/').replace(/^\/+/, '');
    const isFolder = fileOp.is_folder ?? false;

    const parts = filePath.split('/');
    const name = parts.pop()!;
    const parentPath = parts.join('/');

    console.log('[CreateFileTool] Creating:', { filePath, name, parentPath, isFolder });

    if (!name) {
      return { success: false, error: `[${fileOp.file_path}] Invalid file path: name cannot be empty` };
    }

    let parentFolderId: string | undefined;

    if (parentPath) {
      parentFolderId = await this.resolveOrCreateParentFolders(parentPath);
      if (!parentFolderId) {
        return { success: false, error: `[${fileOp.file_path}] Failed to resolve parent folder: "${parentPath}"` };
      }
    }

    if (isFolder) {
      try {
        const result = await overleafEditor.fileOps.newFolder(name, parentFolderId);
        recentlyCreatedFiles.register({ name, path: filePath, id: result._id, type: 'folder' });
        this.folderCache.set(this.normalizePath(filePath), result._id);
        return {
          success: true,
          data: { type: 'folder', name, path: filePath, id: result._id, message: `Created folder "${filePath}"` }
        };
      } catch (folderError) {
        const errorMsg = folderError instanceof Error ? folderError.message : String(folderError);
        if (errorMsg.includes('file already exists') || errorMsg.includes('400')) {
          // 文件夹已存在，尝试恢复其 ID
          console.warn('[CreateFileTool] Folder already exists, recovering:', filePath);
          await new Promise(r => setTimeout(r, 500));
          const entities = await getAllEntities();
          const found = entities.find(
            f => f.type === 'folder' && (this.normalizePath(f.path) === this.normalizePath(filePath) || f.name === name)
          );
          if (found) {
            this.folderCache.set(this.normalizePath(filePath), found.id);
            return {
              success: true,
              data: { type: 'folder', name, path: filePath, id: found.id, message: `Folder "${filePath}" already exists (reused)` }
            };
          }
          // 检查 recentlyCreatedFiles
          const recent = recentlyCreatedFiles.findByPath(filePath);
          if (recent) {
            this.folderCache.set(this.normalizePath(filePath), recent.id);
            return {
              success: true,
              data: { type: 'folder', name, path: filePath, id: recent.id, message: `Folder "${filePath}" already exists (reused)` }
            };
          }
        }
        throw folderError;
      }
    } else {
      const result = await overleafEditor.fileOps.newDoc(name, parentFolderId);
      recentlyCreatedFiles.register({ name, path: filePath, id: result._id, type: 'doc' });
      await this.waitForFileInTree(name, 5000);
      await this.switchToNewFile(filePath);
      return {
        success: true,
        data: { type: 'doc', name, path: filePath, id: result._id, message: `Created file "${filePath}"` }
      };
    }
  }

  async execute(args: {
    files?: Array<{ file_path: string; is_folder?: boolean }>;
    file_path?: string;
    is_folder?: boolean;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    this.folderCache.clear(); // 每次执行清空缓存

    try {
      const files = this.normalizeToFiles(args);

      if (files.length === 0) {
        return {
          success: false,
          error: 'Missing required parameters: provide either "files" array or "file_path".',
          duration: Date.now() - startTime
        };
      }

      for (let i = 0; i < files.length; i++) {
        if (!files[i].file_path) {
          return {
            success: false,
            error: `File operation ${i + 1}: file_path is required.`,
            duration: Date.now() - startTime
          };
        }
      }

      const results: Array<{ success: boolean; data?: any; error?: string }> = [];

      for (let i = 0; i < files.length; i++) {
        console.log(`[CreateFileTool] Processing ${i + 1}/${files.length}: ${files[i].file_path}`);
        try {
          const result = await this.createSingleFile(files[i]);
          results.push(result);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          results.push({ success: false, error: `[${files[i].file_path}] ${msg}` });
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
          message: `${successResults.length}/${files.length} file(s) created successfully.${errorResults.length > 0 ? ` ${errorResults.length} failed.` : ''}`,
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
    if (files.length === 0) return '新建文件';
    if (files.length === 1) {
      const type = files[0].is_folder ? '文件夹' : '文件';
      return `新建${type}: ${files[0].file_path}`;
    }
    return `批量新建 ${files.length} 个文件/文件夹`;
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
   * 逐级解析父文件夹路径，不存在则自动创建。
   *
   * 使用 folderCache 缓存本次 batch 中已创建的文件夹 ID，
   * 避免因 React 状态未同步而重复创建导致 400 "file already exists"。
   */
  private async resolveOrCreateParentFolders(parentPath: string): Promise<string | undefined> {
    try {
      const entities = await getAllEntities();
      const segments = parentPath.split('/').filter(Boolean);
      let currentParentId: string | undefined;

      for (let i = 0; i < segments.length; i++) {
        const segmentPath = segments.slice(0, i + 1).join('/');
        const normalizedSegmentPath = this.normalizePath(segmentPath);

        // 优先级 1: 检查本地缓存（本次 batch 中刚创建的）
        const cachedId = this.folderCache.get(normalizedSegmentPath);
        if (cachedId) {
          console.log('[CreateFileTool] Found folder in cache:', segmentPath, 'id:', cachedId);
          currentParentId = cachedId;
          continue;
        }

        // 优先级 2: 检查 entities（React 状态 + REST API）
        const existing = entities.find(
          f => f.type === 'folder' && this.normalizePath(f.path) === normalizedSegmentPath
        );

        if (existing) {
          currentParentId = existing.id;
          // 也写入缓存，方便后续快速查找
          this.folderCache.set(normalizedSegmentPath, existing.id);
          continue;
        }

        // 优先级 3: 检查 recentlyCreatedFiles 注册表
        const recentEntry = recentlyCreatedFiles.findByPath(segmentPath);
        if (recentEntry && recentEntry.type === 'folder') {
          console.log('[CreateFileTool] Found folder in recently-created registry:', segmentPath, 'id:', recentEntry.id);
          currentParentId = recentEntry.id;
          this.folderCache.set(normalizedSegmentPath, recentEntry.id);
          continue;
        }

        // 不存在，需要创建
        console.log('[CreateFileTool] Creating parent folder:', segments[i], 'parentId:', currentParentId);
        try {
          const result = await overleafEditor.fileOps.newFolder(segments[i], currentParentId);
          currentParentId = result._id;
          // 缓存新创建的文件夹 ID
          this.folderCache.set(normalizedSegmentPath, result._id);
          // 也注册到 recentlyCreatedFiles 中
          recentlyCreatedFiles.register({ name: segments[i], path: segmentPath, id: result._id, type: 'folder' });
          console.log('[CreateFileTool] Created and cached folder:', segmentPath, 'id:', result._id);
        } catch (createError) {
          const errorMsg = createError instanceof Error ? createError.message : String(createError);

          // 检查是否是 "file already exists" 错误
          if (errorMsg.includes('file already exists') || errorMsg.includes('400')) {
            console.warn('[CreateFileTool] Folder already exists on server, recovering:', segments[i]);

            // 等待短暂时间让 React 状态可能同步
            await new Promise(r => setTimeout(r, 1000));

            // 重新查询 entities
            const refreshedEntities = await getAllEntities();
            const found = refreshedEntities.find(
              f => f.type === 'folder' && this.normalizePath(f.path) === normalizedSegmentPath
            );

            if (found) {
              console.log('[CreateFileTool] Recovered existing folder id:', found.id);
              currentParentId = found.id;
              this.folderCache.set(normalizedSegmentPath, found.id);
              continue;
            }

            // 如果还是找不到，尝试按名称 + 父文件夹匹配
            const foundByName = refreshedEntities.find(
              f => f.type === 'folder' && f.name === segments[i]
            );
            if (foundByName) {
              console.log('[CreateFileTool] Recovered folder by name:', foundByName.id);
              currentParentId = foundByName.id;
              this.folderCache.set(normalizedSegmentPath, foundByName.id);
              continue;
            }

            // 最终手段：查 recentlyCreatedFiles
            const recentFallback = recentlyCreatedFiles.findByPath(segmentPath);
            if (recentFallback) {
              console.log('[CreateFileTool] Recovered folder from recently-created:', recentFallback.id);
              currentParentId = recentFallback.id;
              this.folderCache.set(normalizedSegmentPath, recentFallback.id);
              continue;
            }

            console.error('[CreateFileTool] Cannot recover folder ID for:', segmentPath);
            return undefined;
          }

          // 不是 "already exists" 错误，直接抛出
          throw createError;
        }
      }

      return currentParentId;
    } catch (error) {
      console.error('[CreateFileTool] resolveOrCreateParentFolders failed:', error);
      return undefined;
    }
  }
}
