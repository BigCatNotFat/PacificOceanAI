/**
 * 文件操作模块
 * 负责文件/文件夹的增删改移操作（通过注入脚本的 fileOps handler）
 */

import { BaseModule } from './BaseModule';

export interface NewDocResult {
  _id: string;
  name: string;
}

export interface NewFolderResult {
  _id: string;
  name: string;
}

export interface FileEntity {
  type: 'folder' | 'doc' | 'file';
  name: string;
  path: string;
  id: string;
}

export class FileOpsModule extends BaseModule {
  /**
   * 获取根文件夹 ID
   */
  async getRootFolderId(): Promise<string | null> {
    return this.call<string | null>('getRootFolderId');
  }

  /**
   * 列出项目所有文件（通过 React Fiber 内部状态）
   */
  async listFiles(): Promise<FileEntity[]> {
    return this.call<FileEntity[]>('listFiles');
  }

  /**
   * 新建文档
   * @param name 文件名（含扩展名）
   * @param parentFolderId 父文件夹 ID，不传则放在根目录
   */
  async newDoc(name: string, parentFolderId?: string): Promise<NewDocResult> {
    return this.call<NewDocResult>('newDoc', name, parentFolderId || null);
  }

  /**
   * 新建文件夹
   * @param name 文件夹名称
   * @param parentFolderId 父文件夹 ID，不传则放在根目录
   */
  async newFolder(name: string, parentFolderId?: string): Promise<NewFolderResult> {
    return this.call<NewFolderResult>('newFolder', name, parentFolderId || null);
  }

  /**
   * 删除实体
   * @param entityType 实体类型：doc / file / folder
   * @param entityId 实体 ID
   */
  async deleteEntity(entityType: 'doc' | 'file' | 'folder', entityId: string): Promise<{ success: boolean }> {
    return this.call<{ success: boolean }>('deleteEntity', entityType, entityId);
  }

  /**
   * 重命名实体
   * @param entityType 实体类型：doc / file / folder
   * @param entityId 实体 ID
   * @param newName 新名称
   */
  async renameEntity(
    entityType: 'doc' | 'file' | 'folder',
    entityId: string,
    newName: string
  ): Promise<{ success: boolean; newName: string }> {
    return this.call<{ success: boolean; newName: string }>('renameEntity', entityType, entityId, newName);
  }

  /**
   * 移动实体
   * @param entityType 实体类型：doc / file / folder
   * @param entityId 实体 ID
   * @param targetFolderId 目标文件夹 ID
   */
  async moveEntity(
    entityType: 'doc' | 'file' | 'folder',
    entityId: string,
    targetFolderId: string
  ): Promise<{ success: boolean }> {
    return this.call<{ success: boolean }>('moveEntity', entityType, entityId, targetFolderId);
  }
}
