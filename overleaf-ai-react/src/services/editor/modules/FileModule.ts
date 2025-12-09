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
}
