/**
 * 存储类型
 */
export enum StorageScope {
  /** 本地存储，不同步 */
  LOCAL = 'local',
  /** 同步存储，跨设备 */
  SYNC = 'sync',
  /** Session 存储，浏览器关闭后清除 */
  SESSION = 'session'
}

/**
 * 存储适配器接口
 * 抽象存储操作，方便测试和多环境支持
 */
export interface IStorageAdapter {
  get<T = any>(key: string): Promise<T | undefined>;
  set<T = any>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  getAll(): Promise<{ [key: string]: any }>;
}

/**
 * Chrome Storage API 适配器
 */
export class ChromeStorageAdapter implements IStorageAdapter {
  private storage: chrome.storage.StorageArea | null = null;
  private isAvailable: boolean = false;

  constructor(scope: StorageScope = StorageScope.LOCAL) {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        this.isAvailable = false;
        return;
      }
      
      switch (scope) {
        case StorageScope.LOCAL:
          this.storage = chrome.storage.local;
          break;
        case StorageScope.SYNC:
          this.storage = chrome.storage.sync;
          break;
        case StorageScope.SESSION:
          this.storage = chrome.storage.session;
          break;
      }
      
      this.isAvailable = true;
    } catch (error) {
      this.isAvailable = false;
    }
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    if (!this.isAvailable || !this.storage) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      this.storage!.get(key, (items) => {
        resolve(items[key] as T | undefined);
      });
    });
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    if (!this.isAvailable || !this.storage) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.storage!.set({ [key]: value }, () => {
        resolve();
      });
    });
  }

  async remove(key: string): Promise<void> {
    if (!this.isAvailable || !this.storage) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.storage!.remove(key, () => {
        resolve();
      });
    });
  }

  async clear(): Promise<void> {
    if (!this.isAvailable || !this.storage) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.storage!.clear(() => {
        resolve();
      });
    });
  }

  async getAll(): Promise<{ [key: string]: any }> {
    if (!this.isAvailable || !this.storage) {
      return Promise.resolve({});
    }
    return new Promise((resolve) => {
      this.storage!.get(null, (items) => {
        resolve(items || {});
      });
    });
  }
}

/**
 * 内存存储适配器（用于测试）
 */
export class InMemoryStorageAdapter implements IStorageAdapter {
  private data: Map<string, any> = new Map();

  async get<T = any>(key: string): Promise<T | undefined> {
    return this.data.get(key);
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  async getAll(): Promise<{ [key: string]: any }> {
    const result: { [key: string]: any } = {};
    this.data.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}
