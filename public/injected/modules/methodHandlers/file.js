/**
 * 方法处理器 - 文件操作
 * 负责文件相关的方法
 */

// 创建文件相关的方法处理器
import { debug, warn } from '../core/logger.js';

export function createFileHandlers(getEditorView, methodHandlers) {
  return {
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
        warn('[getFileInfo] Failed to get current file info:', e);
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
            debug(`[OverleafBridge] Found file via file tree: ${fileName} (${fileType}, ${fileId})`);
            return {
              name: fileName,
              id: fileId,
              type: fileType,
              source: 'file_tree'
            };
          }
        }
      } catch (e) {
        warn('[OverleafBridge] File tree check failed:', e);
      }

      // 策略 2: 检查 Overleaf Store (官方数据，主要针对编辑器中的文档)
      try {
        const store = window.overleaf?.unstable?.store;
        if (store) {
          const docName = store.get('editor.open_doc_name');
          const docId = store.get('editor.open_doc_id');
          if (docName) {
            debug(`[OverleafBridge] Found file via store: ${docName} (${docId})`);
            return {
              name: docName,
              id: docId,
              type: 'doc', // Store 里存的一般是 doc
              source: 'store'
            };
          }
        }
      } catch (e) {
        warn('[OverleafBridge] Store check failed:', e);
      }

      // 策略 3: 检查面包屑导航 (最后的备选)
      try {
        const breadcrumb = document.querySelector('.ol-cm-breadcrumbs div:last-child, .breadcrumbs div:last-child');
        if (breadcrumb && breadcrumb.textContent) {
          const fileName = breadcrumb.textContent.trim();
          debug(`[OverleafBridge] Found file via breadcrumb: ${fileName}`);
          return {
            name: fileName,
            id: null,
            type: null,
            source: 'breadcrumb'
          };
        }
      } catch (e) {
        warn('[OverleafBridge] Breadcrumb check failed:', e);
      }

      return null;
    },

    // 切换当前编辑的文件
    switchFile: function(targetFilename) {
      debug(`[OverleafBridge] Attempting to switch to file: "${targetFilename}"`);

      // 1. 查找文件节点
      // Overleaf 文件树节点通常带有 aria-label="文件名"
      // 注意：如果是文件夹中的文件，这里可能需要先展开文件夹，目前仅支持顶层或已展开的文件
      const fileNode = document.querySelector(`li[role="treeitem"][aria-label="${targetFilename}"]`);

      if (fileNode) {
        debug("[OverleafBridge] Found file node DOM, clicking...");
        
        // 2. 找到最佳点击目标
        // 通常点击内部的 .entity 元素，如果没有则点击 li 本身
        const clickTarget = fileNode.querySelector('.entity') || fileNode;

        // 3. 模拟完整的鼠标点击事件序列 (MouseDown -> MouseUp -> Click)
        // 这样比单纯的 .click() 更能骗过某些框架的事件监听
        const eventOptions = { bubbles: true, cancelable: true, view: window };
        
        clickTarget.dispatchEvent(new MouseEvent('mousedown', eventOptions));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', eventOptions));
        clickTarget.dispatchEvent(new MouseEvent('click', eventOptions));

        debug(`[OverleafBridge] Switch command sent to "${targetFilename}"`);
        return { success: true };
      } else {
        warn(`[OverleafBridge] DOM node not found for file "${targetFilename}"`);
        return { 
          success: false, 
          error: 'File not found in file tree (it might be in a collapsed folder)' 
        };
      }
    }
  };
}
