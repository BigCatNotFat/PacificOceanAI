/**
 * 选区工具提示 - 文本操作逻辑
 */

import { getEditorView } from '../core/editorView.js';
import { checkIsActivated, showActivationRequiredHint } from '../modelManagement/state.js';
import { getSelectedTextActionModel } from '../modelManagement/models.js';
import { getCurrentSelection, showNoSelectionHint, hideSelectionTooltip, showTextActionMenuAtCursor } from './ui.js';
import { debug, warn } from '../core/logger.js';

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
    console.error('[OverleafBridge] Failed to get selection context:', e);
    return { contextBefore: '', contextAfter: '' };
  }
}

/**
 * 处理自定义请求
 */
export function handleCustomRequest() {
  if (!checkIsActivated()) {
    warn('[OverleafBridge] Not activated, showing activation hint');
    showActivationRequiredHint();
    return;
  }
  
  const inputEl = document.getElementById('ol-ai-custom-input');
  if (!inputEl) return;
  
  const customPrompt = inputEl.value.trim();
  if (!customPrompt) {
    inputEl.style.border = '1px solid rgba(245, 158, 11, 0.5)';
    inputEl.placeholder = '请输入您的要求...';
    setTimeout(function() {
      inputEl.style.border = '1px solid rgba(255,255,255,0.15)';
      inputEl.placeholder = '输入要求，如：插入积分公式、润色文本...';
    }, 1500);
    return;
  }
  
  let selectionData = getCurrentSelection();
  
  // 尝试获取光标位置（如果没有选区）
  if (!selectionData) {
    try {
      const view = getEditorView();
      if (view) {
        const selection = view.state.selection.main;
        const cursorPos = selection.head;
        selectionData = {
          from: cursorPos,
          to: cursorPos,
          text: '',
          isEmpty: true
        };
      }
    } catch (e) {
      console.error('[OverleafBridge] Failed to get cursor position:', e);
    }
  }
  
  if (!selectionData) {
    warn('[OverleafBridge] No cursor position available');
    return;
  }
  
  const selectedModel = getSelectedTextActionModel();
  const hasSelection = selectionData.text && selectionData.text.trim().length > 0;
  
  debug('[OverleafBridge] Custom request:', customPrompt, 'model:', selectedModel);
  
  let contextBefore = '';
  let contextAfter = '';
  try {
    const view = getEditorView();
    if (view) {
      const context = getSelectionContext(view, selectionData.from, selectionData.to);
      contextBefore = context.contextBefore;
      contextAfter = context.contextAfter;
    }
  } catch (e) {
    console.error('[OverleafBridge] Failed to get context:', e);
  }

  window.postMessage({
    type: 'OVERLEAF_TEXT_ACTION_REQUEST',
    data: {
      action: 'custom',
      customPrompt: customPrompt,
      text: selectionData.text || '',
      from: selectionData.from,
      to: selectionData.to,
      modelId: selectedModel,
      insertMode: !hasSelection,
      contextBefore: contextBefore,
      contextAfter: contextAfter
    }
  }, '*');
  
  inputEl.value = '';
  inputEl.style.height = 'auto';
  hideSelectionTooltip();
}

/**
 * 处理文本操作请求
 */
export function handleTextActionRequest(actionType) {
  if (!checkIsActivated()) {
    warn('[OverleafBridge] Not activated, showing activation hint');
    showActivationRequiredHint();
    return;
  }
  
  const currentSelection = getCurrentSelection();
  
  if (!currentSelection) {
    warn('[OverleafBridge] No selection for text action');
    showNoSelectionHint();
    return;
  }
  
  if (currentSelection.isEmpty || !currentSelection.text || currentSelection.text.trim().length === 0) {
    warn('[OverleafBridge] Empty selection for text action');
    showNoSelectionHint();
    return;
  }
  
  const selectedModel = getSelectedTextActionModel();
  debug('[OverleafBridge] Text action requested:', actionType, 'model:', selectedModel);
  
  let contextBefore = '';
  let contextAfter = '';
  const view = getEditorView();
  if (view) {
    const context = getSelectionContext(view, currentSelection.from, currentSelection.to);
    contextBefore = context.contextBefore;
    contextAfter = context.contextAfter;
  }
  
  window.postMessage({
    type: 'OVERLEAF_TEXT_ACTION_REQUEST',
    data: {
      action: actionType,
      text: currentSelection.text,
      from: currentSelection.from,
      to: currentSelection.to,
      modelId: selectedModel,
      contextBefore: contextBefore,
      contextAfter: contextAfter
    }
  }, '*');
  
  hideSelectionTooltip();
}

/**
 * 初始化操作监听
 */
export function initActionListeners() {
  // 监听文本操作结果
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    var data = event.data;
    if (!data || (data.type !== 'OVERLEAF_TRANSLATE_RESPONSE' && data.type !== 'OVERLEAF_TEXT_ACTION_RESPONSE')) return;
    
    const actionType = data.data.action || 'translate';
    debug('[OverleafBridge] Received text action result:', actionType);
    
    try {
      const view = getEditorView();
      if (!view) return;
      
      const resultText = data.data.resultText || data.data.translatedText;
      if (!resultText) return;
      
      view.dispatch({
        changes: { 
          from: data.data.from, 
          to: data.data.to, 
          insert: resultText 
        }
      });
      
      debug('[OverleafBridge] Text action applied successfully');
    } catch (error) {
      console.error('[OverleafBridge] Failed to apply text action:', error);
    }
  });

  // 监听快捷键 Ctrl+Alt+/
  window.addEventListener('keydown', function(event) {
    const isSlashKey = event.key === '/' || event.code === 'Slash' || event.keyCode === 191;
    
    if (event.ctrlKey && event.altKey && isSlashKey) {
      event.preventDefault();
      event.stopPropagation();
      
      debug('[OverleafBridge] Shortcut Ctrl+Alt+/ detected');
      
      const tooltip = document.getElementById('ol-ai-selection-tooltip');
      if (tooltip && tooltip.style.display === 'flex') {
        hideSelectionTooltip();
      } else {
        showTextActionMenuAtCursor();
      }
      
      return false;
    }
  }, true);
}

