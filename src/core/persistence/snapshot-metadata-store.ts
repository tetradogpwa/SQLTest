/**
 * Snapshot metadata store.
 *
 * Each entry corresponds to a snapshot whose *bytes* live in OPFS (via
 * the Worker). This table only stores the descriptor — the bytes are
 * not duplicated into IndexedDB.
 *
 * `dbId` is the user-database id (a string slug) so the UI can
 * filter by database without first having to ask the Worker for the
 * id-to-name mapping. `snapshotId` is the string the Worker uses as
 * the OPFS filename (e.g. `snap-${dbId}-${timestamp}`).
 *
 * Per RESEARCH.md §3.3, snapshots are LRU-pruned: a per-DB cap (5 by
 * default) plus a global byte cap. The byte cap is enforced by the
 * Worker, since the bytes live in OPFS; `prune` here only handles
 * the per-DB count.
 */

import type { SqlAcademyDB } from './dexie'
import { db as defaultDb } from './dexie'
import type { SnapshotMetadataEntry } from './types'

/** Default per-DB cap. Matches RESEARCH.md §3.3. */
export const DEFAULT_MAX_SNAPSHOTS_PER_DB = 5

export class SnapshotMetadataStore {
  private readonly db: SqlAcademyDB

  constructor(dbInstance: SqlAcademyDB = defaultDb) {
    this.db = dbInstance
  }

  /**
   * Insert a new descriptor. Returns the assigned id. The Worker
   * calls into the PersistenceService (which calls this) once it has
   * already written the bytes to OPFS.
   */
  async add(entry: Omit<SnapshotMetadataEntry, 'id'>): Promise<number> {
    return this.db.snapshotMetadata.add(entry as SnapshotMetadataEntry)
  }

  async remove(id: number): Promise<void> {
    await this.db.snapshotMetadata.delete(id)
  }

  /**
   * Drop *every* snapshot for a database. Called when the user deletes
   * the DB itself; the PersistenceService also tells the Worker to
   * wipe the OPFS directory for `dbId`.
   */
  async removeByDb(dbId: string): Promise<void> {
    await this.db.snapshotMetadata.where('dbId').equals(dbId).delete()
  }

  /** All snapshots for a DB, newest first. */
  async listByDb(dbId: string): Promise<SnapshotMetadataEntry[]> {
    const rows = await this.db.snapshotMetadata.where('dbId').equals(dbId).toArray()
    return rows.sort((a, b) => b.createdAt - a.createdAt)
  }

  async getById(id: number): Promise<SnapshotMetadataEntry | undefined> {
    return this.db.snapshotMetadata.get(id)
  }

  /**
   * Look up a snapshot by the OPFS filename (`snapshotId`) the Worker
   * assigned. Used when restoring: the User clicks a row in the
   * "Snapshots" panel and the UI needs the descriptor.
   */
  async getBySnapshotId(
    dbId: string,
    snapshotId: string,
  ): Promise<SnapshotMetadataEntry | undefined> {
    const rows = await this.db.snapshotMetadata
      .where('dbId')
      .equals(dbId)
      .toArray()
    return rows.find((r) => r.snapshotId === snapshotId)
  }

  /**
   * LRU prune: keep the `maxCount` newest snapshots for `dbId`,
   * delete the rest. Returns the number removed. The cap is 5 per
   * RESEARCH.md §3.3; pass a different value to override.
   */
  async prune(dbId: string, maxCount: number = DEFAULT_MAX_SNAPSHOTS_PER_DB): Promise<number> {
    const rows = await this.listByDb(dbId)
    if (rows.length <= maxCount) return 0
    const overflow = rows.length - maxCount
    const toDelete = rows.slice(maxCount) // already sorted newest-first
    const ids = toDelete
      .map((r) => r.id)
      .filter((id): id is number => id !== undefined)
    if (ids.length === 0) return 0
    await this.db.snapshotMetadata.bulkDelete(ids)
    return Math.min(overflow, ids.length)
  }
}

export const snapshotMetadataStore = new SnapshotMetadataStore()
