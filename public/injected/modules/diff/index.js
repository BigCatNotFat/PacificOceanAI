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
import { createDiffSuggestionExtension, diffEffects, diffSuggestionField } from './extension.js';
import { injectDiffStyles, createDiffControlBar, updateDiffControlBar } from './ui.js';
import { setupDiffAPI, initDiffMessageListeners, jumpToNextFileWithSuggestions } from './api.js';

let diffCodeMirror = null;
let extensionGeneration = 0; // incremented each time extensions are re-registered

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
  
  if (!diffEffects || !diffEffects.addDiffSuggestionEffect) {
    updateDiffControlBar();
    return;
  }

  // Verify the current StateField is mounted in the view. If not, effects
  // would silently do nothing and we'd waste the restore attempt.
  if (diffSuggestionField) {
    try {
      diffCurrentView.state.field(diffSuggestionField);
    } catch (e) {
      debug('[DiffAPI] StateField 未装载，跳过此次恢复（等待扩展重建）');
      updateDiffControlBar();
      return;
    }
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
  // "先应用"模式下，文档中已经是 newContent，所以恢复时需要用 newContent 定位
  const toRemove = [];
  for (const entry of suggestions) {
    const id = entry[0];
    const config = entry[1];
    try {
      if (config.type === 'segment') {
        const docContent = diffCurrentView.state.doc.toString();
        // 先应用模式：文档中已是 newContent，用 newContent 定位
        const searchText = config.newContent;
        const foundIndex = docContent.indexOf(searchText);
        if (foundIndex !== -1) {
          config.startOffset = foundIndex;
          config.endOffset = foundIndex + searchText.length;
          config.widgetPos = config.endOffset;
          diffCurrentView.dispatch({ effects: diffEffects.addSegmentSuggestionEffect.of(config) });
        } else {
          warn('[DiffAPI] 恢复片段建议失败，找不到新内容:', id);
          toRemove.push(id);
        }
      } else {
        // 行级建议：先尝试用 newContent 在文档中定位精确位置
        const docContent = diffCurrentView.state.doc.toString();
        const foundIndex = docContent.indexOf(config.newContent);
        if (foundIndex !== -1) {
          const lineStart = diffCurrentView.state.doc.lineAt(foundIndex);
          const lineEnd = diffCurrentView.state.doc.lineAt(foundIndex + config.newContent.length - 1);
          config.startLine = lineStart.number;
          config.endLine = lineEnd.number;
          config.lineFrom = lineStart.from;
          config.lineTo = lineEnd.to;
          config.widgetPos = lineStart.from;
          diffCurrentView.dispatch({ effects: diffEffects.addDiffSuggestionEffect.of(config) });
        } else {
          // 回退到原始行号（可能因其他编辑而偏移）
          try {
            const lineStart = diffCurrentView.state.doc.line(config.startLine);
            const lineEnd = diffCurrentView.state.doc.line(config.endLine);
            config.lineFrom = lineStart.from;
            config.lineTo = lineEnd.to;
            config.widgetPos = lineStart.from;
            diffCurrentView.dispatch({ effects: diffEffects.addDiffSuggestionEffect.of(config) });
          } catch (lineErr) {
            warn('[DiffAPI] 恢复行级建议失败，行号越界:', id, lineErr);
            toRemove.push(id);
          }
        }
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
 *
 * Overleaf may re-fire `UNSTABLE_editor:extensions` after a file switch,
 * which recreates the StateField and all effects.  If we restore too early
 * (before that event) the decorations are written into the *old* field and
 * disappear once the new one takes over.
 *
 * Strategy: restore after a delay, then listen for the extensions event and
 * restore again if needed.
 */
function onFileChanged(oldFileName, newFileName) {
  const genAtSwitch = extensionGeneration;

  // First attempt after 300 ms (handles the case where extensions are NOT rebuilt)
  setTimeout(() => {
    refreshEditorView();
    restoreSuggestionsForCurrentFile();
    window.postMessage({ type: 'DIFF_READY', data: { file: newFileName } }, '*');
  }, 300);

  // Second attempt: if Overleaf rebuilds extensions after the switch, the
  // generation counter will have incremented.  Wait a bit longer and restore
  // once more so decorations land in the *new* field.
  setTimeout(() => {
    if (extensionGeneration !== genAtSwitch) {
      debug('[DiffAPI] 扩展在切换后重建，重新恢复建议:', newFileName);
      refreshEditorView();
      restoreSuggestionsForCurrentFile();
    }
  }, 800);
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
 * 刷新编辑器视图引用
 * Overleaf 切换文件时可能重建 EditorView，需要重新获取
 */
function refreshEditorView() {
  const view = tryGetEditorView();
  if (view && view !== diffCurrentView) {
    debug('[DiffAPI] 编辑器视图已更新（文件切换后）');
    setDiffCurrentView(view);
  }
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
  
  // 监听扩展加载。Overleaf 会在文件切换时重新触发此事件，
  // 导致 StateField + effects 被重建。我们需要追踪这一点，
  // 以便在新扩展注册后重新恢复 diff 装饰。
  window.addEventListener('UNSTABLE_editor:extensions', function(evt) {
    const detail = evt.detail;
    const CM = detail.CodeMirror;
    const extensions = detail.extensions;
    diffCodeMirror = CM;
    
    const diffSuggestionExtension = createDiffSuggestionExtension(CM);
    extensions.push(diffSuggestionExtension);

    extensionGeneration++;
    debug('[DiffAPI] 捕获到 CodeMirror 实例 (generation=' + extensionGeneration + ')');
    debug('[DiffAPI] Diff 建议扩展已注册');

    // If this is a re-registration (not the initial one), the new StateField
    // needs to be mounted by Overleaf before we can dispatch effects into it.
    // Poll until the field is accessible, then restore.
    if (extensionGeneration > 1) {
      const gen = extensionGeneration;
      let restoreAttempts = 0;
      const tryRestore = () => {
        restoreAttempts++;
        if (extensionGeneration !== gen) return; // superseded by newer registration
        refreshEditorView();
        // Check if the new field is mounted by trying to read it
        let fieldMounted = false;
        try {
          if (diffCurrentView && diffSuggestionField) {
            diffCurrentView.state.field(diffSuggestionField);
            fieldMounted = true;
          }
        } catch (e) { /* field not yet in state */ }

        if (fieldMounted) {
          restoreSuggestionsForCurrentFile();
          debug('[DiffAPI] 扩展重建后恢复建议完成 (generation=' + gen + ', attempt=' + restoreAttempts + ')');
        } else if (restoreAttempts < 20) {
          setTimeout(tryRestore, 100);
        } else {
          warn('[DiffAPI] 扩展重建后恢复超时，field 未装载');
        }
      };
      setTimeout(tryRestore, 50);
    }

    // If the initial polling timed out before CM was captured,
    // window.diffAPI will be null. Now that we have CM, try to
    // complete the setup so the diff system becomes functional.
    if (!window.diffAPI) {
      const view = tryGetEditorView();
      if (view) {
        debug('[DiffAPI] 初始化超时后通过扩展事件补救，执行 completeDiffSetup');
        completeDiffSetup(view);
      }
    }
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
