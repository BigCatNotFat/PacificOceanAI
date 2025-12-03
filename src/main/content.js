/**
 * Overleaf AI 助手 - 主入口文件
 * 
 * 这是一个浏览器扩展的内容脚本，为 Overleaf 添加 AI 助手功能
 */

import { ELEMENTS } from '../config/constants.js';
import { injectStyles } from '../utils/dom.js';
import { Sidebar } from '../components/sidebar.js';
import { ToolbarButton, ButtonInjector } from '../components/button.js';

/**
 * 应用主类
 */
class OverleafAIApp {
  constructor() {
    this.sidebar = null;
    this.button = null;
    this.buttonInjector = null;
  }

  /**
   * 初始化应用
   */
  init() {
    // 1. 注入样式
    this.injectStylesheet();

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

  /**
   * 注入样式表
   */
  injectStylesheet() {
    // 读取 CSS 文件内容并注入
    fetch(chrome.runtime.getURL('src/styles/sidebar.css'))
      .then((response) => response.text())
      .then((css) => {
        injectStyles(ELEMENTS.STYLE_ID, css);
      })
      .catch((error) => {
        console.error('❌ 加载样式表失败:', error);
      });
  }

  /**
   * 销毁应用（清理资源）
   */
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

// 启动应用
const app = new OverleafAIApp();
app.init();

// 监听扩展卸载事件
if (chrome.runtime && chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(() => {
    app.destroy();
  });
}
