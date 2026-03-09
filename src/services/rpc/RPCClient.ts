import { Disposable } from '../../base/common/disposable';
import type { IRPCChannel, RPCRequest, RPCResponse, IRPCClient } from '../../platform/rpc/rpc';

/**
 * RPC 客户端实现
 * 用于 Sidepanel/Popup 调用 Content Script 的方法
 */
export class RPCClient extends Disposable implements IRPCClient {
  private readonly pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: number;
  }>();

  private requestIdCounter = 0;
  private connected = false;
  private readonly timeout: number;

  constructor(
    private readonly channel: IRPCChannel,
    options: { timeout?: number } = {}
  ) {
    super();
    this.timeout = options.timeout ?? 30000; // 默认 30 秒超时

    // 监听响应消息
    this.channel.onMessage((message) => {
      if (message.type === 'rpc-response') {
        this.handleResponse(message);
      }
    });

    this.connected = true;
  }

  /**
   * 调用远程方法
   */
  async call<T = any>(method: string, ...args: any[]): Promise<T> {
    if (!this.connected) {
      throw new Error('RPC client is not connected');
    }

    const id = this.generateRequestId();
    const request: RPCRequest = {
      type: 'rpc-request',
      id,
      method,
      args
    };

    return new Promise<T>((resolve, reject) => {
      // 设置超时
      const timeoutHandle = window.setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC call timeout: ${method}`));
      }, this.timeout);

      // 保存待处理的请求
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutHandle
      });

      // 发送请求
      try {
        this.channel.send(request);
      } catch (error) {
        this.pendingRequests.delete(id);
        window.clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 处理响应消息
   */
  private handleResponse(response: RPCResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn('Received response for unknown request:', response.id);
      return;
    }

    // 清除超时
    window.clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    // 处理结果
    if (response.success) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error || 'RPC call failed'));
    }
  }

  /**
   * 生成请求 ID
   */
  private generateRequestId(): string {
    return `rpc-${Date.now()}-${++this.requestIdCounter}`;
  }

  /**
   * 清理资源
   */
  override dispose(): void {
    this.connected = false;

    // 拒绝所有待处理的请求
    for (const [id, pending] of this.pendingRequests) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error('RPC client disposed'));
    }
    this.pendingRequests.clear();

    super.dispose();
  }
}
