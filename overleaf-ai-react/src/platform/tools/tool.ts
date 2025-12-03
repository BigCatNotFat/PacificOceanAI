import type { IEditorService } from '../editor/editor';

export interface ToolExecutionContext {
  editor: IEditorService;
}

export interface ToolResult {
  type: 'text' | 'json';
  content: string | unknown;
}

export interface ITool {
  readonly id: string;
  readonly description: string;

  execute(input: unknown, context: ToolExecutionContext): Promise<ToolResult>;
}

