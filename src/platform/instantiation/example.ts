/**
 * DI 系统使用示例
 * 
 * 此文件展示如何使用依赖注入系统
 */

import { InstantiationService, ServiceDescriptor, injectable } from './index';
import type { ServiceIdentifier } from './index';

// ============================================
// 1. 定义服务接口和标识符
// ============================================

export interface ILogService {
  log(message: string): void;
}

export const ILogServiceId: ServiceIdentifier<ILogService> = Symbol('ILogService');

export interface IConfigService {
  get(key: string): string | null;
}

export const IConfigServiceId: ServiceIdentifier<IConfigService> = Symbol('IConfigService');

// ============================================
// 2. 实现服务类（使用 @injectable 装饰器）
// ============================================

// LogService 没有依赖
@injectable()
export class LogService implements ILogService {
  log(message: string): void {
    console.log(`[LOG] ${message}`);
  }
}

// ConfigService 依赖 ILogService
@injectable(ILogServiceId)
export class ConfigService implements IConfigService {
  constructor(private readonly logService: ILogService) {}

  get(key: string): string | null {
    this.logService.log(`Getting config: ${key}`);
    return `value_of_${key}`;
  }
}

// ============================================
// 3. 使用 DI 容器
// ============================================

export function exampleUsage() {
  // 创建 DI 容器
  const instantiation = new InstantiationService();

  // 注册服务描述符（推荐方式 - 延迟创建）
  instantiation.registerDescriptor(
    new ServiceDescriptor(ILogServiceId, LogService)
  );

  instantiation.registerDescriptor(
    new ServiceDescriptor(IConfigServiceId, ConfigService, [ILogServiceId])
  );

  // 获取服务（自动创建并注入依赖）
  const configService = instantiation.getService<IConfigService>(IConfigServiceId);
  configService.get('theme'); // 输出: [LOG] Getting config: theme

  // 或者：直接注册实例（已创建好的实例）
  const logService = new LogService();
  instantiation.registerInstance(ILogServiceId, logService);

  // 手动创建实例（用于非单例场景）
  const anotherConfig = instantiation.createInstance<IConfigService>(ConfigService, [ILogServiceId]);
  anotherConfig.get('language');
}

// ============================================
// 4. React 中的使用模式
// ============================================

/**
 * 在 React 中，通常有两种使用模式：
 * 
 * 模式 A：通过 Context 传递 DI 容器
 * ```tsx
 * const DIContext = React.createContext<InstantiationService>(null!);
 * 
 * function useService<T>(id: ServiceIdentifier<T>): T {
 *   const di = useContext(DIContext);
 *   return useMemo(() => di.getService(id), [di, id]);
 * }
 * 
 * // 在组件中使用
 * function MyComponent() {
 *   const configService = useService(IConfigServiceId);
 *   // ...
 * }
 * ```
 * 
 * 模式 B：使用全局单例（简化版）
 * ```tsx
 * export const globalDI = new InstantiationService();
 * // 在应用启动时注册所有服务
 * 
 * function useService<T>(id: ServiceIdentifier<T>): T {
 *   return useMemo(() => globalDI.getService(id), [id]);
 * }
 * ```
 */
