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
}
