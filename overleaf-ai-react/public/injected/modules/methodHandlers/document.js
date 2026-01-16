/**
 * 方法处理器 - 文档操作
 * 负责文档内容读取相关的方法
 */

// 创建文档相关的方法处理器
function createDocumentHandlers(getEditorView) {
  return {
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
    }
  };
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createDocumentHandlers };
}

