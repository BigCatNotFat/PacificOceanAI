/**
 * Overleaf Bridge - 注入到页面主世界的脚本
 * 用于访问 window.overleaf.unstable.store 等页面内部 API
 */

// 获取 EditorView
function getEditorView() {
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
}

// --- Search Helper Functions ---

// 获取项目 ID
function getProjectId() {
  const match = window.location.pathname.match(/\/project\/([a-f0-9]+)/);
  if (match) {
    return match[1];
  }
  // 尝试从 meta 标签获取
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
    
    // 从 changes 中提取文件 hash
    if (data.chunk && data.chunk.history && data.chunk.history.changes) {
      data.chunk.history.changes.forEach(change => {
        if (change.operations) {
          change.operations.forEach(op => {
            if (op.pathname && op.file && op.file.hash) {
              // 保存最新的 hash（后面的 change 会覆盖前面的）
              fileHashes[op.pathname] = op.file.hash;
            }
          });
        }
      });
    }
    
    // 也检查 snapshot（如果有的话）
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
  
  // 1. 获取文件列表
  const entities = await fetchEntities(projectId);
  console.log(`[OverleafBridge] 找到 ${entities.length} 个实体`);
  
  // 2. 获取文件 hash 映射
  const fileHashes = await fetchFileHashes(projectId);
  console.log(`[OverleafBridge] 找到 ${Object.keys(fileHashes).length} 个文件 hash`);
  
  // 3. 过滤出可编辑的文档（type === 'doc'）
  const docs = entities.filter(e => e.type === 'doc');
  console.log(`[OverleafBridge] 找到 ${docs.length} 个可编辑文档`);
  
  // ========== 新增：获取当前编辑器文档的实时内容 ==========
  // 优先使用编辑器内容，因为 blob API 可能返回旧版本（不包含最新修改）
  let currentDocPath = null;
  let currentDocContent = null;
  
  try {
    const view = getEditorView();
    if (view) {
      currentDocContent = view.state.doc.toString();
      // 从 Overleaf store 获取当前打开的文档名
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
  // ========== 新增结束 ==========
  
  // 4. 获取每个文档的内容
  const batchSize = 5;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    
    const contents = await Promise.all(
      batch.map(async (doc) => {
        // 路径格式: "/main.tex" -> "main.tex"
        const pathname = doc.path.startsWith('/') ? doc.path.substring(1) : doc.path;
        
        // ========== 新增：当前文档优先使用编辑器实时内容 ==========
        // 这样可以确保搜索到最新的内容（包括中文等最近添加的内容）
        if (currentDocPath && currentDocContent && pathname === currentDocPath) {
          console.log(`[OverleafBridge] ${pathname}: 使用编辑器实时内容`);
          return currentDocContent;
        }
        // ========== 新增结束 ==========
        
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
        // 移除开头的 /
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
    // 使用用户提供的正则表达式
    regexPattern = pattern;
  } else {
    // 转义特殊字符
    regexPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 如果是全字匹配，添加单词边界
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
    // 重置 lastIndex
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
      
      // 防止无限循环（空匹配）
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
    
    // 获取所有文档及其内容
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
    
    // 创建搜索正则表达式
    const regex = createSearchRegex(pattern, options);
    
    // 搜索所有文件
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

// 处理请求的方法映射
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

// ============ 选区提示框功能 ============

/**
 * 选区操作按钮配置
 * 每个按钮包含：id, label, icon, bgColor, hoverColor
 * 扩展新按钮只需在此数组中添加配置即可
 */
var SELECTION_ACTION_BUTTONS = [
  { id: 'expand',    label: '扩写', icon: '', bgColor: '#10b981', hoverColor: '#059669' },
  { id: 'condense',  label: '缩写', icon: '', bgColor: '#f59e0b', hoverColor: '#d97706' },
  { id: 'polish',    label: '润色', icon: '', bgColor: '#3b82f6', hoverColor: '#2563eb' },
  { id: 'translate', label: '翻译', icon: '', bgColor: '#8b5cf6', hoverColor: '#7c3aed' }
];

// 动态模型列表（从 ModelRegistryService 获取）
var availableModels = [];

// 默认备用模型列表（在模型列表加载前使用）
var FALLBACK_MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' }
];

// ============ 激活状态管理 ============

// 激活状态（从 React 应用同步）
var isActivated = false;

/**
 * 检查是否已激活
 * @returns {boolean}
 */
function checkIsActivated() {
  return isActivated;
}

/**
 * 显示激活模态框（复用 React 的 ActivationModal 组件）
 */
function showActivationRequiredHint() {
  // 先隐藏选区提示框
  hideSelectionTooltip();
  
  // 发送消息触发显示 React 的 ActivationModal 组件
  window.postMessage({
    type: 'OVERLEAF_SHOW_ACTIVATION_MODAL',
    data: {}
  }, '*');
  
  console.log('[OverleafBridge] Requesting to show activation modal');
}

/**
 * 监听激活状态更新消息
 */
window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  
  var data = event.data;
  if (!data || data.type !== 'OVERLEAF_ACTIVATION_STATUS_UPDATE') return;
  
  var newStatus = data.data?.isActivated;
  if (typeof newStatus === 'boolean') {
    var oldStatus = isActivated;
    isActivated = newStatus;
    console.log('[OverleafBridge] Activation status updated:', isActivated, '(was:', oldStatus, ')');
  }
});

/**
 * 请求激活状态
 */
function requestActivationStatus() {
  window.postMessage({
    type: 'OVERLEAF_REQUEST_ACTIVATION_STATUS',
    data: {}
  }, '*');
  console.log('[OverleafBridge] Requesting activation status from React app');
}

// 在脚本加载后请求激活状态
setTimeout(requestActivationStatus, 200);

/**
 * 获取当前可用的模型列表
 * 优先使用从 React 应用推送的模型列表，否则使用备用列表
 */
function getAvailableModels() {
  return availableModels.length > 0 ? availableModels : FALLBACK_MODELS;
}

/**
 * 更新模型选择器的选项
 */
function updateModelSelectorOptions() {
  var select = document.getElementById('ol-ai-model-select');
  if (!select) return;
  
  var currentModel = getSelectedTextActionModel();
  var models = getAvailableModels();
  
  // 清空现有选项
  select.innerHTML = '';
  
  // 添加新选项
  models.forEach(function(model) {
    var option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    if (model.id === currentModel) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  
  // 如果当前选择的模型不在列表中，选择第一个
  if (!models.find(function(m) { return m.id === currentModel; })) {
    select.value = models[0]?.id || '';
  }
  
  console.log('[OverleafBridge] Model selector updated with', models.length, 'models');
}

// 文本操作选择的模型 Storage Key
var TEXT_ACTION_MODEL_KEY = 'ol-ai-text-action-model';

var selectionTooltipEl = null;
var buttonContainerEl = null;
var modelSelectorEl = null;
var currentSelection = null; // 保存当前选区信息

/**
 * 获取当前选择的文本操作模型
 */
function getSelectedTextActionModel() {
  try {
    var models = getAvailableModels();
    return localStorage.getItem(TEXT_ACTION_MODEL_KEY) || models[0].id;
  } catch (e) {
    var models = getAvailableModels();
    return models[0].id;
  }
}

/**
 * 保存选择的文本操作模型
 */
function setSelectedTextActionModel(modelId) {
  try {
    localStorage.setItem(TEXT_ACTION_MODEL_KEY, modelId);
    // 通知 React 应用模型变更
    window.postMessage({
      type: 'OVERLEAF_TEXT_ACTION_MODEL_CHANGED',
      data: { modelId: modelId }
    }, '*');
    console.log('[OverleafBridge] Text action model changed to:', modelId);
  } catch (e) {
    console.error('[OverleafBridge] Failed to save model selection:', e);
  }
}

/**
 * 创建模型选择器
 */
function createModelSelector() {
  const container = document.createElement('div');
  container.id = 'ol-ai-model-selector';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '6px';
  container.style.marginTop = '8px';
  container.style.paddingTop = '8px';
  container.style.borderTop = '1px solid rgba(255,255,255,0.1)';
  
  // 标签
  const label = document.createElement('span');
  label.textContent = '🤖 模型:';
  label.style.fontSize = '11px';
  label.style.color = '#9ca3af';
  label.style.flexShrink = '0';
  container.appendChild(label);
  
  // 下拉选择框
  const select = document.createElement('select');
  select.id = 'ol-ai-model-select';
  select.style.flex = '1';
  select.style.padding = '4px 8px';
  select.style.fontSize = '11px';
  select.style.borderRadius = '4px';
  select.style.border = '1px solid rgba(255,255,255,0.2)';
  select.style.background = 'rgba(15, 23, 42, 0.8)';
  select.style.color = '#e5e7eb';
  select.style.cursor = 'pointer';
  select.style.outline = 'none';
  select.style.minWidth = '120px';
  
  // 添加选项
  var currentModel = getSelectedTextActionModel();
  var models = getAvailableModels();
  models.forEach(function(model) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    if (model.id === currentModel) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  
  // 监听变化
  select.onchange = function() {
    setSelectedTextActionModel(this.value);
  };
  
  // 阻止事件冒泡，防止选择模型时隐藏菜单
  select.onclick = function(e) {
    e.stopPropagation();
  };
  
  container.appendChild(select);
  
  return container;
}

/**
 * 隐藏选区提示框
 */
function hideSelectionTooltip() {
  if (selectionTooltipEl) {
    selectionTooltipEl.style.display = 'none';
  }
  currentSelection = null;
}

/**
 * 创建操作按钮的工厂函数
 * @param {Object} config 按钮配置对象
 * @returns {HTMLButtonElement}
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
 * 创建选区提示框 DOM 结构
 * @returns {HTMLDivElement}
 */
function createSelectionTooltip() {
  const tooltip = document.createElement('div');
  tooltip.id = 'ol-ai-selection-tooltip';
  tooltip.style.position = 'fixed';  // 使用 fixed 定位，跟随视口
  tooltip.style.zIndex = '9999';
  tooltip.style.background = 'linear-gradient(135deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.98) 100%)';
  tooltip.style.color = '#e5e7eb';
  tooltip.style.padding = '10px';
  tooltip.style.borderRadius = '10px';
  tooltip.style.fontSize = '12px';
  tooltip.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.1)';
  tooltip.style.display = 'none';
  tooltip.style.flexDirection = 'column';  // 改为垂直布局
  tooltip.style.gap = '8px';
  tooltip.style.backdropFilter = 'blur(10px)';
  tooltip.style.transition = 'left 0.1s ease-out, top 0.1s ease-out, opacity 0.15s ease';
  tooltip.style.opacity = '1';
  tooltip.style.minWidth = '300px';
  tooltip.style.maxWidth = '420px';
  
  // 创建自定义输入区域
  const customInputContainer = document.createElement('div');
  customInputContainer.id = 'ol-ai-custom-input-container';
  customInputContainer.style.display = 'flex';
  customInputContainer.style.gap = '8px';
  customInputContainer.style.alignItems = 'stretch';
  
  // 自定义输入框
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
  
  // 输入框聚焦效果
  customInput.onfocus = function() {
    this.style.border = '1px solid rgba(59, 130, 246, 0.5)';
    this.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.2)';
  };
  customInput.onblur = function() {
    this.style.border = '1px solid rgba(255,255,255,0.15)';
    this.style.boxShadow = 'none';
  };
  
  // 阻止输入框的键盘事件冒泡
  customInput.onkeydown = function(e) {
    e.stopPropagation();
    // Ctrl+Enter 或 Enter（非 Shift）发送
    if ((e.ctrlKey && e.key === 'Enter') || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      handleCustomRequest();
    }
    // ESC 关闭菜单
    if (e.key === 'Escape') {
      hideSelectionTooltip();
    }
  };
  
  // 自动调整高度
  customInput.oninput = function() {
    this.style.height = '28px';
    this.style.height = Math.min(this.scrollHeight, 60) + 'px';
  };
  
  customInputContainer.appendChild(customInput);
  
  // 发送按钮
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
  
  // 分隔线和快捷操作标签
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
  
  // 创建按钮容器
  buttonContainerEl = document.createElement('div');
  buttonContainerEl.id = 'ol-ai-selection-buttons';
  buttonContainerEl.style.display = 'flex';
  buttonContainerEl.style.gap = '8px';
  buttonContainerEl.style.justifyContent = 'center';
  buttonContainerEl.style.flexWrap = 'wrap';
  buttonContainerEl.style.pointerEvents = 'auto';
  
  // 根据配置创建按钮
  SELECTION_ACTION_BUTTONS.forEach(function(btnConfig) {
    const btn = createActionButton(btnConfig);
    buttonContainerEl.appendChild(btn);
  });
  
  tooltip.appendChild(buttonContainerEl);
  
  // 创建模型选择器
  modelSelectorEl = createModelSelector();
  tooltip.appendChild(modelSelectorEl);
  
  document.body.appendChild(tooltip);
  
  return tooltip;
}

/**
 * 处理自定义请求
 */
function handleCustomRequest() {
  // 首先检查激活状态
  if (!checkIsActivated()) {
    console.warn('[OverleafBridge] Not activated, showing activation hint');
    showActivationRequiredHint();
    return;
  }
  
  const inputEl = document.getElementById('ol-ai-custom-input');
  if (!inputEl) return;
  
  const customPrompt = inputEl.value.trim();
  if (!customPrompt) {
    // 输入框为空，显示提示
    inputEl.style.border = '1px solid rgba(245, 158, 11, 0.5)';
    inputEl.placeholder = '请输入您的要求...';
    setTimeout(function() {
      inputEl.style.border = '1px solid rgba(255,255,255,0.15)';
      inputEl.placeholder = '输入要求，如：插入积分公式、润色文本...';
    }, 1500);
    return;
  }
  
  // 获取当前选区或光标位置
  let selectionData = currentSelection;
  
  // 如果没有 currentSelection，尝试从编辑器获取光标位置
  if (!selectionData) {
    try {
      const view = getEditorView();
      if (view) {
        const selection = view.state.selection.main;
        const cursorPos = selection.head;
        selectionData = {
          from: cursorPos,
          to: cursorPos,
          text: '',
          isEmpty: true
        };
      }
    } catch (e) {
      console.error('[OverleafBridge] Failed to get cursor position:', e);
    }
  }
  
  if (!selectionData) {
    console.warn('[OverleafBridge] No cursor position available');
    return;
  }
  
  const selectedModel = getSelectedTextActionModel();
  const hasSelection = selectionData.text && selectionData.text.trim().length > 0;
  
  console.log('[OverleafBridge] Custom request:', customPrompt, 'model:', selectedModel, 
    hasSelection ? '(有选中文本)' : '(无选中文本，将在光标处插入)');
  
  // 获取选区上下文（用于提高准确性）
  let contextBefore = '';
  let contextAfter = '';
  try {
    const view = getEditorView();
    if (view) {
      const context = getSelectionContext(view, selectionData.from, selectionData.to);
      contextBefore = context.contextBefore;
      contextAfter = context.contextAfter;
    }
  } catch (e) {
    console.error('[OverleafBridge] Failed to get context for custom request:', e);
  }

  // 发送自定义操作请求到 content script
  // 如果没有选中文本，text 为空，from 和 to 相同（光标位置）
  window.postMessage({
    type: 'OVERLEAF_TEXT_ACTION_REQUEST',
    data: {
      action: 'custom',  // 自定义操作类型
      customPrompt: customPrompt,  // 用户输入的自定义要求
      text: selectionData.text || '',  // 可以为空
      from: selectionData.from,
      to: selectionData.to,
      modelId: selectedModel,
      insertMode: !hasSelection,  // 标记是否为插入模式（无选中文本）
      contextBefore: contextBefore,
      contextAfter: contextAfter
    }
  }, '*');
  
  // 清空输入框
  inputEl.value = '';
  inputEl.style.height = 'auto';
  
  // 隐藏提示框
  hideSelectionTooltip();
}

/**
 * 计算提示框位置，确保不超出视窗
 * 使用视口坐标（fixed 定位）
 * @param {Object} coords 选区坐标（来自 view.coordsAtPos，是视口坐标）
 * @returns {Object} { left, top }
 */
function calculateTooltipPosition(coords) {
  const tooltipWidth = 280;
  const tooltipHeight = 50;
  
  // coords 已经是视口坐标，不需要加 scroll offset
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
 * 显示当前选区的提示框
 */
function showSelectionTooltipForCurrentSelection() {
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

    // 保存当前选区信息
    currentSelection = {
      from: from,
      to: to,
      text: text,
      isEmpty: false
    };

    // 懒创建提示框
    if (!selectionTooltipEl) {
      selectionTooltipEl = createSelectionTooltip();
    }

    // 计算并设置位置
    const pos = calculateTooltipPosition(coords);
    selectionTooltipEl.style.left = String(pos.left) + 'px';
    selectionTooltipEl.style.top = String(pos.top) + 'px';
    selectionTooltipEl.style.display = 'flex';
    
    // 隐藏未选择文本的提示（因为通过 mouseup 触发时已有选中文本）
    hideNoSelectionHint();
  } catch (e) {
    console.error('[OverleafBridge] Failed to show selection tooltip:', e);
  }
}

/**
 * 获取当前选区信息（供外部调用）
 * @returns {Object|null}
 */
function getCurrentSelection() {
  return currentSelection;
}

/**
 * 获取选区前后的上下文内容
 * @param {Object} view EditorView 实例
 * @param {number} from 选区起始位置
 * @param {number} to 选区结束位置
 * @param {number} contextLines 上下文行数（默认15行）
 * @returns {{ contextBefore: string, contextAfter: string }}
 */
function getSelectionContext(view, from, to, contextLines = 15) {
  try {
    const doc = view.state.doc;
    
    // 获取选区起始位置的行号
    const startLine = doc.lineAt(from);
    // 获取选区结束位置的行号
    const endLine = doc.lineAt(to);
    
    // 计算上下文的行范围
    const contextStartLineNum = Math.max(1, startLine.number - contextLines);
    const contextEndLineNum = Math.min(doc.lines, endLine.number + contextLines);
    
    // 获取选区前的上下文
    let contextBefore = '';
    if (contextStartLineNum < startLine.number) {
      const beforeStartPos = doc.line(contextStartLineNum).from;
      const beforeEndPos = startLine.from; // 选区开始行的起始位置
      contextBefore = doc.sliceString(beforeStartPos, beforeEndPos);
      // 去掉末尾的换行符
      contextBefore = contextBefore.replace(/\n$/, '');
    }
    
    // 获取选区后的上下文
    let contextAfter = '';
    if (contextEndLineNum > endLine.number) {
      const afterStartPos = endLine.to + 1; // 选区结束行的下一个位置
      const afterEndPos = doc.line(contextEndLineNum).to;
      if (afterStartPos <= afterEndPos) {
        contextAfter = doc.sliceString(afterStartPos, afterEndPos);
      }
    }
    
    console.log('[OverleafBridge] Context extracted:', {
      startLine: startLine.number,
      endLine: endLine.number,
      contextStartLine: contextStartLineNum,
      contextEndLine: contextEndLineNum,
      contextBeforeLength: contextBefore.length,
      contextAfterLength: contextAfter.length
    });
    
    return { contextBefore, contextAfter };
  } catch (e) {
    console.error('[OverleafBridge] Failed to get selection context:', e);
    return { contextBefore: '', contextAfter: '' };
  }
}

/**
 * 处理文本操作请求（扩写/缩写/润色等）
 * @param {string} actionType 操作类型
 */
function handleTextActionRequest(actionType) {
  // 首先检查激活状态
  if (!checkIsActivated()) {
    console.warn('[OverleafBridge] Not activated, showing activation hint');
    showActivationRequiredHint();
    return;
  }
  
  // 检查是否有选区
  if (!currentSelection) {
    console.warn('[OverleafBridge] No selection for text action');
    showNoSelectionHint();
    return;
  }
  
  // 检查是否选中了文本
  if (currentSelection.isEmpty || !currentSelection.text || currentSelection.text.trim().length === 0) {
    console.warn('[OverleafBridge] Empty selection for text action');
    showNoSelectionHint();
    return;
  }
  
  const preview = currentSelection.text.length > 50 
    ? currentSelection.text.substring(0, 50) + '...' 
    : currentSelection.text;
  const selectedModel = getSelectedTextActionModel();
  console.log('[OverleafBridge] Text action requested:', actionType, 'model:', selectedModel, 'text:', preview);
  
  // 获取选区上下文（用于提高翻译等操作的准确性）
  let contextBefore = '';
  let contextAfter = '';
  const view = getEditorView();
  if (view) {
    const context = getSelectionContext(view, currentSelection.from, currentSelection.to);
    contextBefore = context.contextBefore;
    contextAfter = context.contextAfter;
  }
  
  // 发送操作请求到 content script
  window.postMessage({
    type: 'OVERLEAF_TEXT_ACTION_REQUEST',
    data: {
      action: actionType,
      text: currentSelection.text,
      from: currentSelection.from,
      to: currentSelection.to,
      modelId: selectedModel,  // 添加选中的模型 ID
      contextBefore: contextBefore,  // 选区前的上下文
      contextAfter: contextAfter     // 选区后的上下文
    }
  }, '*');
  
  // 隐藏提示框
  hideSelectionTooltip();
}

// 添加方法处理器：替换选区文本
methodHandlers.replaceSelection = function(from, to, text) {
  const view = getEditorView();
  if (!view) {
    throw new Error('EditorView not available');
  }
  
  console.log('[OverleafBridge] replaceSelection called:', {
    from: from,
    to: to,
    textLength: text.length
  });
  
  view.dispatch({
    changes: { from: from, to: to, insert: text }
  });
  
  return { success: true };
};

// 监听文本操作结果（扩写/缩写/润色/翻译）
window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  
  var data = event.data;
  // 兼容旧的翻译响应和新的文本操作响应
  if (!data || (data.type !== 'OVERLEAF_TRANSLATE_RESPONSE' && data.type !== 'OVERLEAF_TEXT_ACTION_RESPONSE')) return;
  
  const actionType = data.data.action || 'translate';
  console.log('[OverleafBridge] Received text action result:', actionType);
  
  try {
    const view = getEditorView();
    if (!view) {
      console.error('[OverleafBridge] EditorView not available for text action');
      return;
    }
    
    // 获取替换后的文本
    const resultText = data.data.resultText || data.data.translatedText;
    if (!resultText) {
      console.error('[OverleafBridge] No result text in response');
      return;
    }
    
    // 替换选区文本
    view.dispatch({
      changes: { 
        from: data.data.from, 
        to: data.data.to, 
        insert: resultText 
      }
    });
    
    console.log('[OverleafBridge] Text action applied successfully:', actionType);
  } catch (error) {
    console.error('[OverleafBridge] Failed to apply text action:', error);
  }
});

/**
 * 更新提示框位置（用于滚动时跟随）
 */
function updateTooltipPosition() {
  if (!selectionTooltipEl || selectionTooltipEl.style.display === 'none' || !currentSelection) {
    return;
  }
  
  try {
    const view = getEditorView();
    if (!view) {
      hideSelectionTooltip();
      return;
    }
    
    // 检查选区是否仍然有效
    const selection = view.state.selection.main;
    if (!selection || selection.empty || selection.from !== currentSelection.from || selection.to !== currentSelection.to) {
      hideSelectionTooltip();
      return;
    }
    
    // 获取选区结束位置的坐标
    const coords = view.coordsAtPos(currentSelection.to);
    if (!coords) {
      hideSelectionTooltip();
      return;
    }
    
    // 检查选区是否在可视区域内
    if (coords.bottom < 0 || coords.top > window.innerHeight) {
      // 选区不在可视区域，隐藏提示框
      selectionTooltipEl.style.opacity = '0';
      selectionTooltipEl.style.pointerEvents = 'none';
    } else {
      selectionTooltipEl.style.opacity = '1';
      selectionTooltipEl.style.pointerEvents = 'auto';
      
      // 更新位置
      const pos = calculateTooltipPosition(coords);
      selectionTooltipEl.style.left = String(pos.left) + 'px';
      selectionTooltipEl.style.top = String(pos.top) + 'px';
    }
  } catch (e) {
    console.error('[OverleafBridge] Failed to update tooltip position:', e);
  }
}

// 监听鼠标松开事件
window.addEventListener('mouseup', function(event) {
  // 如果点击发生在菜单内部，不触发选区检查
  if (selectionTooltipEl && selectionTooltipEl.contains(event.target)) {
    return;
  }
  
  // 延迟一点以确保选区已更新
  setTimeout(function() {
    showSelectionTooltipForCurrentSelection();
  }, 10);
});

// 监听滚动事件，更新提示框位置
// 使用 passive 和节流优化性能
var scrollThrottleTimer = null;
function handleScroll() {
  if (scrollThrottleTimer) return;
  scrollThrottleTimer = setTimeout(function() {
    scrollThrottleTimer = null;
    updateTooltipPosition();
  }, 16); // ~60fps
}

// 监听编辑器容器的滚动事件
function setupScrollListeners() {
  // 监听 window 滚动
  window.addEventListener('scroll', handleScroll, { passive: true });
  
  // 监听编辑器内部滚动（CodeMirror 使用自己的滚动容器）
  const editorContainer = document.querySelector('.cm-scroller');
  if (editorContainer) {
    editorContainer.addEventListener('scroll', handleScroll, { passive: true });
  }
  
  // 备用：监听可能的其他滚动容器
  const otherContainers = document.querySelectorAll('.editor-container, .cm-editor');
  otherContainers.forEach(function(container) {
    container.addEventListener('scroll', handleScroll, { passive: true });
  });
}

// 延迟设置滚动监听，确保 DOM 已加载
setTimeout(setupScrollListeners, 1000);

// 监听 ESC 键关闭提示框
window.addEventListener('keyup', function(event) {
  if (event.key === 'Escape') {
    hideSelectionTooltip();
  }
});

// ============ 快捷键 Ctrl+Alt+/ 唤出文本操作菜单 ============

/**
 * 在光标位置显示文本操作菜单
 * 即使没有选中文本也可以显示菜单（但操作时需要选中文本）
 */
function showTextActionMenuAtCursor() {
  try {
    const view = getEditorView();
    if (!view) {
      console.warn('[OverleafBridge] EditorView not available for shortcut menu');
      return;
    }

    const doc = view.state.doc;
    const selection = view.state.selection.main;
    const cursorPos = selection.head; // 当前光标位置
    
    // 获取光标位置的坐标
    const coords = view.coordsAtPos(cursorPos);
    if (!coords) {
      console.warn('[OverleafBridge] Cannot get cursor coordinates');
      return;
    }

    // 检查是否有选中的文本
    const hasSelection = !selection.empty;
    const from = selection.from;
    const to = selection.to;
    const text = hasSelection ? doc.sliceString(from, to) : '';

    // 保存当前选区信息（即使为空也保存光标位置）
    currentSelection = {
      from: from,
      to: to,
      text: text,
      isEmpty: !hasSelection
    };

    // 懒创建提示框
    if (!selectionTooltipEl) {
      selectionTooltipEl = createSelectionTooltip();
    }

    // 计算并设置位置（使用光标坐标）
    const pos = calculateTooltipPosition(coords);
    selectionTooltipEl.style.left = String(pos.left) + 'px';
    selectionTooltipEl.style.top = String(pos.top) + 'px';
    selectionTooltipEl.style.display = 'flex';

    // 根据是否有选中文本，切换菜单模式
    if (!hasSelection) {
      // 无选中文本：只显示输入框（插入模式）
      showInsertOnlyMode();
    } else {
      // 有选中文本：显示完整菜单
      showFullMenuMode();
    }

    console.log('[OverleafBridge] Text action menu shown via shortcut (Ctrl+Alt+/)', {
      hasSelection: hasSelection,
      cursorPos: cursorPos,
      textLength: text.length,
      mode: hasSelection ? 'full' : 'insert-only'
    });
  } catch (e) {
    console.error('[OverleafBridge] Failed to show text action menu via shortcut:', e);
  }
}

/**
 * 显示插入模式菜单（只有输入框，无快捷操作按钮）
 * 用于快捷键唤出且没有选中文本时
 */
function showInsertOnlyMode() {
  if (!selectionTooltipEl) return;
  
  // 隐藏快捷操作标签
  var quickActionsLabel = selectionTooltipEl.querySelector('#ol-ai-quick-actions-label');
  if (quickActionsLabel) {
    quickActionsLabel.style.display = 'none';
  }
  
  // 隐藏快捷操作按钮
  var buttonsContainer = selectionTooltipEl.querySelector('#ol-ai-selection-buttons');
  if (buttonsContainer) {
    buttonsContainer.style.display = 'none';
  }
  
  // 隐藏模型选择器（简化界面）
  // 注意：用户请求在快捷键菜单中始终显示模型选择功能，所以这里不再隐藏
  var modelSelector = selectionTooltipEl.querySelector('#ol-ai-model-selector');
  if (modelSelector) {
    modelSelector.style.display = 'flex';
  }
  
  // 更新输入框 placeholder
  var inputEl = document.getElementById('ol-ai-custom-input');
  if (inputEl) {
    inputEl.placeholder = '输入要生成的内容，如：插入积分公式...';
  }
  
  console.log('[OverleafBridge] Switched to insert-only mode');
}

/**
 * 显示完整菜单模式（输入框 + 快捷操作按钮）
 * 用于有选中文本时
 */
function showFullMenuMode() {
  if (!selectionTooltipEl) return;
  
  // 显示快捷操作标签
  var quickActionsLabel = selectionTooltipEl.querySelector('#ol-ai-quick-actions-label');
  if (quickActionsLabel) {
    quickActionsLabel.style.display = 'flex';
  }
  
  // 显示快捷操作按钮
  var buttonsContainer = selectionTooltipEl.querySelector('#ol-ai-selection-buttons');
  if (buttonsContainer) {
    buttonsContainer.style.display = 'flex';
  }
  
  // 显示模型选择器
  var modelSelector = selectionTooltipEl.querySelector('#ol-ai-model-selector');
  if (modelSelector) {
    modelSelector.style.display = 'flex';
  }
  
  // 启用操作按钮
  var buttons = selectionTooltipEl.querySelectorAll('#ol-ai-selection-buttons button');
  buttons.forEach(function(btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  });
  
  // 更新输入框 placeholder
  var inputEl = document.getElementById('ol-ai-custom-input');
  if (inputEl) {
    inputEl.placeholder = '输入要求，如：翻译成英文、润色...';
  }
  
  console.log('[OverleafBridge] Switched to full menu mode');
}

// 兼容旧函数（供其他地方调用）
function showNoSelectionHint() {
  showInsertOnlyMode();
}

function hideNoSelectionHint() {
  showFullMenuMode();
}

/**
 * 监听 Ctrl+Alt+/ 快捷键
 */
window.addEventListener('keydown', function(event) {
  // 检测 Ctrl+Alt+/ 组合键
  // 注意：在不同键盘布局下，'/' 可能需要不同的检测方式
  const isSlashKey = event.key === '/' || event.code === 'Slash' || event.keyCode === 191;
  
  if (event.ctrlKey && event.altKey && isSlashKey) {
    event.preventDefault(); // 阻止默认行为
    event.stopPropagation(); // 阻止事件冒泡
    
    console.log('[OverleafBridge] Shortcut Ctrl+Alt+/ detected');
    
    // 如果菜单已显示，则隐藏；否则显示
    if (selectionTooltipEl && selectionTooltipEl.style.display === 'flex') {
      hideSelectionTooltip();
    } else {
      showTextActionMenuAtCursor();
    }
    
    return false;
  }
}, true); // 使用捕获阶段确保优先处理

// 点击其他地方时隐藏提示框
document.addEventListener('mousedown', function(event) {
  if (selectionTooltipEl && !selectionTooltipEl.contains(event.target)) {
    // 不要立即隐藏，因为可能是在选择新文本
    // hideSelectionTooltip();
  }
});

// 监听键盘输入，隐藏提示框（用户开始编辑时）
window.addEventListener('keydown', function(event) {
  // 忽略修饰键和功能键
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return;
  if (event.key === 'Escape') return; // ESC 由上面的监听器处理
  
  // 用户开始输入，隐藏提示框
  if (currentSelection) {
    hideSelectionTooltip();
  }
});

// ============ 文本操作预览功能 ============

/**
 * 预览覆盖层相关变量
 */
var previewOverlayEl = null;
var previewConfirmEl = null;
var currentPreview = null; // 当前预览信息

/**
 * 生成唯一 ID
 */
function generatePreviewId() {
  return 'preview_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 隐藏预览覆盖层
 */
function hidePreviewOverlay() {
  if (previewOverlayEl) {
    previewOverlayEl.style.display = 'none';
  }
  if (previewConfirmEl) {
    previewConfirmEl.style.display = 'none';
  }
  // 隐藏内置确认按钮
  const inlineConfirm = document.getElementById('ol-ai-inline-confirm');
  if (inlineConfirm) {
    inlineConfirm.style.display = 'none';
  }
  currentPreview = null;
}

/**
 * 创建预览覆盖层 DOM
 * 显示删除线原文 + 新文本
 */
function createPreviewOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'ol-ai-preview-overlay';
  overlay.style.position = 'absolute';
  overlay.style.zIndex = '2147483647';
  overlay.style.background = '#ffffff';
  overlay.style.border = '1px solid #e2e8f0';
  overlay.style.borderRadius = '12px';
  overlay.style.padding = '16px';
  overlay.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0,0,0,0.05)';
  overlay.style.display = 'none';
  overlay.style.maxWidth = '600px';
  overlay.style.minWidth = '320px';
  overlay.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  overlay.style.fontSize = '14px';
  overlay.style.lineHeight = '1.6';
  overlay.style.whiteSpace = 'pre-wrap';
  overlay.style.wordBreak = 'break-word';
  overlay.style.color = '#1e293b';
  
  // 标题栏容器（包含标题和关闭按钮，可拖拽）
  const titleBar = document.createElement('div');
  titleBar.style.display = 'flex';
  titleBar.style.justifyContent = 'space-between';
  titleBar.style.alignItems = 'center';
  titleBar.style.marginBottom = '8px';
  titleBar.style.cursor = 'move';
  titleBar.style.userSelect = 'none';
  titleBar.style.padding = '4px 0';
  titleBar.style.marginTop = '-4px';
  titleBar.title = '拖拽移动';
  
  // 拖拽状态
  var isDragging = false;
  var dragStartX = 0;
  var dragStartY = 0;
  var overlayStartX = 0;
  var overlayStartY = 0;
  
  titleBar.onmousedown = function(e) {
    // 如果点击的是关闭按钮，不启动拖拽
    if (e.target.tagName === 'BUTTON') return;
    
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    overlayStartX = parseInt(overlay.style.left) || 0;
    overlayStartY = parseInt(overlay.style.top) || 0;
    
    // 拖拽时禁用文本选择
    document.body.style.userSelect = 'none';
    e.preventDefault();
  };
  
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    
    var deltaX = e.clientX - dragStartX;
    var deltaY = e.clientY - dragStartY;
    
    var newLeft = overlayStartX + deltaX;
    var newTop = overlayStartY + deltaY;
    
    // 确保不超出视口边界
    var scrollX = window.scrollX || window.pageXOffset;
    var scrollY = window.scrollY || window.pageYOffset;
    
    if (newLeft < scrollX + 10) newLeft = scrollX + 10;
    if (newTop < scrollY + 10) newTop = scrollY + 10;
    if (newLeft > scrollX + window.innerWidth - 100) {
      newLeft = scrollX + window.innerWidth - 100;
    }
    if (newTop > scrollY + window.innerHeight - 100) {
      newTop = scrollY + window.innerHeight - 100;
    }
    
    overlay.style.left = newLeft + 'px';
    overlay.style.top = newTop + 'px';
    
    // 同步更新确认菜单位置
    if (previewConfirmEl && previewConfirmEl.style.display !== 'none') {
      var overlayRect = overlay.getBoundingClientRect();
      previewConfirmEl.style.left = newLeft + 'px';
      previewConfirmEl.style.top = (newTop + overlayRect.height + 10) + 'px';
    }
  });
  
  document.addEventListener('mouseup', function() {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = '';
    }
  });
  
  // 标题
  const title = document.createElement('div');
  title.id = 'ol-ai-preview-title';
  title.style.fontWeight = '600';
  title.style.color = '#475569';
  title.style.fontSize = '13px';
  title.style.letterSpacing = '0.01em';
  title.textContent = '📝 预览更改';
  titleBar.appendChild(title);
  
  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.background = 'transparent';
  closeBtn.style.border = 'none';
  closeBtn.style.color = '#94a3b8';
  closeBtn.style.fontSize = '20px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.padding = '2px 6px';
  closeBtn.style.borderRadius = '4px';
  closeBtn.style.transition = 'all 0.2s ease';
  closeBtn.style.lineHeight = '1';
  closeBtn.title = '关闭预览 (Esc)';
  
  closeBtn.onmouseenter = function() {
    this.style.background = 'rgba(239, 68, 68, 0.1)';
    this.style.color = '#ef4444';
  };
  closeBtn.onmouseleave = function() {
    this.style.background = 'transparent';
    this.style.color = '#6b7280';
  };
  closeBtn.onclick = function(e) {
    e.stopPropagation();
    // 发送取消信号（立即中断正在进行的请求）
    window.postMessage({
      type: 'OVERLEAF_STREAM_CANCEL',
      data: { reason: 'user_closed' }
    }, '*');
    // 点击关闭相当于拒绝更改
    handlePreviewDecision(false);
  };
  titleBar.appendChild(closeBtn);
  
  overlay.appendChild(titleBar);
  
  // 原文容器（删除线）
  const originalContainer = document.createElement('div');
  originalContainer.id = 'ol-ai-preview-original';
  originalContainer.style.textDecoration = 'line-through';
  originalContainer.style.color = '#991b1b'; // darker red
  originalContainer.style.background = '#fef2f2'; // very light red
  originalContainer.style.padding = '12px';
  originalContainer.style.borderRadius = '8px';
  originalContainer.style.marginBottom = '12px';
  originalContainer.style.border = '1px solid #fee2e2';
  originalContainer.style.fontSize = '13px';
  overlay.appendChild(originalContainer);
  
  // 箭头指示
  const arrow = document.createElement('div');
  arrow.id = 'ol-ai-preview-arrow';
  arrow.style.textAlign = 'center';
  arrow.style.color = '#94a3b8';
  arrow.style.margin = '4px 0 12px 0';
  arrow.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>';
  overlay.appendChild(arrow);
  
  // 新文本容器
  const newContainer = document.createElement('div');
  newContainer.id = 'ol-ai-preview-new';
  newContainer.style.color = '#166534';
  newContainer.style.background = '#f0fdf4';
  newContainer.style.padding = '12px';
  newContainer.style.borderRadius = '8px';
  newContainer.style.border = '1px solid #bbf7d0';
  newContainer.style.maxHeight = '300px';
  newContainer.style.overflowY = 'auto';
  newContainer.style.fontSize = '13px';
  overlay.appendChild(newContainer);
  
  // 内置确认按钮区域
  const confirmContainer = document.createElement('div');
  confirmContainer.id = 'ol-ai-inline-confirm';
  confirmContainer.style.display = 'none';
  confirmContainer.style.marginTop = '16px';
  confirmContainer.style.paddingTop = '12px';
  confirmContainer.style.borderTop = '1px solid #f1f5f9';
  confirmContainer.style.flexDirection = 'row';
  confirmContainer.style.gap = '12px';
  confirmContainer.style.alignItems = 'center';
  confirmContainer.style.justifyContent = 'flex-end';
  
  // 提示文字
  const confirmHint = document.createElement('span');
  confirmHint.id = 'ol-ai-inline-confirm-hint';
  confirmHint.style.color = '#64748b';
  confirmHint.style.fontSize = '13px';
  confirmHint.style.marginRight = 'auto';
  confirmHint.textContent = '是否接受更改？';
  confirmContainer.appendChild(confirmHint);
  
  // 接受按钮
  const inlineAcceptBtn = document.createElement('button');
  inlineAcceptBtn.textContent = '接受';
  inlineAcceptBtn.style.background = '#10b981';
  inlineAcceptBtn.style.color = 'white';
  inlineAcceptBtn.style.border = 'none';
  inlineAcceptBtn.style.padding = '8px 20px';
  inlineAcceptBtn.style.borderRadius = '6px';
  inlineAcceptBtn.style.cursor = 'pointer';
  inlineAcceptBtn.style.fontSize = '13px';
  inlineAcceptBtn.style.fontWeight = '500';
  inlineAcceptBtn.style.transition = 'all 0.2s ease';
  inlineAcceptBtn.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
  
  inlineAcceptBtn.onmouseenter = function() {
    this.style.background = '#059669';
    this.style.transform = 'translateY(-1px)';
  };
  inlineAcceptBtn.onmouseleave = function() {
    this.style.background = '#10b981';
    this.style.transform = 'translateY(0)';
  };
  inlineAcceptBtn.onclick = function(e) {
    e.stopPropagation();
    handlePreviewDecision(true);
  };
  confirmContainer.appendChild(inlineAcceptBtn);
  
  // 拒绝按钮
  const inlineRejectBtn = document.createElement('button');
  inlineRejectBtn.textContent = '拒绝';
  inlineRejectBtn.style.background = 'white';
  inlineRejectBtn.style.color = '#ef4444';
  inlineRejectBtn.style.border = '1px solid #fecaca';
  inlineRejectBtn.style.padding = '8px 16px';
  inlineRejectBtn.style.borderRadius = '6px';
  inlineRejectBtn.style.cursor = 'pointer';
  inlineRejectBtn.style.fontSize = '13px';
  inlineRejectBtn.style.fontWeight = '500';
  inlineRejectBtn.style.transition = 'all 0.2s ease';
  
  inlineRejectBtn.onmouseenter = function() {
    this.style.background = '#fef2f2';
    this.style.borderColor = '#fca5a5';
  };
  inlineRejectBtn.onmouseleave = function() {
    this.style.background = 'white';
    this.style.borderColor = '#fecaca';
  };
  inlineRejectBtn.onclick = function(e) {
    e.stopPropagation();
    window.postMessage({
      type: 'OVERLEAF_STREAM_CANCEL',
      data: { reason: 'user_rejected' }
    }, '*');
    handlePreviewDecision(false);
  };
  confirmContainer.appendChild(inlineRejectBtn);
  
  overlay.appendChild(confirmContainer);
  
  // 添加 CSS 动画样式（如果还没添加）
  if (!document.getElementById('ol-ai-preview-styles')) {
    var style = document.createElement('style');
    style.id = 'ol-ai-preview-styles';
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * 创建确认菜单 DOM
 */
function createPreviewConfirmMenu() {
  const menu = document.createElement('div');
  menu.id = 'ol-ai-preview-confirm';
  menu.style.position = 'absolute';
  menu.style.zIndex = '2147483647';
  menu.style.background = 'linear-gradient(135deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.98) 100%)';
  menu.style.padding = '8px 12px';
  menu.style.borderRadius = '8px';
  menu.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';
  menu.style.display = 'none';
  menu.style.flexDirection = 'row';
  menu.style.gap = '8px';
  menu.style.backdropFilter = 'blur(8px)';
  
  // 提示文字
  const hint = document.createElement('span');
  hint.id = 'ol-ai-confirm-hint';
  hint.style.color = '#e5e7eb';
  hint.style.fontSize = '12px';
  hint.style.marginRight = '8px';
  hint.style.alignSelf = 'center';
  hint.textContent = '是否接受更改？';
  menu.appendChild(hint);
  
  // 接受按钮
  const acceptBtn = document.createElement('button');
  acceptBtn.textContent = '接受';
  acceptBtn.style.background = '#10b981';
  acceptBtn.style.color = 'white';
  acceptBtn.style.border = 'none';
  acceptBtn.style.padding = '6px 14px';
  acceptBtn.style.borderRadius = '4px';
  acceptBtn.style.cursor = 'pointer';
  acceptBtn.style.fontSize = '12px';
  acceptBtn.style.fontWeight = '500';
  acceptBtn.style.transition = 'all 0.2s ease';
  acceptBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
  
  acceptBtn.onmouseenter = function() {
    this.style.background = '#059669';
    this.style.transform = 'translateY(-1px)';
  };
  acceptBtn.onmouseleave = function() {
    this.style.background = '#10b981';
    this.style.transform = 'translateY(0)';
  };
  acceptBtn.onclick = function(e) {
    e.stopPropagation();
    handlePreviewDecision(true);
  };
  menu.appendChild(acceptBtn);
  
  // 拒绝按钮
  const rejectBtn = document.createElement('button');
  rejectBtn.textContent = '拒绝';
  rejectBtn.style.background = '#ef4444';
  rejectBtn.style.color = 'white';
  rejectBtn.style.border = 'none';
  rejectBtn.style.padding = '6px 14px';
  rejectBtn.style.borderRadius = '4px';
  rejectBtn.style.cursor = 'pointer';
  rejectBtn.style.fontSize = '12px';
  rejectBtn.style.fontWeight = '500';
  rejectBtn.style.transition = 'all 0.2s ease';
  rejectBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
  
  rejectBtn.onmouseenter = function() {
    this.style.background = '#dc2626';
    this.style.transform = 'translateY(-1px)';
  };
  rejectBtn.onmouseleave = function() {
    this.style.background = '#ef4444';
    this.style.transform = 'translateY(0)';
  };
  rejectBtn.onclick = function(e) {
    e.stopPropagation();
    // 发送取消信号
    window.postMessage({
      type: 'OVERLEAF_STREAM_CANCEL',
      data: { reason: 'user_rejected' }
    }, '*');
    handlePreviewDecision(false);
  };
  menu.appendChild(rejectBtn);
  
  document.body.appendChild(menu);
  return menu;
}

// 流式预览状态
var streamPreviewText = '';
var isStreamingPreview = false;

// ============ 内联状态系统辅助函数 ============

/**
 * 判断选区是否为整行
 * @param {EditorView} view 编辑器视图
 * @param {number} from 选区起始位置
 * @param {number} to 选区结束位置
 * @returns {boolean} 是否为整行选区
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
 * @param {EditorView} view 编辑器视图
 * @param {number} from 选区起始位置
 * @param {number} to 选区结束位置
 * @returns {Object} { startLine, endLine }
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
 * @param {Object} config 配置信息
 */
function createInlineStatus(config) {
  const effects = window._diffSuggestionEffects;
  const view = getEditorView();
  if (!effects || !view) {
    console.warn('[InlineStatus] Effects or view not available');
    return null;
  }
  
  try {
    view.dispatch({
      effects: effects.addInlineStatusEffect.of(config)
    });
    
    // 保存到文件级存储（用于跨文件保持）
    // 注意：需要在 Diff 建议系统 IIFE 内部访问 inlineStatusByFile
    // 这里通过 window._inlineStatusByFile 暴露
    if (window._inlineStatusByFile) {
      var fileName = config.fileName || 'unknown';
      if (!window._inlineStatusByFile.has(fileName)) {
        window._inlineStatusByFile.set(fileName, new Map());
      }
      window._inlineStatusByFile.get(fileName).set(config.id, config);
    }
    
    console.log('[InlineStatus] 创建内联状态:', config.id);
    return config.id;
  } catch (e) {
    console.error('[InlineStatus] 创建失败:', e);
    return null;
  }
}

/**
 * 更新内联状态窗口
 * @param {Object} updates 更新内容 { id, state, ... }
 */
function updateInlineStatusState(updates) {
  const effects = window._diffSuggestionEffects;
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
 * @param {string} id 内联状态 ID
 */
function removeInlineStatus(id) {
  const effects = window._diffSuggestionEffects;
  const view = getEditorView();
  if (!effects || !view) return;
  
  try {
    view.dispatch({
      effects: effects.removeInlineStatusEffect.of(id)
    });
    
    // 从文件级存储中移除
    if (window._inlineStatusByFile) {
      for (var entry of window._inlineStatusByFile) {
        var statusMap = entry[1];
        if (statusMap.has(id)) {
          statusMap.delete(id);
          break;
        }
      }
    }
    
    console.log('[InlineStatus] 移除内联状态:', id);
  } catch (e) {
    console.error('[InlineStatus] 移除失败:', e);
  }
}

/**
 * 开始流式预览（使用内联状态系统）
 * @param {Object} data 包含 action, originalText, from, to
 */
function startStreamPreview(data) {
  try {
    // 先隐藏选区菜单
    hideSelectionTooltip();
    
    const view = getEditorView();
    if (!view) {
      console.error('[OverleafBridge] EditorView not available for stream preview');
      return;
    }
    
    // 重置流式文本
    streamPreviewText = '';
    isStreamingPreview = true;
    
    // 判断是否为插入模式（无原文）
    const isInsertMode = !data.originalText || data.originalText.trim().length === 0;
    
    // 判断选区类型
    const isFullLine = isFullLineSelection(view, data.from, data.to);
    const lineRange = getLineRange(view, data.from, data.to);
    
    // 生成唯一 ID
    const statusId = 'inline-status-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    // 保存当前预览信息
    currentPreview = {
      id: statusId,
      action: data.action,
      originalText: data.originalText,
      newText: '',  // 初始为空
      from: data.from,
      to: data.to,
      isInsertMode: isInsertMode,
      isFullLine: isFullLine,
      lineRange: lineRange,
      suggestionId: null  // 生成完成后会设置
    };
    
    // 创建内联状态窗口配置（简化版 - 只用于显示旋转指示器）
    const inlineStatusConfig = {
      id: statusId,
      fileName: getCurrentFileName(),
      from: data.from,
      to: data.to,
      widgetPos: data.from,  // 显示在选区起始位置
      originalText: data.originalText,
      newText: null,
      state: 'generating',
      isFullLine: isFullLine,
      lineRange: lineRange,
      action: data.action
    };
    
    // 创建内联状态窗口
    createInlineStatus(inlineStatusConfig);
    
    console.log('[OverleafBridge] Stream preview started with inline status:', statusId, 
      'isFullLine:', isFullLine, 'lines:', lineRange.startLine, '-', lineRange.endLine);
    
  } catch (e) {
    console.error('[OverleafBridge] Failed to start stream preview:', e);
  }
}

/**
 * 获取当前文件名
 */
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

/**
 * 更新流式预览内容
 * @param {string} delta 增量文本
 */
function updateStreamPreview(delta) {
  if (!isStreamingPreview || !currentPreview) return;
  
  streamPreviewText += delta;
  currentPreview.newText = streamPreviewText;
  
  // 注意：内联状态系统不需要实时更新流式文本
  // 因为内联窗口只显示状态，不显示内容
  // 内容通过 Suggestion 系统显示
}

/**
 * 完成流式预览（使用 Suggestion 系统显示更改）
 * @param {Object} data 包含最终的 newText
 */
function completeStreamPreview(data) {
  if (!currentPreview) return;
  
  isStreamingPreview = false;
  
  // 更新最终文本
  const newText = (data && data.newText) ? data.newText : streamPreviewText;
  currentPreview.newText = newText;
  
  // 移除旋转指示器
  removeInlineStatus(currentPreview.id);
  
  // 检查是否生成失败
  if (!newText || newText.trim().length === 0) {
    console.log('[OverleafBridge] 生成失败或返回空内容');
    currentPreview = null;
    return;
  }
  
  const view = getEditorView();
  if (!view) {
    console.error('[OverleafBridge] EditorView not available for suggestion');
    currentPreview = null;
    return;
  }
  
  // 等待 diffAPI 准备好
  const waitForDiffAPI = function(callback, retries) {
    if (window.diffAPI) {
      callback();
    } else if (retries > 0) {
      setTimeout(function() { waitForDiffAPI(callback, retries - 1); }, 100);
    } else {
      console.error('[OverleafBridge] diffAPI not available');
    }
  };
  
  waitForDiffAPI(function() {
    try {
      var suggestionId = null;
      
      if (currentPreview.isInsertMode) {
        // 插入模式：在光标位置插入新内容（使用片段建议）
        suggestionId = window.diffAPI.suggestSegmentWithId(
          'text-action-' + currentPreview.id,
          currentPreview.from,
          currentPreview.to,
          newText
        );
      } else if (currentPreview.isFullLine) {
        // 整行模式：使用行级建议
        var lineRange = currentPreview.lineRange;
        suggestionId = window.diffAPI.suggestRangeWithId(
          'text-action-' + currentPreview.id,
          lineRange.startLine,
          lineRange.endLine,
          newText
        );
      } else {
        // 片段模式：使用片段级建议
        suggestionId = window.diffAPI.suggestSegmentWithId(
          'text-action-' + currentPreview.id,
          currentPreview.from,
          currentPreview.to,
          newText
        );
      }
      
      // 保存关联的 suggestion ID（用于后续操作）
      if (currentPreview) {
        currentPreview.suggestionId = suggestionId;
      }
      
      console.log('[OverleafBridge] Stream preview completed with suggestion:', suggestionId, 
        'isFullLine:', currentPreview ? currentPreview.isFullLine : 'N/A', 
        'isInsertMode:', currentPreview ? currentPreview.isInsertMode : 'N/A');
      
      // 清理 currentPreview，因为现在完全由 Suggestion 系统管理
      currentPreview = null;
        
    } catch (e) {
      console.error('[OverleafBridge] Failed to create suggestion:', e);
      // 更新内联状态为错误状态
      updateInlineStatusState({
        id: currentPreview.id,
        state: 'error'
      });
    }
  }, 10);
}

/**
 * 转义 HTML 特殊字符
 */
function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 显示预览覆盖层（已废弃 - 现在使用内联状态系统）
 * @param {Object} previewData 预览数据
 * @deprecated 使用 startStreamPreview 和内联状态系统代替
 */
function showPreviewOverlay(previewData) {
  // 已废弃：现在使用内联状态系统显示预览
  console.log('[OverleafBridge] showPreviewOverlay 已废弃，请使用内联状态系统');
}

/**
 * 处理预览决策（接受或拒绝）
 * @param {boolean} accepted 是否接受
 */
function handlePreviewDecision(accepted) {
  if (!currentPreview) {
    console.warn('[OverleafBridge] No current preview to handle');
    return;
  }
  
  const preview = currentPreview;
  console.log('[OverleafBridge] Preview decision:', accepted ? 'ACCEPTED' : 'REJECTED', preview.id);
  
  try {
    if (accepted) {
      // 接受更改：用新文本替换原文
      const view = getEditorView();
      if (view) {
        view.dispatch({
          changes: {
            from: preview.from,
            to: preview.to,
            insert: preview.newText
          }
        });
        console.log('[OverleafBridge] Text replaced with new content');
      }
    }
    // 拒绝更改：不做任何操作，原文保持不变
    
    // 隐藏预览覆盖层
    hidePreviewOverlay();
    
    // 发送决策结果到 content script
    window.postMessage({
      type: 'OVERLEAF_PREVIEW_DECISION_RESULT',
      data: {
        id: preview.id,
        accepted: accepted,
        success: true
      }
    }, '*');
    
  } catch (e) {
    console.error('[OverleafBridge] Failed to handle preview decision:', e);
    
    // 发送错误结果
    window.postMessage({
      type: 'OVERLEAF_PREVIEW_DECISION_RESULT',
      data: {
        id: preview.id,
        accepted: accepted,
        success: false,
        error: e.message
      }
    }, '*');
  }
}

// 监听显示预览的消息
window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  
  var data = event.data;
  if (!data || data.type !== 'OVERLEAF_SHOW_PREVIEW_REQUEST') return;
  
  console.log('[OverleafBridge] Received show preview request');
  showPreviewOverlay(data.data);
});

// 监听流式预览开始的消息
window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  
  var data = event.data;
  if (!data || data.type !== 'OVERLEAF_STREAM_PREVIEW_START') return;
  
  console.log('[OverleafBridge] Starting stream preview');
  startStreamPreview(data.data);
});

// 监听流式预览更新的消息
window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  
  var data = event.data;
  if (!data || data.type !== 'OVERLEAF_STREAM_PREVIEW_UPDATE') return;
  
  updateStreamPreview(data.data.delta);
});

// 监听流式预览完成的消息
window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  
  var data = event.data;
  if (!data || data.type !== 'OVERLEAF_STREAM_PREVIEW_COMPLETE') return;
  
  console.log('[OverleafBridge] Stream preview complete');
  completeStreamPreview(data.data);
});

// 监听 ESC 键关闭预览
window.addEventListener('keyup', function(event) {
  if (event.key === 'Escape' && currentPreview) {
    // 发送取消信号
    window.postMessage({
      type: 'OVERLEAF_STREAM_CANCEL',
      data: { reason: 'user_escape' }
    }, '*');
    // ESC 相当于拒绝更改
    handlePreviewDecision(false);
  }
});

// 添加方法处理器：显示预览
methodHandlers.showTextActionPreview = function(previewData) {
  showPreviewOverlay(previewData);
  return { success: true, id: currentPreview ? currentPreview.id : null };
};

// 添加方法处理器：处理预览决策
methodHandlers.handlePreviewDecision = function(accepted) {
  handlePreviewDecision(accepted);
  return { success: true };
};

// ============ 模型列表同步 ============

/**
 * 监听模型列表更新消息
 * React 应用会在初始化时推送模型列表
 */
window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  
  var data = event.data;
  if (!data || data.type !== 'OVERLEAF_UPDATE_MODEL_LIST') return;
  
  var models = data.data?.models;
  if (!Array.isArray(models)) {
    console.warn('[OverleafBridge] Invalid model list received');
    return;
  }
  
  // 更新模型列表
  availableModels = models.map(function(model) {
    return {
      id: model.id,
      name: model.name,
      provider: model.provider
    };
  });
  
  console.log('[OverleafBridge] Model list updated:', availableModels.length, 'models');
  
  // 更新模型选择器
  updateModelSelectorOptions();
});

/**
 * 请求模型列表（在脚本加载时发送）
 */
function requestModelList() {
  window.postMessage({
    type: 'OVERLEAF_REQUEST_MODEL_LIST',
    data: {}
  }, '*');
  console.log('[OverleafBridge] Requesting model list from React app');
}

// 在脚本加载后请求模型列表
setTimeout(requestModelList, 100);

// 标记脚本已加载
console.log('[OverleafBridge] Injected script loaded with selection tooltip and preview feature');

// ============ Diff 建议系统 ============

/**
 * Diff 建议系统
 * 用于显示代码修改建议，支持逐个或批量接受/拒绝
 */
(function() {
  'use strict';
  
  console.log('[OverleafBridge] 初始化 Diff 建议系统...');
  
  // 移除旧样式和控制栏
  const oldDiffStyle = document.getElementById('diff-suggestion-styles');
  if (oldDiffStyle) oldDiffStyle.remove();
  const oldDiffBar = document.getElementById('diff-control-bar');
  if (oldDiffBar) oldDiffBar.remove();
  
  // 注入样式
  const diffStyle = document.createElement('style');
  diffStyle.id = 'diff-suggestion-styles';
  diffStyle.textContent = `
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
  document.head.appendChild(diffStyle);
  
  // Diff 建议存储 - 支持跨文件
  var diffSuggestionsByFile = new Map();  // Map<fileName, Map<id, suggestion>>
  var diffSuggestionId = 0;
  var diffCurrentIndex = 0;  // 全局索引（跨所有文件）
  var diffCodeMirror = null;
  var diffCurrentView = null;
  var diffControlBar = null;
  var diffCurrentFileName = null;  // 当前文件名
  var diffFileCheckInterval = null;  // 文件切换检测定时器
  
  // ===== 内联状态系统存储 =====
  var inlineStatusByFile = new Map();  // Map<fileName, Map<id, inlineStatus>>
  var inlineStatusId = 0;
  
  // 暴露到 window，用于外部函数访问
  window._inlineStatusByFile = inlineStatusByFile;
  
  // 获取当前文件的内联状态 Map
  function getCurrentFileInlineStatus() {
    if (!diffCurrentFileName) return new Map();
    if (!inlineStatusByFile.has(diffCurrentFileName)) {
      inlineStatusByFile.set(diffCurrentFileName, new Map());
    }
    return inlineStatusByFile.get(diffCurrentFileName);
  }
  
  // 保存内联状态到当前文件
  function saveInlineStatusToFile(config) {
    var statusMap = getCurrentFileInlineStatus();
    statusMap.set(config.id, config);
  }
  
  // 从当前文件移除内联状态
  function removeInlineStatusFromFile(id) {
    var statusMap = getCurrentFileInlineStatus();
    statusMap.delete(id);
  }
  
  // 获取当前文件的建议 Map
  function getCurrentFileSuggestions() {
    if (!diffCurrentFileName) return new Map();
    if (!diffSuggestionsByFile.has(diffCurrentFileName)) {
      diffSuggestionsByFile.set(diffCurrentFileName, new Map());
    }
    return diffSuggestionsByFile.get(diffCurrentFileName);
  }
  
  // 获取所有文件的建议列表（扁平化，带文件信息）
  function getAllSuggestionsFlat() {
    var result = [];
    for (var entry of diffSuggestionsByFile) {
      var fileName = entry[0];
      var suggestions = entry[1];
      for (var suggEntry of suggestions) {
        var id = suggEntry[0];
        var config = suggEntry[1];
        result.push({
          id: id,
          fileName: fileName,
          config: config
        });
      }
    }
    return result;
  }
  
  // 获取所有有建议的文件列表（不包括当前文件）
  function getFilesWithSuggestions() {
    var filesWithSuggestions = [];
    var totalChanges = 0;
    for (var entry of diffSuggestionsByFile) {
      var fileName = entry[0];
      var suggestions = entry[1];
      if (suggestions.size > 0 && fileName !== diffCurrentFileName) {
        filesWithSuggestions.push({
          fileName: fileName,
          count: suggestions.size
        });
        totalChanges += suggestions.size;
      }
    }
    // 按文件名排序，确保一致的顺序
    filesWithSuggestions.sort(function(a, b) {
      return a.fileName.localeCompare(b.fileName);
    });
    return {
      files: filesWithSuggestions,
      totalFiles: filesWithSuggestions.length,
      totalChanges: totalChanges,
      nextFile: filesWithSuggestions.length > 0 ? filesWithSuggestions[0] : null
    };
  }
  
  // 获取下一个有建议的文件（向后兼容）
  function getNextFileWithSuggestions() {
    var result = getFilesWithSuggestions();
    return result.nextFile;
  }
  
  // 跳转到下一个有建议的文件
  function jumpToNextFileWithSuggestions() {
    var nextFile = getNextFileWithSuggestions();
    if (!nextFile) {
      console.log('[DiffAPI] 没有其他文件有建议');
      return false;
    }
    
    console.log('[DiffAPI] 跳转到文件:', nextFile.fileName, '(' + nextFile.count + '个建议)');
    methodHandlers.switchFile(nextFile.fileName);
    
    // 切换后更新索引到该文件的第一个建议
    setTimeout(function() {
      var sortedList = getSortedSuggestionsAcrossFiles();
      for (var i = 0; i < sortedList.length; i++) {
        if (sortedList[i].fileName === nextFile.fileName) {
          diffCurrentIndex = i;
          var item = sortedList[i];
          scrollToSuggestion(item.id, item.config);
          updateDiffControlBar();
          break;
        }
      }
    }, 500);
    
    return true;
  }
  
  // 获取所有建议的总数
  function getTotalSuggestionsCount() {
    var count = 0;
    for (var entry of diffSuggestionsByFile) {
      count += entry[1].size;
    }
    return count;
  }
  
  // 检测并处理文件切换
  function checkFileChange() {
    try {
      var currentFile = methodHandlers.getCurrentFile();
      var newFileName = currentFile ? currentFile.name : null;
      
      if (newFileName && newFileName !== diffCurrentFileName) {
        console.log('[DiffAPI] 检测到文件切换:', diffCurrentFileName, '->', newFileName);
        onFileChanged(diffCurrentFileName, newFileName);
        diffCurrentFileName = newFileName;
      }
    } catch (e) {
      // 忽略错误
    }
  }
  
  // 文件切换时的处理
  function onFileChanged(oldFileName, newFileName) {
    // 清除当前编辑器中的装饰（StateField 会自动处理）
    // 如果有新文件的建议，需要重新应用到编辑器
    setTimeout(function() {
      restoreSuggestionsForCurrentFile();
    }, 300);  // 等待编辑器加载新文件
  }
  
  // 恢复当前文件的建议到编辑器
  function restoreSuggestionsForCurrentFile() {
    if (!diffCurrentView || !diffCurrentFileName) {
      updateDiffControlBar();  // 即使没有 view，也要更新控制栏
      return;
    }
    var suggestions = getCurrentFileSuggestions();
    var inlineStatus = getCurrentFileInlineStatus();
    var effects = window._diffSuggestionEffects;
    
    // 如果当前文件没有建议或没有 effects，仍然需要更新控制栏（可能显示导航模式）
    if (!effects) {
      updateDiffControlBar();
      return;
    }
    
    // 先清除所有装饰（行级、片段级和内联状态）
    try {
      diffCurrentView.dispatch({ 
        effects: [
          effects.clearDiffSuggestionsEffect.of(null),
          effects.clearSegmentSuggestionsEffect.of(null),
          effects.clearInlineStatusEffect.of(null)
        ]
      });
    } catch (e) {}
    
    // 如果当前文件没有建议和内联状态，直接更新控制栏
    if (suggestions.size === 0 && inlineStatus.size === 0) {
      console.log('[DiffAPI] 当前文件无建议:', diffCurrentFileName);
      updateDiffControlBar();
      return;
    }
    
    console.log('[DiffAPI] 恢复文件建议:', diffCurrentFileName, '共', suggestions.size, '个建议,', inlineStatus.size, '个内联状态');
    
    // 重新应用建议（需要重新计算位置）
    var toRemove = [];
    for (var entry of suggestions) {
      var id = entry[0];
      var config = entry[1];
      try {
        // 根据类型选择不同的恢复方式
        if (config.type === 'segment') {
          // 片段级建议：使用字符偏移
          // 注意：切换文件后偏移可能已变化，需要基于 oldContent 重新查找
          var docContent = diffCurrentView.state.doc.toString();
          var foundIndex = docContent.indexOf(config.oldContent);
          if (foundIndex !== -1) {
            config.startOffset = foundIndex;
            config.endOffset = foundIndex + config.oldContent.length;
            config.widgetPos = config.endOffset;
            diffCurrentView.dispatch({ effects: effects.addSegmentSuggestionEffect.of(config) });
          } else {
            console.warn('[DiffAPI] 恢复片段建议失败，找不到原始内容:', id);
            toRemove.push(id);
          }
        } else {
          // 行级建议：使用行号
          var lineStart = diffCurrentView.state.doc.line(config.startLine);
          var lineEnd = diffCurrentView.state.doc.line(config.endLine);
          config.lineFrom = lineStart.from;
          config.lineTo = lineEnd.to;
          config.widgetPos = lineEnd.to;
          diffCurrentView.dispatch({ effects: effects.addDiffSuggestionEffect.of(config) });
        }
      } catch (e) {
        console.warn('[DiffAPI] 恢复建议失败:', id, e);
        toRemove.push(id);
      }
    }
    
    // 移除无法恢复的建议
    for (var i = 0; i < toRemove.length; i++) {
      suggestions.delete(toRemove[i]);
    }
    
    // 恢复内联状态
    var statusToRemove = [];
    for (var entry of inlineStatus) {
      var id = entry[0];
      var config = entry[1];
      try {
        // 基于 originalText 重新查找位置
        var docContent = diffCurrentView.state.doc.toString();
        if (config.originalText) {
          var foundIndex = docContent.indexOf(config.originalText);
          if (foundIndex !== -1) {
            config.from = foundIndex;
            config.to = foundIndex + config.originalText.length;
            config.widgetPos = foundIndex;
            diffCurrentView.dispatch({ effects: effects.addInlineStatusEffect.of(config) });
          } else {
            console.warn('[InlineStatus] 恢复内联状态失败，找不到原始内容:', id);
            statusToRemove.push(id);
          }
        } else {
          // 没有原始文本（插入模式），使用保存的位置
          diffCurrentView.dispatch({ effects: effects.addInlineStatusEffect.of(config) });
        }
      } catch (e) {
        console.warn('[InlineStatus] 恢复内联状态失败:', id, e);
        statusToRemove.push(id);
      }
    }
    
    // 移除无法恢复的内联状态
    for (var i = 0; i < statusToRemove.length; i++) {
      inlineStatus.delete(statusToRemove[i]);
    }
    
    updateDiffControlBar();
  }
  
  // 启动文件切换监听
  function startFileChangeListener() {
    if (diffFileCheckInterval) return;
    
    // 初始化当前文件名
    try {
      var currentFile = methodHandlers.getCurrentFile();
      diffCurrentFileName = currentFile ? currentFile.name : null;
      console.log('[DiffAPI] 初始文件:', diffCurrentFileName);
    } catch (e) {}
    
    // 定期检查文件是否切换
    diffFileCheckInterval = setInterval(checkFileChange, 500);
  }
  
  // 创建底部控制栏
  function createDiffControlBar() {
    if (diffControlBar) return diffControlBar;
    
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
    document.getElementById('diff-prev-btn').addEventListener('click', function() {
      if (window.diffAPI) window.diffAPI.prev();
    });
    
    document.getElementById('diff-next-btn').addEventListener('click', function() {
      if (window.diffAPI) window.diffAPI.next();
    });
    
    // Counter 点击事件（在导航模式下跳转到下一个文件）
    document.getElementById('diff-counter').addEventListener('click', function() {
      var currentFileCount = getCurrentFileSuggestions().size;
      if (currentFileCount === 0) {
        // 导航模式：点击跳转到下一个文件
        jumpToNextFileWithSuggestions();
      }
    });
    
    document.getElementById('diff-reject-all-btn').addEventListener('click', function() {
      if (window.diffAPI) window.diffAPI.rejectAll();
    });
    
    document.getElementById('diff-accept-all-btn').addEventListener('click', function() {
      if (window.diffAPI) window.diffAPI.acceptAll();
    });
    
    return diffControlBar;
  }
  
  // 从 StateField 获取最新的行级建议位置（文档变化后位置会自动映射）
  function getLatestSuggestionPosition(suggestionId) {
    if (!diffCurrentView) return null;
    try {
      var field = diffCurrentView.state.field(window._diffSuggestionField);
      if (field && field.suggestions) {
        return field.suggestions.get(suggestionId);
      }
    } catch (e) {
      console.warn('[DiffAPI] 获取最新行级建议位置失败:', e);
    }
    return null;
  }
  
  // 从 StateField 获取最新的片段级建议位置（文档变化后位置会自动映射）
  function getLatestSegmentPosition(suggestionId) {
    if (!diffCurrentView) return null;
    try {
      var field = diffCurrentView.state.field(window._diffSuggestionField);
      if (field && field.segments) {
        return field.segments.get(suggestionId);
      }
    } catch (e) {
      console.warn('[DiffAPI] 获取最新片段建议位置失败:', e);
    }
    return null;
  }
  
  // 获取跨文件排序的建议列表（按文件名 + 位置排序）
  function getSortedSuggestionsAcrossFiles() {
    var result = [];
    
    for (var entry of diffSuggestionsByFile) {
      var fileName = entry[0];
      var suggestions = entry[1];
      var isCurrentFile = (fileName === diffCurrentFileName);
      
      for (var suggEntry of suggestions) {
        var id = suggEntry[0];
        var config = suggEntry[1];
        // 如果是当前文件，获取最新位置
        var pos = config.lineFrom || 0;
        if (isCurrentFile) {
          var latest = getLatestSuggestionPosition(id);
          if (latest) pos = latest.lineFrom;
        }
        result.push({
          id: id,
          fileName: fileName,
          config: config,
          pos: pos,
          isCurrentFile: isCurrentFile
        });
      }
    }
    
    // 排序：先按文件名，再按位置
    result.sort(function(a, b) {
      if (a.fileName !== b.fileName) {
        return a.fileName.localeCompare(b.fileName);
      }
      return a.pos - b.pos;
    });
    
    return result;
  }
  
  // 更新控制栏
  function updateDiffControlBar() {
    if (!diffControlBar) return;
    
    var totalCount = getTotalSuggestionsCount();
    var counter = document.getElementById('diff-counter');
    var prevBtn = document.getElementById('diff-prev-btn');
    var nextBtn = document.getElementById('diff-next-btn');
    var acceptAllBtn = document.getElementById('diff-accept-all-btn');
    var rejectAllBtn = document.getElementById('diff-reject-all-btn');
    
    // 获取当前文件的建议数量
    var currentFileSuggestions = getCurrentFileSuggestions();
    var currentFileCount = currentFileSuggestions.size;
    
    if (totalCount === 0) {
      diffControlBar.classList.add('hidden');
      diffControlBar.classList.remove('diff-control-bar-navigate-mode');
    } else {
      diffControlBar.classList.remove('hidden');
      
      // 如果当前文件没有建议，但其他文件有建议，进入"导航模式"
      if (currentFileCount === 0) {
        var filesInfo = getFilesWithSuggestions();
        if (filesInfo.nextFile) {
          diffControlBar.classList.add('diff-control-bar-navigate-mode');
          
          // 显示详细信息：下一个文件 + 总文件数
          var displayText = '📁 ' + filesInfo.nextFile.fileName;
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
        var fileCount = diffSuggestionsByFile.size;
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
  
  // 跳转到指定建议（支持跨文件）
  function jumpToDiffSuggestion(index) {
    var sortedList = getSortedSuggestionsAcrossFiles();
    if (index < 0 || index >= sortedList.length) return;
    
    diffCurrentIndex = index;
    var item = sortedList[index];
    
    // 如果目标建议不在当前文件，需要先切换文件
    if (item.fileName !== diffCurrentFileName) {
      console.log('[DiffAPI] 跨文件跳转:', diffCurrentFileName, '->', item.fileName);
      methodHandlers.switchFile(item.fileName);
      
      // 延迟后滚动到目标位置
      setTimeout(function() {
        scrollToSuggestion(item.id, item.config);
      }, 500);
    } else {
      // 同文件内跳转
      scrollToSuggestion(item.id, item.config);
    }
    
    updateDiffControlBar();
  }
  
  // 滚动到指定建议
  function scrollToSuggestion(suggestionId, config) {
    if (!diffCurrentView) return;
    
    // 使用最新位置进行滚动
    var latest = getLatestSuggestionPosition(suggestionId);
    var targetConfig = latest || config;
    
    if (targetConfig) {
      try {
        var EditorView = diffCurrentView.constructor;
        diffCurrentView.dispatch({
          effects: EditorView.scrollIntoView(targetConfig.lineFrom, { y: 'center' })
        });
      } catch (e) {
        console.warn('[DiffAPI] 滚动失败:', e);
      }
    }
  }
  
  // 创建行级 Widget 类 (block widget)
  function createDiffSuggestionWidgetClass(CM) {
    var WidgetType = CM.WidgetType;
    
    return class DiffSuggestionWidget extends WidgetType {
      constructor(config) {
        super();
        this.config = config;
      }
      
      toDOM(view) {
        var config = this.config;
        var id = config.id;
        var newContent = config.newContent;
        var onAccept = config.onAccept;
        var onReject = config.onReject;
        
        var container = document.createElement('div');
        container.className = 'diff-suggestion-block';
        container.dataset.suggestionId = id;
        
        var newContentDiv = document.createElement('div');
        newContentDiv.className = 'diff-new-content';
        
        var text = document.createElement('span');
        text.className = 'diff-new-text';
        text.textContent = newContent;
        
        newContentDiv.appendChild(text);
        
        var buttons = document.createElement('div');
        buttons.className = 'diff-buttons';
        
        var rejectBtn = document.createElement('button');
        rejectBtn.className = 'diff-btn diff-btn-reject';
        rejectBtn.innerHTML = '✕ Reject';
        rejectBtn.type = 'button';
        rejectBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
        rejectBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (onReject) onReject(view, id);
        });
        
        var acceptBtn = document.createElement('button');
        acceptBtn.className = 'diff-btn diff-btn-accept';
        acceptBtn.innerHTML = '✓ Accept';
        acceptBtn.type = 'button';
        acceptBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
        acceptBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (onAccept) onAccept(view, id);
        });
        
        buttons.appendChild(rejectBtn);
        buttons.appendChild(acceptBtn);
        newContentDiv.appendChild(buttons);
        container.appendChild(newContentDiv);
        
        return container;
      }
      
      eq(other) {
        return this.config.id === other.config.id &&
               this.config.newContent === other.config.newContent;
      }
      
      ignoreEvent(event) {
        return event.type !== 'mousedown' && event.type !== 'mouseup';
      }
    };
  }
  
  // 创建片段级 Widget 类 (inline widget)
  function createSegmentSuggestionWidgetClass(CM) {
    var WidgetType = CM.WidgetType;
    
    return class SegmentSuggestionWidget extends WidgetType {
      constructor(config) {
        super();
        this.config = config;
      }
      
      toDOM(view) {
        var config = this.config;
        var id = config.id;
        var newContent = config.newContent;
        var onAccept = config.onAccept;
        var onReject = config.onReject;
        
        // 创建 inline 容器
        var container = document.createElement('span');
        container.className = 'diff-segment-widget';
        container.dataset.suggestionId = id;
        
        // 新内容文本
        var newText = document.createElement('span');
        newText.className = 'diff-segment-new';
        newText.textContent = newContent;
        container.appendChild(newText);
        
        // inline 按钮容器
        var buttons = document.createElement('span');
        buttons.className = 'diff-segment-buttons';
        
        // 接受按钮 ✓
        var acceptBtn = document.createElement('button');
        acceptBtn.className = 'diff-segment-btn diff-segment-btn-accept';
        acceptBtn.innerHTML = '✓';
        acceptBtn.type = 'button';
        acceptBtn.title = 'Accept';
        acceptBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
        acceptBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (onAccept) onAccept(view, id);
        });
        
        // 拒绝按钮 ✕
        var rejectBtn = document.createElement('button');
        rejectBtn.className = 'diff-segment-btn diff-segment-btn-reject';
        rejectBtn.innerHTML = '✕';
        rejectBtn.type = 'button';
        rejectBtn.title = 'Reject';
        rejectBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
        rejectBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (onReject) onReject(view, id);
        });
        
        buttons.appendChild(acceptBtn);
        buttons.appendChild(rejectBtn);
        container.appendChild(buttons);
        
        return container;
      }
      
      eq(other) {
        return this.config.id === other.config.id &&
               this.config.newContent === other.config.newContent;
      }
      
      ignoreEvent(event) {
        return event.type !== 'mousedown' && event.type !== 'mouseup';
      }
    };
  }
  
  // ===== 内联状态 Widget 类 =====
  
  // 创建内联状态 Widget 类（简化版 - 只显示旋转指示器）
  function createInlineStatusWidgetClass(CM) {
    var WidgetType = CM.WidgetType;
    
    return class InlineStatusWidget extends WidgetType {
      constructor(config) {
        super();
        this.config = config;
      }
      
      toDOM(view) {
        var config = this.config;
        
        // 创建旋转指示器
        var spinner = document.createElement('span');
        spinner.className = 'inline-generating-spinner';
        spinner.dataset.inlineStatusId = config.id;
        spinner.title = '生成中... (按 ESC 取消)';
        return spinner;
      }
      
      eq(other) {
        return this.config.id === other.config.id &&
               this.config.state === other.config.state;
      }
      
      ignoreEvent(event) {
        return true;
      }
    };
  }
  
  // 创建扩展
  function createDiffSuggestionExtension(CM) {
    var StateEffect = CM.StateEffect;
    var StateField = CM.StateField;
    var EditorView = CM.EditorView;
    var Decoration = CM.Decoration;
    var DiffSuggestionWidget = createDiffSuggestionWidgetClass(CM);
    var SegmentSuggestionWidget = createSegmentSuggestionWidgetClass(CM);
    var InlineStatusWidget = createInlineStatusWidgetClass(CM);
    
    // 行级建议 effects
    var addDiffSuggestionEffect = StateEffect.define();
    var removeDiffSuggestionEffect = StateEffect.define();
    var clearDiffSuggestionsEffect = StateEffect.define();
    
    // 片段级建议 effects
    var addSegmentSuggestionEffect = StateEffect.define();
    var removeSegmentSuggestionEffect = StateEffect.define();
    var clearSegmentSuggestionsEffect = StateEffect.define();
    
    // 内联状态 effects
    var addInlineStatusEffect = StateEffect.define();
    var updateInlineStatusEffect = StateEffect.define();
    var removeInlineStatusEffect = StateEffect.define();
    var clearInlineStatusEffect = StateEffect.define();
    
    var diffSuggestionField = StateField.define({
      create: function() {
        return { 
          suggestions: new Map(),      // 行级建议
          segments: new Map(),         // 片段级建议
          inlineStatus: new Map()      // 内联状态
        };
      },
      update: function(value, tr) {
        var suggestions = new Map(value.suggestions);
        var segments = new Map(value.segments);
        var inlineStatus = new Map(value.inlineStatus);
        
        if (tr.docChanged) {
          // 更新行级建议位置
          for (var entry of suggestions) {
            var id = entry[0];
            var config = entry[1];
            suggestions.set(id, {
              ...config,
              lineFrom: tr.changes.mapPos(config.lineFrom, 1),
              lineTo: tr.changes.mapPos(config.lineTo, 1),
              widgetPos: tr.changes.mapPos(config.widgetPos, 1)
            });
          }
          
          // 更新片段级建议位置
          for (var entry of segments) {
            var id = entry[0];
            var config = entry[1];
            segments.set(id, {
              ...config,
              startOffset: tr.changes.mapPos(config.startOffset, 1),
              endOffset: tr.changes.mapPos(config.endOffset, -1),
              widgetPos: tr.changes.mapPos(config.widgetPos, 1)
            });
          }
          
          // 更新内联状态位置
          for (var entry of inlineStatus) {
            var id = entry[0];
            var config = entry[1];
            inlineStatus.set(id, {
              ...config,
              from: tr.changes.mapPos(config.from, 1),
              to: tr.changes.mapPos(config.to, -1),
              widgetPos: tr.changes.mapPos(config.widgetPos, -1)
            });
          }
        }
        
        // 处理行级建议 effects
        for (var effect of tr.effects) {
          if (effect.is(addDiffSuggestionEffect)) {
            suggestions.set(effect.value.id, effect.value);
          } else if (effect.is(removeDiffSuggestionEffect)) {
            suggestions.delete(effect.value);
          } else if (effect.is(clearDiffSuggestionsEffect)) {
            suggestions.clear();
          }
          // 处理片段级建议 effects
          else if (effect.is(addSegmentSuggestionEffect)) {
            segments.set(effect.value.id, effect.value);
          } else if (effect.is(removeSegmentSuggestionEffect)) {
            segments.delete(effect.value);
          } else if (effect.is(clearSegmentSuggestionsEffect)) {
            segments.clear();
          }
          // 处理内联状态 effects
          else if (effect.is(addInlineStatusEffect)) {
            inlineStatus.set(effect.value.id, effect.value);
          } else if (effect.is(updateInlineStatusEffect)) {
            var existing = inlineStatus.get(effect.value.id);
            if (existing) {
              inlineStatus.set(effect.value.id, { ...existing, ...effect.value });
            }
          } else if (effect.is(removeInlineStatusEffect)) {
            inlineStatus.delete(effect.value);
          } else if (effect.is(clearInlineStatusEffect)) {
            inlineStatus.clear();
          }
        }
        
        return { suggestions: suggestions, segments: segments, inlineStatus: inlineStatus };
      },
      provide: function(field) {
        return EditorView.decorations.compute([field], function(state) {
          var fieldValue = state.field(field);
          var suggestions = fieldValue.suggestions;
          var segments = fieldValue.segments;
          var inlineStatus = fieldValue.inlineStatus;
          var decorations = [];
          
          // 处理行级建议装饰
          for (var entry of suggestions) {
            var id = entry[0];
            var config = entry[1];
            try {
              var lineStart = state.doc.lineAt(config.lineFrom);
              var lineEnd = state.doc.lineAt(config.lineTo);
              
              for (var i = lineStart.number; i <= lineEnd.number; i++) {
                var line = state.doc.line(i);
                decorations.push(
                  Decoration.line({ class: 'diff-line-deleted' }).range(line.from)
                );
              }
              
              decorations.push(
                Decoration.widget({
                  widget: new DiffSuggestionWidget(config),
                  block: true,
                  side: 1
                }).range(config.widgetPos)
              );
            } catch (e) {
              console.error('[DiffAPI] 创建行级装饰失败:', e);
            }
          }
          
          // 处理片段级建议装饰
          for (var entry of segments) {
            var id = entry[0];
            var config = entry[1];
            try {
              // 只有在有选中内容时才添加 mark 装饰（避免空范围错误）
              if (config.startOffset < config.endOffset) {
                // 使用 mark 装饰标记被删除的片段
                decorations.push(
                  Decoration.mark({ class: 'diff-segment-deleted' }).range(config.startOffset, config.endOffset)
                );
              }
              
              // 在片段末尾添加 inline widget 显示新内容
              decorations.push(
                Decoration.widget({
                  widget: new SegmentSuggestionWidget(config),
                  side: 1  // 放在位置之后
                }).range(config.widgetPos)
              );
            } catch (e) {
              console.error('[DiffAPI] 创建片段级装饰失败:', e);
            }
          }
          
          // 处理内联状态装饰（生成中：文本标记 + 旋转指示器）
          for (var entry of inlineStatus) {
            var id = entry[0];
            var config = entry[1];
            try {
              // 只在生成中状态显示装饰
              if (config.state === 'generating') {
                // 判断是否有选中的文本（非插入模式）
                if (config.from < config.to) {
                  // 有选中文本：添加 mark 装饰（浅红色背景 + 删除线）
                  decorations.push(
                    Decoration.mark({ class: 'inline-generating-text' }).range(config.from, config.to)
                  );
                }
                
                // 在位置处添加旋转指示器 widget（插入模式在光标处，替换模式在文本末尾）
                var spinnerPos = config.to;
                decorations.push(
                  Decoration.widget({
                    widget: new InlineStatusWidget(config),
                    side: 1  // 放在位置之后
                  }).range(spinnerPos)
                );
              }
            } catch (e) {
              console.error('[InlineStatus] 创建内联状态装饰失败:', e);
            }
          }
          
          return Decoration.set(decorations, true);
        });
      }
    });
    
    window._diffSuggestionEffects = {
      // 行级建议 effects
      addDiffSuggestionEffect: addDiffSuggestionEffect,
      removeDiffSuggestionEffect: removeDiffSuggestionEffect,
      clearDiffSuggestionsEffect: clearDiffSuggestionsEffect,
      // 片段级建议 effects
      addSegmentSuggestionEffect: addSegmentSuggestionEffect,
      removeSegmentSuggestionEffect: removeSegmentSuggestionEffect,
      clearSegmentSuggestionsEffect: clearSegmentSuggestionsEffect,
      // 内联状态 effects
      addInlineStatusEffect: addInlineStatusEffect,
      updateInlineStatusEffect: updateInlineStatusEffect,
      removeInlineStatusEffect: removeInlineStatusEffect,
      clearInlineStatusEffect: clearInlineStatusEffect
    };
    
    // 保存 StateField 引用，用于获取最新位置
    window._diffSuggestionField = diffSuggestionField;
    
    return diffSuggestionField;
  }
  
  // 监听扩展加载
  window.addEventListener('UNSTABLE_editor:extensions', function(evt) {
    var detail = evt.detail;
    var CM = detail.CodeMirror;
    var extensions = detail.extensions;
    diffCodeMirror = CM;
    console.log('[DiffAPI] 捕获到 CodeMirror 实例');
    var diffSuggestionExtension = createDiffSuggestionExtension(CM);
    extensions.push(diffSuggestionExtension);
    console.log('[DiffAPI] Diff 建议扩展已注册');
  });
  
  // 触发加载并设置 API
  setTimeout(function() {
    window.dispatchEvent(new CustomEvent('editor:extension-loaded'));
    
    setTimeout(function() {
      var store = window.overleaf && window.overleaf.unstable && window.overleaf.unstable.store;
      diffCurrentView = (store && store.get('editor.view')) ||
                        (document.querySelector('.cm-content') && document.querySelector('.cm-content').cmView && document.querySelector('.cm-content').cmView.view);
      
      if (diffCurrentView) {
        console.log('[DiffAPI] 编辑器视图已获取');
        createDiffControlBar();
        setupDiffAPI();
        startFileChangeListener();  // 启动文件切换监听
      } else {
        console.warn('[DiffAPI] 无法获取编辑器视图，稍后重试');
        // 延迟重试
        setTimeout(function() {
          var store = window.overleaf && window.overleaf.unstable && window.overleaf.unstable.store;
          diffCurrentView = (store && store.get('editor.view')) ||
                            (document.querySelector('.cm-content') && document.querySelector('.cm-content').cmView && document.querySelector('.cm-content').cmView.view);
          if (diffCurrentView) {
            console.log('[DiffAPI] 编辑器视图已获取（重试）');
            createDiffControlBar();
            setupDiffAPI();
            startFileChangeListener();  // 启动文件切换监听
          }
        }, 2000);
      }
    }, 500);
  }, 100);
  
  // 设置 API
  function setupDiffAPI() {
    var effects = window._diffSuggestionEffects;
    if (!effects) {
      console.error('[DiffAPI] 效果未初始化');
      return;
    }
    
    window.diffAPI = {
      // 单行建议
      suggest: function(lineNum, newContent, callbacks) {
        callbacks = callbacks || {};
        try {
          var line = diffCurrentView.state.doc.line(lineNum);
          var id = 'suggestion-' + (diffSuggestionId++);
          var oldContent = line.text;
          var fileName = diffCurrentFileName;  // 记录创建时的文件名
          
          var config = {
            id: id,
            fileName: fileName,
            lineNum: lineNum,
            startLine: lineNum,
            endLine: lineNum,
            oldContent: oldContent,
            newContent: newContent,
            lineFrom: line.from,
            lineTo: line.to,
            widgetPos: line.to,
            onAccept: function(view, suggestionId) {
              var currentEffects = window._diffSuggestionEffects;  // 使用最新的 effects
              var fileSuggestions = diffSuggestionsByFile.get(fileName);
              var suggestion = fileSuggestions ? fileSuggestions.get(suggestionId) : null;
              // 获取最新位置（文档可能已变化）
              var latest = getLatestSuggestionPosition(suggestionId);
              var from = latest ? latest.lineFrom : (suggestion ? suggestion.lineFrom : 0);
              var to = latest ? latest.lineTo : (suggestion ? suggestion.lineTo : 0);
              if (suggestion && currentEffects) {
                view.dispatch({
                  changes: { from: from, to: to, insert: suggestion.newContent },
                  effects: currentEffects.removeDiffSuggestionEffect.of(suggestionId)
                });
                // 通知 Content Script
                window.postMessage({
                  type: 'DIFF_SUGGESTION_RESOLVED',
                  data: { id: suggestionId, accepted: true, oldContent: suggestion.oldContent, newContent: suggestion.newContent }
                }, '*');
                fileSuggestions.delete(suggestionId);
                var totalCount = getTotalSuggestionsCount();
                if (diffCurrentIndex >= totalCount) diffCurrentIndex = Math.max(0, totalCount - 1);
                updateDiffControlBar();
                console.log('[DiffAPI] 已接受建议:', suggestionId);
                if (callbacks.onAccept) callbacks.onAccept(oldContent, newContent);
              }
            },
            onReject: function(view, suggestionId) {
              var currentEffects = window._diffSuggestionEffects;  // 使用最新的 effects
              if (currentEffects) {
                view.dispatch({ effects: currentEffects.removeDiffSuggestionEffect.of(suggestionId) });
              }
              // 通知 Content Script
              window.postMessage({
                type: 'DIFF_SUGGESTION_RESOLVED',
                data: { id: suggestionId, accepted: false }
              }, '*');
              var fileSuggestions = diffSuggestionsByFile.get(fileName);
              if (fileSuggestions) fileSuggestions.delete(suggestionId);
              var totalCount = getTotalSuggestionsCount();
              if (diffCurrentIndex >= totalCount) diffCurrentIndex = Math.max(0, totalCount - 1);
              updateDiffControlBar();
              console.log('[DiffAPI] 已拒绝建议:', suggestionId);
              if (callbacks.onReject) callbacks.onReject(oldContent, newContent);
            }
          };
          
          getCurrentFileSuggestions().set(id, config);
          var currentEffectsForAdd = window._diffSuggestionEffects;
          if (currentEffectsForAdd) {
            diffCurrentView.dispatch({ effects: currentEffectsForAdd.addDiffSuggestionEffect.of(config) });
          }
          updateDiffControlBar();
          console.log('[DiffAPI] 建议已创建:', id, '第', lineNum, '行', '文件:', fileName);
          return id;
        } catch (e) {
          console.error('[DiffAPI] 创建建议失败:', e);
          return null;
        }
      },
      
      // 多行建议
      suggestRange: function(startLine, endLine, newContent, callbacks) {
        callbacks = callbacks || {};
        try {
          var lineStart = diffCurrentView.state.doc.line(startLine);
          var lineEnd = diffCurrentView.state.doc.line(endLine);
          var id = 'suggestion-' + (diffSuggestionId++);
          var oldContent = diffCurrentView.state.doc.sliceString(lineStart.from, lineEnd.to);
          var fileName = diffCurrentFileName;  // 记录创建时的文件名
          
          var config = {
            id: id,
            fileName: fileName,
            startLine: startLine,
            endLine: endLine,
            oldContent: oldContent,
            newContent: newContent,
            lineFrom: lineStart.from,
            lineTo: lineEnd.to,
            widgetPos: lineEnd.to,
            onAccept: function(view, suggestionId) {
              var currentEffects = window._diffSuggestionEffects;  // 使用最新的 effects
              var fileSuggestions = diffSuggestionsByFile.get(fileName);
              var suggestion = fileSuggestions ? fileSuggestions.get(suggestionId) : null;
              // 获取最新位置（文档可能已变化）
              var latest = getLatestSuggestionPosition(suggestionId);
              var from = latest ? latest.lineFrom : (suggestion ? suggestion.lineFrom : 0);
              var to = latest ? latest.lineTo : (suggestion ? suggestion.lineTo : 0);
              if (suggestion && currentEffects) {
                view.dispatch({
                  changes: { from: from, to: to, insert: suggestion.newContent },
                  effects: currentEffects.removeDiffSuggestionEffect.of(suggestionId)
                });
                // 通知 Content Script
                window.postMessage({
                  type: 'DIFF_SUGGESTION_RESOLVED',
                  data: { id: suggestionId, accepted: true, oldContent: suggestion.oldContent, newContent: suggestion.newContent }
                }, '*');
                fileSuggestions.delete(suggestionId);
                var totalCount = getTotalSuggestionsCount();
                if (diffCurrentIndex >= totalCount) diffCurrentIndex = Math.max(0, totalCount - 1);
                updateDiffControlBar();
                if (callbacks.onAccept) callbacks.onAccept();
              }
            },
            onReject: function(view, suggestionId) {
              var currentEffects = window._diffSuggestionEffects;  // 使用最新的 effects
              if (currentEffects) {
                view.dispatch({ effects: currentEffects.removeDiffSuggestionEffect.of(suggestionId) });
              }
              // 通知 Content Script
              window.postMessage({
                type: 'DIFF_SUGGESTION_RESOLVED',
                data: { id: suggestionId, accepted: false }
              }, '*');
              var fileSuggestions = diffSuggestionsByFile.get(fileName);
              if (fileSuggestions) fileSuggestions.delete(suggestionId);
              var totalCount = getTotalSuggestionsCount();
              if (diffCurrentIndex >= totalCount) diffCurrentIndex = Math.max(0, totalCount - 1);
              updateDiffControlBar();
              if (callbacks.onReject) callbacks.onReject();
            }
          };
          
          getCurrentFileSuggestions().set(id, config);
          var currentEffectsForAdd = window._diffSuggestionEffects;
          if (currentEffectsForAdd) {
            diffCurrentView.dispatch({ effects: currentEffectsForAdd.addDiffSuggestionEffect.of(config) });
          }
          updateDiffControlBar();
          console.log('[DiffAPI] 建议已创建:', id, '第', startLine, '-', endLine, '行', '文件:', fileName);
          return id;
        } catch (e) {
          console.error('[DiffAPI] 创建建议失败:', e);
          return null;
        }
      },
      
      // 使用外部 ID 创建建议
      suggestRangeWithId: function(externalId, startLine, endLine, newContent, callbacks) {
        callbacks = callbacks || {};
        try {
          var lineStart = diffCurrentView.state.doc.line(startLine);
          var lineEnd = diffCurrentView.state.doc.line(endLine);
          var oldContent = diffCurrentView.state.doc.sliceString(lineStart.from, lineEnd.to);
          var fileName = diffCurrentFileName;  // 记录创建时的文件名
          
          var config = {
            id: externalId,
            fileName: fileName,
            startLine: startLine,
            endLine: endLine,
            oldContent: oldContent,
            newContent: newContent,
            lineFrom: lineStart.from,
            lineTo: lineEnd.to,
            widgetPos: lineEnd.to,
            onAccept: function(view, suggestionId) {
              var currentEffects = window._diffSuggestionEffects;  // 使用最新的 effects
              var fileSuggestions = diffSuggestionsByFile.get(fileName);
              var suggestion = fileSuggestions ? fileSuggestions.get(suggestionId) : null;
              // 获取最新位置（文档可能已变化）
              var latest = getLatestSuggestionPosition(suggestionId);
              var from = latest ? latest.lineFrom : (suggestion ? suggestion.lineFrom : 0);
              var to = latest ? latest.lineTo : (suggestion ? suggestion.lineTo : 0);
              if (suggestion && currentEffects) {
                view.dispatch({
                  changes: { from: from, to: to, insert: suggestion.newContent },
                  effects: currentEffects.removeDiffSuggestionEffect.of(suggestionId)
                });
                // 通知 Content Script
                window.postMessage({
                  type: 'DIFF_SUGGESTION_RESOLVED',
                  data: { id: suggestionId, accepted: true, oldContent: suggestion.oldContent, newContent: suggestion.newContent }
                }, '*');
                fileSuggestions.delete(suggestionId);
                var totalCount = getTotalSuggestionsCount();
                if (diffCurrentIndex >= totalCount) diffCurrentIndex = Math.max(0, totalCount - 1);
                updateDiffControlBar();
                if (callbacks.onAccept) callbacks.onAccept();
              }
            },
            onReject: function(view, suggestionId) {
              var currentEffects = window._diffSuggestionEffects;  // 使用最新的 effects
              if (currentEffects) {
                view.dispatch({ effects: currentEffects.removeDiffSuggestionEffect.of(suggestionId) });
              }
              // 通知 Content Script
              window.postMessage({
                type: 'DIFF_SUGGESTION_RESOLVED',
                data: { id: suggestionId, accepted: false }
              }, '*');
              var fileSuggestions = diffSuggestionsByFile.get(fileName);
              if (fileSuggestions) fileSuggestions.delete(suggestionId);
              var totalCount = getTotalSuggestionsCount();
              if (diffCurrentIndex >= totalCount) diffCurrentIndex = Math.max(0, totalCount - 1);
              updateDiffControlBar();
              if (callbacks.onReject) callbacks.onReject();
            }
          };
          
          getCurrentFileSuggestions().set(externalId, config);
          var currentEffectsForAdd = window._diffSuggestionEffects;
          if (currentEffectsForAdd) {
            diffCurrentView.dispatch({ effects: currentEffectsForAdd.addDiffSuggestionEffect.of(config) });
          }
          updateDiffControlBar();
          console.log('[DiffAPI] 建议已创建（外部ID）:', externalId, '第', startLine, '-', endLine, '行', '文件:', fileName);
          return externalId;
        } catch (e) {
          console.error('[DiffAPI] 创建建议失败:', e);
          return null;
        }
      },
      
      // ===== 片段级建议 (Segment Suggestions) =====
      
      // 创建片段级建议（使用字符偏移）
      suggestSegment: function(startOffset, endOffset, newContent, callbacks) {
        callbacks = callbacks || {};
        try {
          var id = 'segment-' + (diffSuggestionId++);
          var oldContent = diffCurrentView.state.doc.sliceString(startOffset, endOffset);
          var fileName = diffCurrentFileName;
          
          var config = {
            id: id,
            type: 'segment',
            fileName: fileName,
            startOffset: startOffset,
            endOffset: endOffset,
            widgetPos: endOffset,
            oldContent: oldContent,
            newContent: newContent,
            onAccept: function(view, suggestionId) {
              var currentEffects = window._diffSuggestionEffects;
              var fileSuggestions = diffSuggestionsByFile.get(fileName);
              var suggestion = fileSuggestions ? fileSuggestions.get(suggestionId) : null;
              // 获取最新位置
              var latest = getLatestSegmentPosition(suggestionId);
              var from = latest ? latest.startOffset : (suggestion ? suggestion.startOffset : 0);
              var to = latest ? latest.endOffset : (suggestion ? suggestion.endOffset : 0);
              if (suggestion && currentEffects) {
                view.dispatch({
                  changes: { from: from, to: to, insert: suggestion.newContent },
                  effects: currentEffects.removeSegmentSuggestionEffect.of(suggestionId)
                });
                window.postMessage({
                  type: 'DIFF_SUGGESTION_RESOLVED',
                  data: { id: suggestionId, accepted: true, oldContent: suggestion.oldContent, newContent: suggestion.newContent }
                }, '*');
                fileSuggestions.delete(suggestionId);
                var totalCount = getTotalSuggestionsCount();
                if (diffCurrentIndex >= totalCount) diffCurrentIndex = Math.max(0, totalCount - 1);
                updateDiffControlBar();
                console.log('[DiffAPI] 已接受片段建议:', suggestionId);
                if (callbacks.onAccept) callbacks.onAccept(oldContent, newContent);
              }
            },
            onReject: function(view, suggestionId) {
              var currentEffects = window._diffSuggestionEffects;
              if (currentEffects) {
                view.dispatch({ effects: currentEffects.removeSegmentSuggestionEffect.of(suggestionId) });
              }
              window.postMessage({
                type: 'DIFF_SUGGESTION_RESOLVED',
                data: { id: suggestionId, accepted: false }
              }, '*');
              var fileSuggestions = diffSuggestionsByFile.get(fileName);
              if (fileSuggestions) fileSuggestions.delete(suggestionId);
              var totalCount = getTotalSuggestionsCount();
              if (diffCurrentIndex >= totalCount) diffCurrentIndex = Math.max(0, totalCount - 1);
              updateDiffControlBar();
              console.log('[DiffAPI] 已拒绝片段建议:', suggestionId);
              if (callbacks.onReject) callbacks.onReject(oldContent, newContent);
            }
          };
          
          getCurrentFileSuggestions().set(id, config);
          var currentEffectsForAdd = window._diffSuggestionEffects;
          if (currentEffectsForAdd) {
            diffCurrentView.dispatch({ effects: currentEffectsForAdd.addSegmentSuggestionEffect.of(config) });
          }
          updateDiffControlBar();
          console.log('[DiffAPI] 片段建议已创建:', id, '偏移', startOffset, '-', endOffset, '文件:', fileName);
          return id;
        } catch (e) {
          console.error('[DiffAPI] 创建片段建议失败:', e);
          return null;
        }
      },
      
      // 使用外部 ID 创建片段级建议
      suggestSegmentWithId: function(externalId, startOffset, endOffset, newContent, callbacks) {
        callbacks = callbacks || {};
        try {
          var oldContent = diffCurrentView.state.doc.sliceString(startOffset, endOffset);
          var fileName = diffCurrentFileName;
          
          var config = {
            id: externalId,
            type: 'segment',
            fileName: fileName,
            startOffset: startOffset,
            endOffset: endOffset,
            widgetPos: endOffset,
            oldContent: oldContent,
            newContent: newContent,
            onAccept: function(view, suggestionId) {
              var currentEffects = window._diffSuggestionEffects;
              var fileSuggestions = diffSuggestionsByFile.get(fileName);
              var suggestion = fileSuggestions ? fileSuggestions.get(suggestionId) : null;
              // 获取最新位置
              var latest = getLatestSegmentPosition(suggestionId);
              var from = latest ? latest.startOffset : (suggestion ? suggestion.startOffset : 0);
              var to = latest ? latest.endOffset : (suggestion ? suggestion.endOffset : 0);
              if (suggestion && currentEffects) {
                view.dispatch({
                  changes: { from: from, to: to, insert: suggestion.newContent },
                  effects: currentEffects.removeSegmentSuggestionEffect.of(suggestionId)
                });
                window.postMessage({
                  type: 'DIFF_SUGGESTION_RESOLVED',
                  data: { id: suggestionId, accepted: true, oldContent: suggestion.oldContent, newContent: suggestion.newContent }
                }, '*');
                fileSuggestions.delete(suggestionId);
                var totalCount = getTotalSuggestionsCount();
                if (diffCurrentIndex >= totalCount) diffCurrentIndex = Math.max(0, totalCount - 1);
                updateDiffControlBar();
                if (callbacks.onAccept) callbacks.onAccept();
              }
            },
            onReject: function(view, suggestionId) {
              var currentEffects = window._diffSuggestionEffects;
              if (currentEffects) {
                view.dispatch({ effects: currentEffects.removeSegmentSuggestionEffect.of(suggestionId) });
              }
              window.postMessage({
                type: 'DIFF_SUGGESTION_RESOLVED',
                data: { id: suggestionId, accepted: false }
              }, '*');
              var fileSuggestions = diffSuggestionsByFile.get(fileName);
              if (fileSuggestions) fileSuggestions.delete(suggestionId);
              var totalCount = getTotalSuggestionsCount();
              if (diffCurrentIndex >= totalCount) diffCurrentIndex = Math.max(0, totalCount - 1);
              updateDiffControlBar();
              if (callbacks.onReject) callbacks.onReject();
            }
          };
          
          getCurrentFileSuggestions().set(externalId, config);
          var currentEffectsForAdd = window._diffSuggestionEffects;
          if (currentEffectsForAdd) {
            diffCurrentView.dispatch({ effects: currentEffectsForAdd.addSegmentSuggestionEffect.of(config) });
          }
          updateDiffControlBar();
          console.log('[DiffAPI] 片段建议已创建（外部ID）:', externalId, '偏移', startOffset, '-', endOffset, '文件:', fileName);
          return externalId;
        } catch (e) {
          console.error('[DiffAPI] 创建片段建议失败:', e);
          return null;
        }
      },
      
      // 导航
      prev: function() {
        var totalCount = getTotalSuggestionsCount();
        if (totalCount === 0) return;
        
        // 检查是否在导航模式（当前文件没有建议）
        var currentFileCount = getCurrentFileSuggestions().size;
        if (currentFileCount === 0) {
          // 导航模式：跳转到上一个有建议的文件
          jumpToNextFileWithSuggestions();
          return;
        }
        
        if (diffCurrentIndex > 0) {
          jumpToDiffSuggestion(diffCurrentIndex - 1);
        } else {
          // 已经是第一个，重新定位到当前建议
          jumpToDiffSuggestion(diffCurrentIndex);
        }
      },
      
      next: function() {
        var totalCount = getTotalSuggestionsCount();
        if (totalCount === 0) return;
        
        // 检查是否在导航模式（当前文件没有建议）
        var currentFileCount = getCurrentFileSuggestions().size;
        if (currentFileCount === 0) {
          // 导航模式：跳转到下一个有建议的文件
          jumpToNextFileWithSuggestions();
          return;
        }
        
        if (diffCurrentIndex < totalCount - 1) {
          jumpToDiffSuggestion(diffCurrentIndex + 1);
        } else {
          // 已经是最后一个，重新定位到当前建议
          jumpToDiffSuggestion(diffCurrentIndex);
        }
      },
      
      goto: function(index) {
        jumpToDiffSuggestion(index);
      },
      
      // 接受当前
      acceptCurrent: function() {
        var sortedList = getSortedSuggestionsAcrossFiles();
        if (sortedList[diffCurrentIndex]) {
          var item = sortedList[diffCurrentIndex];
          if (item.config && item.config.onAccept) {
            item.config.onAccept(diffCurrentView, item.id);
          }
        }
      },
      
      // 拒绝当前
      rejectCurrent: function() {
        var sortedList = getSortedSuggestionsAcrossFiles();
        if (sortedList[diffCurrentIndex]) {
          var item = sortedList[diffCurrentIndex];
          if (item.config && item.config.onReject) {
            item.config.onReject(diffCurrentView, item.id);
          }
        }
      },
      
      // 接受当前文件所有建议
      acceptAll: function() {
        var fileSuggestions = getCurrentFileSuggestions();
        var ids = Array.from(fileSuggestions.keys());
        // 从后往前接受，避免位置偏移问题
        for (var i = ids.length - 1; i >= 0; i--) {
          var config = fileSuggestions.get(ids[i]);
          if (config && config.onAccept) {
            config.onAccept(diffCurrentView, ids[i]);
          }
        }
        console.log('[DiffAPI] 已接受当前文件所有建议');
      },
      
      // 拒绝当前文件所有建议
      rejectAll: function() {
        var fileSuggestions = getCurrentFileSuggestions();
        var ids = Array.from(fileSuggestions.keys());
        for (var j = 0; j < ids.length; j++) {
          var config = fileSuggestions.get(ids[j]);
          if (config && config.onReject) {
            config.onReject(diffCurrentView, ids[j]);
          }
        }
        console.log('[DiffAPI] 已拒绝当前文件所有建议');
      },
      
      // 清除当前文件所有建议（包括行级和片段级）
      clearAll: function() {
        var fileSuggestions = getCurrentFileSuggestions();
        var ids = Array.from(fileSuggestions.keys());
        for (var k = 0; k < ids.length; k++) {
          // 通知 Content Script 建议被清除（视为拒绝）
          window.postMessage({
            type: 'DIFF_SUGGESTION_RESOLVED',
            data: { id: ids[k], accepted: false }
          }, '*');
        }
        fileSuggestions.clear();
        var totalCount = getTotalSuggestionsCount();
        if (diffCurrentIndex >= totalCount) diffCurrentIndex = Math.max(0, totalCount - 1);
        var currentEffectsForClear = window._diffSuggestionEffects;
        if (currentEffectsForClear) {
          diffCurrentView.dispatch({ 
            effects: [
              currentEffectsForClear.clearDiffSuggestionsEffect.of(null),
              currentEffectsForClear.clearSegmentSuggestionsEffect.of(null)
            ]
          });
        }
        updateDiffControlBar();
        console.log('[DiffAPI] 当前文件所有建议已清除');
      },
      
      // 清除所有文件的建议（包括行级和片段级）
      clearAllFiles: function() {
        for (var entry of diffSuggestionsByFile) {
          var suggestions = entry[1];
          for (var suggEntry of suggestions) {
            window.postMessage({
              type: 'DIFF_SUGGESTION_RESOLVED',
              data: { id: suggEntry[0], accepted: false }
            }, '*');
          }
        }
        diffSuggestionsByFile.clear();
        diffCurrentIndex = 0;
        var currentEffectsForClear = window._diffSuggestionEffects;
        if (currentEffectsForClear) {
          diffCurrentView.dispatch({ 
            effects: [
              currentEffectsForClear.clearDiffSuggestionsEffect.of(null),
              currentEffectsForClear.clearSegmentSuggestionsEffect.of(null)
            ]
          });
        }
        updateDiffControlBar();
        console.log('[DiffAPI] 所有文件的建议已清除');
      },
      
      // 列出所有建议（跨文件）
      list: function() {
        var totalCount = getTotalSuggestionsCount();
        console.log('[DiffAPI] 修改建议 (' + totalCount + '个，' + diffSuggestionsByFile.size + '个文件):');
        for (var entry of diffSuggestionsByFile) {
          var fileName = entry[0];
          var suggestions = entry[1];
          console.log('  文件:', fileName, '(' + suggestions.size + '个)');
          suggestions.forEach(function(config, id) {
            console.log('    -', id, ': 第', config.lineNum || config.startLine, '行');
          });
        }
      },
      
      // 获取建议数量
      count: function() {
        return getTotalSuggestionsCount();
      },
      
      // 获取当前文件建议数量
      countCurrentFile: function() {
        return getCurrentFileSuggestions().size;
      },
      
      // 测试
      test: function() {
        console.log('[DiffAPI] 批量测试...');
        this.suggest(5, '这是第5行的修改建议内容');
        this.suggest(10, '这是第10行的修改建议');
        this.suggest(15, '第15行的新内容');
        console.log('[DiffAPI] 已创建3个测试建议，使用底部控制栏导航');
      }
    };
    
    console.log('[DiffAPI] Diff API 准备就绪!');
  }
  
  // 监听来自 Content Script 的消息
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    var data = event.data;
    if (!data) return;
    
    // 创建单个建议
    if (data.type === 'DIFF_CREATE_SUGGESTION') {
      var suggData = data.data;
      if (window.diffAPI) {
        window.diffAPI.suggestRangeWithId(
          suggData.id,
          suggData.startLine,
          suggData.endLine,
          suggData.newContent
        );
      }
    }
    
    // 批量创建建议
    else if (data.type === 'DIFF_CREATE_BATCH') {
      var suggestions = data.data.suggestions;
      if (window.diffAPI && suggestions) {
        for (var i = 0; i < suggestions.length; i++) {
          var s = suggestions[i];
          window.diffAPI.suggestRangeWithId(s.id, s.startLine, s.endLine, s.newContent);
        }
      }
    }
    
    // 创建单个片段级建议
    else if (data.type === 'DIFF_CREATE_SEGMENT_SUGGESTION') {
      var segmentData = data.data;
      if (window.diffAPI) {
        window.diffAPI.suggestSegmentWithId(
          segmentData.id,
          segmentData.startOffset,
          segmentData.endOffset,
          segmentData.newContent
        );
      }
    }
    
    // 批量创建片段级建议
    else if (data.type === 'DIFF_CREATE_SEGMENT_BATCH') {
      var segmentSuggestions = data.data.suggestions;
      if (window.diffAPI && segmentSuggestions) {
        for (var j = 0; j < segmentSuggestions.length; j++) {
          var seg = segmentSuggestions[j];
          window.diffAPI.suggestSegmentWithId(seg.id, seg.startOffset, seg.endOffset, seg.newContent);
        }
      }
    }
    
    // 接受指定建议
    else if (data.type === 'DIFF_ACCEPT') {
      var acceptId = data.data.id;
      if (window.diffAPI) {
        // 在所有文件中查找建议
        for (var acceptEntry of diffSuggestionsByFile) {
          var acceptSuggestions = acceptEntry[1];
          if (acceptSuggestions.has(acceptId)) {
            var acceptConfig = acceptSuggestions.get(acceptId);
            if (acceptConfig && acceptConfig.onAccept) {
              acceptConfig.onAccept(diffCurrentView, acceptId);
            }
            break;
          }
        }
      }
    }
    
    // 拒绝指定建议
    else if (data.type === 'DIFF_REJECT') {
      var rejectId = data.data.id;
      if (window.diffAPI) {
        // 在所有文件中查找建议
        for (var rejectEntry of diffSuggestionsByFile) {
          var rejectSuggestions = rejectEntry[1];
          if (rejectSuggestions.has(rejectId)) {
            var rejectConfig = rejectSuggestions.get(rejectId);
            if (rejectConfig && rejectConfig.onReject) {
              rejectConfig.onReject(diffCurrentView, rejectId);
            }
            break;
          }
        }
      }
    }
    
    // 接受所有
    else if (data.type === 'DIFF_ACCEPT_ALL') {
      if (window.diffAPI) {
        window.diffAPI.acceptAll();
      }
    }
    
    // 拒绝所有
    else if (data.type === 'DIFF_REJECT_ALL') {
      if (window.diffAPI) {
        window.diffAPI.rejectAll();
      }
    }
    
    // 清除所有
    else if (data.type === 'DIFF_CLEAR_ALL') {
      if (window.diffAPI) {
        window.diffAPI.clearAll();
      }
    }
  });
  
})();