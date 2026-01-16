/**
 * 选区工具提示 - 激活状态管理
 * 负责管理扩展的激活状态
 */

// 激活状态（从 React 应用同步）
var isActivated = false;

/**
 * 检查是否已激活
 * @returns {boolean}
 */
function checkIsActivated() {
  return isActivated;
}

/**
 * 显示激活模态框（复用 React 的 ActivationModal 组件）
 */
function showActivationRequiredHint(hideSelectionTooltip) {
  // 先隐藏选区提示框
  if (hideSelectionTooltip) {
    hideSelectionTooltip();
  }
  
  // 发送消息触发显示 React 的 ActivationModal 组件
  window.postMessage({
    type: 'OVERLEAF_SHOW_ACTIVATION_MODAL',
    data: {}
  }, '*');
  
  console.log('[OverleafBridge] Requesting to show activation modal');
}

/**
 * 请求激活状态
 */
function requestActivationStatus() {
  window.postMessage({
    type: 'OVERLEAF_REQUEST_ACTIVATION_STATUS',
    data: {}
  }, '*');
  console.log('[OverleafBridge] Requesting activation status from React app');
}

/**
 * 设置激活状态监听器
 */
function setupActivationListener() {
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    var data = event.data;
    if (!data || data.type !== 'OVERLEAF_ACTIVATION_STATUS_UPDATE') return;
    
    var newStatus = data.data?.isActivated;
    if (typeof newStatus === 'boolean') {
      var oldStatus = isActivated;
      isActivated = newStatus;
      console.log('[OverleafBridge] Activation status updated:', isActivated, '(was:', oldStatus, ')');
    }
  });
}

/**
 * 初始化激活状态管理
 */
function initializeActivation() {
  setupActivationListener();
  setTimeout(requestActivationStatus, 200);
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    checkIsActivated,
    showActivationRequiredHint,
    requestActivationStatus,
    setupActivationListener,
    initializeActivation
  };
}

