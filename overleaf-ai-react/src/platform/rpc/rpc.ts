/**
 * RPC (Remote Procedure Call) 通信系统
 * 用于 Chrome 插件不同上下文之间的通信（Sidepanel ↔ Content Script）
 */

/**
 * RPC 请求消息
 */
export interface RPCRequest {
  type: 'rpc-request';
  id: string; // 请求唯一标识符
  method: string; // 调用的方法名
  args: any[]; // 方法参数
}

/**
 * RPC 响应消息
 */
export interface RPCResponse {
  type: 'rpc-response';
  id: string; // 对应的请求 ID
  success: boolean; // 是否成功
  result?: any; // 成功时的返回值
  error?: string; // 失败时的错误信息
}

/**
 * RPC 消息类型
 */
export type RPCMessage = RPCRequest | RPCResponse;

/**
 * RPC 通道接口
 * 定义如何发送和接收 RPC 消息
 */
export interface IRPCChannel {
  /**
   * 发送消息
   */
  send(message: RPCMessage): void;

  /**
   * 监听消息
   */
  onMessage(handler: (message: RPCMessage) => void): void;
}

/**
 * RPC 服务端接口
 * 在 Content Script 中实现，接收并处理 RPC 请求
 */
export interface IRPCServer {
  /**
   * 注册服务方法
   */
  registerMethod(name: string, handler: (...args: any[]) => any | Promise<any>): void;

  /**
   * 启动服务器
   */
  start(): void;

  /**
   * 停止服务器
   */
  stop(): void;
}

/**
 * RPC 客户端接口
 * 在 Sidepanel 中实现，发送 RPC 请求
 */
export interface IRPCClient {
  /**
   * 调用远程方法
   */
  call<T = any>(method: string, ...args: any[]): Promise<T>;

  /**
   * 检查是否已连接
   */
  isConnected(): boolean;
}

/**
 * RPC 服务标识符
 */
export const IRPCServerID = Symbol('IRPCServer');
export const IRPCClientID = Symbol('IRPCClient');
