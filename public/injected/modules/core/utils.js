/**
 * 核心模块 - 通用工具函数
 */

/**
 * 转义 HTML 特殊字符
 */
export function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 生成唯一 ID
 */
export function generatePreviewId() {
  return 'preview_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 获取当前文件名
 */
export function getCurrentFileName() {
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
