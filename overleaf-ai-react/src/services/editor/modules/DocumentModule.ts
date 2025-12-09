/**
 * 文档模块
 * 负责文档内容的读取操作
 */

import { BaseModule } from './BaseModule';
import type { ReadLinesResult, ReadEntireFileResult } from '../bridge';

export class DocumentModule extends BaseModule {
  /**
   * 获取文档行数
   */
  async getLines(): Promise<number> {
    return this.call<number>('getDocLines');
  }

  /**
   * 获取文档完整文本
   */
  async getText(): Promise<string> {
    return this.call<string>('getDocText');
  }

  /**
   * 获取指定行的内容
   */
  async getLineContent(lineNumber: number): Promise<string> {
    return this.call<string>('getLineContent', lineNumber);
  }

  /**
   * 读取指定行范围的内容（1-indexed，包含首尾）
   */
  async readLines(startLine: number, endLine: number): Promise<ReadLinesResult> {
    return this.call<ReadLinesResult>('readLines', startLine, endLine);
  }

  /**
   * 读取整个文件内容
   */
  async readEntireFile(): Promise<ReadEntireFileResult> {
    return this.call<ReadEntireFileResult>('readEntireFile');
  }
}
