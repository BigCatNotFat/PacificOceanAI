/**
 * FileEntityResolver
 *
 * Resolve files/folders by project-relative path using multiple sources:
 * 1) REST file tree (`project.getFileTree`) for docs/files
 * 2) Bridge file tree (`fileOps.listFiles`) for folders and fresher UI state
 */

import { overleafEditor } from '../../../editor/OverleafEditor';
import { recentlyCreatedFiles } from './RecentlyCreatedFilesRegistry';

export interface ResolvedEntity {
  type: 'doc' | 'file' | 'folder';
  id: string;
  name: string;
  path: string;
}

function normalize(p: string): string {
  return (p ?? '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function toRelativeBridgePath(rawPath: string, rootPrefix: string): string {
  let relativePath = normalize(rawPath);
  if (rootPrefix && relativePath.startsWith(rootPrefix)) {
    relativePath = relativePath.slice(rootPrefix.length);
    if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
  }
  return relativePath;
}

/**
 * Match an entity from bridge listFiles output.
 *
 * Bridge path format: "rootFolderName/subfolder/file.tex"
 * We remove root folder prefix and match by project-relative path.
 */
function matchInBridgeFiles(
  files: Array<{ type: string; name: string; path: string; id: string }>,
  normalized: string,
  baseName: string,
  allowNameFallback: boolean
): ResolvedEntity | null {
  const rootFolder = files.find(f => f.type === 'folder' && !f.path.includes('/'));
  const rootPrefix = rootFolder ? normalize(rootFolder.path) + '/' : '';

  let exactMatch: ResolvedEntity | null = null;
  let fallbackMatch: ResolvedEntity | null = null;

  for (const f of files) {
    if (f === rootFolder) continue;

    const relativePath = toRelativeBridgePath(f.path, rootPrefix);

    if (recentlyCreatedFiles.isMarkedDeleted({ id: f.id, path: relativePath, name: f.name })) {
      continue;
    }

    const candidate: ResolvedEntity = {
      type: mapEntityType(f.type),
      id: f.id,
      name: f.name,
      path: relativePath
    };

    if (relativePath === normalized) {
      // Exact path match takes priority. Keep the latest exact match to reduce
      // stale-id issues when duplicated entries briefly coexist.
      exactMatch = candidate;
      continue;
    }

    if (allowNameFallback && f.name === baseName && !fallbackMatch) {
      fallbackMatch = candidate;
    }
  }

  return exactMatch ?? fallbackMatch;
}

/**
 * Resolve file/folder by project-relative path.
 */
export async function findEntityByPath(targetPath: string): Promise<ResolvedEntity | null> {
  const normalized = normalize(targetPath);
  const baseName = normalized.split('/').pop() || normalized;
  const allowNameFallback = !normalized.includes('/');

  // Strategy 1: REST API (reliable for doc/file)
  try {
    const fileTree = await overleafEditor.project.getFileTree();
    for (const entity of fileTree.entities) {
      const entityPath = normalize(entity.path);
      const entityName = entityPath.split('/').pop() || entityPath;
      const entityId = entity.id ?? entity._id ?? (entity as any).doc_id ?? (entity as any).docId;

      if (!entityId) continue;

      const matched =
        entityPath === normalized ||
        (allowNameFallback && entityName === baseName);

      if (matched) {
        return {
          type: mapEntityType(entity.type),
          id: entityId,
          name: entityName,
          path: entity.path
        };
      }
    }
  } catch {
    // ignore and fallback
  }

  // Strategy 2: Bridge listFiles (includes folders and often fresher)
  try {
    const files = await overleafEditor.fileOps.listFiles();
    const result = matchInBridgeFiles(files, normalized, baseName, allowNameFallback);
    if (result) {
      return result;
    }
  } catch {
    // ignore and fallback
  }

  // Strategy 3: session recently-created registry
  const recentEntry = recentlyCreatedFiles.findByPath(targetPath);
  if (recentEntry && !recentlyCreatedFiles.isMarkedDeleted({ id: recentEntry.id, path: recentEntry.path, name: recentEntry.name })) {
    return recentEntry;
  }

  return null;
}

/**
 * Resolve folder by path.
 * Prefer bridge because REST API may miss empty folders.
 */
export async function findFolderByPath(folderPath: string): Promise<ResolvedEntity | null> {
  const normalized = normalize(folderPath);
  const baseName = normalized.split('/').pop() || normalized;
  const allowNameFallback = !normalized.includes('/');

  try {
    const files = await overleafEditor.fileOps.listFiles();
    const result = matchInBridgeFiles(
      files.filter(f => f.type === 'folder'),
      normalized,
      baseName,
      allowNameFallback
    );
    if (result) return result;
  } catch {
    // ignore and fallback
  }

  const entity = await findEntityByPath(folderPath);
  if (entity && entity.type === 'folder') return entity;

  return null;
}

/**
 * Merge entities from REST + bridge and return all known entities.
 */
export async function getAllEntities(): Promise<ResolvedEntity[]> {
  const resultMap = new Map<string, ResolvedEntity>();

  // REST entities
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
  } catch {
    // ignore
  }

  // Bridge entities (fill missing folders/entries)
  try {
    const files = await overleafEditor.fileOps.listFiles();
    const rootFolder = files.find(f => f.type === 'folder' && !f.path.includes('/'));
    const rootPrefix = rootFolder ? normalize(rootFolder.path) + '/' : '';

    for (const f of files) {
      if (f === rootFolder) continue;
      if (resultMap.has(f.id)) continue;

      const relativePath = toRelativeBridgePath(f.path, rootPrefix);

      if (recentlyCreatedFiles.isMarkedDeleted({ id: f.id, path: relativePath, name: f.name })) {
        continue;
      }

      resultMap.set(f.id, {
        type: mapEntityType(f.type),
        id: f.id,
        name: f.name,
        path: relativePath
      });
    }
  } catch {
    // ignore
  }

  return Array.from(resultMap.values());
}

function mapEntityType(type: string): 'doc' | 'file' | 'folder' {
  if (type === 'folder') return 'folder';
  if (type === 'doc') return 'doc';
  return 'file';
}
