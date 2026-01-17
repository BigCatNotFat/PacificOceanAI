/**
 * 选区工具提示 - UI 组件
 */

import { getEditorView } from '../core/editorView.js';
import { createModelSelector, getSelectedTextActionModel } from '../modelManagement/models.js';
import { handleTextActionRequest, handleCustomRequest } from './textActions.js';

// 选区操作按钮配置
const SELECTION_ACTION_BUTTONS = [
  { id: 'expand',    label: '扩写', icon: '', bgColor: '#10b981', hoverColor: '#059669' },
  { id: 'condense',  label: '缩写', icon: '', bgColor: '#f59e0b', hoverColor: '#d97706' },
  { id: 'polish',    label: '润色', icon: '', bgColor: '#3b82f6', hoverColor: '#2563eb' },
  { id: 'translate', label: '翻译', icon: '', bgColor: '#8b5cf6', hoverColor: '#7c3aed' }
];

let selectionTooltipEl = null;
let buttonContainerEl = null;
let currentSelection = null;

// 滚动节流计时器
let scrollThrottleTimer = null;

/**
 * 获取当前选区信息
 */
export function getCurrentSelection() {
  return currentSelection;
}

/**
 * 设置当前选区信息 (仅供内部或 textActions 使用)
 */
export function setCurrentSelection(selection) {
  currentSelection = selection;
}

/**
 * 隐藏选区提示框
 */
export function hideSelectionTooltip() {
  if (selectionTooltipEl) {
    selectionTooltipEl.style.display = 'none';
  }
  currentSelection = null;
}

/**
 * 计算提示框位置
 */
function calculateTooltipPosition(coords) {
  const tooltipWidth = 280;
  const tooltipHeight = 50;
  
  // coords 已经是视口坐标
  let left = coords.left;
  let top = coords.bottom + 8;
  
  // 检查右边界
  if (left + tooltipWidth > window.innerWidth - 20) {
    left = window.innerWidth - tooltipWidth - 20;
  }
  
  // 检查左边界
  if (left < 10) {
    left = 10;
  }
  
  // 检查下边界，如果超出则显示在选区上方
  if (top + tooltipHeight > window.innerHeight - 20) {
    top = coords.top - tooltipHeight - 8;
  }
  
  // 检查上边界
  if (top < 10) {
    top = 10;
  }
  
  return { left: left, top: top };
}

/**
 * 创建操作按钮
 */
function createActionButton(config) {
  const btn = document.createElement('button');
  btn.textContent = config.icon + ' ' + config.label;
  btn.dataset.actionId = config.id;
  btn.style.background = config.bgColor;
  btn.style.color = 'white';
  btn.style.border = 'none';
  btn.style.padding = '6px 14px';
  btn.style.borderRadius = '4px';
  btn.style.cursor = 'pointer';
  btn.style.fontSize = '12px';
  btn.style.fontWeight = '500';
  btn.style.transition = 'all 0.2s ease';
  btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
  
  const bgColor = config.bgColor;
  const hoverColor = config.hoverColor;
  
  btn.onmouseenter = function() {
    this.style.background = hoverColor;
    this.style.transform = 'translateY(-1px)';
    this.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
  };
  btn.onmouseleave = function() {
    this.style.background = bgColor;
    this.style.transform = 'translateY(0)';
    this.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
  };
  
  btn.onclick = function(e) {
    e.stopPropagation();
    handleTextActionRequest(config.id);
  };
  
  return btn;
}

/**
 * 创建选区提示框 DOM
 */
function createSelectionTooltip() {
  const tooltip = document.createElement('div');
  tooltip.id = 'ol-ai-selection-tooltip';
  tooltip.style.position = 'fixed';
  tooltip.style.zIndex = '9999';
  tooltip.style.background = 'linear-gradient(135deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.98) 100%)';
  tooltip.style.color = '#e5e7eb';
  tooltip.style.padding = '10px';
  tooltip.style.borderRadius = '10px';
  tooltip.style.fontSize = '12px';
  tooltip.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.1)';
  tooltip.style.display = 'none';
  tooltip.style.flexDirection = 'column';
  tooltip.style.gap = '8px';
  tooltip.style.backdropFilter = 'blur(10px)';
  tooltip.style.transition = 'left 0.1s ease-out, top 0.1s ease-out, opacity 0.15s ease';
  tooltip.style.opacity = '1';
  tooltip.style.minWidth = '300px';
  tooltip.style.maxWidth = '420px';
  
  // 自定义输入区域
  const customInputContainer = document.createElement('div');
  customInputContainer.id = 'ol-ai-custom-input-container';
  customInputContainer.style.display = 'flex';
  customInputContainer.style.gap = '8px';
  customInputContainer.style.alignItems = 'stretch';
  
  const customInput = document.createElement('textarea');
  customInput.id = 'ol-ai-custom-input';
  customInput.placeholder = '输入要求，如：插入积分公式、润色文本...';
  customInput.style.flex = '1';
  customInput.style.padding = '6px 10px';
  customInput.style.fontSize = '12px';
  customInput.style.borderRadius = '6px';
  customInput.style.border = '1px solid rgba(255,255,255,0.15)';
  customInput.style.background = 'rgba(15, 23, 42, 0.6)';
  customInput.style.color = '#e5e7eb';
  customInput.style.outline = 'none';
  customInput.style.resize = 'none';
  customInput.style.height = '28px';
  customInput.style.minHeight = '28px';
  customInput.style.maxHeight = '60px';
  customInput.style.lineHeight = '1.3';
  customInput.style.fontFamily = 'inherit';
  
  customInput.onfocus = function() {
    this.style.border = '1px solid rgba(59, 130, 246, 0.5)';
    this.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.2)';
  };
  customInput.onblur = function() {
    this.style.border = '1px solid rgba(255,255,255,0.15)';
    this.style.boxShadow = 'none';
  };
  
  customInput.onkeydown = function(e) {
    e.stopPropagation();
    if ((e.ctrlKey && e.key === 'Enter') || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      handleCustomRequest();
    }
    if (e.key === 'Escape') {
      hideSelectionTooltip();
    }
  };
  
  customInput.oninput = function() {
    this.style.height = '28px';
    this.style.height = Math.min(this.scrollHeight, 60) + 'px';
  };
  
  customInputContainer.appendChild(customInput);
  
  const sendBtn = document.createElement('button');
  sendBtn.id = 'ol-ai-send-btn';
  sendBtn.innerHTML = '➤';
  sendBtn.title = '发送 (Enter)';
  sendBtn.style.padding = '0 12px';
  sendBtn.style.fontSize = '14px';
  sendBtn.style.borderRadius = '6px';
  sendBtn.style.border = 'none';
  sendBtn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
  sendBtn.style.color = 'white';
  sendBtn.style.cursor = 'pointer';
  sendBtn.style.transition = 'all 0.2s ease';
  sendBtn.style.boxShadow = '0 2px 6px rgba(59, 130, 246, 0.3)';
  sendBtn.style.display = 'flex';
  sendBtn.style.alignItems = 'center';
  sendBtn.style.justifyContent = 'center';
  sendBtn.style.height = '28px';
  
  sendBtn.onmouseenter = function() {
    this.style.background = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)';
    this.style.transform = 'translateY(-1px)';
    this.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
  };
  sendBtn.onmouseleave = function() {
    this.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
    this.style.transform = 'translateY(0)';
    this.style.boxShadow = '0 2px 6px rgba(59, 130, 246, 0.3)';
  };
  sendBtn.onclick = function(e) {
    e.stopPropagation();
    handleCustomRequest();
  };
  
  customInputContainer.appendChild(sendBtn);
  tooltip.appendChild(customInputContainer);
  
  // 分隔线和标签
  const quickActionsLabel = document.createElement('div');
  quickActionsLabel.id = 'ol-ai-quick-actions-label';
  quickActionsLabel.style.display = 'flex';
  quickActionsLabel.style.alignItems = 'center';
  quickActionsLabel.style.gap = '8px';
  quickActionsLabel.style.marginTop = '2px';
  
  const labelLine1 = document.createElement('div');
  labelLine1.style.flex = '1';
  labelLine1.style.height = '1px';
  labelLine1.style.background = 'rgba(255,255,255,0.1)';
  
  const labelText = document.createElement('span');
  labelText.textContent = '快捷操作';
  labelText.style.fontSize = '10px';
  labelText.style.color = '#9ca3af';
  labelText.style.textTransform = 'uppercase';
  labelText.style.letterSpacing = '0.5px';
  
  const labelLine2 = document.createElement('div');
  labelLine2.style.flex = '1';
  labelLine2.style.height = '1px';
  labelLine2.style.background = 'rgba(255,255,255,0.1)';
  
  quickActionsLabel.appendChild(labelLine1);
  quickActionsLabel.appendChild(labelText);
  quickActionsLabel.appendChild(labelLine2);
  tooltip.appendChild(quickActionsLabel);
  
  // 按钮容器
  buttonContainerEl = document.createElement('div');
  buttonContainerEl.id = 'ol-ai-selection-buttons';
  buttonContainerEl.style.display = 'flex';
  buttonContainerEl.style.gap = '8px';
  buttonContainerEl.style.justifyContent = 'center';
  buttonContainerEl.style.flexWrap = 'wrap';
  buttonContainerEl.style.pointerEvents = 'auto';
  
  SELECTION_ACTION_BUTTONS.forEach(function(btnConfig) {
    const btn = createActionButton(btnConfig);
    buttonContainerEl.appendChild(btn);
  });
  
  tooltip.appendChild(buttonContainerEl);
  
  // 模型选择器
  const modelSelector = createModelSelector();
  tooltip.appendChild(modelSelector);
  
  document.body.appendChild(tooltip);
  return tooltip;
}

/**
 * 显示当前选区的提示框
 */
export function showSelectionTooltipForCurrentSelection() {
  try {
    const view = getEditorView();
    if (!view) {
      hideSelectionTooltip();
      return;
    }

    const doc = view.state.doc;
    const selection = view.state.selection.main;
    if (!selection || selection.empty) {
      hideSelectionTooltip();
      return;
    }

    const from = selection.from;
    const to = selection.to;
    const text = doc.sliceString(from, to);
    if (!text || text.trim().length === 0) {
      hideSelectionTooltip();
      return;
    }

    const coords = view.coordsAtPos(to);
    if (!coords) {
      hideSelectionTooltip();
      return;
    }

    currentSelection = {
      from: from,
      to: to,
      text: text,
      isEmpty: false
    };

    if (!selectionTooltipEl) {
      selectionTooltipEl = createSelectionTooltip();
    }

    const pos = calculateTooltipPosition(coords);
    selectionTooltipEl.style.left = String(pos.left) + 'px';
    selectionTooltipEl.style.top = String(pos.top) + 'px';
    selectionTooltipEl.style.display = 'flex';
    
    hideNoSelectionHint();
  } catch (e) {
    console.error('[OverleafBridge] Failed to show selection tooltip:', e);
  }
}

/**
 * 显示插入模式菜单 (用于快捷键唤出且无选中文本)
 */
export function showInsertOnlyMode() {
  if (!selectionTooltipEl) return;
  
  const quickActionsLabel = selectionTooltipEl.querySelector('#ol-ai-quick-actions-label');
  if (quickActionsLabel) {
    quickActionsLabel.style.display = 'none';
  }
  
  const buttonsContainer = selectionTooltipEl.querySelector('#ol-ai-selection-buttons');
  if (buttonsContainer) {
    buttonsContainer.style.display = 'none';
  }
  
  const modelSelector = selectionTooltipEl.querySelector('#ol-ai-model-selector');
  if (modelSelector) {
    modelSelector.style.display = 'flex';
  }
  
  const inputEl = document.getElementById('ol-ai-custom-input');
  if (inputEl) {
    inputEl.placeholder = '输入要生成的内容，如：插入积分公式...';
  }
  
  console.log('[OverleafBridge] Switched to insert-only mode');
}

/**
 * 显示完整菜单模式 (有选中文本)
 */
export function showFullMenuMode() {
  if (!selectionTooltipEl) return;
  
  const quickActionsLabel = selectionTooltipEl.querySelector('#ol-ai-quick-actions-label');
  if (quickActionsLabel) {
    quickActionsLabel.style.display = 'flex';
  }
  
  const buttonsContainer = selectionTooltipEl.querySelector('#ol-ai-selection-buttons');
  if (buttonsContainer) {
    buttonsContainer.style.display = 'flex';
  }
  
  const modelSelector = selectionTooltipEl.querySelector('#ol-ai-model-selector');
  if (modelSelector) {
    modelSelector.style.display = 'flex';
  }
  
  const buttons = selectionTooltipEl.querySelectorAll('#ol-ai-selection-buttons button');
  buttons.forEach(function(btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  });
  
  const inputEl = document.getElementById('ol-ai-custom-input');
  if (inputEl) {
    inputEl.placeholder = '输入要求，如：翻译成英文、润色...';
  }
  
  console.log('[OverleafBridge] Switched to full menu mode');
}

// 兼容别名
export function showNoSelectionHint() {
  showInsertOnlyMode();
}

export function hideNoSelectionHint() {
  showFullMenuMode();
}

/**
 * 在光标位置显示菜单
 */
export function showTextActionMenuAtCursor() {
  try {
    const view = getEditorView();
    if (!view) {
      console.warn('[OverleafBridge] EditorView not available for shortcut menu');
      return;
    }

    const doc = view.state.doc;
    const selection = view.state.selection.main;
    const cursorPos = selection.head;
    
    const coords = view.coordsAtPos(cursorPos);
    if (!coords) {
      console.warn('[OverleafBridge] Cannot get cursor coordinates');
      return;
    }

    const hasSelection = !selection.empty;
    const from = selection.from;
    const to = selection.to;
    const text = hasSelection ? doc.sliceString(from, to) : '';

    currentSelection = {
      from: from,
      to: to,
      text: text,
      isEmpty: !hasSelection
    };

    if (!selectionTooltipEl) {
      selectionTooltipEl = createSelectionTooltip();
    }

    const pos = calculateTooltipPosition(coords);
    selectionTooltipEl.style.left = String(pos.left) + 'px';
    selectionTooltipEl.style.top = String(pos.top) + 'px';
    selectionTooltipEl.style.display = 'flex';

    if (!hasSelection) {
      showInsertOnlyMode();
    } else {
      showFullMenuMode();
    }

    console.log('[OverleafBridge] Text action menu shown via shortcut (Ctrl+Alt+/)', {
      hasSelection: hasSelection,
      cursorPos: cursorPos,
      mode: hasSelection ? 'full' : 'insert-only'
    });
  } catch (e) {
    console.error('[OverleafBridge] Failed to show text action menu via shortcut:', e);
  }
}

/**
 * 更新提示框位置
 */
export function updateTooltipPosition() {
  if (!selectionTooltipEl || selectionTooltipEl.style.display === 'none' || !currentSelection) {
    return;
  }
  
  try {
    const view = getEditorView();
    if (!view) {
      hideSelectionTooltip();
      return;
    }
    
    const selection = view.state.selection.main;
    if (!selection || selection.empty || selection.from !== currentSelection.from || selection.to !== currentSelection.to) {
      hideSelectionTooltip();
      return;
    }
    
    const coords = view.coordsAtPos(currentSelection.to);
    if (!coords) {
      hideSelectionTooltip();
      return;
    }
    
    if (coords.bottom < 0 || coords.top > window.innerHeight) {
      selectionTooltipEl.style.opacity = '0';
      selectionTooltipEl.style.pointerEvents = 'none';
    } else {
      selectionTooltipEl.style.opacity = '1';
      selectionTooltipEl.style.pointerEvents = 'auto';
      const pos = calculateTooltipPosition(coords);
      selectionTooltipEl.style.left = String(pos.left) + 'px';
      selectionTooltipEl.style.top = String(pos.top) + 'px';
    }
  } catch (e) {
    console.error('[OverleafBridge] Failed to update tooltip position:', e);
  }
}

/**
 * 初始化 UI 监听器
 */
export function initUIListeners() {
  // 鼠标松开事件
  window.addEventListener('mouseup', function(event) {
    if (selectionTooltipEl && selectionTooltipEl.contains(event.target)) {
      return;
    }
    setTimeout(function() {
      showSelectionTooltipForCurrentSelection();
    }, 10);
  });

  // 滚动事件
  function handleScroll() {
    if (scrollThrottleTimer) return;
    scrollThrottleTimer = setTimeout(function() {
      scrollThrottleTimer = null;
      updateTooltipPosition();
    }, 16);
  }

  // 监听各种滚动
  setTimeout(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    const editorContainer = document.querySelector('.cm-scroller');
    if (editorContainer) {
      editorContainer.addEventListener('scroll', handleScroll, { passive: true });
    }
    
    const otherContainers = document.querySelectorAll('.editor-container, .cm-editor');
    otherContainers.forEach(function(container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
    });
  }, 1000);

  // 点击外部隐藏
  document.addEventListener('mousedown', function(event) {
    if (selectionTooltipEl && !selectionTooltipEl.contains(event.target)) {
      // 这里的逻辑在 legacy.js 中被注释掉了，但一般是需要的
      // hideSelectionTooltip();
    }
  });

  // 键盘事件隐藏
  window.addEventListener('keydown', function(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return;
    if (event.key === 'Escape') return; // ESC 由 createSelectionTooltip 内部处理
    
    if (currentSelection) {
      hideSelectionTooltip();
    }
  });
}

