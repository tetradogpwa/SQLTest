/**
 * Undo history store.
 *
 * Per RESEARCH.md §4.5 each destructive / transactional operation
 * generates a checkpoint (snapshot) and an undo entry that points to
 * it. The UI uses these entries to render the "↶ Deshacer" button
 * with a readable description.
 *
 * `dbId` is the user-database id (string), **not** the numeric
 * Worker handle. `snapshotId` references the corresponding row in
 * `snapshotMetadata` — the actual bytes live in OPFS.
 *
 * The history is LRU-pruned: at most 5 entries per DB. Older entries
 * are dropped on the next `addEntry` via `prune`.
 */

import type { SqlAcademyDB } from './dexie'
import { db as defaultDb } from './dexie'
import type { UndoEntry } from './types'

/** Default per-DB cap. Matches RESEARCH.md §4.4. */
export const DEFAULT_MAX_UNDO_PER_DB = 5

export class UndoStore {
  private readonly db: SqlAcademyDB

  constructor(dbInstance: SqlAcademyDB = defaultDb) {
    this.db = dbInstance
  }

  /**
   * Append a new entry. Returns the assigned id. The store enforces
   * the per-DB cap (5) on each insert — `prune` is also exposed
   * publicly for callers that want to enforce their own cap.
   */
  async addEntry(entry: Omit<UndoEntry, 'id'>): Promise<number> {
    const id = await this.db.undoHistory.add(entry as UndoEntry)
    await this.prune(entry.dbId)
    return id
  }

  /** Newest first, capped to `limit`. */
  async listRecent(dbId: string, limit?: number): Promise<UndoEntry[]> {
    const rows = await this.db.undoHistory.where('dbId').equals(dbId).toArray()
    const sorted = rows.sort((a, b) => b.timestamp - a.timestamp)
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted
  }

  async getById(id: number): Promise<UndoEntry | undefined> {
    return this.db.undoHistory.get(id)
  }

  async remove(id: number): Promise<void> {
    await this.db.undoHistory.delete(id)
  }

  /** Wipe every undo entry for a DB — called when the DB is deleted. */
  async removeByDb(dbId: string): Promise<void> {
    await this.db.undoHistory.where('dbId').equals(dbId).delete()
  }

  /**
   * Drop the oldest entries until at most `maxCount` remain.
   * Returns the number removed.
   */
  async prune(dbId: string, maxCount: number = DEFAULT_MAX_UNDO_PER_DB): Promise<number> {
    const rows = await this.db.undoHistory.where('dbId').equals(dbId).toArray()
    if (rows.length <= maxCount) return 0
    const overflow = rows.length - maxCount
    const oldest = rows
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, overflow)
    const ids = oldest
      .map((r) => r.id)
      .filter((id): id is number => id !== undefined)
    if (ids.length === 0) return 0
    await this.db.undoHistory.bulkDelete(ids)
    return ids.length
  }
}

export const undoStore = new UndoStore()
