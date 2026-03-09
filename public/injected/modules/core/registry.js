/**
 * 核心模块 - 方法处理器注册表
 * 用于存储所有 API 方法处理器，供 BridgeClient 调用
 */

import { warn } from './logger.js';

export const methodHandlers = {};

/**
 * 注册方法处理器
 * @param {string} name 方法名
 * @param {Function} handler 处理函数
 */
export function registerMethod(name, handler) {
  if (methodHandlers[name]) {
    warn(`[OverleafBridge] Warning: Method '${name}' is already registered. Overwriting.`);
  }
  methodHandlers[name] = handler;
}

/**
 * 批量注册方法处理器
 * @param {Object} handlers 处理器对象
 */
export function registerMethods(handlers) {
  Object.assign(methodHandlers, handlers);
}

