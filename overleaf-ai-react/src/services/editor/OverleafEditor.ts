/**
 * Overleaf Editor 统一门面
 * 提供模块化的编辑器 API 访问
 * 
 * @example
 * ```typescript
 * import { overleafEditor } from './OverleafEditor';
 * 
 * // 文档操作
 * const text = await overleafEditor.document.getText();
 * const lines = await overleafEditor.document.readLines(1, 10);
 * 
 * // 选区操作
 * const selection = await overleafEditor.selection.getSelection();
 * const cursor = await overleafEditor.selection.getCursorPosition();
 * 
 * // 编辑操作
 * await overleafEditor.editor.insertText('Hello');
 * await overleafEditor.editor.replaceRange(0, 5, 'World');
 * 
 * // 文件信息
 * const info = await overleafEditor.file.getInfo();
 * 
 * // 项目操作
 * const fileTree = await overleafEditor.project.getFileTree();
 * const docs = await overleafEditor.project.getDocuments();
 * ```
 */

import { OverleafBridgeClient } from './bridge';
import {
  DocumentModule,
  EditorModule,
  SelectionModule,
  FileModule,
  ProjectModule
} from './modules';

export class OverleafEditor {
  private static instance: OverleafEditor | null = null;
  private bridge: OverleafBridgeClient;

  /** 文档操作模块 */
  readonly document: DocumentModule;
  /** 编辑器操作模块 */
  readonly editor: EditorModule;
  /** 选区/光标操作模块 */
  readonly selection: SelectionModule;
  /** 文件信息模块 */
  readonly file: FileModule;
  /** 项目模块（文件树等） */
  readonly project: ProjectModule;

  private constructor(bridge: OverleafBridgeClient) {
    this.bridge = bridge;
    this.document = new DocumentModule(bridge);
    this.editor = new EditorModule(bridge);
    this.selection = new SelectionModule(bridge);
    this.file = new FileModule(bridge);
    this.project = new ProjectModule(bridge);
  }

  static getInstance(): OverleafEditor {
    if (!OverleafEditor.instance) {
      OverleafEditor.instance = new OverleafEditor(
        OverleafBridgeClient.getInstance()
      );
    }
    return OverleafEditor.instance;
  }

  /**
   * 注入桥接脚本到页面主世界
   */
  injectScript(): void {
    this.bridge.injectScript();
  }

  /**
   * 获取底层桥接客户端（用于高级用法或扩展）
   */
  getBridge(): OverleafBridgeClient {
    return this.bridge;
  }
}

// 导出单例
export const overleafEditor = OverleafEditor.getInstance();
