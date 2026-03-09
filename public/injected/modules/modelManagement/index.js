/**
 * 模型管理 - 入口
 */

import { initStateListeners } from './state.js';
import { initModelListeners } from './models.js';
import { debug } from '../core/logger.js';

export { checkIsActivated, showActivationRequiredHint } from './state.js';
export { getSelectedTextActionModel, createModelSelector } from './models.js';

/**
 * 初始化模型管理模块
 */
export function initModelManagement() {
  debug('[OverleafBridge] Initializing Model Management...');
  initStateListeners();
  initModelListeners();
}

