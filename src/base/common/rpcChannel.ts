import type { IRPCChannel, RPCMessage } from '../../platform/rpc/rpc';

/**
 * Chrome Runtime 消息通道
 * 使用 chrome.runtime.sendMessage 进行通信
 */
export class ChromeRuntimeChannel implements IRPCChannel {
  private messageHandler: ((message: RPCMessage) => void) | null = null;

  constructor() {
    // 监听来自其他上下文的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (this.isRPCMessage(message) && this.messageHandler) {
        this.messageHandler(message);
      }
      return false; // 同步返回，不保持消息通道
    });
  }

  send(message: RPCMessage): void {
    chrome.runtime.sendMessage(message).catch((error) => {
    });
  }

  onMessage(handler: (message: RPCMessage) => void): void {
    this.messageHandler = handler;
  }

  private isRPCMessage(message: any): message is RPCMessage {
    return (
      message &&
      typeof message === 'object' &&
      (message.type === 'rpc-request' || message.type === 'rpc-response')
    );
  }
}

/**
 * Chrome Tab 消息通道
 * 使用 chrome.tabs.sendMessage 向特定 Tab 发送消息
 */
export class ChromeTabChannel implements IRPCChannel {
  private messageHandler: ((message: RPCMessage) => void) | null = null;
  private tabId: number | null = null;

  constructor() {
    // 监听来自 Content Script 的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (this.isRPCMessage(message) && this.messageHandler) {
        // 记录发送者的 Tab ID，用于后续回复
        if (sender.tab?.id) {
          this.tabId = sender.tab.id;
        }
        this.messageHandler(message);
      }
      return false;
    });
  }

  async send(message: RPCMessage): Promise<void> {
    try {
      if (!this.tabId) {
        // 如果没有 tabId，尝试获取当前活动的 tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          this.tabId = tab.id;
        } else {
          throw new Error('No active tab found');
        }
      }

      await chrome.tabs.sendMessage(this.tabId, message);
    } catch (error) {
      throw error;
    }
  }

  onMessage(handler: (message: RPCMessage) => void): void {
    this.messageHandler = handler;
  }

  private isRPCMessage(message: any): message is RPCMessage {
    return (
      message &&
      typeof message === 'object' &&
      (message.type === 'rpc-request' || message.type === 'rpc-response')
    );
  }
}

/**
 * Window PostMessage 通道
 * 用于同一页面不同脚本上下文之间的通信（备用方案）
 */
export class WindowMessageChannel implements IRPCChannel {
  private messageHandler: ((message: RPCMessage) => void) | null = null;
  private readonly targetOrigin: string;

  constructor(targetOrigin = '*') {
    this.targetOrigin = targetOrigin;

    // 监听 window.postMessage
    window.addEventListener('message', (event) => {
      if (this.isRPCMessage(event.data) && this.messageHandler) {
        this.messageHandler(event.data);
      }
    });
  }

  send(message: RPCMessage): void {
    window.postMessage(message, this.targetOrigin);
  }

  onMessage(handler: (message: RPCMessage) => void): void {
    this.messageHandler = handler;
  }

  private isRPCMessage(message: any): message is RPCMessage {
    return (
      message &&
      typeof message === 'object' &&
      (message.type === 'rpc-request' || message.type === 'rpc-response')
    );
  }
}
