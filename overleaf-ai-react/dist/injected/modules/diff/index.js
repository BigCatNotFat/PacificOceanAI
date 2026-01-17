/**
 * Diff 系统 - 入口
 */

import { getCurrentFileName } from '../core/utils.js';
import { methodHandlers } from '../core/registry.js';
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
    console.log('[DiffAPI] 当前文件无建议:', diffCurrentFileName);
    updateDiffControlBar();
    return;
  }
  
  console.log('[DiffAPI] 恢复文件建议:', diffCurrentFileName, '共', suggestions.size, '个建议,', inlineStatus.size, '个内联状态');
  
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
          console.warn('[DiffAPI] 恢复片段建议失败，找不到原始内容:', id);
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
      console.warn('[DiffAPI] 恢复建议失败:', id, e);
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
          console.warn('[InlineStatus] 恢复内联状态失败，找不到原始内容:', id);
          statusToRemove.push(id);
        }
      } else {
        diffCurrentView.dispatch({ effects: diffEffects.addInlineStatusEffect.of(config) });
      }
    } catch (e) {
      console.warn('[InlineStatus] 恢复内联状态失败:', id, e);
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
      console.log('[DiffAPI] 检测到文件切换:', diffCurrentFileName, '->', newFileName);
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
    console.log('[DiffAPI] 初始文件:', diffCurrentFileName);
  } catch (e) {}
  
  const interval = setInterval(checkFileChange, 500);
  setDiffFileCheckInterval(interval);
}

/**
 * 初始化 Diff 系统
 */
export function initDiffSystem() {
  console.log('[OverleafBridge] Initializing Diff System...');
  
  injectDiffStyles();
  initDiffMessageListeners();
  
  // 监听扩展加载
  window.addEventListener('UNSTABLE_editor:extensions', function(evt) {
    const detail = evt.detail;
    const CM = detail.CodeMirror;
    const extensions = detail.extensions;
    diffCodeMirror = CM;
    console.log('[DiffAPI] 捕获到 CodeMirror 实例');
    
    const diffSuggestionExtension = createDiffSuggestionExtension(CM);
    extensions.push(diffSuggestionExtension);
    console.log('[DiffAPI] Diff 建议扩展已注册');
  });
  
  // 触发加载
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('editor:extension-loaded'));
    
    setTimeout(() => {
      const store = window.overleaf && window.overleaf.unstable && window.overleaf.unstable.store;
      const view = (store && store.get('editor.view')) ||
                   (document.querySelector('.cm-content') && document.querySelector('.cm-content').cmView && document.querySelector('.cm-content').cmView.view);
      
      setDiffCurrentView(view);
      
      if (view) {
        console.log('[DiffAPI] 编辑器视图已获取');
        
        createDiffControlBar({
          onPrev: () => window.diffAPI && window.diffAPI.prev(),
          onNext: () => window.diffAPI && window.diffAPI.next(),
          onJumpNextFile: () => jumpToNextFileWithSuggestions(),
          onRejectAll: () => window.diffAPI && window.diffAPI.rejectAll(),
          onAcceptAll: () => window.diffAPI && window.diffAPI.acceptAll()
        });
        
        setupDiffAPI();
        startFileChangeListener();
      } else {
        console.warn('[DiffAPI] 无法获取编辑器视图，稍后重试');
        // 简单重试逻辑
        setTimeout(() => {
           const retryView = (window.overleaf?.unstable?.store?.get('editor.view')) || 
                             (document.querySelector('.cm-content')?.cmView?.view);
           if (retryView) {
             setDiffCurrentView(retryView);
             console.log('[DiffAPI] 编辑器视图已获取（重试）');
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
        }, 2000);
      }
    }, 500);
  }, 100);
}
