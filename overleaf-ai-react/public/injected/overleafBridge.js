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
    response.success = true;
    response.result = result;
  } catch (error) {
    response.success = false;
    response.error = error instanceof Error ? error.message : String(error);
  }

  // 发送响应
  window.postMessage(response, '*');
});

// 标记脚本已加载
console.log('[OverleafBridge] Injected script loaded');
