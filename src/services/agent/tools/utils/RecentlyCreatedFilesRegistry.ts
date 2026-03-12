/**
 * RecentlyCreatedFilesRegistry
 *
 * Tracks files created within the current session so that other tools
 * (ListDir, ReadFile, etc.) can find them even before the Overleaf REST API
 * or DOM have been updated.
 *
 * Entries expire after TTL_MS to avoid stale data once Overleaf has caught up.
 */

export interface CreatedFileEntry {
  name: string;
  path: string;
  id: string;
  type: 'doc' | 'folder';
  createdAt: number;
}

interface DeletedFileEntry {
  id?: string;
  path: string;
  name: string;
  deletedAt: number;
}

const CREATED_TTL_MS = 30_000;
const DELETED_TTL_MS = 30_000;

class RecentlyCreatedFilesRegistry {
  private entries: Map<string, CreatedFileEntry> = new Map();
  private deletedEntries: Map<string, DeletedFileEntry> = new Map();

  register(entry: Omit<CreatedFileEntry, 'createdAt'>): void {
    this.pruneExpired();

    const normalizedPath = this.normalizePath(entry.path);
    this.clearDeletedMatches(entry.id, normalizedPath, entry.name);

    this.entries.set(entry.id, {
      ...entry,
      path: normalizedPath,
      createdAt: Date.now()
    });
  }

  getAll(): CreatedFileEntry[] {
    this.pruneExpired();
    return Array.from(this.entries.values());
  }

  findByPath(targetPath: string): CreatedFileEntry | null {
    this.pruneExpired();
    const normalized = this.normalizePath(targetPath);
    const baseName = normalized.split('/').pop() || normalized;

    for (const entry of this.entries.values()) {
      const entryNormalized = this.normalizePath(entry.path);
      if (
        entryNormalized === normalized ||
        entry.name === baseName
      ) {
        return entry;
      }
    }
    return null;
  }

  findById(id: string): CreatedFileEntry | null {
    this.pruneExpired();
    return this.entries.get(id) ?? null;
  }

  removeById(id: string): void {
    this.entries.delete(id);
  }

  removeByPath(targetPath: string): void {
    const normalized = this.normalizePath(targetPath);
    if (!normalized) return;

    const baseName = this.getBaseName(normalized);
    const isRootTarget = !normalized.includes('/');

    for (const [id, entry] of this.entries) {
      const entryPath = this.normalizePath(entry.path);
      if (entryPath === normalized) {
        this.entries.delete(id);
        continue;
      }

      // Keep the old basename fallback only for root-level paths.
      if (isRootTarget && entry.name === baseName && !entryPath.includes('/')) {
        this.entries.delete(id);
      }
    }
  }

  markDeleted(entry: { id?: string; path: string; name?: string }): void {
    this.pruneExpired();

    const normalizedPath = this.normalizePath(entry.path);
    const name = entry.name?.trim() || this.getBaseName(normalizedPath);
    if (!entry.id && !normalizedPath) return;

    if (entry.id) this.entries.delete(entry.id);
    if (normalizedPath) this.removeByPath(normalizedPath);

    const key = this.buildDeletedKey(entry.id, normalizedPath || name);
    this.deletedEntries.set(key, {
      id: entry.id,
      path: normalizedPath,
      name,
      deletedAt: Date.now()
    });
  }

  isMarkedDeleted(entry: { id?: string; path?: string; name?: string }): boolean {
    this.pruneExpired();

    const normalizedPath = entry.path ? this.normalizePath(entry.path) : '';
    const name = entry.name?.trim() || (normalizedPath ? this.getBaseName(normalizedPath) : '');

    for (const deleted of this.deletedEntries.values()) {
      if (entry.id && deleted.id && deleted.id === entry.id) {
        return true;
      }

      if (normalizedPath && deleted.path === normalizedPath) {
        return true;
      }

      // Only use name match as a last resort when no path is available.
      if (!normalizedPath && name && deleted.name === name) {
        return true;
      }
    }

    return false;
  }

  private pruneExpired(): void {
    const now = Date.now();

    for (const [id, entry] of this.entries) {
      if (now - entry.createdAt > CREATED_TTL_MS) {
        this.entries.delete(id);
      }
    }

    for (const [key, entry] of this.deletedEntries) {
      if (now - entry.deletedAt > DELETED_TTL_MS) {
        this.deletedEntries.delete(key);
      }
    }
  }

  private clearDeletedMatches(id: string | undefined, path: string, _name: string): void {
    for (const [key, deleted] of this.deletedEntries) {
      if (id && deleted.id === id) {
        this.deletedEntries.delete(key);
        continue;
      }
      if (path && deleted.path === path) {
        this.deletedEntries.delete(key);
      }
    }
  }

  private normalizePath(path: string): string {
    return (path ?? '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
  }

  private getBaseName(path: string): string {
    return path.split('/').pop() || path;
  }

  private buildDeletedKey(id: string | undefined, pathOrName: string): string {
    return `${id ?? 'no-id'}:${pathOrName}`;
  }
}

export const recentlyCreatedFiles = new RecentlyCreatedFilesRegistry();
