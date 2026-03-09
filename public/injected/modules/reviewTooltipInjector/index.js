/**
 * Review Tooltip 注入器 - 入口
 * 
 * 在原生 Overleaf 的 review-tooltip-menu 中注入 AI 控件
 * 当用户选中文本后，Overleaf 会弹出添加评论的菜单，
 * 本模块在该菜单中注入输入框、快捷操作按钮等 AI 功能
 */

import { injectStyles } from './styles.js';
import { processMenu, findMenusInElement } from './injector.js';
import { debug, warn } from '../core/logger.js';

let observer = null;
let isEnabled = true; // 默认启用

/**
 * 获取当前启用状态
 */
export function getSelectionTooltipEnabled() {
  return isEnabled;
}

/**
 * 设置启用状态
 */
export function setSelectionTooltipEnabled(enabled) {
  isEnabled = enabled;
  debug('[ReviewTooltipInjector] Selection tooltip', enabled ? 'enabled' : 'disabled');
  
  // 如果禁用，隐藏所有已注入的 AI 控件
  if (!enabled) {
    hideAllInjectedControls();
  } else {
    showAllInjectedControls();
  }
}

/**
 * 隐藏所有已注入的 AI 控件
 */
function hideAllInjectedControls() {
  const controls = document.querySelectorAll('.ol-ai-tooltip-wrapper');
  controls.forEach(control => {
    control.style.display = 'none';
  });
}

/**
 * 显示所有已注入的 AI 控件
 */
function showAllInjectedControls() {
  const controls = document.querySelectorAll('.ol-ai-tooltip-wrapper');
  controls.forEach(control => {
    control.style.display = '';
  });
}

/**
 * 创建 MutationObserver 监听 DOM 变化
 */
function createObserver() {
  return new MutationObserver((mutations) => {
    // 如果禁用则跳过注入
    if (!isEnabled) return;
    
    mutations.forEach((mutation) => {
      // 处理新增的节点
      mutation.addedNodes.forEach((node) => {
        const menus = findMenusInElement(node);
        menus.forEach(processMenu);
      });
      
      // 处理属性变化（菜单可能通过 style/class 变化显示）
      if (mutation.type === 'attributes') {
        const target = mutation.target;
        if (target.classList && target.classList.contains('review-tooltip-menu-container')) {
          const innerMenu = target.querySelector('.review-tooltip-menu');
          if (innerMenu) {
            processMenu(innerMenu);
          }
        }
      }
    });
  });
}

/**
 * 启动观察器
 */
function startObserver() {
  if (observer) {
    debug('[ReviewTooltipInjector] Observer already running');
    return;
  }
  
  observer = createObserver();
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });
  
  debug('[ReviewTooltipInjector] MutationObserver started');
}

/**
 * 停止观察器
 */
function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
    debug('[ReviewTooltipInjector] MutationObserver stopped');
  }
}

/**
 * 处理页面上已存在的菜单
 */
function processExistingMenus() {
  const existingMenus = document.querySelectorAll('.review-tooltip-menu');
  existingMenus.forEach(processMenu);
  if (existingMenus.length > 0) {
    debug('[ReviewTooltipInjector] Processed', existingMenus.length, 'existing menus');
  }
}

/**
 * 初始化 Review Tooltip 注入器
 */
export function initReviewTooltipInjector() {
  debug('[ReviewTooltipInjector] Initializing...');
  
  // 0. 从 localStorage 读取初始状态
  try {
    const savedState = localStorage.getItem('ol-ai-selection-tooltip-enabled');
    if (savedState !== null) {
      isEnabled = savedState === 'true';
      debug('[ReviewTooltipInjector] Loaded saved state:', isEnabled);
    }
  } catch (e) {
    warn('[ReviewTooltipInjector] Failed to load saved state:', e);
  }
  
  // 1. 注入样式
  injectStyles();
  
  // 2. 启动 DOM 观察器
  startObserver();
  
  // 3. 处理已存在的菜单（仅在启用时）
  if (isEnabled) {
    processExistingMenus();
  }
  
  // 4. 监听来自 Sidepanel 的启用/禁用消息
  setupMessageListener();
  
  debug('[ReviewTooltipInjector] Initialized successfully, enabled:', isEnabled);
}

/**
 * 设置消息监听器，接收来自 Sidepanel 的启用/禁用消息
 */
function setupMessageListener() {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    const data = event.data;
    if (!data) return;
    
    if (data.type === 'OVERLEAF_SELECTION_TOOLTIP_TOGGLE') {
      const enabled = data.data?.enabled;
      if (typeof enabled === 'boolean') {
        setSelectionTooltipEnabled(enabled);
        
        // 保存到 localStorage
        try {
          localStorage.setItem('ol-ai-selection-tooltip-enabled', String(enabled));
        } catch (e) {
          warn('[ReviewTooltipInjector] Failed to save state:', e);
        }
      }
    }
    
    // 响应状态查询
    if (data.type === 'OVERLEAF_SELECTION_TOOLTIP_GET_STATE') {
      window.postMessage({
        type: 'OVERLEAF_SELECTION_TOOLTIP_STATE',
        data: { enabled: isEnabled }
      }, '*');
    }
  });
}

/**
 * 销毁 Review Tooltip 注入器
 */
export function destroyReviewTooltipInjector() {
  stopObserver();
  debug('[ReviewTooltipInjector] Destroyed');
}

// 导出给其他模块使用
export { processMenu } from './injector.js';

