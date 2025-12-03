import type { ServiceIdentifier } from './serviceCollection';

/**
 * 服务描述符 - 描述如何创建服务实例
 */
export class ServiceDescriptor<T> {
  constructor(
    public readonly id: ServiceIdentifier<T>,
    public readonly ctor: new (...args: any[]) => T,
    public readonly dependencies: ServiceIdentifier<any>[] = []
  ) {}
}

/**
 * 存储服务构造函数的依赖信息
 */
const SERVICE_DEPENDENCIES = new Map<Function, ServiceIdentifier<any>[]>();

/**
 * @injectable 装饰器 - 标记类可以被依赖注入
 * 用法：@injectable(IServiceId1, IServiceId2, ...)
 */
export function injectable(...dependencies: ServiceIdentifier<any>[]): ClassDecorator {
  return (target: Function) => {
    SERVICE_DEPENDENCIES.set(target, dependencies);
  };
}

/**
 * 获取服务的依赖列表
 */
export function getServiceDependencies(ctor: Function): ServiceIdentifier<any>[] {
  return SERVICE_DEPENDENCIES.get(ctor) || [];
}
