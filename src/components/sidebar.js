/**
 * 侧边栏组件
 */

import { SIDEBAR_CONFIG, ELEMENTS, CLASSES } from '../config/constants.js';
import { getMainContainer, triggerResize, setTransition } from '../utils/dom.js';
import { initResize } from '../utils/resize.js';

/**
 * 侧边栏管理类
 */
export class Sidebar {
  constructor() {
    this.isOpen = false;
    this.currentWidth = SIDEBAR_CONFIG.DEFAULT_WIDTH;
    this.element = null;
  }

  /**
   * 切换侧边栏显示/隐藏
   */
  toggle() {
    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      this.open();
    } else {
      this.close();
    }
  }

  /**
   * 打开侧边栏
   */
  open() {
    const mainContainer = getMainContainer();

    if (!this.element) {
      this.create();
    }

    this.element.style.display = 'flex';

    setTransition(
      mainContainer,
      'width 0.2s ease',
      SIDEBAR_CONFIG.ANIMATION_DURATION
    );
    mainContainer.style.width = `calc(100% - ${this.currentWidth}px)`;

    setTimeout(() => {
      triggerResize();
    }, SIDEBAR_CONFIG.ANIMATION_DURATION);
  }

  /**
   * 关闭侧边栏
   */
  close() {
    const mainContainer = getMainContainer();

    if (this.element) {
      this.element.style.display = 'none';
    }

    setTransition(
      mainContainer,
      'width 0.2s ease',
      SIDEBAR_CONFIG.ANIMATION_DURATION
    );
    mainContainer.style.width = '';

    setTimeout(() => {
      triggerResize();
    }, SIDEBAR_CONFIG.ANIMATION_DURATION);
  }

  /**
   * 创建侧边栏元素
   */
  create() {
    this.element = document.createElement('div');
    this.element.id = ELEMENTS.SIDEBAR_ID;
    this.element.style.width = `${this.currentWidth}px`;

    this.element.innerHTML = this.getTemplate();

    // 绑定事件
    this.bindEvents();

    // 初始化拖拽功能
    const handle = this.element.querySelector(`.${ELEMENTS.RESIZE_HANDLE_CLASS}`);
    initResize(handle, this.element, this);

    document.body.appendChild(this.element);
  }

  /**
   * 获取侧边栏 HTML 模板
   */
  getTemplate() {
    return `
      <div class="${ELEMENTS.RESIZE_HANDLE_CLASS}" title="拖动调整大小">
        <button class="${ELEMENTS.TOGGLER_BTN_CLASS}" title="点击收起">
          <span class="ai-toggler-icon material-symbols">chevron_right</span>
        </button>
      </div>

      <div class="ai-content-wrapper">
        <div class="ai-header">
          <span>✨ AI 助手</span>
          <button class="ai-close-btn">×</button>
        </div>
        <div class="ai-chat-history">
          <div class="ai-message ai-bot">你好！现在这看起来是不是更像 Overleaf 原生的面板了？</div>
          <div class="ai-message ai-bot">你可以拖动左边的灰条，也可以点击灰条中间的小按钮来收起我。</div>
        </div>
        <div class="ai-input-area">
          <textarea class="ai-input" placeholder="输入..."></textarea>
          <button class="ai-send-btn">发送</button>
        </div>
      </div>
    `;
  }

  /**
   * 绑定事件处理器
   */
  bindEvents() {
    // 关闭按钮
    this.element.querySelector('.ai-close-btn').onclick = () => {
      this.toggle();
    };

    // 折叠按钮
    this.element.querySelector(`.${ELEMENTS.TOGGLER_BTN_CLASS}`).onclick = (e) => {
      e.stopPropagation();
      this.toggle();
    };

    // 聊天功能
    this.initChat();
  }

  /**
   * 初始化聊天功能
   */
  initChat() {
    const sendBtn = this.element.querySelector('.ai-send-btn');
    const input = this.element.querySelector('.ai-input');
    const chatHistory = this.element.querySelector('.ai-chat-history');

    const sendMessage = () => {
      const message = input.value.trim();
      if (!message) return;

      // 添加用户消息
      chatHistory.innerHTML += `<div class="ai-message ai-user">${message}</div>`;
      input.value = '';

      // 模拟 AI 回复
      setTimeout(() => {
        chatHistory.innerHTML += `<div class="ai-message ai-bot">收到</div>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }, 500);
    };

    sendBtn.onclick = sendMessage;

    // 支持回车发送（Shift+Enter 换行）
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  /**
   * 检查侧边栏是否已存在
   */
  static exists() {
    return document.getElementById(ELEMENTS.SIDEBAR_ID) !== null;
  }
}
