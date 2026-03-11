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

    // 切换当前编辑的文件。支持传入全路径 (例如 "folder/subfolder/file.tex") 以自动展开文件夹
    switchFile: function(targetFilename) {
      debug(`[OverleafBridge] Attempting to switch to file: "${targetFilename}"`);
      
      return new Promise((resolve) => {
        // 1. 解析路径
        // 如果传入的是完整路径（例如 "folder/subfolder/file.tex"）或者只是文件名 ("file.tex")
        const parts = targetFilename.split('/').filter(Boolean);
        const fileName = parts.pop();
        const folders = parts;

        // 递归展开目录树的辅助函数
        const expandFolders = (folderNames, index) => {
          if (index >= folderNames.length) {
            // 所有文件夹都已经展开完毕，现在去点击文件
            clickTargetFile();
            return;
          }

          const currentFolderName = folderNames[index];
          const folderNodes = Array.from(document.querySelectorAll('li[role="treeitem"]'));
          const folderNode = folderNodes.find(el => el.getAttribute('aria-label') === currentFolderName);

          if (folderNode) {
            const isExpanded = folderNode.getAttribute('aria-expanded') === 'true';
            if (!isExpanded) {
              debug(`[OverleafBridge] Expanding folder: ${currentFolderName}`);
              const toggleBtn = folderNode.querySelector('button') || folderNode.querySelector('.ol-cm-collapse-button') || folderNode;
              
              const opts = { bubbles: true, cancelable: true, view: window };
              toggleBtn.dispatchEvent(new MouseEvent('mousedown', opts));
              toggleBtn.dispatchEvent(new MouseEvent('mouseup', opts));
              toggleBtn.dispatchEvent(new MouseEvent('click', opts));
              
              // 等待一段时间让 React 将内部节点渲染到 DOM
              setTimeout(() => expandFolders(folderNames, index + 1), 500);
            } else {
              // 已经展开，直接进入下一级
              expandFolders(folderNames, index + 1);
            }
          } else {
            warn(`[OverleafBridge] Folder node not found for "${currentFolderName}"`);
            // 尽力而为，如果找不到中间文件夹，也尝试找一下最终的文件看能不能找到
            clickTargetFile();
          }
        };

        const clickTargetFile = () => {
          // 2. 查找文件节点
          const fileNodes = Array.from(document.querySelectorAll('li[role="treeitem"]'));
          const fileNode = fileNodes.find(el => el.getAttribute('aria-label') === fileName);

          if (fileNode) {
            debug("[OverleafBridge] Found file node DOM, clicking...");
            
            // 3. 找到最佳点击目标
            const clickTarget = fileNode.querySelector('.entity') || fileNode;

            // 4. 模拟完整的鼠标点击事件序列
            const eventOptions = { bubbles: true, cancelable: true, view: window };
            
            clickTarget.dispatchEvent(new MouseEvent('mousedown', eventOptions));
            clickTarget.dispatchEvent(new MouseEvent('mouseup', eventOptions));
            clickTarget.dispatchEvent(new MouseEvent('click', eventOptions));

            debug(`[OverleafBridge] Switch command sent to "${fileName}"`);
            resolve({ success: true });
          } else {
            warn(`[OverleafBridge] DOM node not found for file "${fileName}"`);
            resolve({ 
              success: false, 
              error: `File not found in file tree (could not expand to "${targetFilename}")` 
            });
          }
        };

        // 开始展开目录结构
        expandFolders(folders, 0);
      });
    }
  };
}
