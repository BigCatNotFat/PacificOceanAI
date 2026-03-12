import { Disposable } from '../../base/common/disposable';
import type { IRPCChannel, RPCRequest, RPCResponse, IRPCServer } from '../../platform/rpc/rpc';

/**
 * RPC 服务端实现
 * 用于 Content Script 接收并处理来自 Sidepanel/Popup 的调用
 */
export class RPCServer extends Disposable implements IRPCServer {
  private readonly methods = new Map<string, (...args: any[]) => any | Promise<any>>();
  private running = false;

  constructor(private readonly channel: IRPCChannel) {
    super();
  }

  /**
   * 注册服务方法
   */
  registerMethod(name: string, handler: (...args: any[]) => any | Promise<any>): void {
    if (this.methods.has(name)) {
    }
    this.methods.set(name, handler);
  }

  /**
   * 批量注册服务对象的所有方法
   */
  registerService(service: any, methodNames?: string[]): void {
    const names = methodNames || Object.getOwnPropertyNames(Object.getPrototypeOf(service));
    
    for (const name of names) {
      if (name === 'constructor' || typeof service[name] !== 'function') {
        continue;
      }

      // 绑定方法到服务实例
      this.registerMethod(name, (...args: any[]) => {
        return service[name](...args);
      });
    }
  }

  /**
   * 启动服务器
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;

    // 监听请求消息
    this.channel.onMessage((message) => {
      if (message.type === 'rpc-request') {
        this.handleRequest(message);
      }
    });

  }

  /**
   * 停止服务器
   */
  stop(): void {
    this.running = false;
  }

  /**
   * 处理请求消息
   */
  private async handleRequest(request: RPCRequest): Promise<void> {
    const { id, method, args } = request;

    try {
      // 查找方法
      const handler = this.methods.get(method);
      if (!handler) {
        throw new Error(`Method "${method}" is not registered`);
      }

      // 执行方法
      const result = await handler(...args);

      // 发送成功响应
      const response: RPCResponse = {
        type: 'rpc-response',
        id,
        success: true,
        result
      };
      this.channel.send(response);

    } catch (error) {
      // 发送错误响应
      const response: RPCResponse = {
        type: 'rpc-response',
        id,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
      this.channel.send(response);

    }
  }

  /**
   * 清理资源
   */
  override dispose(): void {
    this.stop();
    this.methods.clear();
    super.dispose();
  }
}
