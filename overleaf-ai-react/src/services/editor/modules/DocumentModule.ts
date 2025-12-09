/**
 * 文档模块
 * 负责文档内容的读取操作
 */

import { BaseModule } from './BaseModule';
import type { ReadLinesResult, ReadEntireFileResult } from '../bridge';
import { ProjectModule } from './ProjectModule';

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

  async getDocContent(
    docId: string,
    startLine: number | null = null,
    endLine: number | null = null
  ): Promise<string> {
    const projectModule = new ProjectModule(this.bridge);
    const projectId = projectModule.getProjectId();
    if (!projectId) {
      throw new Error('无法获取项目 ID，请确保在 Overleaf 项目页面中');
    }

    const response = await fetch(`/project/${projectId}/doc/${docId}/download`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`获取文档内容失败: ${response.status} ${response.statusText}`);
    }

    const content = await response.text();
    const lines = content.split('\n');

    if (startLine === null && endLine === null) {
      return content;
    }

    if (endLine === null) {
      return lines[startLine - 1] ?? '';
    }

    const selectedLines = lines.slice(startLine - 1, endLine);
    return selectedLines.join('\n');
  }
}
