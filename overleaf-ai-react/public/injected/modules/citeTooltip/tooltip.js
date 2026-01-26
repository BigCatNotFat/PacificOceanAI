/**
 * Cite Tooltip 核心逻辑
 * 显示 \cite{} 引用的文献信息
 */

import { getEditorView } from '../core/editorView.js';

// 状态
let tooltipContainer = null;
let tooltipContent = null;
let currentCite = null;
let lastPos = -1;
let checkInterval = null;

// 文献缓存（避免重复请求）
const referenceCache = new Map();

/**
 * 创建 DOM 元素
 */
function createTooltipDOM() {
  if (tooltipContainer) return;
  
  tooltipContainer = document.createElement('div');
  tooltipContainer.className = 'ol-cm-cite-tooltip-container';
  
  tooltipContent = document.createElement('div');
  tooltipContent.className = 'ol-cm-cite-content';
  tooltipContainer.appendChild(tooltipContent);
  document.body.appendChild(tooltipContainer);
}

/**
 * 更新主题（浅色/深色）
 */
function updateTheme() {
  if (!tooltipContent) return;
  
  const isDark = document.body.classList.contains('dark') || 
                 document.querySelector('[data-theme="dark"]');
  if (isDark) {
    tooltipContent.classList.add('dark');
    tooltipContent.classList.remove('light');
  } else {
    tooltipContent.classList.add('light');
    tooltipContent.classList.remove('dark');
  }
}

/**
 * 查找光标下的 \cite{} 引用
 */
function findCiteAtCursor(view) {
  if (!view || !view.state) return null;
  
  const selection = view.state.selection.main;
  if (!selection.empty) return null;
  
  const pos = selection.from;
  const line = view.state.doc.lineAt(pos);
  const colInLine = pos - line.from;
  
  // 匹配 \cite{key} 或 \cite{key1, key2, ...}
  const citeRegex = /\\cite\{([^}]+)\}/g;
  let match;
  
  while ((match = citeRegex.exec(line.text)) !== null) {
    const startCol = match.index;
    const endCol = match.index + match[0].length;
    
    if (colInLine >= startCol && colInLine <= endCol) {
      const coords = view.coordsAtPos(line.from + startCol);
      
      // 解析多个引用键（可能是 "key1, key2"）
      const keys = match[1].split(',').map(k => k.trim()).filter(k => k);
      
      return {
        keys: keys,
        fullMatch: match[0],
        pos: line.from + startCol,
        coords: coords
      };
    }
  }
  return null;
}

// 记录上次点击时间，避免重复触发
let lastClickTime = 0;

/**
 * 处理点击事件 - 跳转到文献库中对应的引用
 */
function handleCiteClick(keys) {
  const now = Date.now();
  // 防抖：300ms 内不重复触发
  if (now - lastClickTime < 300) return;
  lastClickTime = now;
  
  // 发送消息到 Sidepanel，请求高亮并滚动到对应文献
  window.postMessage({
    type: 'OVERLEAF_CITE_NAVIGATE',
    keys: keys
  }, '*');
  
  console.log('[CiteTooltip] Navigate to:', keys);
}

/**
 * 从文献管理系统获取引用信息
 * 通过 postMessage 与 Sidepanel 通信
 */
async function fetchReferenceInfo(keys) {
  // 先检查缓存
  const cachedResults = [];
  const uncachedKeys = [];
  
  for (const key of keys) {
    if (referenceCache.has(key)) {
      cachedResults.push(referenceCache.get(key));
    } else {
      uncachedKeys.push(key);
    }
  }
  
  // 如果全部命中缓存，直接返回
  if (uncachedKeys.length === 0) {
    return cachedResults;
  }
  
  // 发送请求到 Content Script
  return new Promise((resolve) => {
    const requestId = `cite_lookup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const handleResponse = (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'OVERLEAF_CITE_LOOKUP_RESPONSE') return;
      if (event.data?.requestId !== requestId) return;
      
      window.removeEventListener('message', handleResponse);
      
      const references = event.data.references || [];
      
      // 更新缓存
      for (const ref of references) {
        if (ref && ref.id) {
          referenceCache.set(ref.id, ref);
        }
      }
      
      // 合并缓存和新数据
      resolve([...cachedResults, ...references]);
    };
    
    window.addEventListener('message', handleResponse);
    
    // 发送请求
    window.postMessage({
      type: 'OVERLEAF_CITE_LOOKUP_REQUEST',
      requestId: requestId,
      keys: uncachedKeys
    }, '*');
    
    // 超时处理
    setTimeout(() => {
      window.removeEventListener('message', handleResponse);
      // 超时返回空，但缓存的数据仍然返回
      resolve(cachedResults);
    }, 2000);
  });
}

/**
 * 渲染文献信息
 */
function renderReferenceInfo(references, keys) {
  if (!tooltipContent) return;
  
  // 如果没有找到任何引用
  if (!references || references.length === 0) {
    tooltipContent.innerHTML = `
      <div class="ol-cm-cite-not-found">
        未找到引用: ${keys.join(', ')}
      </div>
      <div class="ol-cm-cite-key">\\cite{${keys.join(', ')}}</div>
    `;
    return;
  }
  
  // 渲染找到的引用
  const html = references.map(ref => {
    if (!ref) return '';
    
    const venue = ref.journal || ref.booktitle || ref.publisher || '';
    const metaItems = [];
    
    if (ref.year) {
      metaItems.push(`<span class="ol-cm-cite-meta-item">${ref.year}</span>`);
    }
    if (venue) {
      metaItems.push(`<span class="ol-cm-cite-meta-item">${truncate(venue, 40)}</span>`);
    }
    
    return `
      <div class="ol-cm-cite-title">${escapeHtml(ref.title || ref.id)}</div>
      ${ref.authors ? `<div class="ol-cm-cite-authors">${escapeHtml(truncate(ref.authors, 80))}</div>` : ''}
      ${metaItems.length > 0 ? `<div class="ol-cm-cite-meta">${metaItems.join('')}</div>` : ''}
    `;
  }).join('<hr style="margin: 8px 0; border: none; border-top: 1px solid #eee;">');
  
  tooltipContent.innerHTML = html + `<div class="ol-cm-cite-key">\\cite{${keys.join(', ')}}</div>`;
}

/**
 * 显示加载状态
 */
function showLoading(keys) {
  if (!tooltipContent) return;
  
  tooltipContent.innerHTML = `
    <div class="ol-cm-cite-loading">
      <div class="ol-cm-cite-spinner"></div>
      <span>查找引用...</span>
    </div>
    <div class="ol-cm-cite-key">\\cite{${keys.join(', ')}}</div>
  `;
}

/**
 * 更新工具提示位置
 */
function updatePosition() {
  if (!currentCite || !tooltipContainer) return;
  
  const view = getEditorView();
  if (!view) return;
  
  const newCoords = view.coordsAtPos(currentCite.pos);
  if (!newCoords) {
    hideTooltip();
    return;
  }
  
  const gap = 6;
  const tooltipHeight = tooltipContainer.offsetHeight || 60;
  
  // 优先显示在上方
  let top = newCoords.top - tooltipHeight - gap;
  let left = newCoords.left;
  
  // 如果上方空间不足，则显示在下方
  if (top < 10) {
    top = newCoords.bottom + gap;
  }
  
  // 防止超出右边界
  const maxLeft = window.innerWidth - tooltipContainer.offsetWidth - 10;
  if (left > maxLeft) {
    left = maxLeft;
  }
  
  tooltipContainer.style.top = top + 'px';
  tooltipContainer.style.left = Math.max(10, left) + 'px';
}

/**
 * 显示工具提示
 */
async function showTooltip(cite) {
  currentCite = cite;
  updateTheme();
  
  // 先显示加载状态
  showLoading(cite.keys);
  tooltipContainer.style.display = 'block';
  updatePosition();
  
  // 获取引用信息
  const references = await fetchReferenceInfo(cite.keys);
  
  // 检查是否仍然是当前引用（用户可能已移走）
  if (currentCite !== cite) return;
  
  renderReferenceInfo(references, cite.keys);
  updatePosition(); // 内容变化后重新定位
}

/**
 * 隐藏工具提示
 */
function hideTooltip() {
  if (tooltipContainer) {
    tooltipContainer.style.display = 'none';
  }
  currentCite = null;
}

/**
 * 检查光标位置
 */
function check() {
  const view = getEditorView();
  if (!view) return;
  
  const cite = findCiteAtCursor(view);
  
  if (cite) {
    // 检查是否是同一个引用
    const sameKeys = currentCite && 
      currentCite.keys.length === cite.keys.length && 
      currentCite.keys.every((k, i) => k === cite.keys[i]);
    
    if (sameKeys) {
      currentCite = cite;
      updatePosition();
    } else {
      // 新的引用 - 触发导航（用户点击/移动到了新的 cite）
      handleCiteClick(cite.keys);
      showTooltip(cite);
    }
  } else {
    hideTooltip();
  }
}

/**
 * 启动检测
 */
export function startCiteTooltip() {
  createTooltipDOM();
  
  // 轮询检测光标变化
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  
  checkInterval = setInterval(() => {
    const view = getEditorView();
    if (view) {
      const pos = view.state.selection.main.from;
      if (pos !== lastPos) {
        lastPos = pos;
        check();
      }
    }
  }, 50);
  
  // 监听滚动事件
  window.addEventListener('scroll', () => {
    if (currentCite) {
      updatePosition();
    }
  }, true);
  
  // 监听窗口大小变化
  window.addEventListener('resize', () => {
    if (currentCite) {
      updatePosition();
    }
  });
  
  console.log('[CiteTooltip] Started');
}

/**
 * 停止检测
 */
export function stopCiteTooltip() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  hideTooltip();
  console.log('[CiteTooltip] Stopped');
}

/**
 * 更新引用缓存（供外部调用）
 */
export function updateReferenceCache(references) {
  if (!Array.isArray(references)) return;
  
  for (const ref of references) {
    if (ref && ref.id) {
      referenceCache.set(ref.id, ref);
    }
  }
  console.log('[CiteTooltip] Cache updated with', references.length, 'references');
}

/**
 * 清除引用缓存
 */
export function clearReferenceCache() {
  referenceCache.clear();
  console.log('[CiteTooltip] Cache cleared');
}

// 工具函数
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

/**
 * 搜索文档中所有引用指定 key 的位置
 * @param {string} key - 引用键
 * @returns {Array<{line: number, column: number, pos: number, context: string}>}
 */
export function findAllCitePositions(key) {
  const view = getEditorView();
  if (!view) return [];
  
  const positions = [];
  const doc = view.state.doc;
  const text = doc.toString();
  
  // 匹配所有 \cite{...key...} 的位置
  const citeRegex = /\\cite\{([^}]+)\}/g;
  let match;
  
  while ((match = citeRegex.exec(text)) !== null) {
    const keys = match[1].split(',').map(k => k.trim());
    if (keys.includes(key)) {
      const pos = match.index;
      const line = doc.lineAt(pos);
      positions.push({
        line: line.number,
        column: pos - line.from,
        pos: pos,
        context: line.text.substring(0, 80) // 上下文预览
      });
    }
  }
  
  return positions;
}

/**
 * 跳转到指定位置
 * @param {number} pos - 文档位置
 */
export function navigateToPosition(pos) {
  const view = getEditorView();
  if (!view) return false;
  
  try {
    // 设置光标位置
    view.dispatch({
      selection: { anchor: pos },
      scrollIntoView: true
    });
    
    // 聚焦编辑器
    view.focus();
    
    return true;
  } catch (e) {
    console.error('[CiteTooltip] Navigate failed:', e);
    return false;
  }
}

