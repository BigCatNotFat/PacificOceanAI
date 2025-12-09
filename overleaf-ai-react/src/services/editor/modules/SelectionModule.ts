/**
 * 选区模块
 * 负责选区和光标相关操作
 */

import { BaseModule } from './BaseModule';
import type { CursorPosition } from '../bridge';

export class SelectionModule extends BaseModule {
  /**
   * 获取选中的文本
   */
  async getSelection(): Promise<string> {
    return this.call<string>('getSelection');
  }

  /**
   * 获取光标位置
   */
  async getCursorPosition(): Promise<CursorPosition> {
    return this.call<CursorPosition>('getCursorPosition');
  }
}
