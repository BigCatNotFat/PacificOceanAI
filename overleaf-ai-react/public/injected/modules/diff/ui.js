/**
 * Diff 系统 - UI 组件
 * 控制栏和 CSS 注入
 */

import { methodHandlers } from '../core/registry.js';
import { 
  diffSuggestionsByFile, 
  diffCurrentIndex, 
  getTotalSuggestionsCount, 
  getCurrentFileSuggestions, 
  getFilesWithSuggestions 
} from './store.js';

let diffControlBar = null;

// CSS 样式
const DIFF_CSS = `
  /* 原始内容 - 浅红色背景，黑色删除线 */
  .diff-line-deleted {
    background: rgba(255, 0, 0, 0.08) !important;
    text-decoration: line-through !important;
    text-decoration-color: #000000 !important;
    color: #000000 !important;
    position: relative !important;
  }
  
  .diff-line-deleted::before {
    content: '−';
    position: absolute;
    left: -20px;
    color: #c62828;
    font-weight: bold;
  }
  
  /* 替换内容块 - 浅绿色背景，黑色文字 */
  .diff-suggestion-block {
    position: relative;
    margin: 0;
    padding: 0;
  }
  
  .diff-new-content {
    background: rgba(76, 175, 80, 0.1);
    padding: 8px 16px;
    padding-right: 180px;
    border-left: 3px solid #81c784;
    margin: 2px 0;
    font-family: inherit;
    font-size: inherit;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    position: relative;
    border-radius: 0 4px 4px 0;
  }
  
  .diff-new-content::before {
    content: '+';
    position: absolute;
    left: 5px;
    color: #4caf50;
    font-weight: bold;
  }
  
  .diff-new-text {
    color: #000000 !important;
  }
  
  /* 行内按钮容器 */
  .diff-buttons {
    position: absolute;
    right: 8px;
    bottom: 6px;
    display: flex;
    gap: 8px;
    z-index: 10;
  }
  
  .diff-btn {
    padding: 5px 14px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }
  
  .diff-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  }
  
  .diff-btn-accept { background: #66bb6a; color: white; }
  .diff-btn-accept:hover { background: #4caf50; }
  .diff-btn-reject { background: #ef5350; color: white; }
  .diff-btn-reject:hover { background: #f44336; }
  
  /* ===== 片段级建议样式 (Segment Suggestions) ===== */
  
  /* 片段删除样式 - inline strikethrough */
  .diff-segment-deleted {
    background: rgba(255, 0, 0, 0.15) !important;
    text-decoration: line-through !important;
    text-decoration-color: #c62828 !important;
    text-decoration-thickness: 2px !important;
  }
  
  /* 片段新内容 - inline widget */
  .diff-segment-widget {
    display: inline;
    white-space: pre-wrap;
  }
  
  .diff-segment-new {
    background: rgba(76, 175, 80, 0.2);
    border-radius: 3px;
    padding: 1px 4px;
    margin-left: 2px;
    color: #1b5e20 !important;
    font-weight: 500;
  }
  
  /* 片段级 inline 按钮 */
  .diff-segment-buttons {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: 4px;
    vertical-align: middle;
  }
  
  .diff-segment-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 3px;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.15s;
    padding: 0;
    line-height: 1;
  }
  
  .diff-segment-btn:hover {
    transform: scale(1.1);
  }
  
  .diff-segment-btn-accept {
    background: #4caf50;
    color: white;
  }
  
  .diff-segment-btn-accept:hover {
    background: #43a047;
  }
  
  .diff-segment-btn-reject {
    background: #ef5350;
    color: white;
  }
  
  .diff-segment-btn-reject:hover {
    background: #e53935;
  }
  
  /* 片段建议动画 */
  @keyframes diff-segment-highlight {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
  
  .diff-segment-widget {
    animation: diff-segment-highlight 0.2s ease-out;
  }
  
  /* ===== 底部固定控制栏 ===== */
  #diff-control-bar {
    position: fixed;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #2d2d2d;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    color: #fff;
  }
  
  #diff-control-bar.hidden {
    display: none;
  }
  
  /* 导航模式（当前文件无建议） */
  #diff-control-bar.diff-control-bar-navigate-mode .diff-counter {
    cursor: pointer;
    padding: 4px 12px;
    background: rgba(76, 175, 80, 0.15);
    border-radius: 4px;
    border: 1px solid rgba(76, 175, 80, 0.3);
    transition: all 0.2s;
  }
  
  #diff-control-bar.diff-control-bar-navigate-mode .diff-counter:hover {
    background: rgba(76, 175, 80, 0.25);
    border-color: rgba(76, 175, 80, 0.5);
  }
  
  .diff-nav-btn.diff-nav-btn-go {
    width: auto;
    padding: 4px 12px;
    background: #4caf50;
    color: #fff;
    font-weight: 500;
    font-size: 12px;
  }
  
  .diff-nav-btn.diff-nav-btn-go:hover {
    background: #43a047;
  }
  
  /* 导航箭头 */
  .diff-nav-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: #aaa;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 18px;
    transition: all 0.15s;
  }
  
  .diff-nav-btn:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }
  
  .diff-nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  
  /* 计数器 */
  .diff-counter {
    color: #aaa;
    font-size: 13px;
    min-width: 60px;
    text-align: center;
  }
  
  /* 分隔线 */
  .diff-separator {
    width: 1px;
    height: 24px;
    background: #555;
    margin: 0 8px;
  }
  
  /* 控制栏按钮 */
  .diff-bar-btn {
    padding: 6px 16px;
    border: 1px solid #555;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    color: #ddd;
  }
  
  .diff-bar-btn:hover {
    background: rgba(255,255,255,0.1);
    border-color: #777;
  }
  
  .diff-bar-btn-reject {
    color: #ff8a80;
    border-color: #ff8a80;
  }
  
  .diff-bar-btn-reject:hover {
    background: rgba(255,138,128,0.15);
  }
  
  .diff-bar-btn-accept {
    background: #4caf50;
    border-color: #4caf50;
    color: white;
  }
  
  .diff-bar-btn-accept:hover {
    background: #43a047;
    border-color: #43a047;
  }
  
  /* 快捷键提示 */
  .diff-shortcut {
    font-size: 11px;
    color: #888;
    margin-left: 4px;
  }
  
  /* 动画 */
  @keyframes diff-highlight {
    0% { opacity: 0; transform: translateX(-10px); }
    100% { opacity: 1; transform: translateX(0); }
  }
  
  .diff-suggestion-block {
    animation: diff-highlight 0.3s ease-out;
  }
  
  @keyframes diff-bar-slide-up {
    0% { opacity: 0; transform: translate(-50%, 20px); }
    100% { opacity: 1; transform: translate(-50%, 0); }
  }
  
  #diff-control-bar {
    animation: diff-bar-slide-up 0.3s ease-out;
  }
  
  /* ===== 内联生成指示器样式 (Inline Generating Spinner) ===== */
  
  /* 生成中的文本样式 - 浅红色背景 + 删除线（与 suggestion 系统一致） */
  .inline-generating-text {
    background: rgba(255, 0, 0, 0.15) !important;
    text-decoration: line-through !important;
    text-decoration-color: #c62828 !important;
    text-decoration-thickness: 2px !important;
  }
  
  /* 旋转指示器 - 显示在文本后面 */
  .inline-generating-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid #3b82f6;
    border-top-color: transparent;
    border-radius: 50%;
    animation: inline-generating-spin 0.8s linear infinite;
    margin-left: 6px;
    vertical-align: middle;
  }
  
  @keyframes inline-generating-spin {
    to { transform: rotate(360deg); }
  }
`;

/**
 * 注入 CSS 样式
 */
export function injectDiffStyles() {
  // 移除旧样式
  const oldDiffStyle = document.getElementById('diff-suggestion-styles');
  if (oldDiffStyle) oldDiffStyle.remove();
  
  const diffStyle = document.createElement('style');
  diffStyle.id = 'diff-suggestion-styles';
  diffStyle.textContent = DIFF_CSS;
  document.head.appendChild(diffStyle);
}

/**
 * 创建底部控制栏
 */
export function createDiffControlBar(callbacks) {
  const { onPrev, onNext, onJumpNextFile, onRejectAll, onAcceptAll } = callbacks;
  
  // 移除旧控制栏
  const oldDiffBar = document.getElementById('diff-control-bar');
  if (oldDiffBar) oldDiffBar.remove();
  
  if (diffControlBar && diffControlBar.parentNode) {
    diffControlBar.remove();
  }
  
  diffControlBar = document.createElement('div');
  diffControlBar.id = 'diff-control-bar';
  diffControlBar.className = 'hidden';
  
  diffControlBar.innerHTML = 
    '<button class="diff-nav-btn" id="diff-prev-btn" title="上一个">‹</button>' +
    '<span class="diff-counter" id="diff-counter">0 of 0</span>' +
    '<button class="diff-nav-btn" id="diff-next-btn" title="下一个">›</button>' +
    '<div class="diff-separator"></div>' +
    '<button class="diff-bar-btn diff-bar-btn-reject" id="diff-reject-all-btn">Undo File</button>' +
    '<button class="diff-bar-btn diff-bar-btn-accept" id="diff-accept-all-btn">Keep File <span class="diff-shortcut">Ctrl+S</span></button>';
  
  document.body.appendChild(diffControlBar);
  
  // 绑定事件
  document.getElementById('diff-prev-btn').addEventListener('click', onPrev);
  document.getElementById('diff-next-btn').addEventListener('click', onNext);
  
  // Counter 点击事件（在导航模式下跳转到下一个文件）
  document.getElementById('diff-counter').addEventListener('click', function() {
    const currentFileCount = getCurrentFileSuggestions().size;
    if (currentFileCount === 0) {
      onJumpNextFile();
    }
  });
  
  document.getElementById('diff-reject-all-btn').addEventListener('click', onRejectAll);
  document.getElementById('diff-accept-all-btn').addEventListener('click', onAcceptAll);
  
  return diffControlBar;
}

/**
 * 更新控制栏状态
 */
export function updateDiffControlBar() {
  if (!diffControlBar) return;
  
  const totalCount = getTotalSuggestionsCount();
  const counter = document.getElementById('diff-counter');
  const prevBtn = document.getElementById('diff-prev-btn');
  const nextBtn = document.getElementById('diff-next-btn');
  const acceptAllBtn = document.getElementById('diff-accept-all-btn');
  const rejectAllBtn = document.getElementById('diff-reject-all-btn');
  
  // 获取当前文件的建议数量
  const currentFileSuggestions = getCurrentFileSuggestions();
  const currentFileCount = currentFileSuggestions.size;
  
  if (totalCount === 0) {
    diffControlBar.classList.add('hidden');
    diffControlBar.classList.remove('diff-control-bar-navigate-mode');
  } else {
    diffControlBar.classList.remove('hidden');
    
    // 如果当前文件没有建议，但其他文件有建议，进入"导航模式"
    if (currentFileCount === 0) {
      // 避免循环依赖，这里直接获取文件名，或者回调？
      // 为了简单起见，我们重新计算 filesInfo
      // 注意：getFilesWithSuggestions 需要当前文件名，但我们没有 view 引用
      // 这里假设 store.js 的 getFilesWithSuggestions 会自动获取
      const filesInfo = getFilesWithSuggestions();
      
      if (filesInfo.nextFile) {
        diffControlBar.classList.add('diff-control-bar-navigate-mode');
        
        // 显示详细信息：下一个文件 + 总文件数
        let displayText = '📁 ' + filesInfo.nextFile.fileName;
        if (filesInfo.totalFiles > 1) {
          // 多个文件有建议，显示更详细信息
          displayText += ' (' + filesInfo.totalChanges + ' changes in ' + filesInfo.totalFiles + ' files)';
        } else {
          // 只有一个文件有建议
          displayText += ' (' + filesInfo.nextFile.count + ' changes)';
        }
        counter.textContent = displayText;
        
        // 设置简洁的 tooltip
        counter.title = '点击跳转到 ' + filesInfo.nextFile.fileName;
        
        // 隐藏 prev 按钮，修改 next 按钮为 "Go" 样式
        prevBtn.style.display = 'none';
        nextBtn.textContent = 'Go →';
        nextBtn.title = '跳转到 ' + filesInfo.nextFile.fileName;
        nextBtn.disabled = false;
        nextBtn.classList.add('diff-nav-btn-go');
        
        // 隐藏 Accept/Reject 按钮
        if (acceptAllBtn) acceptAllBtn.style.display = 'none';
        if (rejectAllBtn) rejectAllBtn.style.display = 'none';
      }
    } else {
      // 正常模式：当前文件有建议
      diffControlBar.classList.remove('diff-control-bar-navigate-mode');
      
      // 恢复按钮样式
      prevBtn.style.display = '';
      prevBtn.textContent = '‹';
      nextBtn.textContent = '›';
      nextBtn.title = '下一个';
      nextBtn.classList.remove('diff-nav-btn-go');
      if (acceptAllBtn) acceptAllBtn.style.display = '';
      if (rejectAllBtn) rejectAllBtn.style.display = '';
      
      // 显示当前位置和总数，如果有多个文件显示文件数
      const fileCount = diffSuggestionsByFile.size;
      if (fileCount > 1) {
        counter.textContent = (diffCurrentIndex + 1) + ' of ' + totalCount + ' (' + fileCount + ' files)';
      } else {
        counter.textContent = (diffCurrentIndex + 1) + ' of ' + totalCount;
      }
      counter.title = '';
      
      // 只要有建议就启用按钮
      prevBtn.disabled = false;
      nextBtn.disabled = false;
    }
  }
}

