/**
 * 文件模块
 * 负责文件元信息相关操作
 */

import { BaseModule } from './BaseModule';
import type { FileInfo } from '../bridge';

export class FileModule extends BaseModule {
  /**
   * 获取文件信息
   */
  async getInfo(): Promise<FileInfo> {
    return this.call<FileInfo>('getFileInfo');
  }

  /**
   * 切换当前编辑的文件
   * @param targetFilename 目标文件名
   */
  async switchFile(targetFilename: string): Promise<{ success: boolean; error?: string }> {
    return this.call<{ success: boolean; error?: string }>('switchFile', [targetFilename]);
  }
}
