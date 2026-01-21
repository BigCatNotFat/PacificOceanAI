/**
 * Review Tooltip 注入器 - 样式
 * 
 * 样式与原 selectionTooltip 保持一致
 * 只是添加在原生 review-tooltip-menu 上
 */

const STYLE_ID = 'overleaf-ai-review-tooltip-styles';

/**
 * 注入自定义样式
 */
export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* 原生 review-tooltip-menu 保持原样，我们的控件直接嵌入其中 */
    .review-tooltip-menu.ol-ai-enhanced {
      /* 保持原生背景，只调整内边距 */
      padding: 8px !important;
    }
    
    /* 将添加评论按钮改为小图标按钮 */
    .review-tooltip-add-comment-button.ol-ai-transformed {
      padding: 4px !important;
      min-width: unset !important;
      width: 28px !important;
      height: 28px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background: #f3f4f6 !important;
      border: 1px solid #e5e7eb !important;
      border-radius: 4px !important;
      margin-right: 4px !important;
    }
    
    .review-tooltip-add-comment-button.ol-ai-transformed:hover {
      background: #e5e7eb !important;
    }
    
    /* 隐藏按钮中的文字，只保留图标 */
    .review-tooltip-add-comment-button-text {
      display: none !important;
    }
    
    /* AI 控件主容器 - 透明背景，直接使用原生菜单的背景 */
    .ol-ai-tooltip-wrapper {
      position: relative;
      color: #1f2937;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 300px;
      max-width: 420px;
      /* 不设置背景和阴影，使用原生菜单的 */
    }
    
    /* 自定义输入区域 */
    .ol-ai-custom-input-container {
      display: flex;
      gap: 6px;
      align-items: stretch;
    }
    
    /* 输入框 */
    .ol-ai-custom-input {
      flex: 1;
      padding: 6px 10px;
      font-size: 12px;
      border-radius: 6px;
      border: 1px solid #d1d5db;
      background: #f9fafb;
      color: #1f2937;
      outline: none;
      resize: none;
      height: 32px;
      min-height: 32px;
      max-height: 60px;
      line-height: 1.4;
      font-family: inherit;
    }
    
    .ol-ai-custom-input:focus {
      border: 1px solid #5865f2;
      background: #ffffff;
      box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.2);
    }
    
    .ol-ai-custom-input::placeholder {
      color: #9ca3af;
    }
    
    /* 发送按钮 */
    .ol-ai-send-btn {
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 6px;
      border: none;
      background: #5865f2;
      color: white;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    
    .ol-ai-send-btn:hover {
      background: #4752c4;
    }
    
    .ol-ai-send-btn:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }
    
    /* 底部行：按钮 + 模型选择器 */
    .ol-ai-bottom-row {
      display: flex;
      gap: 6px;
      align-items: center;
      justify-content: space-between;
    }
    
    /* 快捷操作按钮容器 */
    .ol-ai-selection-buttons {
      display: flex;
      gap: 4px;
      flex-wrap: nowrap;
      pointer-events: auto;
    }
    
    /* 快捷操作按钮 */
    .ol-ai-action-btn {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #e5e7eb;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.2s ease;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    
    .ol-ai-action-btn:hover {
      background: #e5e7eb;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    /* 模型选择器容器 */
    .ol-ai-model-selector {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1;
      justify-content: flex-end;
    }
    
    /* 模型选择器下拉框 */
    .ol-ai-model-select {
      flex: 1;
      padding: 4px 2px;
      font-size: 11px;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
      background: #f9fafb;
      color: #374151;
      cursor: pointer;
      outline: none;
      min-width: 80px;
      max-width: 100px;
      height: 24px;
    }

    /* Loading 状态 */
    .ol-ai-loading-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid #e5e7eb;
      border-top-color: #5865f2;
      border-radius: 50%;
      animation: ol-ai-spin 0.8s linear infinite;
    }
    
    @keyframes ol-ai-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  console.log('[ReviewTooltipInjector] Styles injected');
}

/**
 * 移除注入的样式
 */
export function removeStyles() {
  const style = document.getElementById(STYLE_ID);
  if (style) {
    style.remove();
    console.log('[ReviewTooltipInjector] Styles removed');
  }
}
