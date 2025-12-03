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

/* 测试按钮区域 */
.ai-test-buttons {
  padding: 12px 15px;
  border-top: 1px solid #e0e0e0;
  border-bottom: 1px solid #e0e0e0;
  background-color: #fafafa;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-test-btn {
  padding: 6px 12px;
  background-color: #fff;
  color: #333;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s;
  flex: 1;
  min-width: calc(50% - 4px);
}

.ai-test-btn:hover {
  background-color: #f0f0f0;
  border-color: #999;
}

.ai-test-btn:active {
  background-color: #e5e5e5;
  transform: translateY(1px);
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
        <div class="ai-test-buttons">
          <button class="ai-test-btn" data-action="read">读取文字</button>
          <button class="ai-test-btn" data-action="insert">插入文字</button>
          <button class="ai-test-btn" data-action="replace">替换文字</button>
          <button class="ai-test-btn" data-action="delete">删除文字</button>
          <button class="ai-test-btn" data-action="readOutline">读取 Outline</button>
          <button class="ai-test-btn" data-action="readFileTree">读取 File Tree</button>
          <button class="ai-test-btn" data-action="readFig4Image">读取 fig4.png 图片</button>
          <button class="ai-test-btn" data-action="readBibFile">读取 Mybib.bib</button>
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

    this.bindTestButtons();
    this.initChat();
  }

  bindTestButtons() {
    const testButtons = this.element.querySelectorAll('.ai-test-btn');
    
    testButtons.forEach(btn => {
      btn.onclick = () => {
        const action = btn.getAttribute('data-action');
        console.log(`测试按钮被点击: ${action}`);
        
        // TODO: 实现具体功能
        switch(action) {
          case 'read':
            this.testReadText();
            break;
          case 'insert':
            this.testInsertText();
            break;
          case 'replace':
            this.testReplaceText();
            break;
          case 'delete':
            this.testDeleteText();
            break;
          case 'readOutline':
            this.testReadOutline();
            break;
          case 'readFileTree':
            this.testReadFileTree();
            break;
          case 'readBibFile':
            this.testReadBibFile();
            break;
          case 'readFig4Image':
            this.testReadFig4Image();
            break;
        }
      };
    });
  }

  testReadText() {
    console.log('开始读取文字功能');
    
    try {
      const lineNumber = 3;
      const text = this.readLineText(lineNumber);
      
      if (text !== null) {
        console.log(`✅ 第 ${lineNumber} 行的内容: "${text}"`);
        
        const chatHistory = this.element.querySelector('.ai-chat-history');
        if (chatHistory) {
          chatHistory.innerHTML += `<div class="ai-message ai-bot">第 ${lineNumber} 行: ${text}</div>`;
          chatHistory.scrollTop = chatHistory.scrollHeight;
        }
      } else {
        console.error(`❌ 无法读取第 ${lineNumber} 行`);
      }
    } catch (error) {
      console.error('读取文字失败:', error);
    }
  }

  readLineText(lineNumber) {
    try {
      const lines = document.querySelectorAll('.cm-line');
      
      if (lines.length === 0) {
        console.error('未找到任何 .cm-line 元素');
        return null;
      }
      
      console.log(`编辑器共有 ${lines.length} 行`);
      
      if (lineNumber < 1 || lineNumber > lines.length) {
        console.error(`行号 ${lineNumber} 超出范围 (1-${lines.length})`);
        return null;
      }
      
      const lineElement = lines[lineNumber - 1];
      const text = lineElement.textContent || lineElement.innerText;
      
      return text;
    } catch (error) {
      console.error('读取行文字时出错:', error);
      return null;
    }
  }

  readAllLines() {
    try {
      const lines = document.querySelectorAll('.cm-line');
      const result = [];
      
      lines.forEach((line, index) => {
        const text = line.textContent || line.innerText;
        result.push(text);
        console.log(`第 ${index + 1} 行: "${text}"`);
      });
      
      return result;
    } catch (error) {
      console.error('读取所有行时出错:', error);
      return [];
    }
  }

  getEditorFullText(targetFileName) {
    try {
      let cmContent = null;

      // 如果提供了文件名，则优先在对应编辑器中查找
      if (targetFileName) {
        const editors = document.querySelectorAll('.cm-editor');
        for (const editor of editors) {
          // 在该编辑器内部查找面包屑
          const breadcrumbs = editor.querySelectorAll('.ol-cm-breadcrumbs, .breadcrumbs');
          for (const breadcrumb of breadcrumbs) {
            // 面包屑结构通常为：<span>图标</span><div>文件名</div>
            const nameElement = breadcrumb.querySelector('div:last-child');
            const name = nameElement?.textContent?.trim();
            if (name && name === targetFileName) {
              cmContent = editor.querySelector('.cm-content');
              break;
            }
          }
          if (cmContent) break;
        }
      }

      // 如果没找到特定文件对应的编辑器，则退回到第一个 .cm-content
      if (!cmContent) {
        cmContent = document.querySelector('.cm-content');
      }

      if (!cmContent) {
        console.error('未找到 .cm-content 元素');
        return '';
      }
      
      return cmContent.textContent || cmContent.innerText || '';
    } catch (error) {
      console.error('读取完整文本时出错:', error);
      return '';
    }
  }

  testInsertText() {
    console.log('开始插入文字功能');
    
    try {
      // 方法1: 直接通过 DOM 操作 CodeMirror 6 的 contenteditable 区域
      const cmContent = document.querySelector('.cm-content[contenteditable="true"]');
      if (cmContent) {
        console.log('找到 .cm-content 可编辑区域，使用 DOM 方法插入');
        this.insertTextViaDom(cmContent, 'abcd');
        return;
      }

      // 方法2: 尝试通过 CodeMirror 6 API
      const cm6Editor = this.findCodeMirror6Editor();
      if (cm6Editor) {
        console.log('找到 CodeMirror 6 编辑器');
        this.insertTextToCM6(cm6Editor, 'abcd');
        return;
      }

      // 方法3: 尝试通过 CodeMirror 5 (旧版 Overleaf)
      const cm5Editor = this.findCodeMirror5Editor();
      if (cm5Editor) {
        console.log('找到 CodeMirror 5 编辑器');
        this.insertTextToCM5(cm5Editor, 'abcd');
        return;
      }

      // 方法4: 尝试通过 Ace Editor
      const aceEditor = this.findAceEditor();
      if (aceEditor) {
        console.log('找到 Ace 编辑器');
        this.insertTextToAce(aceEditor, 'abcd');
        return;
      }

      console.error('未找到任何编辑器');
    } catch (error) {
      console.error('插入文字失败:', error);
    }
  }

  insertTextViaDom(element, text) {
    try {
      element.focus();
      
      const selection = window.getSelection();
      if (!selection.rangeCount) {
        console.error('没有选区');
        return;
      }
      
      const range = selection.getRangeAt(0);
      range.deleteContents();
      
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
      
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log(`✅ 已通过 DOM 插入文字: "${text}"`);
    } catch (error) {
      console.error('DOM 插入失败:', error);
    }
  }

  debugEditorElements() {
    console.log('=== 调试编辑器信息 ===');
    
    const cm6 = document.querySelector('.cm-editor');
    const cm5 = document.querySelector('.CodeMirror');
    const ace = document.querySelector('.ace_editor');
    const editorPane = document.querySelector('.editor-pane');
    
    console.log('CodeMirror 6 (.cm-editor):', cm6);
    console.log('CodeMirror 5 (.CodeMirror):', cm5);
    console.log('Ace Editor (.ace_editor):', ace);
    console.log('Editor Pane (.editor-pane):', editorPane);
    
    const iframes = document.querySelectorAll('iframe');
    console.log('找到 iframe 数量:', iframes.length);
    
    iframes.forEach((iframe, index) => {
      console.log(`iframe ${index}:`, iframe.src || iframe.id || iframe.className);
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const iframeCM6 = iframeDoc.querySelector('.cm-editor');
        const iframeCM5 = iframeDoc.querySelector('.CodeMirror');
        const iframeAce = iframeDoc.querySelector('.ace_editor');
        
        if (iframeCM6) console.log(`  -> 找到 CM6 在 iframe ${index}`);
        if (iframeCM5) console.log(`  -> 找到 CM5 在 iframe ${index}`);
        if (iframeAce) console.log(`  -> 找到 Ace 在 iframe ${index}`);
      } catch (e) {
        console.log(`  -> 无法访问 iframe ${index} 内容 (跨域)`);
      }
    });
    
    console.log('======================');
  }

  findCodeMirror6Editor() {
    let editorElement = document.querySelector('.cm-editor');
    
    if (!editorElement) {
      const iframes = document.querySelectorAll('iframe');
      for (let iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          editorElement = iframeDoc.querySelector('.cm-editor');
          if (editorElement) break;
        } catch (e) {
          // 跨域 iframe，跳过
        }
      }
    }
    
    if (!editorElement) {
      console.log('未找到 .cm-editor 元素');
      return null;
    }

    console.log('找到 .cm-editor 元素:', editorElement);

    // 方法1: 尝试从元素的属性中获取 EditorView 实例
    for (let key in editorElement) {
      if (key.startsWith('__cm6') || key.includes('cmView') || key.includes('CodeMirror')) {
        console.log('找到可能的编辑器实例属性:', key);
        return editorElement[key];
      }
    }

    // 方法2: 尝试从 window 对象获取
    if (window.cmEditor) {
      console.log('从 window.cmEditor 获取');
      return window.cmEditor;
    }

    // 方法3: 检查是否有 view 属性
    if (editorElement.view) {
      console.log('从 element.view 获取');
      return editorElement.view;
    }

    // 方法4: 尝试查找所有数字和符号开头的属性
    console.log('查看所有元素属性:');
    for (let key in editorElement) {
      if (typeof editorElement[key] === 'object' && editorElement[key] !== null) {
        console.log('  属性:', key, typeof editorElement[key]);
      }
    }

    console.log('未能找到 CM6 EditorView 实例');
    return null;
  }

  findCodeMirror5Editor() {
    let editorElement = document.querySelector('.CodeMirror');
    
    if (!editorElement) {
      const iframes = document.querySelectorAll('iframe');
      for (let iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          editorElement = iframeDoc.querySelector('.CodeMirror');
          if (editorElement) break;
        } catch (e) {
          // 跨域 iframe，跳过
        }
      }
    }
    
    if (!editorElement) return null;
    return editorElement.CodeMirror || null;
  }

  findAceEditor() {
    let editorElement = document.querySelector('.ace_editor');
    
    if (!editorElement) {
      const iframes = document.querySelectorAll('iframe');
      for (let iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          editorElement = iframeDoc.querySelector('.ace_editor');
          if (editorElement) break;
        } catch (e) {
          // 跨域 iframe，跳过
        }
      }
    }
    
    if (!editorElement) return null;
    return editorElement.env?.editor || null;
  }

  insertTextToCM6(editor, text) {
    try {
      const { state, dispatch } = editor;
      const selection = state.selection.main;
      
      dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: text
        },
        selection: {
          anchor: selection.from + text.length
        }
      });
      
      console.log(`✅ 已在 CodeMirror 6 中插入文字: "${text}"`);
    } catch (error) {
      console.error('CodeMirror 6 插入失败:', error);
    }
  }

  insertTextToCM5(editor, text) {
    try {
      const cursor = editor.getCursor();
      editor.replaceRange(text, cursor);
      editor.setCursor({
        line: cursor.line,
        ch: cursor.ch + text.length
      });
      editor.focus();
      console.log(`✅ 已在 CodeMirror 5 中插入文字: "${text}"`);
    } catch (error) {
      console.error('CodeMirror 5 插入失败:', error);
    }
  }

  insertTextToAce(editor, text) {
    try {
      editor.insert(text);
      editor.focus();
      console.log(`✅ 已在 Ace 编辑器中插入文字: "${text}"`);
    } catch (error) {
      console.error('Ace 编辑器插入失败:', error);
    }
  }

  testReplaceText() {
    console.log('TODO: 实现替换文字功能');
  }

  testDeleteText() {
    console.log('TODO: 实现删除文字功能');
  }

  async testReadBibFile() {
    console.log('开始读取 Mybib.bib 文件');
    
    try {
      const fileName = 'Mybib.bib';
      const content = await this.readFileContentAsync(fileName);
      
      if (content) {
        console.log(`✅ 成功读取 ${fileName}:`);
        console.log(content);
        
        const chatHistory = this.element.querySelector('.ai-chat-history');
        if (chatHistory) {
          const preview = content.length > 500 ? content.substring(0, 500) + '...' : content;
          let message = `<div class="ai-message ai-bot"><strong>${fileName} 内容：</strong><br>`;
          message += `<pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 11px;">${this.escapeHtml(preview)}</pre>`;
          message += `<small>共 ${content.length} 字符</small></div>`;
          chatHistory.innerHTML += message;
          chatHistory.scrollTop = chatHistory.scrollHeight;
        }
      } else {
        console.error(`❌ 无法读取 ${fileName}`);
        
        const chatHistory = this.element.querySelector('.ai-chat-history');
        if (chatHistory) {
          chatHistory.innerHTML += `<div class="ai-message ai-bot">❌ 无法读取 ${fileName}，请先在编辑器中手动点击打开该文件，然后再点击此按钮</div>`;
          chatHistory.scrollTop = chatHistory.scrollHeight;
        }
      }
    } catch (error) {
      console.error('读取 bib 文件失败:', error);
    }
  }

  async testReadFig4Image() {
    console.log('开始读取 fig4.png 图片');
    try {
      const fileName = 'fig4.png';

      const chatHistory = this.element.querySelector('.ai-chat-history');

      const opened = this.openFileInEditor(fileName);
      if (!opened) {
        console.error(`在文件树中未找到 ${fileName}`);
        if (chatHistory) {
          chatHistory.innerHTML += `<div class="ai-message ai-bot">❌ 在 File Tree 中未找到 ${fileName}</div>`;
          chatHistory.scrollTop = chatHistory.scrollHeight;
        }
        return;
      }

      console.log('已点击打开 fig4.png，等待预览加载...');
      await this.sleep(1500);

      let targetImg = null;
      const imgs = document.querySelectorAll('img');
      imgs.forEach((img) => {
        if (targetImg) return;
        const alt = img.getAttribute('alt') || '';
        const src = img.getAttribute('src') || '';
        if (alt.includes(fileName) || src.includes('fig4')) {
          targetImg = img;
        }
      });

      if (!targetImg) {
        console.error('未在页面中找到 fig4.png 的图片预览');
        if (chatHistory) {
          chatHistory.innerHTML += `<div class=\"ai-message ai-bot\">已尝试打开 ${fileName}，但未在页面中找到图片预览</div>`;
          chatHistory.scrollTop = chatHistory.scrollHeight;
        }
        return;
      }

      const src = targetImg.getAttribute('src') || targetImg.src || '';

      if (chatHistory && src) {
        const safeSrc = this.escapeHtml(src);
        let message = `<div class=\"ai-message ai-bot\"><strong>${fileName} 图片预览：</strong><br>`;
        message += `<img src=\"${safeSrc}\" alt=\"${fileName}\" style=\"max-width: 100%; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);\">`;
        message += `</div>`;
        chatHistory.innerHTML += message;
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }

      console.log(`✅ 已在侧边栏展示 ${fileName} 图片`);
    } catch (error) {
      console.error('读取 fig4.png 图片失败:', error);
    }
  }

  async readFileContentAsync(fileName) {
    try {
      const currentFileName = this.getCurrentFileName();
      console.log('当前打开的文件:', currentFileName);
      
      if (currentFileName === fileName) {
        console.log('目标文件已在编辑器中打开，直接读取');
        return this.getEditorFullText(fileName);
      }
      
      console.log(`当前打开的是 ${currentFileName}，需要切换到 ${fileName}`);
      console.log(`尝试在文件树中查找并打开 ${fileName}`);
      
      const opened = this.openFileInEditor(fileName);
      
      if (opened) {
        console.log('等待文件加载...');
        await this.sleep(1500);
        
        const newFileName = this.getCurrentFileName();
        console.log('等待后当前文件:', newFileName);
        
        if (newFileName === fileName) {
          console.log('文件已成功切换，读取内容');
          return this.getEditorFullText(fileName);
        } else {
          console.error(`文件切换失败，当前文件仍是: ${newFileName}`);
          return null;
        }
      }
      
      console.error('无法在文件树中找到或打开文件');
      return null;
    } catch (error) {
      console.error('读取文件内容时出错:', error);
      return null;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getCurrentFileName() {
    try {
      const breadcrumb = document.querySelector('.ol-cm-breadcrumbs, .breadcrumbs');
      if (breadcrumb) {
        // 面包屑结构通常为：<span>图标</span><div>文件名</div>
        // 优先选择最后一个 div 作为文件名容器
        const fileNameElement = breadcrumb.querySelector('div:last-child');
        const text = fileNameElement?.textContent?.trim();
        if (text) return text;
      }
      
      const selectedItem = document.querySelector('li[role="treeitem"].selected, li[role="treeitem"][aria-selected="true"]');
      if (selectedItem) {
        return selectedItem.getAttribute('aria-label');
      }
      
      return null;
    } catch (error) {
      console.error('获取当前文件名时出错:', error);
      return null;
    }
  }

  openFileInEditor(fileName) {
    try {
      const fileItems = document.querySelectorAll('li[role="treeitem"]');
      
      for (const item of fileItems) {
        const itemLabel = item.getAttribute('aria-label');
        if (itemLabel && itemLabel.includes(fileName)) {
          console.log(`找到文件: ${itemLabel}`);
          
          const fileLink = item.querySelector('.outline-item-link, .item-name-button, button');
          if (fileLink) {
            console.log('点击文件...');
            fileLink.click();
            return true;
          }
        }
      }
      
      console.error(`在文件树中未找到 ${fileName}`);
      return false;
    } catch (error) {
      console.error('打开文件时出错:', error);
      return false;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  testReadOutline() {
    console.log('开始读取 File Outline');
    
    try {
      const outlineData = this.readFileOutline();
      
      if (outlineData && outlineData.length > 0) {
        console.log('✅ File Outline 内容:');
        outlineData.forEach((item, index) => {
          const indent = '  '.repeat(item.level);
          console.log(`${indent}${index + 1}. ${item.title}`);
        });
        
        const chatHistory = this.element.querySelector('.ai-chat-history');
        if (chatHistory) {
          let message = '<div class="ai-message ai-bot"><strong>File Outline:</strong><br>';
          outlineData.forEach((item, index) => {
            const indent = '&nbsp;&nbsp;'.repeat(item.level);
            message += `${indent}${index + 1}. ${item.title}<br>`;
          });
          message += '</div>';
          chatHistory.innerHTML += message;
          chatHistory.scrollTop = chatHistory.scrollHeight;
        }
      } else {
        console.log('未找到 Outline 内容');
      }
    } catch (error) {
      console.error('读取 Outline 失败:', error);
    }
  }

  readFileOutline() {
    try {
      const outlineItems = document.querySelectorAll('.outline-item');
      
      if (outlineItems.length > 0) {
        console.log(`✅ 找到 ${outlineItems.length} 个 outline 项`);
        return this.parseOutlineItems(outlineItems);
      }
      
      console.log('尝试查找其他可能的 outline 选择器...');
      const alternativeSelectors = [
        '[role="treeitem"]',
        '.file-outline-item',
        '[data-type="outline-item"]',
        '.outline-container .outline-entry',
        '.document-outline-item'
      ];
      
      for (const selector of alternativeSelectors) {
        const items = document.querySelectorAll(selector);
        if (items.length > 0) {
          console.log(`找到 ${items.length} 个 outline 项 (使用选择器: ${selector})`);
          return this.parseOutlineItems(items);
        }
      }
      
      console.error('未找到任何 outline 元素');
      return [];
    } catch (error) {
      console.error('读取 File Outline 时出错:', error);
      return [];
    }
  }

  parseOutlineItems(items) {
    const result = [];
    
    items.forEach((item) => {
      const titleLink = item.querySelector(':scope > .outline-item-row > .outline-item-link');
      
      if (!titleLink) return;
      
      let title = titleLink.textContent?.trim() || '';
      title = title.replace(/\s+/g, ' ').trim();
      
      const ariaLabel = item.getAttribute('aria-label');
      if (ariaLabel) {
        title = ariaLabel.trim();
      }
      
      let line = item.getAttribute('data-line') || 
                 item.getAttribute('line') ||
                 item.getAttribute('data-line-number');
      
      if (!line && titleLink) {
        line = titleLink.getAttribute('data-line') || 
               titleLink.getAttribute('data-line-number');
      }
      
      let type = 'section';
      if (title.toLowerCase().includes('chapter')) {
        type = 'chapter';
      } else if (title.toLowerCase().includes('subsection')) {
        type = 'subsection';
      }
      
      let level = 0;
      let parent = item.parentElement;
      while (parent && !parent.classList.contains('outline-item-list-root')) {
        if (parent.classList.contains('outline-item-list')) {
          level++;
        }
        parent = parent.parentElement;
      }
      
      if (title && title.length > 0) {
        result.push({
          title: title,
          type: type,
          line: line || '未知',
          level: level
        });
      }
    });
    
    return result;
  }

  testReadFileTree() {
    console.log('开始读取 File Tree');
    
    try {
      const fileTree = this.readFileTree();
      
      if (fileTree && fileTree.length > 0) {
        console.log('✅ File Tree 内容:');
        fileTree.forEach((item, index) => {
          const indent = '  '.repeat(item.level);
          const icon = item.type === 'folder' ? '📁' : '📄';
          console.log(`  ${indent}${icon} ${item.name}`);
        });
        
        const chatHistory = this.element.querySelector('.ai-chat-history');
        if (chatHistory) {
          let message = '<div class="ai-message ai-bot"><strong>File Tree:</strong><br>';
          fileTree.forEach((item) => {
            const indent = '&nbsp;&nbsp;'.repeat(item.level);
            const icon = item.type === 'folder' ? '📁' : '📄';
            message += `${indent}${icon} ${item.name}<br>`;
          });
          message += '</div>';
          chatHistory.innerHTML += message;
          chatHistory.scrollTop = chatHistory.scrollHeight;
        }
      } else {
        console.log('未找到 File Tree 内容');
      }
    } catch (error) {
      console.error('读取 File Tree 失败:', error);
    }
  }

  readFileTree() {
    try {
      const fileTreeContainer = document.querySelector('.file-tree, .file-tree-inner, .file-tree-list');
      
      if (fileTreeContainer) {
        const fileItems = fileTreeContainer.querySelectorAll('li[role="treeitem"]');
        if (fileItems.length > 0) {
          console.log(`✅ 找到 ${fileItems.length} 个文件树项`);
          return this.parseFileTreeItems(fileItems);
        }
      }
      
      const entityItems = document.querySelectorAll('.entity[data-file-id]');
      if (entityItems.length > 0) {
        console.log(`✅ 通过 .entity 找到 ${entityItems.length} 个文件项`);
        const fileItems = Array.from(entityItems).map(entity => {
          let li = entity.closest('li[role="treeitem"]');
          return li;
        }).filter(li => li !== null);
        
        if (fileItems.length > 0) {
          return this.parseFileTreeItems(fileItems);
        }
      }
      
      console.log('尝试查找其他可能的文件树选择器...');
      const alternativeSelectors = [
        '.file-tree-item',
        '[data-type="fileItem"]',
        '.entity-item'
      ];
      
      for (const selector of alternativeSelectors) {
        const items = document.querySelectorAll(selector);
        if (items.length > 0) {
          console.log(`找到 ${items.length} 个文件项 (使用选择器: ${selector})`);
          return this.parseFileTreeItems(items);
        }
      }
      
      console.error('未找到任何文件树元素');
      return [];
    } catch (error) {
      console.error('读取 File Tree 时出错:', error);
      return [];
    }
  }

  parseFileTreeItems(items) {
    const result = [];
    
    items.forEach((item) => {
      let name = item.getAttribute('aria-label');
      
      if (!name) {
        const nameElement = item.querySelector('.item-name-button > span');
        if (nameElement) {
          name = nameElement.textContent?.trim();
        }
      }
      
      if (!name) {
        const nameElement = item.querySelector('.entity-name, .file-tree-item-name');
        if (nameElement) {
          const cloned = nameElement.cloneNode(true);
          const icons = cloned.querySelectorAll('.material-symbols, [class*="icon"]');
          icons.forEach(icon => icon.remove());
          name = cloned.textContent?.trim();
        }
      }
      
      if (!name) return;
      
      name = name.replace(/\s+/g, ' ').trim();
      
      const entity = item.querySelector('.entity[data-file-type]');
      let type = 'file';
      let fileType = '';
      
      if (entity) {
        const dataType = entity.getAttribute('data-file-type');
        if (dataType === 'folder') {
          type = 'folder';
        } else {
          fileType = dataType;
        }
      }
      
      const isFolder = item.classList.contains('folder') || 
                      item.classList.contains('directory') ||
                      item.getAttribute('aria-expanded') !== null;
      
      if (isFolder) {
        type = 'folder';
      }
      
      let level = 0;
      const ariaLevel = item.getAttribute('aria-level');
      if (ariaLevel) {
        level = parseInt(ariaLevel) - 1;
      } else {
        let parent = item.parentElement;
        while (parent && !parent.classList.contains('file-tree')) {
          if (parent.tagName === 'UL' || parent.tagName === 'OL') {
            level++;
          }
          parent = parent.parentElement;
        }
      }
      
      if (name && name.length > 0) {
        result.push({
          name: name,
          type: type,
          level: level,
          fileType: fileType
        });
      }
    });
    
    return result;
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
