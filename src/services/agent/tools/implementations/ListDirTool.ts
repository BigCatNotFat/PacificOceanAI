/**
 * list_dir - 列出目录内容工具
 * 
 * 功能：列出目录中的文件和子目录
 * 类型：read（只读操作，不需要用户审批）
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';
import type { FileTreeEntity } from '../../../editor/modules/ProjectModule';
import type { FileEntity } from '../../../editor/modules/FileOpsModule';

/** 文件项信息（带可选统计） */
interface FileItem {
  name: string;
  type: string;
  path: string;
  id?: string;
  stats?: {
    lines: number;
    characters: number;
  };
}

/**
 * 列出目录工具
 */
export class ListDirTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'list_dir',
    description: `List the contents of a directory. Returns file names, types, paths, and statistics (line count, character count) for each file. The quick tool to use for discovery, before using more targeted tools like semantic search or file reading. Useful to try to understand the file structure before diving deeper into specific files. Can be used to explore the paperbase.`,
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

      // 通过 ProjectModule 获取文件树（REST API，只返回 doc/file 叶节点）
      const fileTree = await overleafEditor.project.getFileTree();
      const normalizedPath = this.normalizeRelativePath(args.relative_workspace_path);
      
      // 过滤出指定目录下的文件
      const result = this.filterByDirectory(fileTree.entities, normalizedPath);

      // REST API 不返回空文件夹，通过 Bridge listFiles 补全
      await this.mergeEmptyFolders(result.items, normalizedPath);

      // 默认获取文件统计信息
      await this.enrichWithStats(result.items, fileTree.project_id);

      return {
        success: true,
        data: {
          project_id: fileTree.project_id,
          path: normalizedPath,
          items: result.items,
          total_items: result.items.length,
          message: `成功列出目录 ${normalizedPath}`
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

  /**
   * 生成摘要
   */
  getSummary(args: {
    relative_workspace_path: string;
  }): string {
    return `列出目录: ${args.relative_workspace_path}`;
  }

  /**
   * 根据目录路径过滤文件树
   * @param entities 文件树实体列表
   * @param dirPath 目录路径
   */
  private filterByDirectory(
    entities: FileTreeEntity[],
    dirPath: string
  ): { items: FileItem[] } {
    const items: FileItem[] = [];
    const seenDirs = new Set<string>();

    // 规范化目录路径
    const normalizedDirPath = dirPath === '/' ? '' : dirPath;

    // 从 DOM 中构建文件名到 ID 的映射（基于 data-file-id）
    const domIdMap = this.getDomFileIdMap();

    for (const entity of entities) {
      const entityPath = entity.path;
      
      // 检查是否在指定目录下
      if (normalizedDirPath === '') {
        // 根目录：获取顶层文件和文件夹
        const parts = entityPath.split('/').filter(p => p);
        if (parts.length === 1) {
          // 顶层文件
          items.push({
            name: parts[0],
            type: entity.type === 'folder' ? 'directory' : (entity.type === 'doc' ? 'doc' : 'file'),
            path: entityPath,
            id: entity.id ?? entity._id ?? domIdMap.get(parts[0]) ?? undefined
          });
        } else if (parts.length > 1) {
          // 有子目录，记录顶层目录
          const topDir = parts[0];
          if (!seenDirs.has(topDir)) {
            seenDirs.add(topDir);
            items.push({
              name: topDir,
              type: 'directory',
              path: `/${topDir}`
            });
          }
        }
      } else {
        // 子目录：检查路径是否以指定目录开头
        if (entityPath.startsWith(normalizedDirPath + '/')) {
          const relativePath = entityPath.slice(normalizedDirPath.length + 1);
          const parts = relativePath.split('/').filter(p => p);
          
          if (parts.length === 1) {
            // 直接子文件
            items.push({
              name: parts[0],
              type: entity.type === 'folder' ? 'directory' : (entity.type === 'doc' ? 'doc' : 'file'),
              path: entityPath,
              id: entity.id ?? entity._id ?? domIdMap.get(parts[0]) ?? undefined
            });
          } else if (parts.length > 1) {
            // 有更深的子目录，记录直接子目录
            const subDir = parts[0];
            const subDirPath = `${normalizedDirPath}/${subDir}`;
            if (!seenDirs.has(subDirPath)) {
              seenDirs.add(subDirPath);
              items.push({
                name: subDir,
                type: 'directory',
                path: subDirPath
              });
            }
          }
        }
      }
    }

    return { items };
  }

  /**
   * 为文件项添加统计信息（行数、字符数）
   * @param items 文件项列表
   * @param projectId 项目 ID
   */
  private async enrichWithStats(items: FileItem[], projectId: string): Promise<void> {
    // Overleaf 只有 doc 才能用 /doc/{id}/download 获取文本内容；二进制文件会 404
    const fileItems = items.filter(item => item.type === 'doc' && item.id);
    
    // 并行获取所有文件的内容
    const statsPromises = fileItems.map(async (item) => {
      try {
        const content = await this.fetchFileContent(projectId, item.id!);
        const lines = content.split('\n').length;
        const characters = content.length;
        item.stats = { lines, characters };
      } catch (error) {
        // 如果获取失败，不添加统计信息
        console.warn(`[ListDirTool] 无法获取文件 ${item.path} 的统计信息:`, error);
      }
    });

    await Promise.all(statsPromises);
  }

  /**
   * 获取文件内容
   * @param projectId 项目 ID
   * @param docId 文档 ID
   */
  private async fetchFileContent(projectId: string, docId: string): Promise<string> {
    const response = await fetch(`/project/${projectId}/doc/${docId}/download`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`获取文件内容失败: ${response.status}`);
    }

    return response.text();
  }

  /**
   * REST API `/project/{id}/entities` 只返回 doc/file 叶节点，不包含空文件夹。
   * 通过 Bridge `listFiles`（读取 React Fiber 内部状态）补全缺失的文件夹。
   *
   * Bridge listFiles 的路径格式: "rootFolderName/subfolder/file.tex"
   * 其中第一段是根文件夹名称（不应显示给用户）。
   */
  private async mergeEmptyFolders(items: FileItem[], dirPath: string): Promise<void> {
    try {
      const bridgeFiles = await overleafEditor.fileOps.listFiles();
      const folders = bridgeFiles.filter(f => f.type === 'folder');
      if (folders.length === 0) return;

      // 根文件夹：path 中不含 "/" 的文件夹就是 root
      const rootFolder = folders.find(f => !f.path.includes('/'));
      const rootPrefix = rootFolder ? rootFolder.path + '/' : '';

      const existingNames = new Set(items.map(i => i.name));
      const normalizedDir = dirPath === '/' ? '' : dirPath.replace(/^\/+/, '');

      for (const f of folders) {
        if (f === rootFolder) continue;

        // 将 bridge 路径转为相对于项目根的路径（去掉根文件夹前缀）
        let relativePath = f.path;
        if (rootPrefix && relativePath.startsWith(rootPrefix)) {
          relativePath = relativePath.slice(rootPrefix.length);
        }

        // 判断此文件夹是否是 dirPath 的直接子文件夹
        if (normalizedDir === '') {
          // 列出根目录：直接子文件夹 = 路径中不含 "/"
          if (!relativePath.includes('/') && !existingNames.has(f.name)) {
            existingNames.add(f.name);
            items.push({
              name: f.name,
              type: 'directory',
              path: `/${f.name}`,
              id: f.id
            });
          }
        } else {
          // 列出子目录：路径应该是 "normalizedDir/folderName" 且没有更深层级
          const expected = normalizedDir + '/' + f.name;
          if (relativePath === expected && !existingNames.has(f.name)) {
            existingNames.add(f.name);
            items.push({
              name: f.name,
              type: 'directory',
              path: `/${relativePath}`,
              id: f.id
            });
          }
        }
      }
    } catch (error) {
      console.warn('[ListDirTool] mergeEmptyFolders failed (non-critical):', error);
    }
  }

  private getDomFileIdMap(): Map<string, string> {
    const map = new Map<string, string>();

    try {
      const fileItems = document.querySelectorAll('[data-file-id]');

      fileItems.forEach((item) => {
        const el = item as HTMLElement;
        const id = el.getAttribute('data-file-id');
        if (!id) return;

        const nameSpan = el.querySelector('.item-name-button span') as HTMLElement | null;
        const name = nameSpan?.textContent?.trim();
        if (!name) return;

        map.set(name, id);
      });
    } catch (error) {
      console.error('[ListDirTool] 获取 DOM 文件 ID 映射失败:', error);
    }

    return map;
  }

  /**
   * 将用户输入的相对路径规范化为 Overleaf 文件树可匹配的形式：
   * - 空/`.`/`./` → `/`
   * - 统一分隔符为 `/`
   * - 去掉多余的 `./` 前缀与重复的 `/`
   * - 确保以 `/` 开头（根目录为 `/`）
   */
  private normalizeRelativePath(input: string): string {
    let p = (input ?? '').trim();
    if (!p || p === '.' || p === './' || p === '.\\') {
      return '/';
    }

    // 统一 Windows 风格分隔符
    p = p.replace(/\\/g, '/');

    // 去掉开头的 "./"（可能重复）
    while (p.startsWith('./')) {
      p = p.slice(2);
    }

    // 清理重复斜杠
    p = p.replace(/\/+/g, '/');

    // 特殊：如果最后变成空，仍视为根
    if (!p) return '/';

    // 确保以 / 开头
    if (!p.startsWith('/')) {
      p = `/${p}`;
    }

    // 规范化末尾：保留根目录的 "/"，其他去掉末尾 "/"
    if (p.length > 1 && p.endsWith('/')) {
      p = p.slice(0, -1);
    }

    return p;
  }
}
