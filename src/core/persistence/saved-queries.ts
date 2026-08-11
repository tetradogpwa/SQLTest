/**
 * Saved queries store.
 *
 * User-managed bookmarks: the user names a query, optionally
 * describes it, and can recall it later from the "Saved" panel.
 *
 * No LRU here — the user owns the list and decides when to delete.
 * `search()` is a cheap case-insensitive substring match over
 * `name`, `sql` and `description`. For larger libraries a proper
 * full-text index could be added in a future POC, but for the MVP
 * `LIKE`-style scanning over a few hundred rows is fine.
 */

import type { SqlAcademyDB } from './dexie'
import { db as defaultDb } from './dexie'
import type { SavedQuery } from './types'

export class SavedQueriesStore {
  private readonly db: SqlAcademyDB

  constructor(dbInstance: SqlAcademyDB = defaultDb) {
    this.db = dbInstance
  }

  /**
   * Persist a brand-new saved query. Returns the Dexie-assigned id so
   * the caller can immediately reference it (e.g. to highlight the
   * newly-saved row in the UI).
   */
  async save(
    dbId: number,
    name: string,
    sql: string,
    description?: string,
  ): Promise<number> {
    const now = Date.now()
    const row: SavedQuery = {
      dbId,
      name,
      sql,
      createdAt: now,
      updatedAt: now,
      ...(description !== undefined ? { description } : {}),
    }
    return this.db.savedQueries.add(row)
  }

  /**
   * Apply a partial update to an existing row. Only the fields present
   * in `changes` are touched. `updatedAt` is bumped automatically.
   */
  async update(id: number, changes: Partial<SavedQuery>): Promise<void> {
    const next: Partial<SavedQuery> = { ...changes, updatedAt: Date.now() }
    // Strip `id` defensively so callers cannot accidentally rewrite
    // the primary key.
    delete next.id
    await this.db.savedQueries.update(id, next)
  }

  async delete(id: number): Promise<void> {
    await this.db.savedQueries.delete(id)
  }

  async getById(id: number): Promise<SavedQuery | undefined> {
    return this.db.savedQueries.get(id)
  }

  /** All saved queries for a given `dbId`, newest first. */
  async listByDb(dbId: number): Promise<SavedQuery[]> {
    const rows = await this.db.savedQueries.where('dbId').equals(dbId).toArray()
    return rows.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** All saved queries across all DBs, newest first. */
  async listAll(): Promise<SavedQuery[]> {
    const rows = await this.db.savedQueries.toArray()
    return rows.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * Case-insensitive substring search over `name`, `sql`, and
   * `description`. Empty/whitespace `query` returns everything (caller
   * can detect this and show a "type to search" hint).
   */
  async search(query: string): Promise<SavedQuery[]> {
    const q = query.trim().toLowerCase()
    if (q === '') return this.listAll()
    const rows = await this.db.savedQueries.toArray()
    return rows
      .filter((r) => {
        if (r.name.toLowerCase().includes(q)) return true
        if (r.sql.toLowerCase().includes(q)) return true
        if (r.description && r.description.toLowerCase().includes(q)) return true
        return false
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

export const savedQueries = new SavedQueriesStore()
