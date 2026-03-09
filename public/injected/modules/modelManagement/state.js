/**
 * 状态管理 - 激活状态
 */

import { hideSelectionTooltip } from '../selectionTooltip/ui.js';
import { debug } from '../core/logger.js';

let isActivated = false;

/**
 * 检查是否已激活
 * @returns {boolean}
 */
export function checkIsActivated() {
  return isActivated;
}

/**
 * 提示用户需要配置 API Key（打开设置页面）
 */
export function showActivationRequiredHint() {
  hideSelectionTooltip();
  
  // 发送消息请求打开设置页面
  window.postMessage({
    type: 'OVERLEAF_OPEN_SETTINGS',
    data: {}
  }, '*');
  
  debug('[OverleafBridge] Requesting to open settings page');
}

/**
 * 请求激活状态
 */
export function requestActivationStatus() {
  window.postMessage({
    type: 'OVERLEAF_REQUEST_ACTIVATION_STATUS',
    data: {}
  }, '*');
  debug('[OverleafBridge] Requesting activation status from React app');
}

/**
 * 初始化状态监听
 */
export function initStateListeners() {
  // 监听激活状态更新消息
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    var data = event.data;
    if (!data || data.type !== 'OVERLEAF_ACTIVATION_STATUS_UPDATE') return;
    
    var newStatus = data.data?.isActivated;
    if (typeof newStatus === 'boolean') {
      var oldStatus = isActivated;
      isActivated = newStatus;
      debug('[OverleafBridge] Activation status updated:', isActivated, '(was:', oldStatus, ')');
    }
  });

  // 在脚本加载后请求激活状态
  setTimeout(requestActivationStatus, 200);
}

