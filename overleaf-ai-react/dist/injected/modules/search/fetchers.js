/**
 * 搜索模块 - 文件获取
 * 负责通过 Overleaf API 获取文件列表、hash、内容等
 */

import { getEditorView } from '../core/editorView.js';

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

// 获取所有文档及其内容
export async function getAllDocsWithContent(projectId) {
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
