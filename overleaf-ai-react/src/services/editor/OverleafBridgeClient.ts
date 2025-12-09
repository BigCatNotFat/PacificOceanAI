/**
 * Overleaf Bridge Client - 兼容层
 * 
 * @deprecated 请使用新的模块化 API：
 * ```typescript
 * import { overleafEditor } from './OverleafEditor';
 * 
 * // 新用法
 * await overleafEditor.document.getText();
 * await overleafEditor.selection.getCursorPosition();
 * await overleafEditor.editor.insertText('text');
 * ```
 * 
 * 此文件保留用于向后兼容，内部代理到新的模块化实现
 */

import { OverleafBridgeClient as BridgeClient } from './bridge';
import { overleafEditor, OverleafEditor } from './OverleafEditor';

// 重新导出类型
export type {
  LineData,
  ReadLinesResult,
  ReadEntireFileResult,
  FileInfo,
  CursorPosition
} from './bridge';

/**
 * @deprecated 使用 overleafEditor 代替
 */
class OverleafBridgeClientCompat {
  private static instance: OverleafBridgeClientCompat | null = null;
  private editor: OverleafEditor;

  private constructor() {
    this.editor = overleafEditor;
  }

  static getInstance(): OverleafBridgeClientCompat {
    if (!OverleafBridgeClientCompat.instance) {
      OverleafBridgeClientCompat.instance = new OverleafBridgeClientCompat();
    }
    return OverleafBridgeClientCompat.instance;
  }

  injectScript(): void {
    this.editor.injectScript();
  }

  async call<T = any>(method: string, ...args: any[]): Promise<T> {
    return this.editor.getBridge().call<T>(method, ...args);
  }

  // ============ 兼容方法 ============

  async getDocLines(): Promise<number> {
    return this.editor.document.getLines();
  }

  async getDocText(): Promise<string> {
    return this.editor.document.getText();
  }

  async getSelection(): Promise<string> {
    return this.editor.selection.getSelection();
  }

  async getCursorPosition(): Promise<{ line: number; column: number; offset: number }> {
    return this.editor.selection.getCursorPosition();
  }

  async getLineContent(lineNumber: number): Promise<string> {
    return this.editor.document.getLineContent(lineNumber);
  }

  async isEditorAvailable(): Promise<boolean> {
    return this.editor.editor.isAvailable();
  }

  async insertText(text: string): Promise<boolean> {
    return this.editor.editor.insertText(text);
  }

  async replaceRange(from: number, to: number, text: string): Promise<boolean> {
    return this.editor.editor.replaceRange(from, to, text);
  }

  async readLines(startLine: number, endLine: number) {
    return this.editor.document.readLines(startLine, endLine);
  }

  async readEntireFile() {
    return this.editor.document.readEntireFile();
  }

  async getFileInfo() {
    return this.editor.file.getInfo();
  }
}

/**
 * @deprecated 使用 overleafEditor 代替
 */
export const overleafBridge = OverleafBridgeClientCompat.getInstance();

/**
 * @deprecated 使用 OverleafEditor 代替
 */
export { OverleafBridgeClientCompat as OverleafBridgeClient };

