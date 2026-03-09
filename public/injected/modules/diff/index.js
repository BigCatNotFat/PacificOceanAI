/**
 * Diff 系统 - 入口
 */

import { getCurrentFileName } from '../core/utils.js';
import { methodHandlers } from '../core/registry.js';
import { debug, warn } from '../core/logger.js';
import { 
  diffCurrentFileName, 
  diffCurrentView, 
  setDiffCurrentFileName, 
  setDiffCurrentView,
  setDiffFileCheckInterval,
  diffFileCheckInterval,
  getCurrentFileSuggestions,
  getCurrentFileInlineStatus
} from './store.js';
import { createDiffSuggestionExtension, diffEffects } from './extension.js';
import { injectDiffStyles, createDiffControlBar, updateDiffControlBar } from './ui.js';
import { setupDiffAPI, initDiffMessageListeners, jumpToNextFileWithSuggestions } from './api.js';

let diffCodeMirror = null;

/**
 * 恢复当前文件的建议到编辑器
 */
function restoreSuggestionsForCurrentFile() {
  if (!diffCurrentView || !diffCurrentFileName) {
    updateDiffControlBar();
    return;
  }
  
  const suggestions = getCurrentFileSuggestions();
  const inlineStatus = getCurrentFileInlineStatus();
  
  if (!diffEffects) {
    updateDiffControlBar();
    return;
  }
  
  // 清除所有装饰
  try {
    diffCurrentView.dispatch({ 
      effects: [
        diffEffects.clearDiffSuggestionsEffect.of(null),
        diffEffects.clearSegmentSuggestionsEffect.of(null),
        diffEffects.clearInlineStatusEffect.of(null)
      ]
    });
  } catch (e) {}
  
  if (suggestions.size === 0 && inlineStatus.size === 0) {
    debug('[DiffAPI] 当前文件无建议:', diffCurrentFileName);
    updateDiffControlBar();
    return;
  }
  
  debug('[DiffAPI] 恢复文件建议:', diffCurrentFileName, '共', suggestions.size, '个建议,', inlineStatus.size, '个内联状态');
  
  // 恢复建议
  const toRemove = [];
  for (const entry of suggestions) {
    const id = entry[0];
    const config = entry[1];
    try {
      if (config.type === 'segment') {
        const docContent = diffCurrentView.state.doc.toString();
        const foundIndex = docContent.indexOf(config.oldContent);
        if (foundIndex !== -1) {
          config.startOffset = foundIndex;
          config.endOffset = foundIndex + config.oldContent.length;
          config.widgetPos = config.endOffset;
          diffCurrentView.dispatch({ effects: diffEffects.addSegmentSuggestionEffect.of(config) });
        } else {
          warn('[DiffAPI] 恢复片段建议失败，找不到原始内容:', id);
          toRemove.push(id);
        }
      } else {
        const lineStart = diffCurrentView.state.doc.line(config.startLine);
        const lineEnd = diffCurrentView.state.doc.line(config.endLine);
        config.lineFrom = lineStart.from;
        config.lineTo = lineEnd.to;
        config.widgetPos = lineEnd.to;
        diffCurrentView.dispatch({ effects: diffEffects.addDiffSuggestionEffect.of(config) });
      }
    } catch (e) {
      warn('[DiffAPI] 恢复建议失败:', id, e);
      toRemove.push(id);
    }
  }
  
  for (const id of toRemove) {
    suggestions.delete(id);
  }
  
  // 恢复内联状态
  const statusToRemove = [];
  for (const entry of inlineStatus) {
    const id = entry[0];
    const config = entry[1];
    try {
      const docContent = diffCurrentView.state.doc.toString();
      if (config.originalText) {
        const foundIndex = docContent.indexOf(config.originalText);
        if (foundIndex !== -1) {
          config.from = foundIndex;
          config.to = foundIndex + config.originalText.length;
          config.widgetPos = foundIndex;
          diffCurrentView.dispatch({ effects: diffEffects.addInlineStatusEffect.of(config) });
        } else {
          warn('[InlineStatus] 恢复内联状态失败，找不到原始内容:', id);
          statusToRemove.push(id);
        }
      } else {
        diffCurrentView.dispatch({ effects: diffEffects.addInlineStatusEffect.of(config) });
      }
    } catch (e) {
      warn('[InlineStatus] 恢复内联状态失败:', id, e);
      statusToRemove.push(id);
    }
  }
  
  for (const id of statusToRemove) {
    inlineStatus.delete(id);
  }
  
  updateDiffControlBar();
}

/**
 * 文件切换处理
 */
function onFileChanged(oldFileName, newFileName) {
  setTimeout(() => {
    restoreSuggestionsForCurrentFile();
  }, 300);
}

/**
 * 检查文件变化
 */
function checkFileChange() {
  try {
    const currentFile = methodHandlers.getCurrentFile 
      ? methodHandlers.getCurrentFile() 
      : { name: getCurrentFileName() };
      
    const newFileName = currentFile ? currentFile.name : null;
    
    if (newFileName && newFileName !== diffCurrentFileName) {
      debug('[DiffAPI] 检测到文件切换:', diffCurrentFileName, '->', newFileName);
      const oldFileName = diffCurrentFileName;
      setDiffCurrentFileName(newFileName);
      onFileChanged(oldFileName, newFileName);
    }
  } catch (e) {
    // ignore
  }
}

/**
 * 启动文件监听
 */
function startFileChangeListener() {
  if (diffFileCheckInterval) return;
  
  try {
    const currentFile = methodHandlers.getCurrentFile 
      ? methodHandlers.getCurrentFile() 
      : { name: getCurrentFileName() };
    setDiffCurrentFileName(currentFile ? currentFile.name : null);
    debug('[DiffAPI] 初始文件:', diffCurrentFileName);
  } catch (e) {}
  
  const interval = setInterval(checkFileChange, 500);
  setDiffFileCheckInterval(interval);
}

/**
 * 尝试获取编辑器视图
 */
function tryGetEditorView() {
  try {
    const store = window.overleaf && window.overleaf.unstable && window.overleaf.unstable.store;
    const view = (store && typeof store.get === 'function' && store.get('editor.view')) ||
                 (document.querySelector('.cm-content') && document.querySelector('.cm-content').cmView && document.querySelector('.cm-content').cmView.view);
    return view || null;
  } catch (e) {
    return null;
  }
}

/**
 * 完成 Diff 系统设置（获取到 view 之后）
 */
function completeDiffSetup(view) {
  setDiffCurrentView(view);
  debug('[DiffAPI] 编辑器视图已获取');
  
  createDiffControlBar({
    onPrev: () => window.diffAPI && window.diffAPI.prev(),
    onNext: () => window.diffAPI && window.diffAPI.next(),
    onJumpNextFile: () => jumpToNextFileWithSuggestions(),
    onRejectAll: () => window.diffAPI && window.diffAPI.rejectAll(),
    onAcceptAll: () => window.diffAPI && window.diffAPI.acceptAll()
  });
  
  setupDiffAPI();
  startFileChangeListener();
}

/**
 * 尝试捕获 CodeMirror 并注册扩展
 * 通过分发 editor:extension-loaded 事件触发 Overleaf 响应
 */
function tryCaptureCMAndRegisterExtension() {
  if (diffCodeMirror) return true; // 已经捕获过了
  window.dispatchEvent(new CustomEvent('editor:extension-loaded'));
  return !!diffCodeMirror;
}

/**
 * 初始化 Diff 系统
 * 使用轮询重试机制，避免因页面加载时序导致的竞态条件
 */
export function initDiffSystem() {
  debug('[OverleafBridge] Initializing Diff System...');
  
  injectDiffStyles();
  initDiffMessageListeners();
  
  // 监听扩展加载（只需注册一次，Overleaf 会在响应 editor:extension-loaded 时触发）
  window.addEventListener('UNSTABLE_editor:extensions', function(evt) {
    const detail = evt.detail;
    const CM = detail.CodeMirror;
    const extensions = detail.extensions;
    diffCodeMirror = CM;
    debug('[DiffAPI] 捕获到 CodeMirror 实例');
    
    const diffSuggestionExtension = createDiffSuggestionExtension(CM);
    extensions.push(diffSuggestionExtension);
    debug('[DiffAPI] Diff 建议扩展已注册');
  });
  
  // 轮询初始化：每 500ms 检查一次，最多重试 60 次（30 秒）
  let attempts = 0;
  const MAX_ATTEMPTS = 60;
  const POLL_INTERVAL = 500;
  
  const pollInit = setInterval(() => {
    attempts++;
    
    // 第一步：确保 CodeMirror 模块已捕获
    tryCaptureCMAndRegisterExtension();
    
    // 第二步：尝试获取编辑器视图
    const view = tryGetEditorView();
    
    if (view && diffCodeMirror) {
      // 两者都就绪，完成初始化
      clearInterval(pollInit);
      completeDiffSetup(view);
      debug('[DiffAPI] Diff 系统初始化完成（第 ' + attempts + ' 次尝试）');
    } else if (attempts >= MAX_ATTEMPTS) {
      clearInterval(pollInit);
      warn('[DiffAPI] Diff 系统初始化超时（' + MAX_ATTEMPTS + ' 次尝试）',
           'view:', !!view, 'CM:', !!diffCodeMirror);
    }
  }, POLL_INTERVAL);
  
  // 立即尝试一次（不等第一个 500ms）
  setTimeout(() => {
    tryCaptureCMAndRegisterExtension();
    const view = tryGetEditorView();
    if (view && diffCodeMirror) {
      clearInterval(pollInit);
      completeDiffSetup(view);
      debug('[DiffAPI] Diff 系统初始化完成（首次立即尝试）');
    }
  }, 100);
}
