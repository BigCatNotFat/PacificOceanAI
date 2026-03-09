import type { Event } from '../../base/common/event';

export type OutlineItem = { title: string; type: string; line: string | number; level: number };
export type FileTreeItem = { name: string; type: string; level: number; fileType: string };

export interface IEditorService {
  readonly onDidChangeActiveFile: Event<string | null>;

  getCurrentFileName(): string | null | Promise<string | null>;
  readLine(lineNumber: number): string | null | Promise<string | null>;
  readAllLines(): string[] | Promise<string[]>;
  getEditorFullText(targetFileName?: string): string | Promise<string>;
  readFileOutline(): OutlineItem[] | Promise<OutlineItem[]>;
  readFileTree(): FileTreeItem[] | Promise<FileTreeItem[]>;
  readImagePreviewUrl(fileName: string): Promise<string | null>;
  
  /**
   * 在当前光标位置插入文本
   * @param text - 要插入的文本
   * @returns 是否插入成功
   */
  insertTextAtCursor(text: string): boolean | Promise<boolean>;
}

export const IEditorServiceId: symbol = Symbol('IEditorService');

