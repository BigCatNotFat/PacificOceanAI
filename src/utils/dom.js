/**
 * DOM 操作工具函数
 */

import { SELECTORS } from '../config/constants.js';

/**
 * 获取主容器元素
 * @returns {HTMLElement}
 */
export function getMainContainer() {
  return (
    document.querySelector(SELECTORS.MAIN_CONTAINER) ||
    document.querySelector(SELECTORS.LAYOUT_ROOT) ||
    document.body
  );
}

/**
 * 禁用/启用所有 iframe 的鼠标事件
 * @param {boolean} disable - 是否禁用
 */
export function disableIframes(disable) {
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach((iframe) => {
    iframe.style.pointerEvents = disable ? 'none' : 'auto';
  });
}

/**
 * 触发窗口 resize 事件
 */
export function triggerResize() {
  window.dispatchEvent(new Event('resize'));
}

/**
 * 注入样式到页面
 * @param {string} styleId - 样式元素的 ID
 * @param {string} cssText - CSS 文本内容
 */
export function injectStyles(styleId, cssText) {
  if (!document.getElementById(styleId)) {
    const styleSheet = document.createElement('style');
    styleSheet.id = styleId;
    styleSheet.innerText = cssText;
    document.head.appendChild(styleSheet);
  }
}

/**
 * 设置元素的过渡效果
 * @param {HTMLElement} element - 目标元素
 * @param {string} transition - 过渡属性
 * @param {number} duration - 持续时间（毫秒）
 */
export function setTransition(element, transition, duration) {
  element.style.transition = transition;
  setTimeout(() => {
    element.style.transition = 'none';
  }, duration);
}
