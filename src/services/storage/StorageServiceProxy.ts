import { Disposable } from '../../base/common/disposable';
import { Emitter } from '../../base/common/event';
import type { Event } from '../../base/common/event';
import type { IStorageService, StorageChangeEvent } from '../../platform/storage/storage';
import type { IRPCClient } from '../../platform/rpc/rpc';
import { injectable } from '../../platform/instantiation';
import { IRPCClientID } from '../../platform/rpc/rpc';

/**
 * 存储服务 RPC 代理
 * 
 * 用于 Sidepanel 环境，通过 RPC 调用 Content Script 中的存储服务
 * 
 * 注意：由于 chrome.storage API 在 Sidepanel 中也可用，
 * 事件监听直接在本地处理，无需通过 RPC
 */
@injectable(IRPCClientID)
export class StorageServiceProxy extends Disposable implements IStorageService {
  private readonly _onDidChangeStorage = new Emitter<StorageChangeEvent>();
  readonly onDidChangeStorage: Event<StorageChangeEvent> = this._onDidChangeStorage.event;

  constructor(private readonly rpcClient: IRPCClient) {
    super();
    
    // 直接在 Sidepanel 监听 chrome.storage 变化
    this.setupStorageListener();
  }

  /**
   * 在 Sidepanel 中直接监听存储变化
   * chrome.storage API 在所有上下文中都可用
   */
  private setupStorageListener(): void {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const listener = (
        changes: { [key: string]: chrome.storage.StorageChange },
        areaName: string
      ) => {
        for (const key in changes) {
          const change = changes[key];
          this._onDidChangeStorage.fire({
            key,
            oldValue: change.oldValue,
            newValue: change.newValue
          });
        }
      };

      chrome.storage.onChanged.addListener(listener);

      this._register({
        dispose: () => {
          if (chrome?.storage?.onChanged) {
            chrome.storage.onChanged.removeListener(listener);
          }
        }
      });
    }
  }

  async get<T = any>(key: string, defaultValue?: T): Promise<T | undefined> {
    return this.rpcClient.call('storage.get', key, defaultValue);
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    return this.rpcClient.call('storage.set', key, value);
  }

  async remove(key: string): Promise<void> {
    return this.rpcClient.call('storage.remove', key);
  }

  async clear(): Promise<void> {
    return this.rpcClient.call('storage.clear');
  }

  async keys(): Promise<string[]> {
    return this.rpcClient.call('storage.keys');
  }

  async has(key: string): Promise<boolean> {
    return this.rpcClient.call('storage.has', key);
  }

  async getByPrefix(prefix: string): Promise<{ [key: string]: any }> {
    return this.rpcClient.call('storage.getByPrefix', prefix);
  }

  override dispose(): void {
    this._onDidChangeStorage.dispose();
    super.dispose();
  }
}
