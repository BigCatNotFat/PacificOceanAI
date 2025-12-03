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

    // 测试按钮
    this.bindTestButtons();

    // 聊天功能
    this.initChat();
  }

  /**
   * 绑定测试按钮事件
   */
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

  /**
   * 测试：读取文字
   */
  testReadText() {
    console.log('开始读取文字功能');
    
    try {
      // 读取第3行的文字
      const lineNumber = 3;
      const text = this.readLineText(lineNumber);
      
      if (text !== null) {
        console.log(`✅ 第 ${lineNumber} 行的内容: "${text}"`);
        
        // 可以选择在聊天界面显示
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

  /**
   * 读取指定行的文字
   * @param {number} lineNumber - 行号（从1开始）
   * @returns {string|null} - 行内容，失败返回 null
   */
  readLineText(lineNumber) {
    try {
      // 查找所有行元素
      const lines = document.querySelectorAll('.cm-line');
      
      if (lines.length === 0) {
        console.error('未找到任何 .cm-line 元素');
        return null;
      }
      
      console.log(`编辑器共有 ${lines.length} 行`);
      
      // 检查行号是否有效
      if (lineNumber < 1 || lineNumber > lines.length) {
        console.error(`行号 ${lineNumber} 超出范围 (1-${lines.length})`);
        return null;
      }
      
      // 获取指定行（索引从0开始，所以减1）
      const lineElement = lines[lineNumber - 1];
      
      // 获取文本内容
      const text = lineElement.textContent || lineElement.innerText;
      
      return text;
    } catch (error) {
      console.error('读取行文字时出错:', error);
      return null;
    }
  }

  /**
   * 读取所有行的文字
   * @returns {string[]} - 所有行的内容数组
   */
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

  /**
   * 获取编辑器的完整文本内容
   * @returns {string} - 完整文本
   */
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

  /**
   * 测试：插入文字
   */
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

  /**
   * 通过 DOM 操作插入文字（适用于 contenteditable 元素）
   */
  insertTextViaDom(element, text) {
    try {
      // 聚焦元素
      element.focus();
      
      // 获取当前选区
      const selection = window.getSelection();
      if (!selection.rangeCount) {
        console.error('没有选区');
        return;
      }
      
      const range = selection.getRangeAt(0);
      
      // 删除当前选中内容（如果有）
      range.deleteContents();
      
      // 创建文本节点
      const textNode = document.createTextNode(text);
      
      // 插入文本节点
      range.insertNode(textNode);
      
      // 将光标移到插入文字之后
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
      
      // 触发 input 事件，让编辑器知道内容已更改
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log(`✅ 已通过 DOM 插入文字: "${text}"`);
    } catch (error) {
      console.error('DOM 插入失败:', error);
    }
  }

  /**
   * 调试：打印可用的编辑器元素
   */
  debugEditorElements() {
    console.log('=== 调试编辑器信息 ===');
    
    // 查找所有可能的编辑器容器
    const cm6 = document.querySelector('.cm-editor');
    const cm5 = document.querySelector('.CodeMirror');
    const ace = document.querySelector('.ace_editor');
    const editorPane = document.querySelector('.editor-pane');
    
    console.log('CodeMirror 6 (.cm-editor):', cm6);
    console.log('CodeMirror 5 (.CodeMirror):', cm5);
    console.log('Ace Editor (.ace_editor):', ace);
    console.log('Editor Pane (.editor-pane):', editorPane);
    
    // 查找所有 iframe
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

  /**
   * 查找 CodeMirror 6 编辑器实例
   */
  findCodeMirror6Editor() {
    // 先在主文档查找
    let editorElement = document.querySelector('.cm-editor');
    
    // 如果主文档没找到，尝试在 iframe 中查找
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

  /**
   * 查找 CodeMirror 5 编辑器实例
   */
  findCodeMirror5Editor() {
    // 先在主文档查找
    let editorElement = document.querySelector('.CodeMirror');
    
    // 如果主文档没找到，尝试在 iframe 中查找
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

    // CodeMirror 5 的实例存储在 element.CodeMirror
    return editorElement.CodeMirror || null;
  }

  /**
   * 查找 Ace 编辑器实例
   */
  findAceEditor() {
    // 先在主文档查找
    let editorElement = document.querySelector('.ace_editor');
    
    // 如果主文档没找到，尝试在 iframe 中查找
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

    // Ace 编辑器实例通常存储在 element.env.editor
    return editorElement.env?.editor || null;
  }

  /**
   * 向 CodeMirror 6 插入文字
   */
  insertTextToCM6(editor, text) {
    try {
      const { state, dispatch } = editor;
      const selection = state.selection.main;
      
      // 在当前光标位置插入文字
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

  /**
   * 向 CodeMirror 5 插入文字
   */
  insertTextToCM5(editor, text) {
    try {
      // 获取当前光标位置
      const cursor = editor.getCursor();
      
      // 在光标位置插入文字
      editor.replaceRange(text, cursor);
      
      // 将光标移动到插入文字之后
      editor.setCursor({
        line: cursor.line,
        ch: cursor.ch + text.length
      });
      
      // 聚焦编辑器
      editor.focus();
      
      console.log(`✅ 已在 CodeMirror 5 中插入文字: "${text}"`);
    } catch (error) {
      console.error('CodeMirror 5 插入失败:', error);
    }
  }

  /**
   * 向 Ace 编辑器插入文字
   */
  insertTextToAce(editor, text) {
    try {
      // 在当前光标位置插入文字
      editor.insert(text);
      
      // 聚焦编辑器
      editor.focus();
      
      console.log(`✅ 已在 Ace 编辑器中插入文字: "${text}"`);
    } catch (error) {
      console.error('Ace 编辑器插入失败:', error);
    }
  }

  /**
   * 测试：替换文字
   */
  testReplaceText() {
    console.log('TODO: 实现替换文字功能');
  }

  /**
   * 测试：删除文字
   */
  testDeleteText() {
    console.log('TODO: 实现删除文字功能');
  }

  /**
   * 测试：读取 Mybib.bib 文件
   */
  async testReadBibFile() {
    console.log('开始读取 Mybib.bib 文件');
    
    try {
      const fileName = 'Mybib.bib';
      const content = await this.readFileContentAsync(fileName);
      
      if (content) {
        console.log(`✅ 成功读取 ${fileName}:`);
        console.log(content);
        
        // 在聊天界面显示（截取前500字符）
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
          chatHistory.innerHTML += `<div class="ai-message ai-bot">已尝试打开 ${fileName}，但未在页面中找到图片预览</div>`;
          chatHistory.scrollTop = chatHistory.scrollHeight;
        }
        return;
      }

      const src = targetImg.getAttribute('src') || targetImg.src || '';

      if (chatHistory && src) {
        const safeSrc = this.escapeHtml(src);
        let message = `<div class="ai-message ai-bot"><strong>${fileName} 图片预览：</strong><br>`;
        message += `<img src="${safeSrc}" alt="${fileName}" style="max-width: 100%; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">`;
        message += `</div>`;
        chatHistory.innerHTML += message;
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }

      console.log(`✅ 已在侧边栏展示 ${fileName} 图片`);
    } catch (error) {
      console.error('读取 fig4.png 图片失败:', error);
    }
  }

  /**
   * 异步读取指定文件的内容
   * @param {string} fileName - 文件名
   * @returns {Promise<string|null>} - 文件内容
   */
  async readFileContentAsync(fileName) {
    try {
      // 检查当前打开的文件是否是目标文件
      const currentFileName = this.getCurrentFileName();
      console.log('当前打开的文件:', currentFileName);
      
      // 精确匹配文件名（不是包含关系）
      if (currentFileName === fileName) {
        console.log('目标文件已在编辑器中打开，直接读取');
        return this.getEditorFullText(fileName);
      }
      
      // 如果当前打开的是其他文件，尝试切换到目标文件
      console.log(`当前打开的是 ${currentFileName}，需要切换到 ${fileName}`);
      console.log(`尝试在文件树中查找并打开 ${fileName}`);
      
      const opened = this.openFileInEditor(fileName);
      
      if (opened) {
        // 使用真正的异步等待
        console.log('等待文件加载...');
        await this.sleep(1500); // 等待1.5秒让文件加载
        
        // 再次检查当前文件名
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

  /**
   * 异步等待
   * @param {number} ms - 毫秒数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取当前打开的文件名
   */
  getCurrentFileName() {
    try {
      // 尝试从面包屑获取
      const breadcrumb = document.querySelector('.ol-cm-breadcrumbs, .breadcrumbs');
      if (breadcrumb) {
        // 面包屑结构通常为：<span>图标</span><div>文件名</div>
        // 我们优先选择最后一个 div 作为文件名容器
        const fileNameElement = breadcrumb.querySelector('div:last-child');
        const text = fileNameElement?.textContent?.trim();
        if (text) return text;
      }
      
      // 尝试从选中的文件树项获取
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

  /**
   * 在编辑器中打开指定文件
   * @param {string} fileName - 文件名
   * @returns {boolean} - 是否成功打开
   */
  openFileInEditor(fileName) {
    try {
      // 在文件树中查找该文件
      const fileItems = document.querySelectorAll('li[role="treeitem"]');
      
      for (const item of fileItems) {
        const itemLabel = item.getAttribute('aria-label');
        if (itemLabel && itemLabel.includes(fileName)) {
          console.log(`找到文件: ${itemLabel}`);
          
          // 查找文件的链接/按钮
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

  /**
   * HTML 转义
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 测试：读取 File Outline
   */
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
        
        // 在聊天界面显示
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

  /**
   * 读取 File Outline 内容
   */
  readFileOutline() {
    try {
      // Overleaf 新版使用 .outline-item 类
      const outlineItems = document.querySelectorAll('.outline-item');
      
      if (outlineItems.length > 0) {
        console.log(`✅ 找到 ${outlineItems.length} 个 outline 项`);
        return this.parseOutlineItems(outlineItems);
      }
      
      console.log('尝试查找其他可能的 outline 选择器...');
      // 尝试其他可能的选择器
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

  /**
   * 解析 Outline 项目
   */
  parseOutlineItems(items) {
    const result = [];
    
    items.forEach((item) => {
      // 查找当前项的标题链接（只要直接子元素的）
      const titleLink = item.querySelector(':scope > .outline-item-row > .outline-item-link');
      
      if (!titleLink) return;
      
      // 获取标题文本
      let title = titleLink.textContent?.trim() || '';
      
      // 清理多余的空白
      title = title.replace(/\s+/g, ' ').trim();
      
      // 获取 aria-label 作为更准确的标题（如果有）
      const ariaLabel = item.getAttribute('aria-label');
      if (ariaLabel) {
        title = ariaLabel.trim();
      }
      
      // 尝试获取行号
      let line = item.getAttribute('data-line') || 
                 item.getAttribute('line') ||
                 item.getAttribute('data-line-number');
      
      // 如果没有行号属性，尝试从链接元素获取
      if (!line && titleLink) {
        line = titleLink.getAttribute('data-line') || 
               titleLink.getAttribute('data-line-number');
      }
      
      // 获取类型（从 aria-label 或类名推断）
      let type = 'section';
      if (title.toLowerCase().includes('chapter')) {
        type = 'chapter';
      } else if (title.toLowerCase().includes('subsection')) {
        type = 'subsection';
      }
      
      // 获取层级（通过嵌套的 ul 数量）
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

  /**
   * 测试：读取 File Tree
   */
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
        
        // 在聊天界面显示
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

  /**
   * 读取 File Tree 内容
   */
  readFileTree() {
    try {
      // 排除 outline 项，只选择文件树中的项
      // 使用更具体的选择器，避免选中 outline
      const fileTreeContainer = document.querySelector('.file-tree, .file-tree-inner, .file-tree-list');
      
      if (fileTreeContainer) {
        const fileItems = fileTreeContainer.querySelectorAll('li[role="treeitem"]');
        if (fileItems.length > 0) {
          console.log(`✅ 找到 ${fileItems.length} 个文件树项`);
          return this.parseFileTreeItems(fileItems);
        }
      }
      
      // 如果上面的方法失败，尝试通过 .entity 元素查找（文件树特有）
      const entityItems = document.querySelectorAll('.entity[data-file-id]');
      if (entityItems.length > 0) {
        console.log(`✅ 通过 .entity 找到 ${entityItems.length} 个文件项`);
        // 获取包含 .entity 的父 li 元素
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

  /**
   * 解析文件树项目
   */
  parseFileTreeItems(items) {
    const result = [];
    
    items.forEach((item) => {
      // 优先使用 aria-label（最准确）
      let name = item.getAttribute('aria-label');
      
      // 如果没有 aria-label，尝试从 .item-name-button > span 提取
      if (!name) {
        const nameElement = item.querySelector('.item-name-button > span');
        if (nameElement) {
          name = nameElement.textContent?.trim();
        }
      }
      
      // 如果还是没有，尝试其他方法
      if (!name) {
        const nameElement = item.querySelector('.entity-name, .file-tree-item-name');
        if (nameElement) {
          // 克隆元素以避免修改原始DOM
          const cloned = nameElement.cloneNode(true);
          // 移除图标元素
          const icons = cloned.querySelectorAll('.material-symbols, [class*="icon"]');
          icons.forEach(icon => icon.remove());
          name = cloned.textContent?.trim();
        }
      }
      
      if (!name) return;
      
      // 清理文件名
      name = name.replace(/\s+/g, ' ').trim();
      
      // 判断文件类型
      const entity = item.querySelector('.entity[data-file-type]');
      let type = 'file';
      let fileType = '';
      
      if (entity) {
        const dataType = entity.getAttribute('data-file-type');
        if (dataType === 'folder') {
          type = 'folder';
        } else {
          fileType = dataType; // doc, file, etc.
        }
      }
      
      // 检查是否是文件夹（通过类名或aria属性）
      const isFolder = item.classList.contains('folder') || 
                      item.classList.contains('directory') ||
                      item.getAttribute('aria-expanded') !== null;
      
      if (isFolder) {
        type = 'folder';
      }
      
      // 获取层级
      let level = 0;
      const ariaLevel = item.getAttribute('aria-level');
      if (ariaLevel) {
        level = parseInt(ariaLevel) - 1;
      } else {
        // 通过父元素层级计算
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
