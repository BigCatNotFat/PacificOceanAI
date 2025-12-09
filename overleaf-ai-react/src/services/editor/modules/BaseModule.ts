/**
 * 模块基类
 * 所有功能模块都继承自此类
 */

import type { OverleafBridgeClient } from '../bridge';

export abstract class BaseModule {
  constructor(protected bridge: OverleafBridgeClient) {}

  /**
   * 调用桥接方法的便捷封装
   */
  protected call<T>(method: string, ...args: any[]): Promise<T> {
    return this.bridge.call<T>(method, ...args);
  }
}
