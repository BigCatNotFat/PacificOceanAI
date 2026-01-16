/**
 * 方法处理器 - 编辑器操作
 * 负责文档编辑相关的方法
 */

// 创建编辑器相关的方法处理器
function createEditorHandlers(getEditorView) {
  return {
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
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createEditorHandlers };
}

