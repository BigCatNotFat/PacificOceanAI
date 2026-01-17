/**
 * 选区工具提示 - 入口
 */

import { initUIListeners } from './ui.js';
import { initActionListeners } from './textActions.js';

export { hideSelectionTooltip } from './ui.js';

/**
 * 初始化选区工具提示模块
 */
export function initSelectionTooltip() {
  console.log('[OverleafBridge] Initializing Selection Tooltip...');
  initUIListeners();
  initActionListeners();
}

