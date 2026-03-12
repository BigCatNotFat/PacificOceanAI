/**
 * list_dir - List directory contents.
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';
import type { FileTreeEntity } from '../../../editor/modules/ProjectModule';
import { recentlyCreatedFiles } from '../utils/RecentlyCreatedFilesRegistry';

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

export class ListDirTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'list_dir',
    description: `Recursively list all files and folders under a directory. Returns file names, types, paths, and statistics (line count, character count) for each text document. Useful to understand the full project structure before diving deeper into specific files.`,
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

  async execute(args: {
    relative_workspace_path: string;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.validate(args)) {
        return {
          success: false,
          error: `Missing required parameter: relative_workspace_path. Received args: ${JSON.stringify(args)}`,
          duration: Date.now() - startTime
        };
      }

      this.log(`List directory recursively: ${args.relative_workspace_path}`);

      const fileTree = await overleafEditor.project.getFileTree();
      const normalizedPath = this.normalizeRelativePath(args.relative_workspace_path);

      const result = this.filterByDirectory(fileTree.entities, normalizedPath);

      // Bridge listFiles reads from React Fiber state which updates faster
      // than the REST API. Merge all entity types so newly-created files appear immediately.
      await this.mergeBridgeEntities(result.items, normalizedPath);

      this.sortItems(result.items);
      await this.enrichWithStats(result.items, fileTree.project_id);

      return {
        success: true,
        data: {
          project_id: fileTree.project_id,
          path: normalizedPath,
          items: result.items,
          total_items: result.items.length,
          message: `Successfully listed directory ${normalizedPath}`
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

  getSummary(args: {
    relative_workspace_path: string;
  }): string {
    return `List directory recursively: ${args.relative_workspace_path}`;
  }

  private filterByDirectory(
    entities: FileTreeEntity[],
    dirPath: string
  ): { items: FileItem[] } {
    const items: FileItem[] = [];
    const seenPaths = new Set<string>();
    const seenIds = new Set<string>();

    const normalizedDirPath = dirPath === '/' ? '' : this.normalizeListPath(dirPath);
    const domIdMap = this.getDomFileIdMap();
    const addItem = (item: FileItem): void => {
      this.addItemIfAbsent(items, item, seenPaths, seenIds);
    };

    for (const entity of entities) {
      const entityPath = this.normalizeListPath(entity.path);
      const relativePath = this.getRelativePathWithinDirectory(entityPath, normalizedDirPath);
      if (relativePath == null || relativePath === '') continue;

      this.addAncestorDirectories(relativePath, normalizedDirPath, addItem);

      const parts = relativePath.split('/').filter(Boolean);
      if (parts.length === 0) continue;

      const name = parts[parts.length - 1];
      addItem({
        name,
        type: entity.type === 'folder' ? 'directory' : (entity.type === 'doc' ? 'doc' : 'file'),
        path: entityPath,
        id: entity.id ?? entity._id ?? domIdMap.get(name) ?? undefined
      });
    }

    return { items };
  }

  private async enrichWithStats(items: FileItem[], projectId: string): Promise<void> {
    // Overleaf can only download text for docs. Binary files may return 404.
    const fileItems = items.filter(item => item.type === 'doc' && item.id);

    const statsPromises = fileItems.map(async (item) => {
      try {
        const content = await this.fetchFileContent(projectId, item.id!);
        const lines = content.split('\n').length;
        const characters = content.length;
        item.stats = { lines, characters };
      } catch (error) {
      }
    });

    await Promise.all(statsPromises);
  }

  private async fetchFileContent(projectId: string, docId: string): Promise<string> {
    const response = await fetch(`/project/${projectId}/doc/${docId}/download`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch file content: ${response.status}`);
    }

    return response.text();
  }

  private async mergeBridgeEntities(items: FileItem[], dirPath: string): Promise<void> {
    try {
      const bridgeFiles = await overleafEditor.fileOps.listFiles();
      if (bridgeFiles.length === 0) return;

      const rootFolder = bridgeFiles.find(f => f.type === 'folder' && !f.path.includes('/'));
      const rootPrefix = rootFolder ? `${rootFolder.path}/` : '';

      const normalizedDirPath = dirPath === '/' ? '' : this.normalizeListPath(dirPath);
      const normalizedDirRelativePath = normalizedDirPath.replace(/^\/+/, '');

      const existingIds = new Set(items.map(i => i.id).filter((id): id is string => Boolean(id)));
      const existingPaths = new Set(items.map(i => this.normalizeListPath(i.path)));
      const addItem = (item: FileItem): void => {
        this.addItemIfAbsent(items, item, existingPaths, existingIds);
      };

      const mergeEntry = (entry: {
        id?: string;
        path: string;
        name: string;
        type: 'folder' | 'doc' | 'file';
      }): void => {
        let relativePath = (entry.path ?? '')
          .replace(/\\/g, '/')
          .replace(/^\/+/, '')
          .replace(/\/+/g, '/')
          .trim();

        if (!relativePath) return;
        if (relativePath.length > 1 && relativePath.endsWith('/')) {
          relativePath = relativePath.slice(0, -1);
        }

        if (recentlyCreatedFiles.isMarkedDeleted({ id: entry.id, path: relativePath, name: entry.name })) return;
        if (!this.isNestedInDirectory(relativePath, normalizedDirRelativePath)) return;

        const relativePathInDir = normalizedDirRelativePath === ''
          ? relativePath
          : relativePath.slice(normalizedDirRelativePath.length + 1);
        if (!relativePathInDir) return;

        this.addAncestorDirectories(relativePathInDir, normalizedDirPath, addItem);

        const pathParts = relativePath.split('/').filter(Boolean);
        addItem({
          name: entry.name || pathParts[pathParts.length - 1],
          type: entry.type === 'folder' ? 'directory' : (entry.type === 'doc' ? 'doc' : 'file'),
          path: `/${relativePath}`,
          id: entry.id
        });
      };

      for (const f of bridgeFiles) {
        if (f === rootFolder) continue;

        let relativePath = f.path;
        if (rootPrefix && relativePath.startsWith(rootPrefix)) {
          relativePath = relativePath.slice(rootPrefix.length);
        }

        mergeEntry({
          id: f.id,
          path: relativePath,
          name: f.name,
          type: f.type
        });
      }

      for (const entry of recentlyCreatedFiles.getAll()) {
        mergeEntry({
          id: entry.id,
          path: entry.path,
          name: entry.name,
          type: entry.type
        });
      }
    } catch (error) {
    }
  }

  private addItemIfAbsent(
    items: FileItem[],
    item: FileItem,
    seenPaths: Set<string>,
    seenIds: Set<string>
  ): void {
    const normalizedPath = this.normalizeListPath(item.path);

    if (item.id && seenIds.has(item.id)) return;
    if (seenPaths.has(normalizedPath)) return;

    seenPaths.add(normalizedPath);
    if (item.id) seenIds.add(item.id);

    items.push({
      ...item,
      path: normalizedPath,
      id: item.id || undefined
    });
  }

  private addAncestorDirectories(
    relativePath: string,
    baseDirPath: string,
    addItem: (item: FileItem) => void
  ): void {
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length <= 1) return;

    let currentPath = baseDirPath;
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`;

      addItem({
        name: segment,
        type: 'directory',
        path: currentPath
      });
    }
  }

  private getRelativePathWithinDirectory(entityPath: string, dirPath: string): string | null {
    const normalizedEntityPath = this.normalizeListPath(entityPath);
    if (dirPath === '') {
      return normalizedEntityPath.slice(1);
    }
    if (normalizedEntityPath === dirPath) {
      return '';
    }
    if (!normalizedEntityPath.startsWith(dirPath + '/')) {
      return null;
    }
    return normalizedEntityPath.slice(dirPath.length + 1);
  }

  private isNestedInDirectory(relativePath: string, parentDir: string): boolean {
    if (parentDir === '') {
      return true;
    }
    return relativePath.startsWith(parentDir + '/');
  }

  private sortItems(items: FileItem[]): void {
    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.path.localeCompare(b.path);
    });
  }

  private normalizeListPath(path: string): string {
    let normalized = (path ?? '')
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .trim();

    if (!normalized) return '/';

    if (!normalized.startsWith('/')) {
      normalized = `/${normalized}`;
    }

    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
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
    }

    return map;
  }

  /**
   * Normalize user relative paths to Overleaf tree format:
   * - empty/./.\ => /
   * - normalize separator to /
   * - remove leading ./
   * - ensure path starts with /
   */
  private normalizeRelativePath(input: string): string {
    let p = (input ?? '').trim();
    if (!p || p === '.' || p === './' || p === '.\\') {
      return '/';
    }

    p = p.replace(/\\/g, '/');

    while (p.startsWith('./')) {
      p = p.slice(2);
    }

    p = p.replace(/\/+/g, '/');

    if (!p) return '/';

    if (!p.startsWith('/')) {
      p = `/${p}`;
    }

    if (p.length > 1 && p.endsWith('/')) {
      p = p.slice(0, -1);
    }

    return p;
  }
}
