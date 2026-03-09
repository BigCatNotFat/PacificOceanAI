/**
 * Cite Tooltip 模块 - 入口
 * 
 * 当用户光标移动到 \cite{...} 上时，
 * 显示对应文献的标题、作者等信息
 */

import { injectStyles } from './styles.js';
import { 
  startCiteTooltip, 
  stopCiteTooltip, 
  updateReferenceCache,
  clearReferenceCache 
} from './tooltip.js';
import { debug } from '../core/logger.js';

let isInitialized = false;
let isEnabled = true;

/**
 * 初始化 Cite Tooltip 模块
 */
export function initCiteTooltip() {
  if (isInitialized) {
    debug('[CiteTooltip] Already initialized');
    return;
  }
  
  debug('[CiteTooltip] Initializing...');
  
  // 1. 注入样式
  injectStyles();
  
  // 2. 从 localStorage 读取启用状态
  const savedState = localStorage.getItem('ol-ai-cite-tooltip-enabled');
  isEnabled = savedState !== 'false'; // 默认启用
  
  // 3. 如果启用，启动工具提示检测
  if (isEnabled) {
    startCiteTooltip();
  }
  
  // 4. 监听来自 Content Script 的消息
  setupMessageListener();
  
  isInitialized = true;
  debug('[CiteTooltip] Initialized successfully, enabled:', isEnabled);
}

/**
 * 设置消息监听器
 */
function setupMessageListener() {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    const data = event.data;
    if (!data) return;
    
    // 接收文献数据推送（用于预加载缓存）
    if (data.type === 'OVERLEAF_REFERENCES_UPDATE') {
      const references = data.references;
      if (Array.isArray(references)) {
        updateReferenceCache(references);
      }
    }
    
    // 清除缓存请求
    if (data.type === 'OVERLEAF_REFERENCES_CLEAR') {
      clearReferenceCache();
    }
    
    // 切换开关
    if (data.type === 'OVERLEAF_CITE_TOOLTIP_TOGGLE') {
      const enabled = data.data?.enabled;
      if (typeof enabled === 'boolean') {
        isEnabled = enabled;
        localStorage.setItem('ol-ai-cite-tooltip-enabled', String(enabled));
        
        if (enabled) {
          startCiteTooltip();
          debug('[CiteTooltip] Enabled');
        } else {
          stopCiteTooltip();
          debug('[CiteTooltip] Disabled');
        }
      }
    }
    
    // 获取当前状态
    if (data.type === 'OVERLEAF_CITE_TOOLTIP_GET_STATE') {
      window.postMessage({
        type: 'OVERLEAF_CITE_TOOLTIP_STATE',
        data: { enabled: isEnabled }
      }, '*');
    }
  });
}

/**
 * 销毁 Cite Tooltip 模块
 */
export function destroyCiteTooltip() {
  stopCiteTooltip();
  isInitialized = false;
  debug('[CiteTooltip] Destroyed');
}

// 导出内部函数供调试使用
export { updateReferenceCache, clearReferenceCache };

