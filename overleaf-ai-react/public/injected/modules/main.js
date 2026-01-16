/**
 * overleafBridge.js - 主入口文件
 * 整合所有模块，提供完整的桥接功能
 * 
 * 此文件将被 esbuild 打包为单文件版本
 */

// ============ 导入核心模块 ============
// 注意：由于浏览器环境限制，这些导入语句会被 esbuild 打包处理

// 核心功能
const getEditorView = (function() {
  try {
    const overleaf = window.overleaf;
    if (!overleaf || !overleaf.unstable || !overleaf.unstable.store) {
      return null;
    }
    return overleaf.unstable.store.get('editor.view');
  } catch (error) {
    console.error('[OverleafBridge] Failed to get EditorView:', error);
    return null;
  }
});

// 工具函数
function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function generatePreviewId() {
  return 'preview_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function getCurrentFileName() {
  try {
    var fileTab = document.querySelector('.file-tree-inner .selected .name');
    if (fileTab) return fileTab.textContent;
    
    var breadcrumb = document.querySelector('.editor-header .name');
    if (breadcrumb) return breadcrumb.textContent;
    
    var store = window.overleaf && window.overleaf.unstable && window.overleaf.unstable.store;
    if (store) {
      var openDocId = store.get('editor.open_doc_id');
      var docs = store.get('docs');
      if (openDocId && docs) {
        for (var key in docs) {
          if (docs[key]._id === openDocId) {
            return docs[key].name || 'unknown';
          }
        }
      }
    }
    return 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

// ============ 搜索模块 ============

// 获取项目 ID
function getProjectId() {
  const match = window.location.pathname.match(/\/project\/([a-f0-9]+)/);
  if (match) {
    return match[1];
  }
  const metaTag = document.querySelector('meta[name="ol-project_id"]');
  if (metaTag) {
    return metaTag.getAttribute('content');
  }
  throw new Error('无法获取项目 ID');
}

// 通过 entities API 获取文件列表
async function fetchEntities(projectId) {
  try {
    const response = await fetch(`/project/${projectId}/entities`);
    if (!response.ok) {
      throw new Error(`获取 entities 失败: ${response.status}`);
    }
    const data = await response.json();
    return data.entities || [];
  } catch (error) {
    console.error('[OverleafBridge] 获取 entities 失败:', error);
    return [];
  }
}

// 通过 history API 获取文件 hash 映射
async function fetchFileHashes(projectId) {
  try {
    const response = await fetch(`/project/${projectId}/latest/history`);
    if (!response.ok) {
      throw new Error(`获取 history 失败: ${response.status}`);
    }
    const data = await response.json();
    
    const fileHashes = {};
    
    if (data.chunk && data.chunk.history && data.chunk.history.changes) {
      data.chunk.history.changes.forEach(change => {
        if (change.operations) {
          change.operations.forEach(op => {
            if (op.pathname && op.file && op.file.hash) {
              fileHashes[op.pathname] = op.file.hash;
            }
          });
        }
      });
    }
    
    if (data.chunk && data.chunk.history && data.chunk.history.snapshot && data.chunk.history.snapshot.files) {
      const snapshotFiles = data.chunk.history.snapshot.files;
      for (const [pathname, fileData] of Object.entries(snapshotFiles)) {
        if (fileData && fileData.hash) {
          fileHashes[pathname] = fileData.hash;
        }
      }
    }
    
    return fileHashes;
  } catch (error) {
    console.error('[OverleafBridge] 获取 history 失败:', error);
    return {};
  }
}

// 通过 blob API 获取文件内容
async function fetchBlobContent(projectId, hash) {
  try {
    const response = await fetch(`/project/${projectId}/blob/${hash}`);
    if (!response.ok) {
      throw new Error(`获取 blob 失败: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`[OverleafBridge] 获取 blob 失败 (hash: ${hash}):`, error);
    return null;
  }
}

// 获取所有文档及其内容
async function getAllDocsWithContent(projectId) {
  const files = [];
  
  console.log('[OverleafBridge] 使用 entities + history API 获取文件');
  
  const entities = await fetchEntities(projectId);
  console.log(`[OverleafBridge] 找到 ${entities.length} 个实体`);
  
  const fileHashes = await fetchFileHashes(projectId);
  console.log(`[OverleafBridge] 找到 ${Object.keys(fileHashes).length} 个文件 hash`);
  
  const docs = entities.filter(e => e.type === 'doc');
  console.log(`[OverleafBridge] 找到 ${docs.length} 个可编辑文档`);
  
  let currentDocPath = null;
  let currentDocContent = null;
  
  try {
    const view = getEditorView();
    if (view) {
      currentDocContent = view.state.doc.toString();
      const store = window.overleaf?.unstable?.store;
      if (store) {
        currentDocPath = store.get('editor.open_doc_name');
      }
      if (currentDocPath && currentDocContent) {
        console.log(`[OverleafBridge] 当前编辑器文档: ${currentDocPath} (${currentDocContent.length} 字符，使用实时内容)`);
      }
    }
  } catch (e) {
    console.warn('[OverleafBridge] 无法获取当前编辑器内容:', e);
  }
  
  const batchSize = 5;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    
    const contents = await Promise.all(
      batch.map(async (doc) => {
        const pathname = doc.path.startsWith('/') ? doc.path.substring(1) : doc.path;
        
        if (currentDocPath && currentDocContent && pathname === currentDocPath) {
          console.log(`[OverleafBridge] ${pathname}: 使用编辑器实时内容`);
          return currentDocContent;
        }
        
        const hash = fileHashes[pathname];
        
        if (hash) {
          return await fetchBlobContent(projectId, hash);
        } else {
          console.warn(`[OverleafBridge] 未找到文件 hash: ${pathname}`);
          return null;
        }
      })
    );
    
    for (let j = 0; j < batch.length; j++) {
      if (contents[j] !== null) {
        const path = batch[j].path.startsWith('/') ? batch[j].path.substring(1) : batch[j].path;
        files.push({
          path: path,
          content: contents[j],
        });
      }
    }
  }
  
  console.log(`[OverleafBridge] 成功加载 ${files.length} 个文档内容`);
  return files;
}

// 创建正则表达式
function createSearchRegex(pattern, options = {}) {
  const { caseSensitive = false, wholeWord = false, regexp = false } = options;
  
  let regexPattern;
  
  if (regexp) {
    regexPattern = pattern;
  } else {
    regexPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  if (wholeWord) {
    regexPattern = `\\b${regexPattern}\\b`;
  }

  const flags = caseSensitive ? 'g' : 'gi';
  
  try {
    return new RegExp(regexPattern, flags);
  } catch (error) {
    throw new Error(`无效的正则表达式: ${error.message}`);
  }
}

// 搜索单个文件
function searchInFile(file, regex) {
  const lines = file.content.split('\n');
  const matches = [];

  lines.forEach((line, lineIndex) => {
    let match;
    regex.lastIndex = 0;
    
    const matchesInLine = [];
    while ((match = regex.exec(line)) !== null) {
      matchesInLine.push({
        lineNumber: lineIndex + 1,
        columnStart: match.index + 1,
        columnEnd: match.index + match[0].length + 1,
        matchedText: match[0],
        lineContent: line,
      });
      
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }
    
    matches.push(...matchesInLine);
  });

  return matches;
}

// 主搜索函数
async function searchInternal(pattern, options = {}) {
  const startTime = Date.now();
  
  console.log(`[OverleafBridge] 🔍 正在搜索: "${pattern}"`);
  console.log('[OverleafBridge] 搜索选项:', options);
  
  try {
    const projectId = getProjectId();
    console.log(`[OverleafBridge] 📂 项目 ID: ${projectId}`);
    
    console.log('[OverleafBridge] 📥 正在获取项目文档...');
    const files = await getAllDocsWithContent(projectId);
    console.log(`[OverleafBridge] ✅ 已加载 ${files.length} 个文档`);
    
    if (files.length === 0) {
      console.warn('[OverleafBridge] ⚠️ 未找到任何文档，搜索将返回空结果');
      return {
        results: [],
        totalMatches: 0,
        fileCount: 0,
        duration: ((Date.now() - startTime) / 1000).toFixed(2),
        error: '未找到任何文档'
      };
    }
    
    const regex = createSearchRegex(pattern, options);
    
    console.log('[OverleafBridge] 🔎 正在搜索...');
    const results = [];
    let totalMatches = 0;
    
    for (const file of files) {
      const matches = searchInFile(file, regex);
      if (matches.length > 0) {
        results.push({
          path: file.path,
          matchCount: matches.length,
          matches: matches,
        });
        totalMatches += matches.length;
      }
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`[OverleafBridge] ✨ 搜索完成！用时: ${duration}秒, 找到 ${totalMatches} 个匹配项`);
    
    return {
      results,
      totalMatches,
      fileCount: results.length,
      duration
    };
    
  } catch (error) {
    console.error('[OverleafBridge] ❌ 搜索失败:', error);
    throw error;
  }
}

// ============ 方法处理器 ============

const methodHandlers = {
  // 获取文档行数
  getDocLines: function() {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    return view.state.doc.lines;
  },

  // 获取文档完整文本
  getDocText: function() {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    return view.state.doc.toString();
  },

  // 获取选中的文本
  getSelection: function() {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    const selection = view.state.selection.main;
    return view.state.doc.sliceString(selection.from, selection.to);
  },

  // 获取选区详细信息（包含位置和文本）
  getSelectionInfo: function() {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    const selection = view.state.selection.main;
    const from = selection.from;
    const to = selection.to;
    const text = view.state.doc.sliceString(from, to);
    return {
      from: from,
      to: to,
      text: text,
      isEmpty: selection.empty
    };
  },

  // 获取光标位置
  getCursorPosition: function() {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    return {
      line: line.number,
      column: pos - line.from,
      offset: pos
    };
  },

  // 根据 offset 获取位置信息（line/column/offset）
  getPositionAtOffset: function(offset) {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    const doc = view.state.doc;
    if (offset < 0 || offset > doc.length) {
      throw new Error('Offset ' + offset + ' out of range (0-' + doc.length + ')');
    }
    const line = doc.lineAt(offset);
    return {
      line: line.number,
      column: offset - line.from,
      offset: offset
    };
  },

  // 获取指定行的范围信息（from/to 以及文本内容）
  getLineRange: function(lineNumber) {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    const doc = view.state.doc;
    if (lineNumber < 1 || lineNumber > doc.lines) {
      throw new Error('Line number ' + lineNumber + ' out of range (1-' + doc.lines + ')');
    }
    const line = doc.line(lineNumber);
    return {
      lineNumber: line.number,
      from: line.from,
      to: line.to,
      text: line.text
    };
  },

  // 获取指定行的内容
  getLineContent: function(lineNumber) {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    if (lineNumber < 1 || lineNumber > view.state.doc.lines) {
      throw new Error('Line number ' + lineNumber + ' out of range (1-' + view.state.doc.lines + ')');
    }
    return view.state.doc.line(lineNumber).text;
  },

  // 检查 EditorView 是否可用
  isEditorAvailable: function() {
    return getEditorView() !== null;
  },

  // 在光标位置插入文本（通过 EditorView API）
  insertText: function(text) {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: text },
      selection: { anchor: selection.from + text.length }
    });
    return true;
  },

  // 替换指定范围的文本
  replaceRange: function(from, to, text) {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    view.dispatch({
      changes: { from: from, to: to, insert: text }
    });
    return true;
  },

  // 根据指定内容查找首个匹配并替换，返回匹配区间
  replaceFirstMatch: function(searchText, replaceText) {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    if (!searchText) {
      throw new Error('searchText must not be empty');
    }

    const doc = view.state.doc;
    const fullText = doc.toString();
    const firstIndex = fullText.indexOf(searchText);

    // 1. 完全没匹配
    if (firstIndex === -1) {
      return {
        found: false,
        from: -1,
        to: -1,
        searchText: searchText,
        replaceText: replaceText,
        matchesCount: 0
      };
    }

    // 2. 统计一共有多少处匹配
    let count = 1;
    let searchFrom = firstIndex + searchText.length;
    while (true) {
      const nextIndex = fullText.indexOf(searchText, searchFrom);
      if (nextIndex === -1) {
        break;
      }
      count++;
      searchFrom = nextIndex + searchText.length;
    }

    // 3. 如果匹配到多处，则不替换，只返回提示信息
    if (count > 1) {
      return {
        found: false,
        from: -1,
        to: -1,
        searchText: searchText,
        replaceText: replaceText,
        matchesCount: count
      };
    }

    // 4. 只有一处匹配：执行替换
    const from = firstIndex;
    const to = firstIndex + searchText.length;

    console.log('[OverleafBridge] replaceFirstMatch called:', {
      searchTextLength: searchText.length,
      replaceTextLength: replaceText ? replaceText.length : 0,
      from: from,
      to: to,
      matchesCount: count
    });

    view.dispatch({
      changes: { from: from, to: to, insert: replaceText }
    });

    return {
      found: true,
      from: from,
      to: to,
      searchText: searchText,
      replaceText: replaceText,
      matchesCount: count
    };
  },

  // 读取指定行范围的内容（1-indexed，包含首尾）
  readLines: function(startLine, endLine) {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    
    const totalLines = view.state.doc.lines;
    
    // 验证行号范围
    if (startLine < 1) startLine = 1;
    if (endLine > totalLines) endLine = totalLines;
    if (startLine > endLine) {
      throw new Error('Invalid line range: start (' + startLine + ') > end (' + endLine + ')');
    }
    
    // 收集指定范围的行
    var lines = [];
    for (var i = startLine; i <= endLine; i++) {
      var line = view.state.doc.line(i);
      lines.push({
        lineNumber: i,
        text: line.text
      });
    }
    
    return {
      lines: lines,
      totalLines: totalLines,
      startLine: startLine,
      endLine: endLine,
      hasMoreBefore: startLine > 1,
      hasMoreAfter: endLine < totalLines
    };
  },

  // 读取整个文件内容（带行号）
  readEntireFile: function() {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    
    const totalLines = view.state.doc.lines;
    var lines = [];
    
    for (var i = 1; i <= totalLines; i++) {
      var line = view.state.doc.line(i);
      lines.push({
        lineNumber: i,
        text: line.text
      });
    }
    
    return {
      lines: lines,
      totalLines: totalLines,
      content: view.state.doc.toString()
    };
  },

  // 获取文件信息（行数等元数据）
  getFileInfo: function() {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    
    const doc = view.state.doc;
    
    // 复用 getCurrentFile 的逻辑来获取文件名和ID
    let fileInfo = null;
    try {
      fileInfo = methodHandlers.getCurrentFile();
    } catch (e) {
      console.warn('[getFileInfo] Failed to get current file info:', e);
    }

    return {
      totalLines: doc.lines,
      totalLength: doc.length,
      fileName: fileInfo ? fileInfo.name : null,
      fileId: fileInfo ? fileInfo.id : null,
      fileType: fileInfo ? fileInfo.type : null
    };
  },

  // 获取当前打开的文件信息（支持文档和图片，无需 EditorView）
  getCurrentFile: function() {
    // 策略 1: 检查左侧文件树的高亮项 (UI 状态，最准确，支持所有类型)
    try {
      const selectedItem = document.querySelector('li[role="treeitem"][aria-selected="true"]');
      if (selectedItem) {
        const fileName = selectedItem.getAttribute('aria-label');
        const entityDiv = selectedItem.querySelector('.entity');
        const fileType = entityDiv ? entityDiv.getAttribute('data-file-type') : null; // 'doc' or 'file'
        const fileId = entityDiv ? entityDiv.getAttribute('data-file-id') : null;

        if (fileName) {
          console.log(`[OverleafBridge] Found file via file tree: ${fileName} (${fileType}, ${fileId})`);
          return {
            name: fileName,
            id: fileId,
            type: fileType,
            source: 'file_tree'
          };
        }
      }
    } catch (e) {
      console.warn('[OverleafBridge] File tree check failed:', e);
    }

    // 策略 2: 检查 Overleaf Store (官方数据，主要针对编辑器中的文档)
    try {
      const store = window.overleaf?.unstable?.store;
      if (store) {
        const docName = store.get('editor.open_doc_name');
        const docId = store.get('editor.open_doc_id');
        if (docName) {
          console.log(`[OverleafBridge] Found file via store: ${docName} (${docId})`);
          return {
            name: docName,
            id: docId,
            type: 'doc', // Store 里存的一般是 doc
            source: 'store'
          };
        }
      }
    } catch (e) {
      console.warn('[OverleafBridge] Store check failed:', e);
    }

    // 策略 3: 检查面包屑导航 (最后的备选)
    try {
      const breadcrumb = document.querySelector('.ol-cm-breadcrumbs div:last-child, .breadcrumbs div:last-child');
      if (breadcrumb && breadcrumb.textContent) {
        const fileName = breadcrumb.textContent.trim();
        console.log(`[OverleafBridge] Found file via breadcrumb: ${fileName}`);
        return {
          name: fileName,
          id: null,
          type: null,
          source: 'breadcrumb'
        };
      }
    } catch (e) {
      console.warn('[OverleafBridge] Breadcrumb check failed:', e);
    }

    return null;
  },

  // 切换当前编辑的文件
  switchFile: function(targetFilename) {
    console.log(`[OverleafBridge] Attempting to switch to file: "${targetFilename}"`);

    // 1. 查找文件节点
    // Overleaf 文件树节点通常带有 aria-label="文件名"
    // 注意：如果是文件夹中的文件，这里可能需要先展开文件夹，目前仅支持顶层或已展开的文件
    const fileNode = document.querySelector(`li[role="treeitem"][aria-label="${targetFilename}"]`);

    if (fileNode) {
      console.log("[OverleafBridge] Found file node DOM, clicking...");
      
      // 2. 找到最佳点击目标
      // 通常点击内部的 .entity 元素，如果没有则点击 li 本身
      const clickTarget = fileNode.querySelector('.entity') || fileNode;

      // 3. 模拟完整的鼠标点击事件序列 (MouseDown -> MouseUp -> Click)
      // 这样比单纯的 .click() 更能骗过某些框架的事件监听
      const eventOptions = { bubbles: true, cancelable: true, view: window };
      
      clickTarget.dispatchEvent(new MouseEvent('mousedown', eventOptions));
      clickTarget.dispatchEvent(new MouseEvent('mouseup', eventOptions));
      clickTarget.dispatchEvent(new MouseEvent('click', eventOptions));

      console.log(`[OverleafBridge] Switch command sent to "${targetFilename}"`);
      return { success: true };
    } else {
      console.warn(`[OverleafBridge] DOM node not found for file "${targetFilename}"`);
      return { 
        success: false, 
        error: 'File not found in file tree (it might be in a collapsed folder)' 
      };
    }
  },

  // 设置整个文档内容（全量替换）
  setDocContent: function(newContent) {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    
    const doc = view.state.doc;
    const oldLength = doc.length;
    
    console.log('[OverleafBridge] setDocContent called:', {
      oldLength: oldLength,
      newLength: newContent.length
    });
    
    // 全量替换：从0到文档末尾
    view.dispatch({
      changes: { from: 0, to: oldLength, insert: newContent }
    });
    
    return {
      success: true,
      oldLength: oldLength,
      newLength: newContent.length
    };
  },

  // 应用多个编辑操作（按 offset 倒序应用，避免位置偏移问题）
  applyEdits: function(edits) {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
    
    if (!edits || edits.length === 0) {
      return { success: true, appliedCount: 0 };
    }
    
    console.log('[OverleafBridge] applyEdits called:', {
      editCount: edits.length
    });
    
    // 按 from 倒序排列，这样从后往前应用不会影响前面的位置
    var sortedEdits = edits.slice().sort(function(a, b) {
      return b.from - a.from;
    });
    
    // 构建所有的 changes
    var changes = sortedEdits.map(function(edit) {
      return {
        from: edit.from,
        to: edit.to,
        insert: edit.insert || ''
      };
    });
    
    // 一次性应用所有更改
    view.dispatch({ changes: changes });
    
    return {
      success: true,
      appliedCount: edits.length
    };
  },

  // 获取全局搜索
  searchProject: async function(pattern, options) {
    return await searchInternal(pattern, options);
  },

  // 获取项目文件统计信息（行数、字符数）
  getProjectFileStats: async function() {
    try {
      const projectId = getProjectId();
      const files = await getAllDocsWithContent(projectId);
      return files.map(f => ({
        path: f.path,
        lines: f.content ? f.content.split('\n').length : 0,
        chars: f.content ? f.content.length : 0
      }));
    } catch (e) {
      console.error('[OverleafBridge] getProjectFileStats failed:', e);
      return [];
    }
  }
};

// ============ 消息监听器 ============

// 监听来自 Content Script 的消息
window.addEventListener('message', function(event) {
  // 只处理来自同一页面的消息
  if (event.source !== window) return;
  
  var data = event.data;
  if (!data || data.type !== 'OVERLEAF_BRIDGE_REQUEST') return;

  var requestId = data.requestId;
  var method = data.method;
  var args = data.args || [];

  // 构建响应
  var response = {
    type: 'OVERLEAF_BRIDGE_RESPONSE',
    requestId: requestId,
    success: false
  };

  try {
    var handler = methodHandlers[method];
    if (!handler) {
      throw new Error('Unknown method: ' + method);
    }

    var result = handler.apply(null, args);
    
    // 处理 Promise 结果 (for async methods like searchProject)
    if (result && typeof result.then === 'function') {
      result.then(function(res) {
        response.success = true;
        response.result = res;
        window.postMessage(response, '*');
      }).catch(function(err) {
        response.success = false;
        response.error = err instanceof Error ? err.message : String(err);
        window.postMessage(response, '*');
      });
      return;
    }

    response.success = true;
    response.result = result;
  } catch (error) {
    response.success = false;
    response.error = error instanceof Error ? error.message : String(error);
  }

  // 发送响应 (同步结果)
  window.postMessage(response, '*');
});

// ============ 导入 Legacy UI 模块 ============
// Legacy 模块包含：选区工具提示、预览系统、Diff 建议系统的完整 UI 代码
// 这部分代码将在打包时自动内联

console.log('[OverleafBridge] 模块化 Bridge 已加载');
console.log('[OverleafBridge] Modular architecture initialized');

