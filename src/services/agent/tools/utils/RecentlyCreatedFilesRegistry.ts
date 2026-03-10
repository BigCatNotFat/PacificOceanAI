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

const TTL_MS = 30_000;

class RecentlyCreatedFilesRegistry {
  private entries: Map<string, CreatedFileEntry> = new Map();

  register(entry: Omit<CreatedFileEntry, 'createdAt'>): void {
    this.entries.set(entry.id, { ...entry, createdAt: Date.now() });
  }

  getAll(): CreatedFileEntry[] {
    this.pruneExpired();
    return Array.from(this.entries.values());
  }

  findByPath(targetPath: string): CreatedFileEntry | null {
    this.pruneExpired();
    const normalized = targetPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const baseName = normalized.split('/').pop() || normalized;

    for (const entry of this.entries.values()) {
      const entryNormalized = entry.path.replace(/\\/g, '/').replace(/^\/+/, '');
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

  private pruneExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (now - entry.createdAt > TTL_MS) {
        this.entries.delete(id);
      }
    }
  }
}

export const recentlyCreatedFiles = new RecentlyCreatedFilesRegistry();
