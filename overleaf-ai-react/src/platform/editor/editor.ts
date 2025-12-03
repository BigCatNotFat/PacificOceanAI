import type { Event } from '../../base/common/event';

export type OutlineItem = { title: string; type: string; line: string | number; level: number };
export type FileTreeItem = { name: string; type: string; level: number; fileType: string };

export interface IEditorService {
  readonly onDidChangeActiveFile: Event<string | null>;

  getCurrentFileName(): string | null;
  readLine(lineNumber: number): string | null;
  readAllLines(): string[];
  getEditorFullText(targetFileName?: string): string;
  readFileOutline(): OutlineItem[];
  readFileTree(): FileTreeItem[];
  readImagePreviewUrl(fileName: string): Promise<string | null>;
}

export const IEditorServiceId: symbol = Symbol('IEditorService');

