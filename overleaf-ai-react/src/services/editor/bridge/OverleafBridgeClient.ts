/**
 * Overleaf Bridge Client
 * Content Script 端的桥接客户端，用于与注入到主世界的脚本通信
 * 
 * 这是核心通信层，只负责消息的收发，不包含业务逻辑
 */

import type {
  OverleafBridgeRequest,
  OverleafBridgeResponse,
  PendingRequest
} from './types';

export class OverleafBridgeClient {
  private static instance: OverleafBridgeClient | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestIdCounter = 0;
  private injected = false;
  private readonly defaultTimeout = 10000; // 10秒超时

  private constructor() {
    // 监听来自注入脚本的响应
    window.addEventListener('message', this.handleMessage.bind(this));
  }

  static getInstance(): OverleafBridgeClient {
    if (!OverleafBridgeClient.instance) {
      OverleafBridgeClient.instance = new OverleafBridgeClient();
    }
    return OverleafBridgeClient.instance;
  }

  /**
   * 注入桥接脚本到页面主世界
   */
  injectScript(): void {
    if (this.injected) {
      console.log('[OverleafBridgeClient] Script already injected');
      return;
    }

    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected/overleafBridge.js');
      script.onload = () => {
        console.log('[OverleafBridgeClient] Bridge script injected successfully');
        this.injected = true;
      };
      script.onerror = (error) => {
        console.error('[OverleafBridgeClient] Failed to inject bridge script:', error);
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.error('[OverleafBridgeClient] Error injecting script:', error);
    }
  }

  /**
   * 处理来自注入脚本的消息
   */
  private handleMessage(event: MessageEvent): void {
    if (event.source !== window) return;

    const data = event.data as OverleafBridgeResponse;
    if (data?.type !== 'OVERLEAF_BRIDGE_RESPONSE') return;

    const pending = this.pendingRequests.get(data.requestId);
    if (!pending) {
      console.warn('[OverleafBridgeClient] Received response for unknown request:', data.requestId);
      return;
    }

    // 清除超时和待处理请求
    window.clearTimeout(pending.timeout);
    this.pendingRequests.delete(data.requestId);

    // 处理响应
    if (data.success) {
      pending.resolve(data.result);
    } else {
      pending.reject(new Error(data.error || 'Bridge call failed'));
    }
  }

  /**
   * 调用注入脚本中的方法
   */
  async call<T = any>(method: string, ...args: any[]): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const requestId = `bridge-${Date.now()}-${++this.requestIdCounter}`;

      // 设置超时
      const timeout = window.setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Bridge call timeout: ${method}`));
      }, this.defaultTimeout);

      // 保存待处理请求
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // 发送请求
      const request: OverleafBridgeRequest = {
        type: 'OVERLEAF_BRIDGE_REQUEST',
        requestId,
        method,
        args
      };

      window.postMessage(request, '*');
    });
  }
}
