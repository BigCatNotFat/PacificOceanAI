/**
 * FileEntityResolver - 可靠的文件实体查找工具
 *
 * 通过多策略查找项目中的文件/文件夹：
 * 1. REST API getFileTree（直接走 HTTP，不返回空文件夹）
 * 2. Bridge listFiles（通过 React Fiber 内部状态，能看到文件夹）
 *
 * 所有文件操作工具（create / delete / rename / move）都应使用此模块。
 */

import { overleafEditor } from '../../../editor/OverleafEditor';

export interface ResolvedEntity {
  type: 'doc' | 'file' | 'folder';
  id: string;
  name: string;
  path: string;
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * 从 Bridge listFiles 结果中匹配实体。
 *
 * Bridge 路径格式: "rootFolderName/subfolder/file.tex"
 * 第一段是根文件夹名，需要跳过。
 */
function matchInBridgeFiles(
  files: Array<{ type: string; name: string; path: string; id: string }>,
  normalized: string,
  baseName: string
): ResolvedEntity | null {
  // 识别根文件夹（路径中不含 "/" 的 folder）
  const rootFolder = files.find(f => f.type === 'folder' && !f.path.includes('/'));
  const rootPrefix = rootFolder ? rootFolder.path + '/' : '';

  for (const f of files) {
    // 跳过根文件夹本身
    if (f === rootFolder) continue;

    // 将 bridge 路径转为相对于项目根的路径
    let relativePath = normalize(f.path);
    if (rootPrefix && relativePath.startsWith(normalize(rootPrefix))) {
      relativePath = relativePath.slice(normalize(rootPrefix).length);
      if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
    }

    const matched =
      relativePath === normalized ||
      f.name === baseName;

    if (matched) {
      return {
        type: mapEntityType(f.type),
        id: f.id,
        name: f.name,
        path: relativePath
      };
    }
  }
  return null;
}

/**
 * 根据路径查找文件实体
 * @param targetPath 目标路径（相对于项目根目录）
 * @returns 找到的实体信息，未找到则返回 null
 */
export async function findEntityByPath(targetPath: string): Promise<ResolvedEntity | null> {
  const normalized = normalize(targetPath);
  const baseName = normalized.split('/').pop() || normalized;

  console.log('[FileEntityResolver] Looking for:', { targetPath, normalized, baseName });

  // 策略 1: REST API（对 doc/file 最可靠，但不返回空文件夹）
  try {
    const fileTree = await overleafEditor.project.getFileTree();
    console.log('[FileEntityResolver] REST API returned', fileTree.entities.length, 'entities');

    for (const entity of fileTree.entities) {
      const entityPath = normalize(entity.path);
      const entityName = entityPath.split('/').pop() || entityPath;
      const entityId = entity.id ?? entity._id ?? (entity as any).doc_id ?? (entity as any).docId;

      if (!entityId) continue;

      const matched =
        entityPath === normalized ||
        entityPath === baseName ||
        entityName === baseName;

      if (matched) {
        const type = mapEntityType(entity.type);
        console.log('[FileEntityResolver] Found via REST API:', { path: entity.path, type, id: entityId });
        return { type, id: entityId, name: entityName, path: entity.path };
      }
    }

    console.log('[FileEntityResolver] Not found via REST API (may be an empty folder)');
  } catch (error) {
    console.warn('[FileEntityResolver] REST API getFileTree failed:', error);
  }

  // 策略 2: Bridge listFiles（能看到文件夹，包括空文件夹）
  try {
    const files = await overleafEditor.fileOps.listFiles();
    console.log('[FileEntityResolver] Bridge listFiles returned', files.length, 'entries');

    const result = matchInBridgeFiles(files, normalized, baseName);
    if (result) {
      console.log('[FileEntityResolver] Found via Bridge:', result);
      return result;
    }

    console.log('[FileEntityResolver] Not found via Bridge either');
  } catch (error) {
    console.warn('[FileEntityResolver] Bridge listFiles failed:', error);
  }

  console.error('[FileEntityResolver] Entity not found by any strategy:', targetPath);
  return null;
}

/**
 * 查找文件夹实体（优先走 Bridge，因为 REST API 不返回空文件夹）
 */
export async function findFolderByPath(folderPath: string): Promise<ResolvedEntity | null> {
  const normalized = normalize(folderPath);
  const baseName = normalized.split('/').pop() || normalized;

  // 文件夹：优先 Bridge（REST API 找不到空文件夹）
  try {
    const files = await overleafEditor.fileOps.listFiles();
    const result = matchInBridgeFiles(
      files.filter(f => f.type === 'folder'),
      normalized,
      baseName
    );
    if (result) return result;
  } catch (error) {
    console.warn('[FileEntityResolver] Bridge failed for folder lookup:', error);
  }

  // Fallback: REST API（非空文件夹可能通过路径推断）
  const entity = await findEntityByPath(folderPath);
  if (entity && entity.type === 'folder') return entity;

  return null;
}

/**
 * 获取所有文件实体（合并 REST API + Bridge，确保包含文件夹）
 * 返回的 path 均为相对于项目根的路径（无根文件夹前缀）
 */
export async function getAllEntities(): Promise<ResolvedEntity[]> {
  const resultMap = new Map<string, ResolvedEntity>();

  // 策略 1: REST API（doc/file，路径已经是 /xxx 格式）
  try {
    const fileTree = await overleafEditor.project.getFileTree();
    for (const e of fileTree.entities) {
      const id = e.id ?? e._id ?? (e as any).doc_id;
      if (!id) continue;
      const name = normalize(e.path).split('/').pop() || e.path;
      resultMap.set(id, {
        type: mapEntityType(e.type),
        id,
        name,
        path: e.path
      });
    }
  } catch (error) {
    console.warn('[FileEntityResolver] REST API failed in getAllEntities');
  }

  // 策略 2: Bridge（补全文件夹，路径需要去掉根文件夹前缀）
  try {
    const files = await overleafEditor.fileOps.listFiles();
    const rootFolder = files.find(f => f.type === 'folder' && !f.path.includes('/'));
    const rootPrefix = rootFolder ? rootFolder.path + '/' : '';

    for (const f of files) {
      if (f === rootFolder) continue;
      if (resultMap.has(f.id)) continue;

      let relativePath = f.path;
      if (rootPrefix && relativePath.startsWith(rootPrefix)) {
        relativePath = relativePath.slice(rootPrefix.length);
      }

      resultMap.set(f.id, {
        type: mapEntityType(f.type),
        id: f.id,
        name: f.name,
        path: relativePath
      });
    }
  } catch (error) {
    console.warn('[FileEntityResolver] Bridge failed in getAllEntities');
  }

  return Array.from(resultMap.values());
}

function mapEntityType(type: string): 'doc' | 'file' | 'folder' {
  if (type === 'folder') return 'folder';
  if (type === 'doc') return 'doc';
  return 'file';
}
