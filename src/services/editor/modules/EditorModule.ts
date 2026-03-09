/**
 * 编辑器模块
 * 负责编辑器状态和编辑操作
 */

import { BaseModule } from './BaseModule';
import type { ReplaceFirstMatchResult } from '../bridge';

/** 编辑操作类型 */
export interface EditOperation {
  from: number;
  to: number;
  insert: string;
}

/** 设置文档内容结果 */
export interface SetDocContentResult {
  success: boolean;
  oldLength: number;
  newLength: number;
}

/** 应用编辑结果 */
export interface ApplyEditsResult {
  success: boolean;
  appliedCount: number;
}

export class EditorModule extends BaseModule {
  /**
   * 检查编辑器是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      return await this.call<boolean>('isEditorAvailable');
    } catch {
      return false;
    }
  }

  /**
   * 在光标位置插入文本
   */
  async insertText(text: string): Promise<boolean> {
    return this.call<boolean>('insertText', text);
  }

  /**
   * 替换指定范围的文本
   */
  async replaceRange(from: number, to: number, text: string): Promise<boolean> {
    return this.call<boolean>('replaceRange', from, to, text);
  }

  /**
   * 根据指定内容查找首个匹配并替换；若匹配到多处则不替换
   */
  async replaceFirstMatch(searchText: string, replaceText: string): Promise<ReplaceFirstMatchResult> {
    return this.call<ReplaceFirstMatchResult>('replaceFirstMatch', searchText, replaceText);
  }

  /**
   * 设置整个文档内容（全量替换）
   */
  async setDocContent(newContent: string): Promise<SetDocContentResult> {
    return this.call<SetDocContentResult>('setDocContent', newContent);
  }

  /**
   * 应用多个编辑操作
   * @param edits 编辑操作数组，每个操作包含 from, to, insert
   */
  async applyEdits(edits: EditOperation[]): Promise<ApplyEditsResult> {
    return this.call<ApplyEditsResult>('applyEdits', edits);
  }
}
