/**
 * 项目模块
 * 负责项目级别的操作，如获取文件树等
 */

import { BaseModule } from './BaseModule';

/** 文件树实体类型 */
export interface FileTreeEntity {
  path: string;
  type: 'file' | 'doc' | 'folder';
  id?: string;
  _id?: string;
}

/** 文件树响应 */
export interface FileTreeResponse {
  project_id: string;
  entities: FileTreeEntity[];
}

/** 项目文件统计信息 */
export interface ProjectFileStats {
  path: string;
  lines: number;
  chars: number;
}

export class ProjectModule extends BaseModule {
  /**
   * 从 URL 获取当前项目 ID
   */
  getProjectId(): string | null {
    const pathParts = window.location.pathname.split('/');
    // URL 格式: /project/{projectId}/...
    const projectIndex = pathParts.indexOf('project');
    if (projectIndex !== -1 && pathParts[projectIndex + 1]) {
      return pathParts[projectIndex + 1];
    }
    return null;
  }

  /**
   * 获取项目文件树
   */
  async getFileTree(): Promise<FileTreeResponse> {
    const projectId = this.getProjectId();
    if (!projectId) {
      throw new Error('无法获取项目 ID，请确保在 Overleaf 项目页面中');
    }

    const response = await fetch(`/project/${projectId}/entities`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`获取文件树失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data as FileTreeResponse;
  }

  /**
   * 获取项目文件统计信息（包含行数和字符数）
   */
  async getProjectFileStats(): Promise<ProjectFileStats[]> {
    return this.call<ProjectFileStats[]>('getProjectFileStats');
  }

  /**
   * 获取文件树中的所有文件路径
   */
  async getFilePaths(): Promise<string[]> {
    const { entities } = await this.getFileTree();
    return entities.map(e => e.path);
  }

  /**
   * 获取文件树中的所有文档（可编辑的文本文件）
   */
  async getDocuments(): Promise<FileTreeEntity[]> {
    const { entities } = await this.getFileTree();
    return entities.filter(e => e.type === 'doc');
  }

  /**
   * 获取文件树中的所有二进制文件（图片、PDF等）
   */
  async getBinaryFiles(): Promise<FileTreeEntity[]> {
    const { entities } = await this.getFileTree();
    return entities.filter(e => e.type === 'file');
  }

  /**
   * 检查文件是否存在于项目中
   */
  async fileExists(filePath: string): Promise<boolean> {
    const { entities } = await this.getFileTree();
    // 确保路径以 / 开头
    const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    return entities.some(e => e.path === normalizedPath);
  }

  /**
   * 获取项目名称
   * 从 DOM 中获取 Overleaf 项目标题
   */
  getProjectName(): string | null {
    try {
      // 策略 1: 【最优先】查找精确的子元素类名 (针对部分定制版结构)
      const preciseSelectors = [
        '.project-name .name',         // 常见：父容器下的 .name
        '.header-project-name .name',
        '.project-name > span.name',   // 直接子元素
        'header .name',                // header 下的 name
        '.toolbar-center .name'        // 工具栏中的 name
      ];

      for (const selector of preciseSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent) {
          const name = el.textContent.trim();
          if (name) return name;
        }
      }

      // 策略 2: 尝试从 Meta 标签获取 (通常很干净，无干扰)
      const metaTag = document.querySelector('meta[name="ol-project-name"], meta[property="og:title"]');
      if (metaTag) {
        const content = metaTag.getAttribute('content');
        if (content) return content.trim();
      }

      // 策略 3: 从容器获取，但先【清理垃圾】
      // 移除里面的按钮、图标等干扰项
      const containerSelectors = ['.project-name', '.header-project-name', '[data-project-name]'];

      for (const selector of containerSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          // 克隆节点以免影响页面
          const clone = el.cloneNode(true) as Element;

          // 移除所有的链接、按钮、图标和不可见元素
          const trash = clone.querySelectorAll('a, button, .btn, .fa, .icon, i, [role="button"], .sr-only');
          trash.forEach(t => t.remove());

          const name = clone.textContent?.trim();
          // 排除 "Overleaf" 和包含 "Editor" 的通用标题
          if (name && name !== 'Overleaf' && !name.includes('Editor')) {
            return name;
          }
        }
      }

      // 策略 4: 页面标题 (最后的保底，支持多种分隔符)
      const pageTitle = document.title;
      if (pageTitle) {
        const separators = [' - ', ' | ', ' — ', ' : '];
        for (const sep of separators) {
          if (pageTitle.includes(sep)) {
            const parts = pageTitle.split(sep);
            // 取第一部分作为项目名
            if (parts.length > 0 && parts[0].trim()) {
              return parts[0].trim();
            }
          }
        }
        // 如果没有找到分隔符且不是 Overleaf 默认标题，可能整个就是项目名
        if (!pageTitle.includes('Overleaf')) {
          return pageTitle.trim();
        }
      }

      return null;
    } catch (error) {
      console.error('获取项目名称时出错:', error);
      return null;
    }
  }
}
