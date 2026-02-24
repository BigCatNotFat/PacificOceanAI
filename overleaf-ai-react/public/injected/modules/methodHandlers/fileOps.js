/**
 * 方法处理器 - 文件操作（增删改移）
 * 提供文件树查看、新建文档/文件夹、删除、重命名、移动、上传等操作
 */

import { debug } from '../core/logger.js';
import { getFiberRoot, findProjectState, getCsrfToken, getJsonHeaders } from '../core/reactFiber.js';

export function createFileOpsHandlers(getProjectId) {
  return {
    getRootFolderId: function () {
      const proj = findProjectState(getFiberRoot());
      return proj?.rootFolder?.[0]?._id || null;
    },

    listFiles: function () {
      const proj = findProjectState(getFiberRoot());
      if (!proj?.rootFolder) {
        throw new Error('未找到文件树');
      }

      const result = [];

      function walk(folder, path) {
        const currentPath = path ? path + '/' + folder.name : folder.name;
        result.push({ type: 'folder', name: folder.name, path: currentPath, id: folder._id });

        (folder.docs || []).forEach(d => {
          result.push({ type: 'doc', name: d.name, path: currentPath + '/' + d.name, id: d._id });
        });
        (folder.fileRefs || []).forEach(f => {
          result.push({ type: 'file', name: f.name, path: currentPath + '/' + f.name, id: f._id });
        });
        (folder.folders || []).forEach(f => walk(f, currentPath));
      }

      proj.rootFolder.forEach(f => walk(f, ''));
      return result;
    },

    newDoc: async function (name, parentFolderId) {
      const projectId = getProjectId();
      if (!parentFolderId) {
        parentFolderId = findProjectState(getFiberRoot())?.rootFolder?.[0]?._id;
      }
      if (!parentFolderId) throw new Error('无法获取父文件夹 ID');

      const res = await fetch(`/project/${projectId}/doc`, {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify({ name, parent_folder_id: parentFolderId }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error('创建文档失败: ' + res.status + ' ' + text);
      }

      const doc = await res.json();
      debug('[FileOps] 已创建文档:', name, 'id:', doc._id);
      return doc;
    },

    newFolder: async function (name, parentFolderId) {
      const projectId = getProjectId();
      if (!parentFolderId) {
        parentFolderId = findProjectState(getFiberRoot())?.rootFolder?.[0]?._id;
      }
      if (!parentFolderId) throw new Error('无法获取父文件夹 ID');

      const res = await fetch(`/project/${projectId}/folder`, {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify({ name, parent_folder_id: parentFolderId }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error('创建文件夹失败: ' + res.status + ' ' + text);
      }

      const folder = await res.json();
      debug('[FileOps] 已创建文件夹:', name, 'id:', folder._id);
      return folder;
    },

    deleteEntity: async function (entityType, entityId) {
      if (!['doc', 'file', 'folder'].includes(entityType)) {
        throw new Error('entityType 必须是 doc / file / folder');
      }

      const projectId = getProjectId();
      const res = await fetch(`/project/${projectId}/${entityType}/${entityId}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });

      if (!res.ok) {
        throw new Error('删除失败: ' + res.status);
      }

      debug('[FileOps] 已删除:', entityType, entityId);
      return { success: true };
    },

    renameEntity: async function (entityType, entityId, newName) {
      if (!['doc', 'file', 'folder'].includes(entityType)) {
        throw new Error('entityType 必须是 doc / file / folder');
      }

      const projectId = getProjectId();
      const res = await fetch(`/project/${projectId}/${entityType}/${entityId}/rename`, {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify({ name: newName }),
      });

      if (!res.ok) {
        throw new Error('重命名失败: ' + res.status);
      }

      debug('[FileOps] 已重命名:', entityType, entityId, '->', newName);
      return { success: true, newName };
    },

    moveEntity: async function (entityType, entityId, targetFolderId) {
      if (!['doc', 'file', 'folder'].includes(entityType)) {
        throw new Error('entityType 必须是 doc / file / folder');
      }

      const projectId = getProjectId();
      const res = await fetch(`/project/${projectId}/${entityType}/${entityId}/move`, {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify({ folder_id: targetFolderId }),
      });

      if (!res.ok) {
        throw new Error('移动失败: ' + res.status);
      }

      debug('[FileOps] 已移动:', entityType, entityId, '->', targetFolderId);
      return { success: true };
    },

    uploadFile: async function (base64Data, fileName, folderId) {
      const projectId = getProjectId();
      if (!folderId) {
        folderId = findProjectState(getFiberRoot())?.rootFolder?.[0]?._id;
      }
      if (!folderId) throw new Error('无法获取目标文件夹 ID');

      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes]);
      const file = new File([blob], fileName);

      const formData = new FormData();
      formData.append('qqfile', file);
      formData.append('name', fileName);

      const res = await fetch(`/Project/${projectId}/upload?folder_id=${folderId}`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': getCsrfToken() },
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error('上传失败: ' + res.status + ' ' + text);
      }

      const data = await res.json();
      debug('[FileOps] 已上传:', fileName);
      return data;
    },
  };
}
