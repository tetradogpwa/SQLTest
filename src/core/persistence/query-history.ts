/**
 * Query history store.
 *
 * A 100-entry LRU log of recently executed queries, scoped per
 * database. The store is *system-managed*: the user never deletes from
 * it directly. When the 101st entry is added for a given `dbId`, the
 * oldest is evicted (see `enforceLimit`).
 *
 * Note: this is different from `savedQueries` (user-managed) and
 * `editorDrafts` (debounced text). RESEARCH.md §12.2 covers the
 * distinction in detail.
 *
 * Failed queries are persisted with `success: false` so the user can
 * see "you tried X and got this error last time" without having to
 * re-run.
 */

import type { SqlAcademyDB } from './dexie'
import { db as defaultDb } from './dexie'
import type { QueryHistory } from './types'

/** Default cap per `dbId`; spec says 100. */
export const DEFAULT_MAX_ENTRIES_PER_DB = 100

export class QueryHistoryStore {
  private readonly db: SqlAcademyDB

  constructor(dbInstance: SqlAcademyDB = defaultDb) {
    this.db = dbInstance
  }

  /**
   * Record a query. The row is appended (not upserted) so the user can
   * see the full timeline of runs. The cap is enforced lazily by
   * `enforceLimit` so a single `addEntry` is O(1).
   */
  async addEntry(
    dbId: number,
    sql: string,
    success: boolean,
    executionMs: number,
    errorMessage?: string,
  ): Promise<void> {
    const row: QueryHistory = {
      dbId,
      sql,
      executedAt: Date.now(),
      executionMs,
      success,
      ...(errorMessage !== undefined ? { errorMessage } : {}),
    }
    await this.db.queryHistory.add(row)
  }

  /**
   * Latest `limit` entries (newest first) for a given `dbId`. If
   * `limit` is omitted the full per-db history is returned — useful
   * for the "show all" view.
   */
  async getRecent(dbId: number, limit?: number): Promise<QueryHistory[]> {
    const all = await this.db.queryHistory
      .where('dbId')
      .equals(dbId)
      .reverse()
      .sortBy('executedAt')
    return typeof limit === 'number' ? all.slice(0, limit) : all
  }

  /**
   * Drop every entry for `dbId`. Called when the user deletes the
   * database from the Playground.
   */
  async clear(dbId: number): Promise<void> {
    await this.db.queryHistory.where('dbId').equals(dbId).delete()
  }

  /**
   * Trim the history of `dbId` down to at most `maxEntries` rows
   * (default 100), keeping the *newest*. Returns the number of rows
   * removed. Safe to call on every `addEntry` (it is a no-op when
   * below the cap).
   */
  async enforceLimit(dbId: number, maxEntries: number = DEFAULT_MAX_ENTRIES_PER_DB): Promise<number> {
    const total = await this.db.queryHistory.where('dbId').equals(dbId).count()
    if (total <= maxEntries) return 0
    const overflow = total - maxEntries
    // Get the IDs of the `overflow` oldest rows.
    const oldest = await this.db.queryHistory
      .where('dbId')
      .equals(dbId)
      .sortBy('executedAt')
    const toDelete = oldest.slice(0, overflow)
    const ids = toDelete
      .map((r) => r.id)
      .filter((id): id is number => id !== undefined)
    if (ids.length === 0) return 0
    await this.db.queryHistory.bulkDelete(ids)
    return ids.length
  }
}

export const queryHistory = new QueryHistoryStore()
