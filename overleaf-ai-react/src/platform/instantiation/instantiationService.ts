import type { ServiceIdentifier } from './serviceCollection';
import { ServiceCollection } from './serviceCollection';
import { ServiceDescriptor, getServiceDependencies } from './descriptors';

/**
 * InstantiationService - 依赖注入容器核心
 * 负责自动解析依赖并创建服务实例
 */
export class InstantiationService {
  private readonly services: ServiceCollection;
  private readonly descriptors = new Map<ServiceIdentifier<any>, ServiceDescriptor<any>>();
  private readonly creating = new Set<ServiceIdentifier<any>>(); // 检测循环依赖

  constructor(services: ServiceCollection = new ServiceCollection()) {
    this.services = services;
  }

  /**
   * 注册服务描述符（延迟创建）
   */
  registerDescriptor<T>(descriptor: ServiceDescriptor<T>): void {
    this.descriptors.set(descriptor.id, descriptor);
  }

  /**
   * 注册服务实例（立即可用）
   */
  registerInstance<T>(id: ServiceIdentifier<T>, instance: T): void {
    this.services.set(id, instance);
  }

  /**
   * 获取或创建服务实例
   */
  getService<T>(id: ServiceIdentifier<T>): T {
    // 1. 先查找已创建的实例
    try {
      return this.services.get(id);
    } catch {
      // 实例不存在，继续查找描述符
    }

    // 2. 查找服务描述符
    const descriptor = this.descriptors.get(id);
    if (!descriptor) {
      throw new Error(`Service not registered: ${id.toString()}`);
    }

    // 3. 检测循环依赖
    if (this.creating.has(id)) {
      throw new Error(`Circular dependency detected for service: ${id.toString()}`);
    }

    // 4. 创建服务实例
    this.creating.add(id);
    try {
      const instance = this.createInstance(descriptor.ctor, descriptor.dependencies);
      this.services.set(id, instance);
      return instance;
    } finally {
      this.creating.delete(id);
    }
  }

  /**
   * 创建类实例（自动注入依赖）
   */
  createInstance<T>(ctor: new (...args: any[]) => T, explicitDeps?: ServiceIdentifier<any>[]): T {
    // 获取依赖列表（优先使用显式声明的依赖）
    const dependencies = explicitDeps || getServiceDependencies(ctor);

    // 递归解析所有依赖
    const args = dependencies.map((depId) => this.getService(depId));

    // 创建实例
    return new ctor(...args);
  }

  /**
   * 调用方法并自动注入依赖
   */
  invokeFunction<T>(fn: Function, ...explicitArgs: any[]): T {
    // 简单实现：不解析函数参数依赖，只传递显式参数
    return fn(...explicitArgs) as T;
  }

  /**
   * 创建子容器（继承父容器的服务）
   */
  createChild(): InstantiationService {
    const child = new InstantiationService(this.services);
    // 复制描述符到子容器
    this.descriptors.forEach((descriptor, id) => {
      child.descriptors.set(id, descriptor);
    });
    return child;
  }
}
