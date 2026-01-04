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
  
  // 4. 获取每个文档的内容
  const batchSize = 5;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    
    const contents = await Promise.all(
      batch.map(async (doc) => {
        // 路径格式: "/main.tex" -> "main.tex"
        const pathname = doc.path.startsWith('/') ? doc.path.substring(1) : doc.path;
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
    return {
      totalLines: doc.lines,
      totalLength: doc.length,
      // 尝试获取当前文件名（从 breadcrumbs）
      fileName: (function() {
        try {
          var breadcrumb = document.querySelector('.ol-cm-breadcrumbs, .breadcrumbs');
          if (breadcrumb) {
            var nameElement = breadcrumb.querySelector('div:last-child');
            return nameElement ? nameElement.textContent.trim() : null;
          }
          return null;
        } catch (e) {
          return null;
        }
      })()
    };
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

  // 全局搜索
  searchProject: async function(pattern, options) {
    return await searchInternal(pattern, options);
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
  tooltip.style.padding = '8px 12px';
  tooltip.style.borderRadius = '8px';
  tooltip.style.fontSize = '12px';
  tooltip.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255,255,255,0.1)';
  tooltip.style.display = 'none';
  tooltip.style.flexDirection = 'column';  // 改为垂直布局
  tooltip.style.gap = '0';
  tooltip.style.backdropFilter = 'blur(8px)';
  tooltip.style.transition = 'left 0.1s ease-out, top 0.1s ease-out, opacity 0.15s ease';
  tooltip.style.opacity = '1';
  
  // 创建按钮容器
  buttonContainerEl = document.createElement('div');
  buttonContainerEl.id = 'ol-ai-selection-buttons';
  buttonContainerEl.style.display = 'flex';
  buttonContainerEl.style.gap = '8px';
  buttonContainerEl.style.justifyContent = 'center';
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
      text: text
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
 * 处理文本操作请求（扩写/缩写/润色等）
 * @param {string} actionType 操作类型
 */
function handleTextActionRequest(actionType) {
  if (!currentSelection) {
    console.warn('[OverleafBridge] No selection for text action');
    return;
  }
  
  const preview = currentSelection.text.length > 50 
    ? currentSelection.text.substring(0, 50) + '...' 
    : currentSelection.text;
  const selectedModel = getSelectedTextActionModel();
  console.log('[OverleafBridge] Text action requested:', actionType, 'model:', selectedModel, 'text:', preview);
  
  // 发送操作请求到 content script
  window.postMessage({
    type: 'OVERLEAF_TEXT_ACTION_REQUEST',
    data: {
      action: actionType,
      text: currentSelection.text,
      from: currentSelection.from,
      to: currentSelection.to,
      modelId: selectedModel  // 添加选中的模型 ID
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
window.addEventListener('mouseup', function() {
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
  overlay.style.zIndex = '9998';
  overlay.style.background = 'rgba(255, 255, 255, 0.98)';
  overlay.style.border = '2px solid #3b82f6';
  overlay.style.borderRadius = '8px';
  overlay.style.padding = '12px';
  overlay.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
  overlay.style.display = 'none';
  overlay.style.maxWidth = '600px';
  overlay.style.minWidth = '300px';
  overlay.style.fontFamily = 'monospace';
  overlay.style.fontSize = '13px';
  overlay.style.lineHeight = '1.5';
  overlay.style.whiteSpace = 'pre-wrap';
  overlay.style.wordBreak = 'break-word';
  
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
  title.style.fontWeight = '600';
  title.style.color = '#1e3a5f';
  title.style.fontSize = '12px';
  title.style.textTransform = 'uppercase';
  title.style.letterSpacing = '0.5px';
  title.textContent = '📝 预览更改';
  titleBar.appendChild(title);
  
  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.background = 'transparent';
  closeBtn.style.border = 'none';
  closeBtn.style.color = '#6b7280';
  closeBtn.style.fontSize = '16px';
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
  originalContainer.style.color = '#dc2626';
  originalContainer.style.background = 'rgba(254, 202, 202, 0.3)';
  originalContainer.style.padding = '8px';
  originalContainer.style.borderRadius = '4px';
  originalContainer.style.marginBottom = '8px';
  originalContainer.style.borderLeft = '3px solid #dc2626';
  overlay.appendChild(originalContainer);
  
  // 箭头指示
  const arrow = document.createElement('div');
  arrow.style.textAlign = 'center';
  arrow.style.color = '#6b7280';
  arrow.style.margin = '4px 0';
  arrow.textContent = '↓';
  overlay.appendChild(arrow);
  
  // 新文本容器
  const newContainer = document.createElement('div');
  newContainer.id = 'ol-ai-preview-new';
  newContainer.style.color = '#059669';
  newContainer.style.background = 'rgba(167, 243, 208, 0.3)';
  newContainer.style.padding = '8px';
  newContainer.style.borderRadius = '4px';
  newContainer.style.borderLeft = '3px solid #059669';
  overlay.appendChild(newContainer);
  
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
  menu.style.zIndex = '9999';
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

/**
 * 开始流式预览
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
    
    // 保存当前预览信息
    currentPreview = {
      id: generatePreviewId(),
      action: data.action,
      originalText: data.originalText,
      newText: '',  // 初始为空
      from: data.from,
      to: data.to
    };
    
    // 获取选区位置坐标
    const coords = view.coordsAtPos(data.from);
    if (!coords) {
      console.error('[OverleafBridge] Could not get coords for stream preview');
      return;
    }
    
    // 懒创建覆盖层
    if (!previewOverlayEl) {
      previewOverlayEl = createPreviewOverlay();
    }
    if (!previewConfirmEl) {
      previewConfirmEl = createPreviewConfirmMenu();
    }
    
    // 更新覆盖层内容
    const originalContainer = document.getElementById('ol-ai-preview-original');
    const newContainer = document.getElementById('ol-ai-preview-new');
    
    if (originalContainer) {
      originalContainer.textContent = data.originalText;
    }
    if (newContainer) {
      // 显示加载指示器
      newContainer.innerHTML = '<span style="color: #60a5fa; animation: pulse 1.5s ease-in-out infinite;">AI 正在生成...</span>';
    }
    
    // 计算位置
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    
    let overlayLeft = coords.left + scrollX;
    let overlayTop = coords.bottom + scrollY + 10;
    
    const overlayWidth = 500;
    if (overlayLeft + overlayWidth > window.innerWidth + scrollX - 20) {
      overlayLeft = window.innerWidth + scrollX - overlayWidth - 20;
    }
    if (overlayLeft < scrollX + 10) {
      overlayLeft = scrollX + 10;
    }
    
    previewOverlayEl.style.left = overlayLeft + 'px';
    previewOverlayEl.style.top = overlayTop + 'px';
    previewOverlayEl.style.display = 'block';
    
    // 隐藏确认菜单（等生成完成后显示）
    previewConfirmEl.style.display = 'none';
    
    console.log('[OverleafBridge] Stream preview started:', currentPreview.id);
    
  } catch (e) {
    console.error('[OverleafBridge] Failed to start stream preview:', e);
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
  
  const newContainer = document.getElementById('ol-ai-preview-new');
  if (newContainer) {
    // 显示流式文本 + 光标动画
    newContainer.innerHTML = escapeHtml(streamPreviewText) + '<span style="animation: blink 0.7s step-end infinite; color: #60a5fa;">▌</span>';
  }
}

/**
 * 完成流式预览
 * @param {Object} data 包含最终的 newText
 */
function completeStreamPreview(data) {
  if (!currentPreview) return;
  
  isStreamingPreview = false;
  
  // 更新最终文本
  if (data && data.newText) {
    currentPreview.newText = data.newText;
  } else {
    currentPreview.newText = streamPreviewText;
  }
  
  const newContainer = document.getElementById('ol-ai-preview-new');
  if (newContainer) {
    // 移除光标，显示最终文本
    newContainer.textContent = currentPreview.newText;
  }
  
  // 显示确认菜单
  if (previewConfirmEl && previewOverlayEl) {
    setTimeout(function() {
      const overlayRect = previewOverlayEl.getBoundingClientRect();
      const scrollY = window.scrollY || window.pageYOffset;
      const confirmTop = overlayRect.bottom + scrollY + 10;
      
      previewConfirmEl.style.left = previewOverlayEl.style.left;
      previewConfirmEl.style.top = confirmTop + 'px';
      previewConfirmEl.style.display = 'flex';
    }, 10);
  }
  
  console.log('[OverleafBridge] Stream preview completed');
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
 * 显示预览覆盖层
 * @param {Object} previewData 预览数据
 */
function showPreviewOverlay(previewData) {
  try {
    // 先隐藏选区菜单，避免遮挡
    hideSelectionTooltip();
    
    const view = getEditorView();
    if (!view) {
      console.error('[OverleafBridge] EditorView not available for preview');
      return;
    }
    
    // 保存当前预览信息
    currentPreview = {
      id: previewData.id || generatePreviewId(),
      action: previewData.action,
      originalText: previewData.originalText,
      newText: previewData.newText,
      from: previewData.from,
      to: previewData.to
    };
    
    // 获取选区位置坐标
    const coords = view.coordsAtPos(previewData.from);
    if (!coords) {
      console.error('[OverleafBridge] Could not get coords for preview');
      return;
    }
    
    // 懒创建覆盖层
    if (!previewOverlayEl) {
      previewOverlayEl = createPreviewOverlay();
    }
    if (!previewConfirmEl) {
      previewConfirmEl = createPreviewConfirmMenu();
    }
    
    // 更新覆盖层内容
    const originalContainer = document.getElementById('ol-ai-preview-original');
    const newContainer = document.getElementById('ol-ai-preview-new');
    
    if (originalContainer) {
      originalContainer.textContent = previewData.originalText;
    }
    if (newContainer) {
      newContainer.textContent = previewData.newText;
    }
    
    // 计算位置（使用绝对定位，需要加上滚动偏移）
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    
    // 预览覆盖层显示在选区下方
    let overlayLeft = coords.left + scrollX;
    let overlayTop = coords.bottom + scrollY + 10;
    
    // 确保不超出视口右边界
    const overlayWidth = 500;
    if (overlayLeft + overlayWidth > window.innerWidth + scrollX - 20) {
      overlayLeft = window.innerWidth + scrollX - overlayWidth - 20;
    }
    if (overlayLeft < scrollX + 10) {
      overlayLeft = scrollX + 10;
    }
    
    previewOverlayEl.style.left = overlayLeft + 'px';
    previewOverlayEl.style.top = overlayTop + 'px';
    previewOverlayEl.style.display = 'block';
    
    // 确认菜单显示在覆盖层下方
    // 需要等待覆盖层渲染后获取其高度
    setTimeout(function() {
      const overlayRect = previewOverlayEl.getBoundingClientRect();
      const confirmTop = overlayTop + overlayRect.height + 10;
      
      previewConfirmEl.style.left = overlayLeft + 'px';
      previewConfirmEl.style.top = confirmTop + 'px';
      previewConfirmEl.style.display = 'flex';
    }, 10);
    
    console.log('[OverleafBridge] Preview overlay shown:', currentPreview.id);
    
  } catch (e) {
    console.error('[OverleafBridge] Failed to show preview overlay:', e);
  }
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
