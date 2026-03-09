import { Disposable } from '../../base/common/disposable';
import { Emitter } from '../../base/common/event';
import type { Event } from '../../base/common/event';
import type { IStorageAdapter } from '../../base/browser/storage';
import { ChromeStorageAdapter, StorageScope } from '../../base/browser/storage';
import type { IStorageService, StorageChangeEvent } from '../../platform/storage/storage';
import { injectable } from '../../platform/instantiation';

/**
 * 存储服务实现
 * 
 * 职责：
 * - 封装底层存储 API
 * - 提供类型安全的读写接口
 * - 发射存储变化事件
 * - 管理存储监听器生命周期
 */
@injectable()
export class StorageService extends Disposable implements IStorageService {
  private readonly _onDidChangeStorage = new Emitter<StorageChangeEvent>();
  readonly onDidChangeStorage: Event<StorageChangeEvent> = this._onDidChangeStorage.event;

  private adapter: IStorageAdapter;

  constructor(
    scope: StorageScope = StorageScope.LOCAL,
    adapter?: IStorageAdapter
  ) {
    super();
    
    // 允许注入自定义适配器（方便测试）
    this.adapter = adapter || new ChromeStorageAdapter(scope);
    
    // 监听 Chrome Storage 变化
    this.setupStorageListener();
  }

  /**
   * 设置存储变化监听器
   */
  private setupStorageListener(): void {
    try {
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

        // 注册清理函数
        this._register({
          dispose: () => {
            try {
              if (chrome?.storage?.onChanged) {
                chrome.storage.onChanged.removeListener(listener);
              }
            } catch (error) {
              console.warn('[StorageService] Failed to remove storage listener:', error);
            }
          }
        });
      } else {
        console.warn('[StorageService] Chrome storage change listener not available');
      }
    } catch (error) {
      console.warn('[StorageService] Failed to setup storage listener:', error);
    }
  }

  async get<T = any>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const value = await this.adapter.get<T>(key);
      return value !== undefined ? value : defaultValue;
    } catch (error) {
      console.error(`[StorageService] Failed to get key "${key}":`, error);
      return defaultValue;
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    try {
      await this.adapter.set(key, value);
    } catch (error) {
      console.error(`[StorageService] Failed to set key "${key}":`, error);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.adapter.remove(key);
    } catch (error) {
      console.error(`[StorageService] Failed to remove key "${key}":`, error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.adapter.clear();
    } catch (error) {
      console.error('[StorageService] Failed to clear storage:', error);
      throw error;
    }
  }

  async keys(): Promise<string[]> {
    try {
      const all = await this.adapter.getAll();
      return Object.keys(all);
    } catch (error) {
      console.error('[StorageService] Failed to get keys:', error);
      return [];
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const value = await this.adapter.get(key);
      return value !== undefined;
    } catch (error) {
      console.error(`[StorageService] Failed to check key "${key}":`, error);
      return false;
    }
  }

  async getByPrefix(prefix: string): Promise<{ [key: string]: any }> {
    try {
      const all = await this.adapter.getAll();
      const result: { [key: string]: any } = {};
      
      for (const key in all) {
        if (key.startsWith(prefix)) {
          result[key] = all[key];
        }
      }
      
      return result;
    } catch (error) {
      console.error(`[StorageService] Failed to get by prefix "${prefix}":`, error);
      return {};
    }
  }

  override dispose(): void {
    this._onDidChangeStorage.dispose();
    super.dispose();
  }
}
