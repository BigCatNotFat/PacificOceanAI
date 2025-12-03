import React, { createContext, useContext, ReactNode } from 'react';
import type { InstantiationService } from '../../platform/instantiation';

/**
 * DI 容器的 React Context
 * 用于在组件树中共享 InstantiationService 实例
 */
const DIContext = createContext<InstantiationService | null>(null);

/**
 * DI Provider 组件
 * 在应用根部提供 DI 容器
 */
export interface DIProviderProps {
  container: InstantiationService;
  children: ReactNode;
}

export function DIProvider({ container, children }: DIProviderProps) {
  return <DIContext.Provider value={container}>{children}</DIContext.Provider>;
}

/**
 * 获取 DI 容器实例
 * @throws 如果不在 DIProvider 内部调用
 */
export function useDIContainer(): InstantiationService {
  const container = useContext(DIContext);
  if (!container) {
    throw new Error('useDIContainer must be used within a DIProvider');
  }
  return container;
}
