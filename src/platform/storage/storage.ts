import type { Event } from '../../base/common/event';

/**
 * 存储变化事件数据
 */
export interface StorageChangeEvent {
  key: string;
  oldValue?: any;
  newValue?: any;
}

/**
 * 存储服务接口
 * 
 * 提供类型安全的键值存储能力，支持：
 * - 异步读写操作
 * - 存储变化事件
 * - 键命名空间管理
 */
export interface IStorageService {
  /**
   * 存储项变化事件
   * 当任何键的值发生变化时触发
   */
  readonly onDidChangeStorage: Event<StorageChangeEvent>;

  /**
   * 获取存储值
   * @param key 存储键
   * @param defaultValue 默认值（当键不存在时返回）
   * @returns Promise<T>
   */
  get<T = any>(key: string, defaultValue?: T): Promise<T | undefined>;

  /**
   * 设置存储值
   * @param key 存储键
   * @param value 存储值
   */
  set<T = any>(key: string, value: T): Promise<void>;

  /**
   * 删除存储项
   * @param key 存储键
   */
  remove(key: string): Promise<void>;

  /**
   * 清空所有存储
   */
  clear(): Promise<void>;

  /**
   * 获取所有键
   */
  keys(): Promise<string[]>;

  /**
   * 判断键是否存在
   */
  has(key: string): Promise<boolean>;

  /**
   * 获取指定前缀的所有项
   * @param prefix 键前缀
   */
  getByPrefix(prefix: string): Promise<{ [key: string]: any }>;
}

/**
 * 存储服务标识符
 */
export const IStorageServiceId: symbol = Symbol('IStorageService');
