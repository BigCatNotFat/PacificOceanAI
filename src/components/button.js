/**
 * 顶部工具栏按钮组件
 */

import { ELEMENTS, CLASSES, SELECTORS } from '../config/constants.js';

/**
 * 按钮管理类
 */
export class ToolbarButton {
  constructor(onClickCallback) {
    this.onClickCallback = onClickCallback;
    this.element = null;
  }

  /**
   * 创建按钮包装器元素
   */
  create() {
    const wrapper = document.createElement('div');
    wrapper.className = CLASSES.TOOLBAR_CONTAINER;
    wrapper.id = ELEMENTS.BUTTON_WRAPPER_ID;
    wrapper.style.marginRight = '8px';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = CLASSES.BTN_PRIMARY;
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.gap = '4px';
    button.innerHTML = `<span class="button-content" style="font-weight: 600;">AI助手</span>`;

    button.onclick = this.onClickCallback;

    wrapper.appendChild(button);
    this.element = wrapper;

    return wrapper;
  }

  /**
   * 注入按钮到工具栏
   */
  inject() {
    // 如果按钮已存在，不重复注入
    if (document.getElementById(ELEMENTS.BUTTON_WRAPPER_ID)) {
      return;
    }

    const containers = document.querySelectorAll(SELECTORS.TOOLBAR_BUTTON);
    if (containers.length > 0) {
      const targetContainer = containers[0];
      if (targetContainer && targetContainer.parentElement) {
        const buttonElement = this.create();
        targetContainer.parentElement.insertBefore(buttonElement, targetContainer);
      }
    }
  }

  /**
   * 检查按钮是否已存在
   */
  static exists() {
    return document.getElementById(ELEMENTS.BUTTON_WRAPPER_ID) !== null;
  }
}

/**
 * 按钮注入器 - 监听 DOM 变化并自动注入按钮
 */
export class ButtonInjector {
  constructor(button) {
    this.button = button;
    this.observer = null;
  }

  /**
   * 开始监听并注入按钮
   */
  start() {
    // 立即尝试注入
    this.button.inject();

    // 延迟注入（防止页面加载慢）
    setTimeout(() => this.button.inject(), 1000);

    // 使用 MutationObserver 监听 DOM 变化
    this.observer = new MutationObserver(() => {
      this.button.inject();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * 停止监听
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}
