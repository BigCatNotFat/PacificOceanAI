import { useEffect, useState } from 'react';
import type { Event } from '../../base/common/event';

/**
 * useServiceEvent Hook
 * 
 * 自动订阅服务事件，并在事件触发时更新 React State
 * 组件卸载时自动取消订阅，防止内存泄漏
 * 
 * @param event - 服务的事件（onDidXxx）
 * @param initialValue - 初始值
 * @returns 当前事件值
 * 
 * @example
 * ```tsx
 * function FileNameDisplay() {
 *   const editorService = useService(IEditorServiceId);
 *   
 *   // 自动订阅文件变化事件
 *   const currentFile = useServiceEvent(
 *     editorService.onDidChangeActiveFile,
 *     null
 *   );
 *   
 *   return <div>Current File: {currentFile || 'None'}</div>;
 * }
 * ```
 */
export function useServiceEvent<T>(
  event: Event<T>,
  initialValue: T
): T {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    // 订阅事件
    const disposable = event((newValue) => {
      setValue(newValue);
    });

    // 组件卸载时取消订阅
    return () => {
      disposable.dispose();
    };
  }, [event]);

  return value;
}

/**
 * useServiceEventWithCallback Hook
 * 
 * 订阅服务事件，并在事件触发时执行回调
 * 不更新 State，适合副作用场景
 * 
 * @param event - 服务的事件
 * @param callback - 事件触发时的回调函数
 * 
 * @example
 * ```tsx
 * function NotificationHandler() {
 *   const logService = useService(ILogServiceId);
 *   
 *   useServiceEventWithCallback(
 *     logService.onDidLogError,
 *     (error) => {
 *       toast.error(error.message);
 *     }
 *   );
 *   
 *   return <div>Monitoring errors...</div>;
 * }
 * ```
 */
export function useServiceEventWithCallback<T>(
  event: Event<T>,
  callback: (value: T) => void
): void {
  useEffect(() => {
    const disposable = event(callback);
    return () => disposable.dispose();
  }, [event, callback]);
}

/**
 * useServiceEventArray Hook
 * 
 * 订阅事件并将每次触发的值累积到数组中
 * 适合日志、历史记录等场景
 * 
 * @param event - 服务的事件
 * @param maxLength - 最大长度（可选）
 * @returns 事件值数组
 * 
 * @example
 * ```tsx
 * function LogViewer() {
 *   const logService = useService(ILogServiceId);
 *   const logs = useServiceEventArray(logService.onDidLog, 100);
 *   
 *   return (
 *     <div>
 *       {logs.map((log, i) => <div key={i}>{log}</div>)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useServiceEventArray<T>(
  event: Event<T>,
  maxLength?: number
): T[] {
  const [values, setValues] = useState<T[]>([]);

  useEffect(() => {
    const disposable = event((newValue) => {
      setValues((prev) => {
        const next = [...prev, newValue];
        // 限制数组长度
        if (maxLength && next.length > maxLength) {
          return next.slice(-maxLength);
        }
        return next;
      });
    });

    return () => disposable.dispose();
  }, [event, maxLength]);

  return values;
}
