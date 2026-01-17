/**
 * 预览系统 - 流式预览逻辑
 */

import { getEditorView } from '../core/editorView.js';
import { getCurrentFileName } from '../core/utils.js';
import { hideSelectionTooltip } from '../selectionTooltip/ui.js';
import { diffEffects } from '../diff/extension.js';
import { inlineStatusByFile } from '../diff/store.js';

let streamPreviewText = '';
let isStreamingPreview = false;
let currentPreview = null;

/**
 * 判断选区是否为整行
 */
function isFullLineSelection(view, from, to) {
  try {
    const startLine = view.state.doc.lineAt(from);
    const endLine = view.state.doc.lineAt(to);
    // 从行首开始且到行尾结束（或下一行行首）
    return from === startLine.from && (to === endLine.to || to === endLine.to + 1);
  } catch (e) {
    return false;
  }
}

/**
 * 获取选区的行号范围
 */
function getLineRange(view, from, to) {
  try {
    const startLine = view.state.doc.lineAt(from);
    const endLine = view.state.doc.lineAt(to);
    return {
      startLine: startLine.number,
      endLine: endLine.number
    };
  } catch (e) {
    return { startLine: 1, endLine: 1 };
  }
}

/**
 * 创建内联状态窗口
 */
function createInlineStatus(config) {
  const effects = window._diffSuggestionEffects || diffEffects;
  const view = getEditorView();
  if (!effects || !view) {
    console.warn('[InlineStatus] Effects or view not available');
    return null;
  }
  
  try {
    view.dispatch({
      effects: effects.addInlineStatusEffect.of(config)
    });
    
    // 保存到文件级存储
    const fileName = config.fileName || 'unknown';
    if (!inlineStatusByFile.has(fileName)) {
      inlineStatusByFile.set(fileName, new Map());
    }
    inlineStatusByFile.get(fileName).set(config.id, config);
    
    console.log('[InlineStatus] 创建内联状态:', config.id);
    return config.id;
  } catch (e) {
    console.error('[InlineStatus] 创建失败:', e);
    return null;
  }
}

/**
 * 更新内联状态窗口
 */
function updateInlineStatusState(updates) {
  const effects = window._diffSuggestionEffects || diffEffects;
  const view = getEditorView();
  if (!effects || !view) return;
  
  try {
    view.dispatch({
      effects: effects.updateInlineStatusEffect.of(updates)
    });
  } catch (e) {
    console.error('[InlineStatus] 更新失败:', e);
  }
}

/**
 * 移除内联状态窗口
 */
function removeInlineStatus(id) {
  const effects = window._diffSuggestionEffects || diffEffects;
  const view = getEditorView();
  if (!effects || !view) return;
  
  try {
    view.dispatch({
      effects: effects.removeInlineStatusEffect.of(id)
    });
    
    // 从文件级存储中移除
    for (const entry of inlineStatusByFile) {
      const statusMap = entry[1];
      if (statusMap.has(id)) {
        statusMap.delete(id);
        break;
      }
    }
    
    console.log('[InlineStatus] 移除内联状态:', id);
  } catch (e) {
    console.error('[InlineStatus] 移除失败:', e);
  }
}

/**
 * 开始流式预览
 */
export function startStreamPreview(data) {
  try {
    hideSelectionTooltip();
    
    const view = getEditorView();
    if (!view) {
      console.error('[OverleafBridge] EditorView not available for stream preview');
      return;
    }
    
    streamPreviewText = '';
    isStreamingPreview = true;
    
    const isInsertMode = !data.originalText || data.originalText.trim().length === 0;
    const isFullLine = isFullLineSelection(view, data.from, data.to);
    const lineRange = getLineRange(view, data.from, data.to);
    const statusId = 'inline-status-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    currentPreview = {
      id: statusId,
      action: data.action,
      originalText: data.originalText,
      newText: '',
      from: data.from,
      to: data.to,
      isInsertMode: isInsertMode,
      isFullLine: isFullLine,
      lineRange: lineRange,
      suggestionId: null
    };
    
    const inlineStatusConfig = {
      id: statusId,
      fileName: getCurrentFileName(),
      from: data.from,
      to: data.to,
      widgetPos: data.from,
      originalText: data.originalText,
      newText: null,
      state: 'generating',
      isFullLine: isFullLine,
      lineRange: lineRange,
      action: data.action
    };
    
    createInlineStatus(inlineStatusConfig);
    
    console.log('[OverleafBridge] Stream preview started with inline status:', statusId, 
      'isFullLine:', isFullLine, 'lines:', lineRange.startLine, '-', lineRange.endLine);
    
  } catch (e) {
    console.error('[OverleafBridge] Failed to start stream preview:', e);
  }
}

/**
 * 更新流式预览内容
 */
export function updateStreamPreview(delta) {
  if (!isStreamingPreview || !currentPreview) return;
  
  streamPreviewText += delta;
  currentPreview.newText = streamPreviewText;
}

/**
 * 完成流式预览
 */
export function completeStreamPreview(data) {
  if (!currentPreview) return;
  
  isStreamingPreview = false;
  const newText = (data && data.newText) ? data.newText : streamPreviewText;
  currentPreview.newText = newText;
  
  removeInlineStatus(currentPreview.id);
  
  if (!newText || newText.trim().length === 0) {
    console.log('[OverleafBridge] 生成失败或返回空内容');
    currentPreview = null;
    return;
  }
  
  const view = getEditorView();
  if (!view) {
    console.error('[OverleafBridge] EditorView not available for suggestion');
    currentPreview = null;
    return;
  }
  
  const waitForDiffAPI = function(callback, retries) {
    if (window.diffAPI) {
      callback();
    } else if (retries > 0) {
      setTimeout(function() { waitForDiffAPI(callback, retries - 1); }, 100);
    } else {
      console.error('[OverleafBridge] diffAPI not available');
    }
  };
  
  waitForDiffAPI(function() {
    try {
      let suggestionId = null;
      
      if (currentPreview.isInsertMode) {
        // 插入模式：使用片段建议
        suggestionId = window.diffAPI.suggestSegmentWithId(
          'text-action-' + currentPreview.id,
          currentPreview.from,
          currentPreview.to,
          newText
        );
      } else if (currentPreview.isFullLine) {
        // 整行模式：使用行级建议
        const lineRange = currentPreview.lineRange;
        suggestionId = window.diffAPI.suggestRangeWithId(
          'text-action-' + currentPreview.id,
          lineRange.startLine,
          lineRange.endLine,
          newText
        );
      } else {
        // 片段模式：使用片段级建议
        suggestionId = window.diffAPI.suggestSegmentWithId(
          'text-action-' + currentPreview.id,
          currentPreview.from,
          currentPreview.to,
          newText
        );
      }
      
      if (currentPreview) {
        currentPreview.suggestionId = suggestionId;
      }
      
      console.log('[OverleafBridge] Stream preview completed with suggestion:', suggestionId);
      currentPreview = null;
        
    } catch (e) {
      console.error('[OverleafBridge] Failed to create suggestion:', e);
      updateInlineStatusState({
        id: currentPreview.id,
        state: 'error'
      });
    }
  }, 10);
}

// 监听 ESC 键
export function initStreamListeners() {
  window.addEventListener('keyup', function(event) {
    if (event.key === 'Escape' && currentPreview) {
      window.postMessage({
        type: 'OVERLEAF_STREAM_CANCEL',
        data: { reason: 'user_escape' }
      }, '*');
      
      // 取消预览
      if (currentPreview) {
        removeInlineStatus(currentPreview.id);
        currentPreview = null;
        isStreamingPreview = false;
      }
    }
  });
}

