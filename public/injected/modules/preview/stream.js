/**
 * 预览系统 - 流式预览逻辑
 */

import { getEditorView } from '../core/editorView.js';
import { getCurrentFileName } from '../core/utils.js';
import { hideSelectionTooltip } from '../selectionTooltip/ui.js';
import { diffEffects } from '../diff/extension.js';
import { inlineStatusByFile } from '../diff/store.js';
import { debug, warn } from '../core/logger.js';

// 支持多任务并行：使用 Map 存储多个预览状态
// key 是 previewId，value 是预览对象
const previewsMap = new Map();

// 用于生成唯一的 inline-status ID
function generateStatusId() {
  return 'inline-status-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

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
    warn('[InlineStatus] Effects or view not available');
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
    
    debug('[InlineStatus] 创建内联状态:', config.id);
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
    
    debug('[InlineStatus] 移除内联状态:', id);
  } catch (e) {
    console.error('[InlineStatus] 移除失败:', e);
  }
}

/**
 * 开始流式预览（支持多任务并行）
 */
export function startStreamPreview(data) {
  try {
    hideSelectionTooltip();
    
    const view = getEditorView();
    if (!view) {
      console.error('[OverleafBridge] EditorView not available for stream preview');
      return;
    }
    
    // 使用传入的 previewId，如果没有则生成一个
    const previewId = data.previewId || ('legacy-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    const statusId = generateStatusId();
    
    const isInsertMode = !data.originalText || data.originalText.trim().length === 0;
    const isFullLine = isFullLineSelection(view, data.from, data.to);
    const lineRange = getLineRange(view, data.from, data.to);
    
    // 创建预览对象并存储到 Map
    const preview = {
      id: statusId,
      previewId: previewId,
      action: data.action,
      originalText: data.originalText,
      newText: '',
      streamText: '',  // 用于累积流式文本
      from: data.from,
      to: data.to,
      isInsertMode: isInsertMode,
      isFullLine: isFullLine,
      lineRange: lineRange,
      suggestionId: null,
      isStreaming: true
    };
    
    previewsMap.set(previewId, preview);
    
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
    
    debug('[OverleafBridge] Stream preview started:', 
      'previewId:', previewId,
      'statusId:', statusId,
      'isFullLine:', isFullLine, 
      'lines:', lineRange.startLine, '-', lineRange.endLine);
    
  } catch (e) {
    console.error('[OverleafBridge] Failed to start stream preview:', e);
  }
}

/**
 * 更新流式预览内容（支持多任务并行）
 * @param {string} previewId - 预览 ID
 * @param {string} delta - 增量文本
 */
export function updateStreamPreview(previewId, delta) {
  // 兼容旧版调用（只传 delta）
  if (typeof previewId === 'string' && delta === undefined) {
    // 旧版调用：previewId 实际上是 delta
    delta = previewId;
    // 尝试更新最后一个预览
    if (previewsMap.size === 0) return;
    const lastEntry = Array.from(previewsMap.entries()).pop();
    if (!lastEntry) return;
    previewId = lastEntry[0];
  }
  
  const preview = previewsMap.get(previewId);
  if (!preview || !preview.isStreaming) return;
  
  preview.streamText += delta;
  preview.newText = preview.streamText;
}

/**
 * 完成流式预览（支持多任务并行）
 * @param {Object} data - 包含 previewId 和 newText
 */
export function completeStreamPreview(data) {
  // 获取 previewId
  let previewId = data && data.previewId;
  
  // 兼容旧版：如果没有 previewId，尝试使用最后一个预览
  if (!previewId) {
    if (previewsMap.size === 0) return;
    const lastEntry = Array.from(previewsMap.entries()).pop();
    if (!lastEntry) return;
    previewId = lastEntry[0];
  }
  
  const preview = previewsMap.get(previewId);
  if (!preview) {
    warn('[OverleafBridge] 找不到预览:', previewId);
    return;
  }
  
  preview.isStreaming = false;
  const newText = (data && data.newText) ? data.newText : preview.streamText;
  preview.newText = newText;
  
  removeInlineStatus(preview.id);
  
  if (!newText || newText.trim().length === 0) {
    debug('[OverleafBridge] 生成失败或返回空内容 previewId:', previewId);
    previewsMap.delete(previewId);
    return;
  }
  
  const view = getEditorView();
  if (!view) {
    console.error('[OverleafBridge] EditorView not available for suggestion');
    previewsMap.delete(previewId);
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
  
  // 使用闭包保存当前 preview 和 previewId
  const currentPreview = preview;
  const currentPreviewId = previewId;
  
  // 创建决策回调（用于统计）
  // 当用户接受/拒绝建议时，发送包含 action 的决策消息
  const createDecisionCallbacks = function(action) {
    return {
      onAccept: function() {
        // 发送决策消息，包含 action 用于统计
        window.postMessage({
          type: 'OVERLEAF_TEXT_ACTION_DECISION',
          data: {
            action: action,
            accepted: true
          }
        }, '*');
      },
      onReject: function() {
        // 发送决策消息，包含 action 用于统计
        window.postMessage({
          type: 'OVERLEAF_TEXT_ACTION_DECISION',
          data: {
            action: action,
            accepted: false
          }
        }, '*');
      }
    };
  };
  
  waitForDiffAPI(function() {
    try {
      let suggestionId = null;
      const callbacks = createDecisionCallbacks(currentPreview.action);
      
      if (currentPreview.isInsertMode) {
        // 插入模式：使用片段建议
        suggestionId = window.diffAPI.suggestSegmentWithId(
          'text-action-' + currentPreview.id,
          currentPreview.from,
          currentPreview.to,
          newText,
          callbacks
        );
      } else if (currentPreview.isFullLine) {
        // 整行模式：使用行级建议
        const lineRange = currentPreview.lineRange;
        suggestionId = window.diffAPI.suggestRangeWithId(
          'text-action-' + currentPreview.id,
          lineRange.startLine,
          lineRange.endLine,
          newText,
          callbacks
        );
      } else {
        // 片段模式：使用片段级建议
        suggestionId = window.diffAPI.suggestSegmentWithId(
          'text-action-' + currentPreview.id,
          currentPreview.from,
          currentPreview.to,
          newText,
          callbacks
        );
      }
      
      currentPreview.suggestionId = suggestionId;
      
      debug('[OverleafBridge] Stream preview completed:', 
        'previewId:', currentPreviewId,
        'suggestionId:', suggestionId,
        'action:', currentPreview.action);
      
      // 从 Map 中移除
      previewsMap.delete(currentPreviewId);
        
    } catch (e) {
      console.error('[OverleafBridge] Failed to create suggestion:', e, 'previewId:', currentPreviewId);
      updateInlineStatusState({
        id: currentPreview.id,
        state: 'error'
      });
      previewsMap.delete(currentPreviewId);
    }
  }, 10);
}

/**
 * 取消指定的预览（支持多任务并行）
 * @param {string} previewId - 预览 ID，如果不提供则取消所有预览
 */
export function cancelStreamPreview(previewId) {
  if (previewId) {
    const preview = previewsMap.get(previewId);
    if (preview) {
      removeInlineStatus(preview.id);
      previewsMap.delete(previewId);
      debug('[OverleafBridge] 取消预览:', previewId);
    }
  } else {
    // 取消所有预览
    for (const [id, preview] of previewsMap) {
      removeInlineStatus(preview.id);
      debug('[OverleafBridge] 取消预览:', id);
    }
    previewsMap.clear();
  }
}

// 监听 ESC 键 - 取消所有正在进行的预览
export function initStreamListeners() {
  window.addEventListener('keyup', function(event) {
    if (event.key === 'Escape' && previewsMap.size > 0) {
      // 通知 React 应用取消所有请求
      window.postMessage({
        type: 'OVERLEAF_STREAM_CANCEL',
        data: { reason: 'user_escape' }
      }, '*');
      
      // 取消所有预览
      cancelStreamPreview();
    }
  });
  
  // 监听取消特定预览的消息
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    const data = event.data;
    if (!data) return;
    
    if (data.type === 'OVERLEAF_STREAM_PREVIEW_CANCELLED') {
      const previewId = data.data && data.data.previewId;
      if (previewId) {
        cancelStreamPreview(previewId);
      }
    }
  });
}

