/**
 * Overleaf AI 助手 - 打包版本
 * 所有模块合并到单个文件中，避免 ES6 模块兼容性问题
 */

// ============================================
// 1. 常量配置 (config/constants.js)
// ============================================
const SIDEBAR_CONFIG = {
  DEFAULT_WIDTH: 360,
  MIN_WIDTH: 260,
  MAX_WIDTH: 800,
  ANIMATION_DURATION: 250,
};

const ELEMENTS = {
  SIDEBAR_ID: 'overleaf-ai-sidebar',
  STYLE_ID: 'ai-sidebar-style',
  BUTTON_WRAPPER_ID: 'overleaf-ai-wrapper',
  RESIZE_HANDLE_CLASS: 'ai-resize-handle',
  TOGGLER_BTN_CLASS: 'ai-toggler-btn',
};

const SELECTORS = {
  MAIN_CONTAINER: 'main',
  LAYOUT_ROOT: '.layout-root',
  TOOLBAR_BUTTON: '.ide-redesign-toolbar-button-container',
};

const CLASSES = {
  RESIZING: 'resizing',
  BTN_PRIMARY: 'd-inline-grid btn btn-primary btn-sm',
  TOOLBAR_CONTAINER: 'ide-redesign-toolbar-button-container',
};

// ============================================
// 2. CSS 样式
// ============================================
const sidebarStyles = `
/* 侧边栏容器：包含拖拽条和内容区 */
#overleaf-ai-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 360px;
  min-width: 260px;
  max-width: 800px;
  background-color: #f9f9f9;
  display: flex;
  flex-direction: row;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* 原生风格拖拽条 */
.ai-resize-handle {
  width: 12px;
  background-color: #f1f3f4;
  border-left: 1px solid #dcdcdc;
  border-right: 1px solid #dcdcdc;
  cursor: col-resize;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color 0.2s;
  user-select: none;
  position: relative;
}

.ai-resize-handle:hover,
.ai-resize-handle.resizing {
  background-color: #e0e0e0;
}

/* 中间的折叠按钮 */
.ai-toggler-btn {
  width: 12px;
  height: 24px;
  padding: 0;
  background-color: #fff;
  border: 1px solid #dcdcdc;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10002;
  overflow: hidden;
  color: #555;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.ai-toggler-btn:hover {
  background-color: #f8f9fa;
  color: #333;
}

/* Overleaf Material Symbols 图标 */
.ai-toggler-icon {
  font-family: 'Material Symbols Outlined', 'Material Symbols Rounded', sans-serif;
  font-weight: normal;
  font-style: normal;
  font-size: 14px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
}

/* 右侧内容区域 */
.ai-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  min-width: 0;
}

/* 头部 */
.ai-header {
  height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #fff;
  font-weight: 700;
  color: #333;
}

.ai-close-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 20px;
  color: #666;
}

/* 聊天历史 */
.ai-chat-history {
  flex: 1;
  padding: 15px;
  overflow-y: auto;
  background-color: #fff;
}

/* 输入区域 */
.ai-input-area {
  padding: 15px;
  border-top: 1px solid #e0e0e0;
  background-color: #f4f5f6;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  resize: none;
  height: 70px;
  font-size: 13px;
  box-sizing: border-box;
  font-family: inherit;
}

.ai-input:focus {
  border-color: #3b9c37;
  outline: none;
}

.ai-send-btn {
  align-self: flex-end;
  padding: 6px 16px;
  background-color: #3b9c37;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
}

/* 消息气泡 */
.ai-message {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 90%;
}

.ai-user {
  background-color: #e8f5e9;
  color: #2b2b2b;
  margin-left: auto;
  border-top-right-radius: 0;
}

.ai-bot {
  background-color: #f0f0f0;
  color: #333;
  margin-right: auto;
  border-top-left-radius: 0;
}
`;

// ============================================
// 3. DOM 工具函数 (utils/dom.js)
// ============================================
function getMainContainer() {
  return (
    document.querySelector(SELECTORS.MAIN_CONTAINER) ||
    document.querySelector(SELECTORS.LAYOUT_ROOT) ||
    document.body
  );
}

function disableIframes(disable) {
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach((iframe) => {
    iframe.style.pointerEvents = disable ? 'none' : 'auto';
  });
}

function triggerResize() {
  window.dispatchEvent(new Event('resize'));
}

function injectStyles(styleId, cssText) {
  if (!document.getElementById(styleId)) {
    const styleSheet = document.createElement('style');
    styleSheet.id = styleId;
    styleSheet.innerText = cssText;
    document.head.appendChild(styleSheet);
  }
}

function setTransition(element, transition, duration) {
  element.style.transition = transition;
  setTimeout(() => {
    element.style.transition = 'none';
  }, duration);
}

// ============================================
// 4. 拖拽调整工具 (utils/resize.js)
// ============================================
function initResize(handle, sidebar, state) {
  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
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

  function doDrag(e) {
    let newWidth = startWidth + (startX - e.clientX);

    if (newWidth < SIDEBAR_CONFIG.MIN_WIDTH) {
      newWidth = SIDEBAR_CONFIG.MIN_WIDTH;
    }
    if (newWidth > SIDEBAR_CONFIG.MAX_WIDTH) {
      newWidth = SIDEBAR_CONFIG.MAX_WIDTH;
    }

    state.currentWidth = newWidth;
    sidebar.style.width = `${newWidth}px`;

    const mainContainer = getMainContainer();
    mainContainer.style.width = `calc(100% - ${newWidth}px)`;
  }

  function stopDrag() {
    document.documentElement.removeEventListener('mousemove', doDrag);
    document.documentElement.removeEventListener('mouseup', stopDrag);
    document.documentElement.style.cursor = 'default';
    handle.classList.remove(CLASSES.RESIZING);
    disableIframes(false);
    triggerResize();
  }
}

// ============================================
// 5. 侧边栏组件 (components/sidebar.js)
// ============================================
class Sidebar {
  constructor() {
    this.isOpen = false;
    this.currentWidth = SIDEBAR_CONFIG.DEFAULT_WIDTH;
    this.element = null;
  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.open();
    } else {
      this.close();
    }
  }

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

  create() {
    this.element = document.createElement('div');
    this.element.id = ELEMENTS.SIDEBAR_ID;
    this.element.style.width = `${this.currentWidth}px`;

    this.element.innerHTML = this.getTemplate();
    this.bindEvents();

    const handle = this.element.querySelector(`.${ELEMENTS.RESIZE_HANDLE_CLASS}`);
    initResize(handle, this.element, this);

    document.body.appendChild(this.element);
  }

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

  bindEvents() {
    this.element.querySelector('.ai-close-btn').onclick = () => {
      this.toggle();
    };

    this.element.querySelector(`.${ELEMENTS.TOGGLER_BTN_CLASS}`).onclick = (e) => {
      e.stopPropagation();
      this.toggle();
    };

    this.initChat();
  }

  initChat() {
    const sendBtn = this.element.querySelector('.ai-send-btn');
    const input = this.element.querySelector('.ai-input');
    const chatHistory = this.element.querySelector('.ai-chat-history');

    const sendMessage = () => {
      const message = input.value.trim();
      if (!message) return;

      chatHistory.innerHTML += `<div class="ai-message ai-user">${message}</div>`;
      input.value = '';

      setTimeout(() => {
        chatHistory.innerHTML += `<div class="ai-message ai-bot">收到</div>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }, 500);
    };

    sendBtn.onclick = sendMessage;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
}

// ============================================
// 6. 按钮组件 (components/button.js)
// ============================================
class ToolbarButton {
  constructor(onClickCallback) {
    this.onClickCallback = onClickCallback;
    this.element = null;
  }

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

  inject() {
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
}

class ButtonInjector {
  constructor(button) {
    this.button = button;
    this.observer = null;
  }

  start() {
    this.button.inject();
    setTimeout(() => this.button.inject(), 1000);

    this.observer = new MutationObserver(() => {
      this.button.inject();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// ============================================
// 7. 主应用 (main/content.js)
// ============================================
class OverleafAIApp {
  constructor() {
    this.sidebar = null;
    this.button = null;
    this.buttonInjector = null;
  }

  init() {
    // 1. 注入样式
    injectStyles(ELEMENTS.STYLE_ID, sidebarStyles);

    // 2. 创建侧边栏实例
    this.sidebar = new Sidebar();

    // 3. 创建工具栏按钮
    this.button = new ToolbarButton(() => {
      this.sidebar.toggle();
    });

    // 4. 启动按钮注入器
    this.buttonInjector = new ButtonInjector(this.button);
    this.buttonInjector.start();

    console.log('✅ Overleaf AI 助手已加载');
  }

  destroy() {
    if (this.buttonInjector) {
      this.buttonInjector.stop();
    }

    if (this.sidebar && this.sidebar.isOpen) {
      this.sidebar.close();
    }

    console.log('🔄 Overleaf AI 助手已卸载');
  }
}

// ============================================
// 8. 启动应用
// ============================================
const app = new OverleafAIApp();
app.init();
