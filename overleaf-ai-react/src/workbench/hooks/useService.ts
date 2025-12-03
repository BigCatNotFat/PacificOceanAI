import { useMemo } from 'react';
import type { ServiceIdentifier } from '../../platform/instantiation';
import { useDIContainer } from '../context/DIContext';

/**
 * useService Hook
 * 
 * 在 React 组件中获取服务实例
 * 服务实例会被缓存，只在首次调用时创建
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const editorService = useService(IEditorServiceId);
 *   
 *   const handleClick = async () => {
 *     const fileName = await editorService.getCurrentFileName();
 *     console.log(fileName);
 *   };
 *   
 *   return <button onClick={handleClick}>Get File Name</button>;
 * }
 * ```
 */
export function useService<T>(serviceId: ServiceIdentifier<T>): T {
  const container = useDIContainer();
  
  // 使用 useMemo 缓存服务实例
  // 只在 container 或 serviceId 变化时重新获取
  return useMemo(() => {
    return container.getService<T>(serviceId);
  }, [container, serviceId]);
}
