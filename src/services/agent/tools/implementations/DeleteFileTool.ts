/**
 * delete_file - delete files/folders in Overleaf project.
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';
import { findEntityByPath, findFolderByPath, getAllEntities, type ResolvedEntity } from '../utils/FileEntityResolver';
import { recentlyCreatedFiles } from '../utils/RecentlyCreatedFilesRegistry';

interface DeleteAttemptLog {
  attempt: number;
  entityType: 'doc' | 'file' | 'folder';
  entityId: string;
  outcome: 'success' | 'error';
  error?: string;
  note?: string;
}

interface DeleteDiagnostics {
  target: string;
  normalizedTarget: string;
  resolverSnapshot?: {
    restExactPathCount: number;
    restSameNameCount: number;
    bridgeExactPathCount: number;
    bridgeSameNameCount: number;
    restExactPathSamples: string[];
    bridgeExactPathSamples: string[];
    errors?: string[];
  };
  attempts: DeleteAttemptLog[];
  candidates?: Array<{
    source: string;
    entityType: 'doc' | 'file' | 'folder';
    entityId: string;
    path: string;
  }>;
}

export class DeleteFileTool extends BaseTool {
  private readonly MAX_DELETE_ATTEMPTS = 10;
  private currentBatchDeleteTargets: Set<string> | null = null;

  protected metadata: ToolMetadata = {
    name: 'delete_file',
    description: `Delete one or more files or folders in the Overleaf project. Supports batch deletion in a single call.

**Batch mode (recommended):** Provide a \`files\` array to delete multiple files/folders at once.
**Single mode (backward compatible):** Provide target_file directly.

**Warning:** This action is irreversible. The files and their contents will be permanently removed.

Examples:
- Single: target_file="old_chapter.tex"
- Batch: files=[{target_file:"old_chapter.tex"}, {target_file:"deprecated/notes.tex"}]`,
    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'Array of files/folders to delete. Use this for batch deletion.',
          items: {
            type: 'object',
            properties: {
              target_file: {
                type: 'string',
                description: 'The path of the file or folder to delete, relative to the project root.'
              }
            },
            required: ['target_file']
          }
        },
        target_file: {
          type: 'string',
          description: '(Single mode) The path of the file or folder to delete.'
        },
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why these files are being deleted.'
        }
      },
      required: ['explanation']
    },
    needApproval: false,
    modes: ['agent']
  };

  private normalizeToFiles(args: any): Array<{ target_file: string }> {
    if (Array.isArray(args.files) && args.files.length > 0) {
      return args.files;
    }
    if (args.target_file) {
      return [{ target_file: args.target_file }];
    }
    return [];
  }

  private normalizePath(path: string): string {
    return (path ?? '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .trim();
  }

  private pathDepth(path: string): number {
    const normalized = this.normalizePath(path);
    if (!normalized) return 0;
    return normalized.split('/').length;
  }

  private hasBatchNestedTargets(targetPath: string): boolean {
    if (!this.currentBatchDeleteTargets) return false;

    const normalized = this.normalizePath(targetPath);
    if (!normalized) return false;

    const prefix = `${normalized}/`;
    for (const candidate of this.currentBatchDeleteTargets) {
      if (candidate !== normalized && candidate.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  private isExplicitFolderPath(path: string): boolean {
    const raw = (path ?? '').trim();
    return raw.endsWith('/') || raw.endsWith('\\');
  }

  private looksLikeLikelyDocPath(path: string): boolean {
    const normalized = this.normalizePath(path);
    if (!normalized) return false;
    const baseName = normalized.split('/').pop() || normalized;
    return /\.[a-z0-9]{1,12}$/i.test(baseName);
  }

  private errorText(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private toEntityKey(entity: Pick<ResolvedEntity, 'type' | 'id'>): string {
    return `${entity.type}:${entity.id}`;
  }

  private async expandDeleteTargets(files: Array<{ target_file: string }>): Promise<Array<{ target_file: string }>> {
    if (files.length === 0) return files;

    let allEntities: ResolvedEntity[] = [];
    try {
      allEntities = await getAllEntities();
    } catch {
      return files;
    }

    const folderPathSet = new Set<string>();
    const entitiesByPath = new Map<string, ResolvedEntity>();
    for (const entity of allEntities) {
      const path = this.normalizePath(entity.path);
      if (!path) continue;
      entitiesByPath.set(path, entity);
      if (entity.type === 'folder') {
        folderPathSet.add(path);
      }
    }

    const expanded: Array<{ target_file: string }> = [];
    const seen = new Set<string>();

    const addTarget = (path: string, forceFolderSyntax = false): void => {
      const normalized = this.normalizePath(path);
      if (!normalized) return;
      const dedupeKey = forceFolderSyntax ? `${normalized}/` : normalized;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      expanded.push({ target_file: forceFolderSyntax ? `${normalized}/` : normalized });
    };

    for (const file of files) {
      const normalized = this.normalizePath(file.target_file);
      if (!normalized) continue;

      const explicitFolder = this.isExplicitFolderPath(file.target_file);
      const inferredFolder = folderPathSet.has(normalized) || entitiesByPath.get(normalized)?.type === 'folder';
      const hasDescendants = allEntities.some(entity => {
        const entityPath = this.normalizePath(entity.path);
        return entityPath.startsWith(`${normalized}/`);
      });
      const isFolderTarget = explicitFolder || inferredFolder || hasDescendants;

      if (!isFolderTarget) {
        addTarget(file.target_file);
        continue;
      }

      const prefix = `${normalized}/`;
      const descendants = allEntities
        .filter(e => {
          const entityPath = this.normalizePath(e.path);
          return entityPath.startsWith(prefix);
        })
        .sort((a, b) => this.pathDepth(b.path) - this.pathDepth(a.path));

      for (const descendant of descendants) {
        if (descendant.type === 'folder') {
          addTarget(descendant.path, true);
        } else {
          addTarget(descendant.path, false);
        }
      }

      addTarget(normalized, true);
    }

    return expanded.length > 0 ? expanded : files;
  }

  private async resolveSafeDocPath(excludingPath: string): Promise<string | null> {
    const exclude = this.normalizePath(excludingPath);

    try {
      const entities = await getAllEntities();
      let fallback: string | null = null;

      for (const entity of entities) {
        if (entity.type !== 'doc') continue;

        const path = this.normalizePath(entity.path);
        if (!path || path === exclude) continue;
        if (!fallback) fallback = path;

        if (this.currentBatchDeleteTargets && this.currentBatchDeleteTargets.has(path)) {
          continue;
        }
        return path;
      }

      return fallback;
    } catch {
      return null;
    }
  }

  private async switchToFilePath(path: string): Promise<boolean> {
    const normalized = this.normalizePath(path);
    if (!normalized) return false;

    try {
      const switched = await overleafEditor.file.switchFile(normalized);
      if (switched.success) return true;

      const baseName = normalized.split('/').pop() || normalized;
      const switchedByName = await overleafEditor.file.switchFile(baseName);
      return switchedByName.success;
    } catch {
      return false;
    }
  }

  private async ensureNotDeletingActiveDoc(entity: ResolvedEntity): Promise<void> {
    if (entity.type !== 'doc') return;

    try {
      const info: any = await overleafEditor.file.getInfo();
      const activeDocId = info?.fileId ?? info?.docId;
      if (!activeDocId || String(activeDocId) !== entity.id) return;

      const safeDocPath = await this.resolveSafeDocPath(entity.path);
      if (!safeDocPath) return;

      const switched = await this.switchToFilePath(safeDocPath);
      if (!switched) return;

      const safeDocName = safeDocPath.split('/').pop() || safeDocPath;
      await this.waitForFileSwitch(safeDocName, 2500);
    } catch {
      // best effort only
    }
  }

  private async collectResolverSnapshot(targetFile: string): Promise<DeleteDiagnostics['resolverSnapshot']> {
    const normalizedTarget = this.normalizePath(targetFile);
    const baseName = normalizedTarget.split('/').pop() || normalizedTarget;

    const snapshot: DeleteDiagnostics['resolverSnapshot'] = {
      restExactPathCount: 0,
      restSameNameCount: 0,
      bridgeExactPathCount: 0,
      bridgeSameNameCount: 0,
      restExactPathSamples: [],
      bridgeExactPathSamples: [],
      errors: []
    };

    try {
      const fileTree = await overleafEditor.project.getFileTree();
      for (const e of fileTree.entities) {
        const rel = this.normalizePath(e.path);
        const name = rel.split('/').pop() || rel;
        if (rel === normalizedTarget) {
          snapshot.restExactPathCount++;
          if (snapshot.restExactPathSamples.length < 5) snapshot.restExactPathSamples.push(rel);
        }
        if (name === baseName) snapshot.restSameNameCount++;
      }
    } catch (error) {
      snapshot.errors?.push(`REST snapshot failed: ${this.errorText(error)}`);
    }

    try {
      const files = await overleafEditor.fileOps.listFiles();
      const rootFolder = files.find(f => f.type === 'folder' && !f.path.includes('/'));
      const rootPrefix = rootFolder ? this.normalizePath(rootFolder.path) + '/' : '';

      for (const f of files) {
        if (f === rootFolder) continue;

        let rel = this.normalizePath(f.path);
        if (rootPrefix && rel.startsWith(rootPrefix)) {
          rel = rel.slice(rootPrefix.length);
        }

        if (rel === normalizedTarget) {
          snapshot.bridgeExactPathCount++;
          if (snapshot.bridgeExactPathSamples.length < 5) snapshot.bridgeExactPathSamples.push(rel);
        }
        if (f.name === baseName) snapshot.bridgeSameNameCount++;
      }
    } catch (error) {
      snapshot.errors?.push(`Bridge snapshot failed: ${this.errorText(error)}`);
    }

    if (snapshot.errors && snapshot.errors.length === 0) {
      delete snapshot.errors;
    }
    return snapshot;
  }

  /**
   * Collect all bridge entries whose exact relative path equals target path.
   * We intentionally keep duplicates (different IDs) to handle stale-id races.
   */
  private async collectBridgeExactPathCandidates(
    targetFile: string,
    expectedTypes?: Array<'doc' | 'file' | 'folder'>
  ): Promise<ResolvedEntity[]> {
    const normalizedTarget = this.normalizePath(targetFile);
    if (!normalizedTarget) return [];

    try {
      const files = await overleafEditor.fileOps.listFiles();
      const rootFolder = files.find(f => f.type === 'folder' && !f.path.includes('/'));
      const rootPrefix = rootFolder ? this.normalizePath(rootFolder.path) + '/' : '';

      const candidates: ResolvedEntity[] = [];

      for (const f of files) {
        if (f === rootFolder) continue;

        let rel = this.normalizePath(f.path);
        if (rootPrefix && rel.startsWith(rootPrefix)) {
          rel = rel.slice(rootPrefix.length);
        }

        if (rel !== normalizedTarget) continue;

        if (recentlyCreatedFiles.isMarkedDeleted({ id: f.id, path: rel, name: f.name })) {
          continue;
        }

        const type: 'doc' | 'file' | 'folder' = f.type === 'folder'
          ? 'folder'
          : (f.type === 'doc' ? 'doc' : 'file');

        if (expectedTypes && !expectedTypes.includes(type)) {
          continue;
        }

        candidates.push({
          type,
          id: f.id,
          name: f.name,
          path: rel
        });
      }

      return candidates;
    } catch {
      return [];
    }
  }

  /**
   * Fallback for doc stale-id races:
   * switch editor to target doc, then read current fileId from bridge.
   */
  private async resolveDocEntityViaFileSwitch(targetFile: string): Promise<ResolvedEntity | null> {
    const normalizedTarget = this.normalizePath(targetFile);
    if (!normalizedTarget) return null;

    const baseName = normalizedTarget.split('/').pop() || normalizedTarget;

    try {
      let switched = await overleafEditor.file.switchFile(normalizedTarget);

      // Only fallback to basename when user asked for a root-level file.
      if (!switched.success && !normalizedTarget.includes('/')) {
        switched = await overleafEditor.file.switchFile(baseName);
      }

      if (!switched.success) return null;

      const ready = await this.waitForFileSwitch(baseName, 4000);
      if (!ready) return null;

      const info: any = await overleafEditor.file.getInfo();
      const fileId = info?.fileId ?? info?.docId;
      const fileName = info?.fileName;

      if (!fileId || !fileName) return null;
      if (fileName !== baseName && !normalizedTarget.endsWith(fileName)) return null;

      return {
        type: 'doc',
        id: String(fileId),
        name: String(fileName),
        path: normalizedTarget
      };
    } catch {
      return null;
    }
  }

  private async waitForFileSwitch(targetFileName: string, timeoutMs = 4000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const info: any = await overleafEditor.file.getInfo();
        const name = info?.fileName as string | null | undefined;
        if (name === targetFileName) return true;
      } catch {
        // ignore and retry
      }
      await this.sleep(200);
    }
    return false;
  }

  private async deleteSingleFile(
    targetFile: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const explicitFolderIntent = this.isExplicitFolderPath(targetFile);
    const likelyDocPath = this.looksLikeLikelyDocPath(targetFile);
    const expectedTypes: Array<'doc' | 'file' | 'folder'> | undefined = explicitFolderIntent ? ['folder'] : undefined;

    const diagnostics: DeleteDiagnostics = {
      target: targetFile,
      normalizedTarget: this.normalizePath(targetFile),
      attempts: [],
      candidates: []
    };

    const candidateQueue: Array<{ entity: ResolvedEntity; source: string }> = [];
    const seenCandidateKeys = new Set<string>();

    const enqueueCandidate = (entity: ResolvedEntity | null, source: string): void => {
      if (!entity?.id) return;
      const key = this.toEntityKey(entity);
      if (seenCandidateKeys.has(key)) return;
      seenCandidateKeys.add(key);
      candidateQueue.push({ entity, source });
      diagnostics.candidates?.push({
        source,
        entityType: entity.type,
        entityId: entity.id,
        path: entity.path
      });
    };

    const resolverEntity = explicitFolderIntent
      ? await findFolderByPath(targetFile)
      : await findEntityByPath(targetFile);
    enqueueCandidate(resolverEntity, 'resolver');

    if (!explicitFolderIntent) {
      const folderProbe = await findFolderByPath(targetFile);
      enqueueCandidate(folderProbe, 'folder_probe');
    }

    const bridgeCandidates = await this.collectBridgeExactPathCandidates(targetFile, expectedTypes);
    for (let i = bridgeCandidates.length - 1; i >= 0; i--) {
      enqueueCandidate(bridgeCandidates[i], 'bridge_exact_path');
    }

    // If nothing is visible yet, do a few short retries before failing.
    if (candidateQueue.length === 0) {
      for (let lookupAttempt = 1; lookupAttempt <= 3; lookupAttempt++) {
        await this.sleep(250 * lookupAttempt);

        const retried = explicitFolderIntent
          ? await findFolderByPath(targetFile)
          : await findEntityByPath(targetFile);
        enqueueCandidate(retried, `resolver_retry_${lookupAttempt}`);

        if (!explicitFolderIntent) {
          const folderRetried = await findFolderByPath(targetFile);
          enqueueCandidate(folderRetried, `folder_probe_retry_${lookupAttempt}`);
        }

        const bridgeRetried = await this.collectBridgeExactPathCandidates(targetFile, expectedTypes);
        for (let i = bridgeRetried.length - 1; i >= 0; i--) {
          enqueueCandidate(bridgeRetried[i], `bridge_retry_${lookupAttempt}`);
        }

        if (candidateQueue.length > 0) break;
      }
    }

    // Last fallback for docs: open target file and read its runtime fileId.
    if (candidateQueue.length === 0 && !explicitFolderIntent && likelyDocPath) {
      const switchedDoc = await this.resolveDocEntityViaFileSwitch(targetFile);
      enqueueCandidate(switchedDoc, 'switch_file_fallback');
    }

    if (candidateQueue.length === 0) {
      diagnostics.resolverSnapshot = await this.collectResolverSnapshot(targetFile);

      const looksLikeFolderIntent = explicitFolderIntent || !likelyDocPath || this.hasBatchNestedTargets(targetFile);
      const snapshot = diagnostics.resolverSnapshot;
      const noVisibleEntities =
        !!snapshot &&
        snapshot.restExactPathCount === 0 &&
        snapshot.bridgeExactPathCount === 0;

      if (looksLikeFolderIntent && noVisibleEntities) {
        return {
          success: true,
          data: {
            file: targetFile,
            type: 'folder',
            deleted: true,
            already_absent: true,
            message: `Folder "${targetFile}" is already absent`,
            diagnostics
          }
        };
      }

      const reason = `[${targetFile}] File or folder not found`;
      return {
        success: false,
        error: reason,
        data: {
          file: targetFile,
          deleted: false,
          reason: 'not_found',
          message: reason,
          error: reason,
          diagnostics
        }
      };
    }

    let attempt = 0;
    let lastErrorMsg = 'unknown reason';
    let lastEntity: ResolvedEntity | null = null;

    while (candidateQueue.length > 0 && attempt < this.MAX_DELETE_ATTEMPTS) {
      const { entity, source } = candidateQueue.shift()!;
      lastEntity = entity;
      attempt++;

      try {
        await this.ensureNotDeletingActiveDoc(entity);
        await overleafEditor.fileOps.deleteEntity(entity.type, entity.id);
        diagnostics.attempts.push({
          attempt,
          entityType: entity.type,
          entityId: entity.id,
          outcome: 'success',
          note: `source=${source}`
        });

        recentlyCreatedFiles.markDeleted({
          id: entity.id,
          path: entity.path || targetFile,
          name: entity.name
        });

        return {
          success: true,
          data: {
            file: targetFile,
            type: entity.type,
            deleted: true,
            entity_id: entity.id,
            message: `Deleted ${entity.type} "${targetFile}"`,
            diagnostics
          }
        };
      } catch (error) {
        const errorMsg = this.errorText(error);
        lastErrorMsg = errorMsg;

        diagnostics.attempts.push({
          attempt,
          entityType: entity.type,
          entityId: entity.id,
          outcome: 'error',
          error: errorMsg,
          note: `source=${source}`
        });

        if (!errorMsg.includes('404')) {
          diagnostics.resolverSnapshot = await this.collectResolverSnapshot(targetFile);
          const reason = `[${targetFile}] Delete failed: ${errorMsg}`;
          return {
            success: false,
            error: reason,
            data: {
              file: targetFile,
              type: entity.type,
              deleted: false,
              entity_id: entity.id,
              reason: 'delete_failed',
              message: reason,
              error: reason,
              diagnostics
            }
          };
        }

        // 404: refresh candidates and keep trying new IDs.
        const refreshed = explicitFolderIntent
          ? await findFolderByPath(targetFile)
          : await findEntityByPath(targetFile);
        enqueueCandidate(refreshed, `resolver_after_404_${attempt}`);

        if (!explicitFolderIntent) {
          const refreshedFolder = await findFolderByPath(targetFile);
          enqueueCandidate(refreshedFolder, `folder_probe_after_404_${attempt}`);
        }

        const bridgeAfter404 = await this.collectBridgeExactPathCandidates(targetFile, expectedTypes);
        for (let i = bridgeAfter404.length - 1; i >= 0; i--) {
          enqueueCandidate(bridgeAfter404[i], `bridge_after_404_${attempt}`);
        }

        if (entity.type === 'doc' && !explicitFolderIntent && likelyDocPath) {
          const switchedDoc = await this.resolveDocEntityViaFileSwitch(targetFile);
          enqueueCandidate(switchedDoc, `switch_after_404_${attempt}`);
        }
      }
    }

    diagnostics.resolverSnapshot = await this.collectResolverSnapshot(targetFile);

    const reason = lastErrorMsg.includes('404')
      ? `[${targetFile}] Delete failed: stale entity id(s), all candidates returned 404`
      : `[${targetFile}] Delete failed: ${lastErrorMsg}`;

    return {
      success: false,
      error: reason,
      data: {
        file: targetFile,
        type: lastEntity?.type,
        deleted: false,
        entity_id: lastEntity?.id,
        reason: 'delete_failed',
        message: reason,
        error: reason,
        diagnostics
      }
    };
  }

  async execute(args: {
    files?: Array<{ target_file: string }>;
    target_file?: string;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const requestedFiles = this.normalizeToFiles(args);
      const files = await this.expandDeleteTargets(requestedFiles);

      if (files.length === 0) {
        return {
          success: false,
          error: 'Missing required parameters: provide either "files" array or "target_file".',
          duration: Date.now() - startTime
        };
      }

      for (let i = 0; i < files.length; i++) {
        if (!files[i].target_file) {
          return {
            success: false,
            error: `Delete operation ${i + 1}: target_file is required.`,
            duration: Date.now() - startTime
          };
        }
      }

      const results: Array<{ success: boolean; data?: any; error?: string }> = [];
      this.currentBatchDeleteTargets = new Set(files.map(f => this.normalizePath(f.target_file)));

      try {
        for (let i = 0; i < files.length; i++) {
          try {
            const result = await this.deleteSingleFile(files[i].target_file);
            results.push(result);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            results.push({
              success: false,
              error: `[${files[i].target_file}] ${msg}`,
              data: {
                file: files[i].target_file,
                deleted: false,
                reason: 'unexpected_exception',
                message: `[${files[i].target_file}] ${msg}`,
                error: `[${files[i].target_file}] ${msg}`
              }
            });
          }
        }
      } finally {
        this.currentBatchDeleteTargets = null;
      }

      if (files.length === 1) {
        const r = results[0];
        return { success: r.success, data: r.data, error: r.error, duration: Date.now() - startTime };
      }

      const successResults = results.filter(r => r.success);
      const errorResults = results.filter(r => !r.success);

      return {
        success: successResults.length > 0,
        data: {
          batchMode: true,
          totalOperations: files.length,
          successCount: successResults.length,
          errorCount: errorResults.length,
          message: `${successResults.length}/${files.length} file(s) deleted successfully.${errorResults.length > 0 ? ` ${errorResults.length} failed.` : ''}`,
          fileResults: results.map(r => r.data || { error: r.error }),
          errors: errorResults.length > 0 ? errorResults.map(r => r.error) : undefined
        },
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        ...this.handleError(error),
        duration: Date.now() - startTime
      };
    }
  }

  getSummary(args: any): string {
    const files = this.normalizeToFiles(args);
    if (files.length === 0) return 'Delete file';
    if (files.length === 1) return 'Delete file: ' + files[0].target_file;
    return 'Batch delete ' + files.length + ' files';
  }
}
