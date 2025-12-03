import { useState, useEffect, useCallback } from 'react';
import { useService } from './useService';
import { IStorageServiceId } from '../../platform/storage/storage';
import type { IStorageService } from '../../platform/storage/storage';

/**
 * 类似 React useState，但数据持久化到存储中
 * 
 * 特性：
 * - 自动加载初始值
 * - 自动监听存储变化（跨组件同步）
 * - 类型安全
 * 
 * @param key 存储键
 * @param defaultValue 默认值
 * @returns [value, setValue] 元组
 * 
 * @example
 * ```tsx
 * function UserProfile() {
 *   const [name, setName] = useStorage('user.name', 'Guest');
 *   
 *   return (
 *     <input 
 *       value={name} 
 *       onChange={(e) => setName(e.target.value)} 
 *     />
 *   );
 * }
 * ```
 */
export function useStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => Promise<void>] {
  const storageService = useService<IStorageService>(IStorageServiceId);
  const [value, setValue] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);

  // 初始加载
  useEffect(() => {
    let cancelled = false;
    
    storageService.get<T>(key, defaultValue).then((loadedValue) => {
      if (!cancelled) {
        setValue(loadedValue ?? defaultValue);
        setIsLoaded(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [key, storageService]);

  // 监听存储变化（其他组件或标签页的更新）
  useEffect(() => {
    if (!isLoaded) return;

    const disposable = storageService.onDidChangeStorage((change) => {
      if (change.key === key) {
        setValue(change.newValue ?? defaultValue);
      }
    });

    return () => disposable.dispose();
  }, [key, isLoaded, storageService, defaultValue]);

  // 设置值
  const setStoredValue = useCallback(
    async (newValue: T) => {
      try {
        await storageService.set(key, newValue);
        setValue(newValue);
      } catch (error) {
        console.error(`[useStorage] Failed to set key "${key}":`, error);
        throw error;
      }
    },
    [key, storageService]
  );

  return [value, setStoredValue];
}

/**
 * 获取存储值（只读，不监听变化）
 * 
 * @param key 存储键
 * @param defaultValue 默认值
 * @returns 存储值
 * 
 * @example
 * ```tsx
 * function Component() {
 *   const theme = useStorageValue('ui.theme', 'light');
 *   return <div className={theme}>Content</div>;
 * }
 * ```
 */
export function useStorageValue<T>(key: string, defaultValue: T): T {
  const storageService = useService<IStorageService>(IStorageServiceId);
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    let cancelled = false;
    
    storageService.get<T>(key, defaultValue).then((loadedValue) => {
      if (!cancelled) {
        setValue(loadedValue ?? defaultValue);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [key, storageService, defaultValue]);

  return value;
}

/**
 * 获取所有指定前缀的存储项
 * 
 * @param prefix 键前缀
 * @returns 存储项对象
 * 
 * @example
 * ```tsx
 * function SettingsPanel() {
 *   const userSettings = useStorageByPrefix('user.');
 *   // { 'user.name': 'Alice', 'user.email': 'alice@example.com' }
 * }
 * ```
 */
export function useStorageByPrefix(prefix: string): { [key: string]: any } {
  const storageService = useService<IStorageService>(IStorageServiceId);
  const [items, setItems] = useState<{ [key: string]: any }>({});

  useEffect(() => {
    let cancelled = false;
    
    storageService.getByPrefix(prefix).then((loadedItems) => {
      if (!cancelled) {
        setItems(loadedItems);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [prefix, storageService]);

  // 监听变化
  useEffect(() => {
    const disposable = storageService.onDidChangeStorage((change) => {
      if (change.key.startsWith(prefix)) {
        // 重新加载所有项
        storageService.getByPrefix(prefix).then(setItems);
      }
    });

    return () => disposable.dispose();
  }, [prefix, storageService]);

  return items;
}
