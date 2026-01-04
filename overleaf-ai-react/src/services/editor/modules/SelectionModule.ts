/**
 * 选区模块
 * 负责选区和光标相关操作
 */

import { BaseModule } from './BaseModule';
import type { CursorPosition, SelectionInfo, ReplaceSelectionResult } from '../bridge';

export class SelectionModule extends BaseModule {
  /**
   * 获取选中的文本
   */
  async getSelection(): Promise<string> {
    return this.call<string>('getSelection');
  }

  /**
   * 获取选区详细信息（包含位置和文本）
   */
  async getSelectionInfo(): Promise<SelectionInfo> {
    return this.call<SelectionInfo>('getSelectionInfo');
  }

  /**
   * 获取光标位置
   */
  async getCursorPosition(): Promise<CursorPosition> {
    return this.call<CursorPosition>('getCursorPosition');
  }

  /**
   * 替换选区内容
   * @param from 起始位置
   * @param to 结束位置
   * @param text 替换文本
   */
  async replaceSelection(from: number, to: number, text: string): Promise<ReplaceSelectionResult> {
    return this.call<ReplaceSelectionResult>('replaceSelection', from, to, text);
  }
}
