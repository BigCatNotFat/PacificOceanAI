/**
 * Dependency Injection (DI) 依赖注入系统
 * 
 * 核心概念：
 * - ServiceIdentifier: 服务的唯一标识符（Symbol）
 * - ServiceCollection: 服务实例容器
 * - ServiceDescriptor: 服务描述符（如何创建服务）
 * - InstantiationService: DI 容器核心（自动解析依赖）
 * - @injectable: 装饰器，声明类的依赖
 */

export type { ServiceIdentifier } from './serviceCollection';
export { ServiceCollection } from './serviceCollection';
export { ServiceDescriptor, injectable, getServiceDependencies } from './descriptors';
export { InstantiationService } from './instantiationService';
