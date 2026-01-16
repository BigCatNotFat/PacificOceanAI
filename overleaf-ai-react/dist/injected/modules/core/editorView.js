/**
 * 核心模块 - EditorView 访问
 * 提供统一的 EditorView 获取接口
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

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getEditorView };
}

