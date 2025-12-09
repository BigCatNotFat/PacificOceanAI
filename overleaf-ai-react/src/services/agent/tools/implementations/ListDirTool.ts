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

      // 通过 ProjectModule 获取文件树
      const fileTree = await overleafEditor.project.getFileTree();
      const requestedPath = args.relative_workspace_path;
      
      // 规范化路径（确保以 / 开头）
      const normalizedPath = requestedPath === '/' || requestedPath === '' || requestedPath === '.'
        ? '/'
        : (requestedPath.startsWith('/') ? requestedPath : `/${requestedPath}`);
      
      // 过滤出指定目录下的文件
      const result = this.filterByDirectory(fileTree.entities, normalizedPath);

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
  ): { items: Array<{ name: string; type: string; path: string; id?: string }> } {
    const items: Array<{ name: string; type: string; path: string; id?: string }> = [];
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
            type: entity.type === 'folder' ? 'directory' : 'file',
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
              type: entity.type === 'folder' ? 'directory' : 'file',
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
}
