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
import { isAgentDebugEnabled, logger } from '../../../utils/logger';

export class OverleafBridgeClient {
  private static instance: OverleafBridgeClient | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestIdCounter = 0;
  private injected = false;
  private consolePatched = false;
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
    // 先确保 console 过滤补丁生效（即使脚本已注入过，也要确保刷屏日志被屏蔽）
    this.injectConsoleFilterScript();

    if (this.injected) {
      logger.debug('[OverleafBridgeClient] Script already injected');
      return;
    }

    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected/generated/overleafBridge.js');
      script.onload = () => {
        logger.debug('[OverleafBridgeClient] Bridge script injected successfully');
        this.injected = true;
      };
      script.onerror = (error) => {
        logger.error('[OverleafBridgeClient] Failed to inject bridge script:', error);
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      logger.error('[OverleafBridgeClient] Error injecting script:', error);
    }
  }

  /**
   * 注入一个极小的补丁到页面主世界：过滤掉 `[OverleafBridge] ...` 这类调试日志。
   *
   * 说明：
   * - 这些日志来源于自动生成的 injected 脚本（用户要求不直接改 generated 文件）
   * - 因此这里通过“先注入补丁脚本，再注入 bridge 脚本”的方式实现静音
   */
  private injectConsoleFilterScript(): void {
    if (this.consolePatched) return;
    this.consolePatched = true;

    try {
      // 如果用户显式开启 debug，就不要在主世界做任何 console 过滤，方便排查问题
      if (isAgentDebugEnabled()) return;

      const patch = document.createElement('script');
      patch.type = 'text/javascript';
      patch.textContent = `
(function () {
  try {
    if (window.__OVERLEAF_BRIDGE_CONSOLE_PATCHED__) return;
    window.__OVERLEAF_BRIDGE_CONSOLE_PATCHED__ = true;

    function shouldMute(args) {
      try {
        if (!args || !args.length) return false;
        for (var i = 0; i < args.length; i++) {
          var a = args[i];
          if (typeof a !== 'string') continue;
          // 只过滤本扩展注入脚本的日志前缀，避免影响 Overleaf 网站自身日志
          if (
            a.indexOf('OverleafBridge') !== -1 ||
            a.indexOf('DiffAPI') !== -1 ||
            a.indexOf('InlineStatus') !== -1 ||
            a.indexOf('ReviewTooltipInjector') !== -1 ||
            a.indexOf('CiteTooltip') !== -1 ||
            a.indexOf('SelectionTooltip') !== -1
          ) return true;
        }
      } catch (e) {}
      return false;
    }

    var origLog = console.log;
    var origInfo = console.info;
    var origDebug = console.debug;
    var origWarn = console.warn;
    var origError = console.error;

    console.log = function () {
      if (shouldMute(arguments)) return;
      return origLog.apply(console, arguments);
    };
    console.info = function () {
      if (shouldMute(arguments)) return;
      return origInfo.apply(console, arguments);
    };
    console.debug = function () {
      if (shouldMute(arguments)) return;
      return origDebug.apply(console, arguments);
    };
    console.warn = function () {
      if (shouldMute(arguments)) return;
      return origWarn.apply(console, arguments);
    };
    console.error = function () {
      if (shouldMute(arguments)) return;
      return origError.apply(console, arguments);
    };
  } catch (e) {}
})();`;

      (document.head || document.documentElement).appendChild(patch);
    } catch (e) {
      // 静默失败：不影响桥接功能
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
      logger.warn('[OverleafBridgeClient] Received response for unknown request:', data.requestId);
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
