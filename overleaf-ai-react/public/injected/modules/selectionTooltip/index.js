/**
 * 选区工具提示 - 入口
 */

import { initUIListeners } from './ui.js';
import { initActionListeners } from './textActions.js';
import { debug } from '../core/logger.js';

export { hideSelectionTooltip } from './ui.js';

/**
 * 初始化选区工具提示模块
 */
export function initSelectionTooltip() {
  debug('[OverleafBridge] Initializing Selection Tooltip...');
  initUIListeners();
  initActionListeners();
}

