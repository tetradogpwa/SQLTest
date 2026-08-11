/**
 * Database metadata store.
 *
 * Tracks the *lightweight* attributes of every user database — name,
 * size, creation time — so the UI can render the "My databases"
 * sidebar without round-tripping through the Worker. The actual
 * `.db` bytes live in OPFS, owned by the Worker; this table never
 * touches them.
 *
 * `id` is a stable string (typically a slug derived from the
 * filename, plus a short random suffix to avoid collisions when the
 * user imports two files with the same name).
 */

import type { SqlAcademyDB } from './dexie'
import { db as defaultDb } from './dexie'
import type { Database } from './types'

export class DbMetadataStore {
  private readonly db: SqlAcademyDB

  constructor(dbInstance: SqlAcademyDB = defaultDb) {
    this.db = dbInstance
  }

  /**
   * Insert a new metadata row. Throws if `id` already exists — the
   * caller is expected to pick a unique id; if the user renames or
   * re-imports, this method is the wrong API (use `rename`/`updateSize`).
   */
  async register(id: string, name: string, sizeBytes: number): Promise<void> {
    const now = Date.now()
    const row: Database = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      sizeBytes,
      origin: 'created',
    }
    await this.db.databases.add(row)
  }

  /**
   * Drop the metadata row. The Worker is responsible for deleting the
   * actual `.db` bytes in OPFS — this method only touches Dexie. The
   * PersistenceService orchestrates the two in the right order.
   */
  async unregister(id: string): Promise<void> {
    await this.db.databases.delete(id)
  }

  /**
   * Rename a database. `updatedAt` is bumped so the sidebar can show
   * "Last modified 2 minutes ago".
   */
  async rename(id: string, newName: string): Promise<void> {
    await this.db.databases.update(id, { name: newName, updatedAt: Date.now() })
  }

  /**
   * Update only the size. Called by the PersistenceService whenever
   * the Worker reports a `db:sizeChanged` event.
   */
  async updateSize(id: string, sizeBytes: number): Promise<void> {
    await this.db.databases.update(id, { sizeBytes, updatedAt: Date.now() })
  }

  async get(id: string): Promise<Database | undefined> {
    return this.db.databases.get(id)
  }

  /** All metadata rows, newest first. */
  async listAll(): Promise<Database[]> {
    const rows = await this.db.databases.toArray()
    return rows.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * Case-insensitive substring search over `name`. Used by the
   * "Search my databases" box.
   */
  async search(query: string): Promise<Database[]> {
    const q = query.trim().toLowerCase()
    if (q === '') return this.listAll()
    const rows = await this.db.databases.toArray()
    return rows
      .filter((r) => r.name.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

export const dbMetadata = new DbMetadataStore()
