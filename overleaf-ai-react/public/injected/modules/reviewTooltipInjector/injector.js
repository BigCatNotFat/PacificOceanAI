/**
 * Review Tooltip 注入器 - DOM 注入逻辑
 * 
 * 在原生 Overleaf review-tooltip-menu 中注入 AI 控件
 * UI 结构与原 selectionTooltip 完全一致
 */

import { getEditorView } from '../core/editorView.js';
import { checkIsActivated, showActivationRequiredHint } from '../modelManagement/state.js';
import { getSelectedTextActionModel, setSelectedTextActionModel, getAvailableModels } from '../modelManagement/models.js';

// 标记已注入的 class
const INJECTED_MARKER = 'ol-ai-controls-injected';

// 快捷操作配置 - 与原 selectionTooltip 一致
const SELECTION_ACTION_BUTTONS = [
  { id: 'expand', label: '扩写', icon: '' },
  { id: 'condense', label: '缩写', icon: '' },
  { id: 'polish', label: '润色', icon: '' },
  { id: 'translate', label: '译', icon: '' }
];

/**
 * 获取选区上下文
 */
function getSelectionContext(view, from, to, contextLines = 15) {
  try {
    const doc = view.state.doc;
    
    const startLine = doc.lineAt(from);
    const endLine = doc.lineAt(to);
    
    const contextStartLineNum = Math.max(1, startLine.number - contextLines);
    const contextEndLineNum = Math.min(doc.lines, endLine.number + contextLines);
    
    let contextBefore = '';
    if (contextStartLineNum < startLine.number) {
      const beforeStartPos = doc.line(contextStartLineNum).from;
      const beforeEndPos = startLine.from;
      contextBefore = doc.sliceString(beforeStartPos, beforeEndPos);
      contextBefore = contextBefore.replace(/\n$/, '');
    }
    
    let contextAfter = '';
    if (contextEndLineNum > endLine.number) {
      const afterStartPos = endLine.to + 1;
      const afterEndPos = doc.line(contextEndLineNum).to;
      if (afterStartPos <= afterEndPos) {
        contextAfter = doc.sliceString(afterStartPos, afterEndPos);
      }
    }
    
    return { contextBefore, contextAfter };
  } catch (e) {
    console.error('[ReviewTooltipInjector] Failed to get selection context:', e);
    return { contextBefore: '', contextAfter: '' };
  }
}

/**
 * 获取当前选区信息
 */
function getCurrentSelectionInfo() {
  try {
    const view = getEditorView();
    if (!view) return null;
    
    const doc = view.state.doc;
    const selection = view.state.selection.main;
    
    if (!selection || selection.empty) return null;
    
    const from = selection.from;
    const to = selection.to;
    const text = doc.sliceString(from, to);
    
    if (!text || text.trim().length === 0) return null;
    
    const context = getSelectionContext(view, from, to);
    
    return {
      from,
      to,
      text,
      contextBefore: context.contextBefore,
      contextAfter: context.contextAfter
    };
  } catch (e) {
    console.error('[ReviewTooltipInjector] Failed to get selection info:', e);
    return null;
  }
}

/**
 * 发送文本操作请求
 */
function sendTextActionRequest(action, customPrompt = '') {
  if (!checkIsActivated()) {
    console.warn('[ReviewTooltipInjector] Not activated');
    showActivationRequiredHint();
    return false;
  }
  
  const selectionInfo = getCurrentSelectionInfo();
  if (!selectionInfo) {
    console.warn('[ReviewTooltipInjector] No selection available');
    return false;
  }
  
  const selectedModel = getSelectedTextActionModel();
  
  console.log('[ReviewTooltipInjector] Sending text action:', action, 'model:', selectedModel);
  
  window.postMessage({
    type: 'OVERLEAF_TEXT_ACTION_REQUEST',
    data: {
      action: action,
      customPrompt: customPrompt,
      text: selectionInfo.text,
      from: selectionInfo.from,
      to: selectionInfo.to,
      modelId: selectedModel,
      insertMode: false,
      contextBefore: selectionInfo.contextBefore,
      contextAfter: selectionInfo.contextAfter
    }
  }, '*');
  
  return true;
}

/**
 * 处理自定义请求提交
 */
function handleCustomSubmit(inputElement, submitBtn) {
  const value = inputElement.value.trim();
  
  if (!value) {
    inputElement.style.border = '1px solid rgba(245, 158, 11, 0.5)';
    inputElement.placeholder = '请输入您的要求...';
    setTimeout(() => {
      inputElement.style.border = '1px solid #333';
      inputElement.placeholder = '输入您的要求...';
    }, 1500);
    return;
  }
  
  const success = sendTextActionRequest('custom', value);
  
  if (success) {
    inputElement.value = '';
    inputElement.style.height = '32px';
  }
}

/**
 * 处理快捷操作按钮点击
 */
function handleActionButtonClick(actionId) {
  sendTextActionRequest(actionId);
}

/**
 * 将添加评论按钮改为小图标
 */
function transformAddCommentButton(menu) {
  const addCommentBtn = menu.querySelector('.review-tooltip-add-comment-button');
  if (addCommentBtn && !addCommentBtn.dataset.transformed) {
    addCommentBtn.dataset.transformed = 'true';
    addCommentBtn.classList.add('ol-ai-transformed');
    
    // 遍历子节点，隐藏文字节点，保留图标
    Array.from(addCommentBtn.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const span = document.createElement('span');
        span.className = 'review-tooltip-add-comment-button-text';
        span.textContent = node.textContent;
        addCommentBtn.replaceChild(span, node);
      } else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('material-symbols')) {
        node.classList.add('review-tooltip-add-comment-button-text');
      }
    });
    
    addCommentBtn.title = addCommentBtn.title || '添加评论';
    console.log('[ReviewTooltipInjector] Add comment button transformed');
  }
  return addCommentBtn;
}

/**
 * 创建操作按钮 - 与原 selectionTooltip 一致
 */
function createActionButton(config) {
  const btn = document.createElement('button');
  btn.textContent = config.icon + ' ' + config.label;
  btn.dataset.actionId = config.id;
  btn.className = 'ol-ai-action-btn';
  
  btn.onclick = function(e) {
    e.stopPropagation();
    handleActionButtonClick(config.id);
  };
  
  // 阻止事件冒泡
  ['mousedown', 'mouseup'].forEach(eventType => {
    btn.addEventListener(eventType, e => e.stopPropagation());
  });
  
  return btn;
}

/**
 * 创建模型选择器 - 与原 selectionTooltip 一致
 */
function createModelSelector() {
  const container = document.createElement('div');
  container.className = 'ol-ai-model-selector';
  
  // 下拉选择框
  const select = document.createElement('select');
  select.className = 'ol-ai-model-select';
  
  // 添加选项
  const currentModel = getSelectedTextActionModel();
  const models = getAvailableModels();
  models.forEach(function(model) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    if (model.id === currentModel) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  
  // 监听变化
  select.onchange = function() {
    setSelectedTextActionModel(this.value);
  };
  
  // 阻止事件冒泡
  ['click', 'mousedown', 'mouseup', 'keydown', 'keyup'].forEach(eventType => {
    select.addEventListener(eventType, e => e.stopPropagation());
  });
  
  container.appendChild(select);
  
  return container;
}

/**
 * 创建 AI 控件容器 - 与原 selectionTooltip UI 完全一致
 */
function createAIControls(addCommentBtn) {
  // 主容器 - 样式与原 ol-ai-selection-tooltip 一致
  const wrapper = document.createElement('div');
  wrapper.className = `ol-ai-tooltip-wrapper ${INJECTED_MARKER}`;
  
  // ============ 自定义输入区域 ============
  const customInputContainer = document.createElement('div');
  customInputContainer.className = 'ol-ai-custom-input-container';
  
  // 输入框
  const customInput = document.createElement('textarea');
  customInput.className = 'ol-ai-custom-input';
  customInput.placeholder = '输入您的要求...';
  
  // 阻止输入框的键盘事件冒泡到编辑器
  ['keydown', 'keyup', 'keypress', 'input'].forEach(eventType => {
    customInput.addEventListener(eventType, function(e) {
      e.stopPropagation();
      if (e.type === 'keydown') {
        if ((e.ctrlKey && e.key === 'Enter') || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          handleCustomSubmit(customInput, sendBtn);
        }
        if (e.key === 'Escape') {
          customInput.value = '';
          customInput.blur();
        }
      }
    });
  });
  
  // 自动调整高度
  customInput.oninput = function() {
    this.style.height = '32px';
    this.style.height = Math.min(this.scrollHeight, 60) + 'px';
  };
  
  // 阻止鼠标事件冒泡
  ['click', 'mousedown', 'mouseup'].forEach(eventType => {
    customInput.addEventListener(eventType, e => e.stopPropagation());
  });
  
  customInputContainer.appendChild(customInput);
  
  // 发送按钮
  const sendBtn = document.createElement('button');
  sendBtn.className = 'ol-ai-send-btn';
  sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
  sendBtn.title = '发送 (Enter)';
  
  sendBtn.onclick = function(e) {
    e.stopPropagation();
    handleCustomSubmit(customInput, sendBtn);
  };
  
  ['mousedown', 'mouseup'].forEach(eventType => {
    sendBtn.addEventListener(eventType, e => e.stopPropagation());
  });
  
  customInputContainer.appendChild(sendBtn);
  wrapper.appendChild(customInputContainer);
  
  // ============ 底部行：按钮 + 模型选择器 ============
  const bottomRow = document.createElement('div');
  bottomRow.className = 'ol-ai-bottom-row';
  
  // 按钮容器
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'ol-ai-selection-buttons';
  
  // 如果有添加评论按钮，先放进来
  if (addCommentBtn) {
    buttonContainer.appendChild(addCommentBtn);
  }
  
  // 添加快捷操作按钮
  SELECTION_ACTION_BUTTONS.forEach(function(btnConfig) {
    const btn = createActionButton(btnConfig);
    buttonContainer.appendChild(btn);
  });
  
  bottomRow.appendChild(buttonContainer);
  
  // 模型选择器
  const modelSelector = createModelSelector();
  bottomRow.appendChild(modelSelector);
  
  wrapper.appendChild(bottomRow);
  
  return wrapper;
}

/**
 * 处理菜单注入
 */
export function processMenu(menu) {
  // 检查是否已经注入过
  if (menu.querySelector('.' + INJECTED_MARKER)) {
    return;
  }
  
  // 1. 将添加评论按钮改为小图标并获取它
  const addCommentBtn = transformAddCommentButton(menu);
  
  // 2. 从原菜单中移除添加评论按钮（我们会把它放到新容器中）
  if (addCommentBtn && addCommentBtn.parentNode === menu) {
    addCommentBtn.remove();
  }
  
  // 3. 标记原菜单已增强
  menu.classList.add('ol-ai-enhanced');
  
  // 4. 清空原菜单内容（保留原有的其他元素如果有的话）
  // 实际上我们只需要隐藏原有样式，然后插入我们的容器
  
  // 5. 创建并插入 AI 控件（包含添加评论按钮）
  const aiControls = createAIControls(addCommentBtn);
  menu.appendChild(aiControls);
  
  console.log('[ReviewTooltipInjector] AI controls injected into review tooltip');
}

/**
 * 检查元素是否是目标菜单
 */
export function isTargetMenu(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  return element.classList && element.classList.contains('review-tooltip-menu');
}

/**
 * 从元素中查找目标菜单
 */
export function findMenusInElement(element) {
  const menus = [];
  
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return menus;
  }
  
  if (isTargetMenu(element)) {
    menus.push(element);
  } else if (element.classList && element.classList.contains('review-tooltip-menu-container')) {
    const innerMenu = element.querySelector('.review-tooltip-menu');
    if (innerMenu) menus.push(innerMenu);
  } else if (element.querySelectorAll) {
    const foundMenus = element.querySelectorAll('.review-tooltip-menu');
    menus.push(...Array.from(foundMenus));
  }
  
  return menus;
}
