/**
 * 拖拽调整大小工具
 */

import { SIDEBAR_CONFIG, CLASSES, ELEMENTS } from '../config/constants.js';
import { getMainContainer, disableIframes, triggerResize } from './dom.js';

/**
 * 初始化侧边栏拖拽调整大小功能
 * @param {HTMLElement} handle - 拖拽手柄元素
 * @param {HTMLElement} sidebar - 侧边栏元素
 * @param {Object} state - 状态对象，包含 currentWidth 属性
 */
export function initResize(handle, sidebar, state) {
  let startX, startWidth;

  // 鼠标按下事件
  handle.addEventListener('mousedown', (e) => {
    // 如果点击的是折叠按钮，不触发拖拽
    if (e.target.closest(`.${ELEMENTS.TOGGLER_BTN_CLASS}`)) {
      return;
    }

    startX = e.clientX;
    startWidth = parseInt(
      document.defaultView.getComputedStyle(sidebar).width,
      10
    );

    document.documentElement.style.cursor = 'col-resize';
    handle.classList.add(CLASSES.RESIZING);
    disableIframes(true);

    document.documentElement.addEventListener('mousemove', doDrag);
    document.documentElement.addEventListener('mouseup', stopDrag);
  });

  /**
   * 拖拽过程中
   */
  function doDrag(e) {
    // 侧边栏在右侧，往左拖(clientX变小)宽度变大
    let newWidth = startWidth + (startX - e.clientX);

    // 限制最小和最大宽度
    if (newWidth < SIDEBAR_CONFIG.MIN_WIDTH) {
      newWidth = SIDEBAR_CONFIG.MIN_WIDTH;
    }
    if (newWidth > SIDEBAR_CONFIG.MAX_WIDTH) {
      newWidth = SIDEBAR_CONFIG.MAX_WIDTH;
    }

    // 更新状态
    state.currentWidth = newWidth;

    // 更新侧边栏宽度
    sidebar.style.width = `${newWidth}px`;

    // 更新主容器宽度
    const mainContainer = getMainContainer();
    mainContainer.style.width = `calc(100% - ${newWidth}px)`;
  }

  /**
   * 停止拖拽
   */
  function stopDrag() {
    document.documentElement.removeEventListener('mousemove', doDrag);
    document.documentElement.removeEventListener('mouseup', stopDrag);
    document.documentElement.style.cursor = 'default';
    handle.classList.remove(CLASSES.RESIZING);
    disableIframes(false);
    triggerResize();
  }
}
