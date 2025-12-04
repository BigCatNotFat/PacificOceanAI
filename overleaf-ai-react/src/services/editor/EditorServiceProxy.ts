import { Disposable } from '../../base/common/disposable';
import { Emitter } from '../../base/common/event';
import type { Event } from '../../base/common/event';
import type { IEditorService, OutlineItem, FileTreeItem } from '../../platform/editor/editor';
import type { IRPCClient } from '../../platform/rpc/rpc';
import { injectable } from '../../platform/instantiation';
import { IRPCClientID } from '../../platform/rpc/rpc';

/**
 * EditorService RPC 代理
 * 在 Sidepanel 中使用，通过 RPC 调用 Content Script 的 OverleafEditorService
 */
@injectable(IRPCClientID)
export class EditorServiceProxy extends Disposable implements IEditorService {
  private readonly _onDidChangeActiveFile = new Emitter<string | null>();
  readonly onDidChangeActiveFile: Event<string | null> = this._onDidChangeActiveFile.event;

  private pollingInterval: number | null = null;
  private lastActiveFile: string | null = null;

  constructor(private readonly rpcClient: IRPCClient) {
    super();
    this.startFilePolling();
  }

  /**
   * 获取当前文件名
   */
  async getCurrentFileName(): Promise<string | null> {
    return this.rpcClient.call<string | null>('getCurrentFileName');
  }

  /**
   * 读取指定行
   */
  async readLine(lineNumber: number): Promise<string | null> {
    return this.rpcClient.call<string | null>('readLine', lineNumber);
  }

  /**
   * 读取所有行
   */
  async readAllLines(): Promise<string[]> {
    return this.rpcClient.call<string[]>('readAllLines');
  }

  /**
   * 获取编辑器完整文本
   */
  async getEditorFullText(targetFileName?: string): Promise<string> {
    return this.rpcClient.call<string>('getEditorFullText', targetFileName);
  }

  /**
   * 读取文件大纲
   */
  async readFileOutline(): Promise<OutlineItem[]> {
    return this.rpcClient.call<OutlineItem[]>('readFileOutline');
  }

  /**
   * 读取文件树
   */
  async readFileTree(): Promise<FileTreeItem[]> {
    return this.rpcClient.call<FileTreeItem[]>('readFileTree');
  }

  /**
   * 读取图片预览 URL
   */
  async readImagePreviewUrl(fileName: string): Promise<string | null> {
    return this.rpcClient.call<string | null>('readImagePreviewUrl', fileName);
  }

  /**
   * 在当前光标位置插入文本
   */
  async insertTextAtCursor(text: string): Promise<boolean> {
    return this.rpcClient.call<boolean>('insertTextAtCursor', text);
  }

  /**
   * 轮询检查活动文件变化
   * 因为 RPC 无法直接传递事件，所以使用轮询模拟
   */
  private startFilePolling(): void {
    this.pollingInterval = window.setInterval(async () => {
      try {
        const currentFile = await this.getCurrentFileName();
        if (currentFile !== this.lastActiveFile) {
          this.lastActiveFile = currentFile;
          this._onDidChangeActiveFile.fire(currentFile);
        }
      } catch (error) {
        console.error('Error polling active file:', error);
      }
    }, 1000); // 每秒检查一次
  }

  /**
   * 清理资源
   */
  override dispose(): void {
    if (this.pollingInterval !== null) {
      window.clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this._onDidChangeActiveFile.dispose();
    super.dispose();
  }
}
