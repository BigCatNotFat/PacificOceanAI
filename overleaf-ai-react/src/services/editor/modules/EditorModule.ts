/**
 * 编辑器模块
 * 负责编辑器状态和编辑操作
 */

import { BaseModule } from './BaseModule';

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
}
