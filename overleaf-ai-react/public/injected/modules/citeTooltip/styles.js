/**
 * Cite Tooltip 样式
 */

import { debug } from '../core/logger.js';

export const CITE_TOOLTIP_STYLES = `
  .ol-cm-cite-tooltip-container {
    position: fixed;
    z-index: 99999;
    pointer-events: none; /* 容器穿透，避免遮挡大面积区域 */
    display: none;
    transition: top 0.05s ease-out, left 0.05s ease-out;
  }

  .ol-cm-cite-content {
    pointer-events: auto; /* 内容可交互 */
    user-select: text;    /* 内容可选中 */
    cursor: text;         /* 鼠标样式 */
    
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: auto;
    padding: 10px 14px;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    max-width: 420px;
    min-width: 200px;
  }

  /* 浅色主题 */
  .ol-cm-cite-content.light,
  body:not(.dark) .ol-cm-cite-content {
    box-shadow: 0px 4px 12px 0px rgba(30, 37, 48, 0.15);
    border: 1px solid #e7e9ee !important;
    background-color: white !important;
    color: #333;
  }

  /* 深色主题 */
  .ol-cm-cite-content.dark,
  body.dark .ol-cm-cite-content,
  [data-theme="dark"] .ol-cm-cite-content {
    box-shadow: 0px 4px 12px 0px rgba(0, 0, 0, 0.3);
    border: 1px solid #2f3a4c !important;
    background-color: #1b222c !important;
    color: #e0e0e0;
  }

  /* 标题 */
  .ol-cm-cite-title {
    font-weight: 600;
    font-size: 13px;
    line-height: 1.4;
    color: inherit;
    margin: 0;
  }

  /* 作者 */
  .ol-cm-cite-authors {
    font-size: 12px;
    color: #666;
    margin: 0;
  }

  body.dark .ol-cm-cite-authors,
  [data-theme="dark"] .ol-cm-cite-authors {
    color: #aaa;
  }

  /* 元信息行 */
  .ol-cm-cite-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 11px;
    margin-top: 4px;
  }

  .ol-cm-cite-meta-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 4px;
    background-color: rgba(0, 119, 182, 0.1);
    color: #0077B6;
  }

  body.dark .ol-cm-cite-meta-item,
  [data-theme="dark"] .ol-cm-cite-meta-item {
    background-color: rgba(0, 180, 216, 0.15);
    color: #00B4D8;
  }

  /* 引用键 */
  .ol-cm-cite-key {
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    font-size: 11px;
    color: #888;
    margin-top: 4px;
  }

  /* 未找到状态 */
  .ol-cm-cite-not-found {
    font-style: italic;
    color: #999;
  }

  /* 加载状态 */
  .ol-cm-cite-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #666;
  }

  .ol-cm-cite-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #ddd;
    border-top-color: #0077B6;
    border-radius: 50%;
    animation: ol-cite-spin 0.8s linear infinite;
  }

  @keyframes ol-cite-spin {
    to { transform: rotate(360deg); }
  }
`;

/**
 * 注入样式到页面
 */
export function injectStyles() {
  if (document.getElementById('ol-cite-tooltip-styles')) {
    return; // 已注入
  }
  
  const style = document.createElement('style');
  style.id = 'ol-cite-tooltip-styles';
  style.textContent = CITE_TOOLTIP_STYLES;
  document.head.appendChild(style);
  
  debug('[CiteTooltip] Styles injected');
}

