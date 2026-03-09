/**
 * 搜索模块 - 文件获取
 * 负责通过 Overleaf API 获取文件列表、hash、内容等
 */

import { getEditorView } from '../core/editorView.js';
import { debug, warn } from '../core/logger.js';

// 通过 entities API 获取文件列表
export async function fetchEntities(projectId) {
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
export async function fetchFileHashes(projectId) {
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
export async function fetchBlobContent(projectId, hash) {
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

// 通过 doc download API 获取文档内容（更可靠）
export async function fetchDocContent(projectId, docId) {
  try {
    const response = await fetch(`/project/${projectId}/doc/${docId}/download`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`获取文档内容失败: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`[OverleafBridge] 获取文档内容失败 (docId: ${docId}):`, error);
    return null;
  }
}

// 从 DOM 获取文件 ID 映射（fallback）
function getDomFileIdMap() {
  const map = new Map();
  
  try {
    const fileItems = document.querySelectorAll('[data-file-id]');
    
    fileItems.forEach((item) => {
      const id = item.getAttribute('data-file-id');
      if (!id) return;
      
      // 尝试获取文件名
      const nameSpan = item.querySelector('.item-name-button span');
      const name = nameSpan?.textContent?.trim();
      if (!name) return;
      
      map.set(name, id);
    });
  } catch (error) {
    console.error('[OverleafBridge] 获取 DOM 文件 ID 映射失败:', error);
  }
  
  return map;
}

// 获取所有文档及其内容
export async function getAllDocsWithContent(projectId) {
  const files = [];
  
  debug('[OverleafBridge] 使用 entities + doc download API 获取文件');
  
  // 1. 获取文件列表
  const entities = await fetchEntities(projectId);
  debug(`[OverleafBridge] 找到 ${entities.length} 个实体`);
  
  // 2. 过滤出可编辑的文档（type === 'doc'）
  const docs = entities.filter(e => e.type === 'doc');
  debug(`[OverleafBridge] 找到 ${docs.length} 个可编辑文档`);
  
  // 3. 获取 DOM 中的文件 ID 映射（作为 fallback）
  const domIdMap = getDomFileIdMap();
  debug(`[OverleafBridge] DOM 文件 ID 映射: ${domIdMap.size} 个`);
  
  // 获取当前编辑器文档的实时内容（优先使用，因为可能有未保存的修改）
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
        debug(`[OverleafBridge] 当前编辑器文档: ${currentDocPath} (使用实时内容)`);
      }
    }
  } catch (e) {
    warn('[OverleafBridge] 无法获取当前编辑器内容:', e);
  }
  
  // 4. 获取每个文档的内容（使用 doc download API）
  const batchSize = 5;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    
    const contents = await Promise.all(
      batch.map(async (doc) => {
        const pathname = doc.path.startsWith('/') ? doc.path.substring(1) : doc.path;
        const filename = pathname.split('/').pop(); // 获取文件名
        
        // 当前文档优先使用编辑器实时内容
        if (currentDocPath && currentDocContent && pathname === currentDocPath) {
          debug(`[OverleafBridge] ${pathname}: 使用编辑器实时内容`);
          return currentDocContent;
        }
        
        // 尝试获取文档 ID（优先从 entities，然后从 DOM）
        let docId = doc._id || doc.id;
        
        // Fallback: 从 DOM 获取 ID
        if (!docId && filename) {
          docId = domIdMap.get(filename);
          if (docId) {
            debug(`[OverleafBridge] ${pathname}: 从 DOM 获取 ID`);
          }
        }
        
        if (docId) {
          return await fetchDocContent(projectId, docId);
        } else {
          warn(`[OverleafBridge] 未找到文档 ID: ${pathname}`);
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
  
  debug(`[OverleafBridge] 成功加载 ${files.length} 个文档内容`);
  return files;
}
