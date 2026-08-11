/**
 * Tests for `UndoStore` — append, list, and the per-DB LRU cap of 5.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { UndoStore } from '../../../src/core/persistence/undo-store'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'

describe('UndoStore', () => {
  let db: SqlAcademyDB
  let store: UndoStore

  beforeEach(() => {
    db = createTestDb()
    store = new UndoStore(db)
  })

  afterEach(async () => {
    await resetTestDb(db)
  })

  /* ------------------------------------------------------------------ *
   *  addEntry                                                             *
   * ------------------------------------------------------------------ */

  it('addEntry appends a row and returns its id', async () => {
    const id = await store.addEntry({
      dbId: 'db-1',
      operation: 'DELETE FROM users',
      operationType: 'dml',
      affectedRows: 15,
      timestamp: 1000,
      snapshotId: 'snap-1',
      description: 'DELETE FROM users (15 filas)',
    })
    expect(typeof id).toBe('number')
    const recent = await store.listRecent('db-1')
    expect(recent).toHaveLength(1)
    expect(recent[0]?.description).toBe('DELETE FROM users (15 filas)')
    expect(recent[0]?.affectedRows).toBe(15)
  })

  /* ------------------------------------------------------------------ *
   *  listRecent                                                           *
   * ------------------------------------------------------------------ */

  it('listRecent returns rows newest first, optionally limited', async () => {
    for (let i = 0; i < 7; i += 1) {
      await store.addEntry({
        dbId: 'db-1',
        operation: `OP ${i}`,
        operationType: 'dml',
        timestamp: 1000 + i,
        snapshotId: `s${i}`,
        description: '',
      })
    }
    const all = await store.listRecent('db-1')
    expect(all.map((r) => r.timestamp)).toEqual([1006, 1005, 1004, 1003, 1002])
    const three = await store.listRecent('db-1', 3)
    expect(three).toHaveLength(3)
    expect(three[0]?.timestamp).toBe(1006)
  })

  /* ------------------------------------------------------------------ *
   *  prune — max 5                                                        *
   * ------------------------------------------------------------------ */

  it('addEntry enforces the default cap of 5 entries per db', async () => {
    for (let i = 0; i < 8; i += 1) {
      await store.addEntry({
        dbId: 'db-1',
        operation: `OP ${i}`,
        operationType: 'dml',
        timestamp: 1000 + i,
        snapshotId: `s${i}`,
        description: '',
      })
    }
    const all = await store.listRecent('db-1')
    expect(all).toHaveLength(5)
    // We inserted timestamps 1000..1007 (8 rows). After each insert
    // `addEntry` prunes to the cap of 5, so the oldest 3 rows are
    // dropped along the way. The final state keeps the 5 newest
    // (1003..1007).
    expect(all.map((r) => r.timestamp).sort((a, b) => a - b)).toEqual([
      1003, 1004, 1005, 1006, 1007,
    ])
  })

  it('prune returns the number of rows removed and is idempotent', async () => {
    await store.addEntry({ dbId: 'db-1', operation: 'a', operationType: 'dml', timestamp: 1, snapshotId: 's1', description: '' })
    await store.addEntry({ dbId: 'db-1', operation: 'b', operationType: 'dml', timestamp: 2, snapshotId: 's2', description: '' })
    expect(await store.prune('db-1', 5)).toBe(0)
    expect(await store.prune('db-1', 1)).toBe(1)
    expect(await store.listRecent('db-1')).toHaveLength(1)
  })

  /* ------------------------------------------------------------------ *
   *  getById / remove / removeByDb                                        *
   * ------------------------------------------------------------------ */

  it('getById fetches a row by its primary key', async () => {
    const id = await store.addEntry({ dbId: 'db-1', operation: 'a', operationType: 'dml', timestamp: 1, snapshotId: 's1', description: 'x' })
    const got = await store.getById(id)
    expect(got?.description).toBe('x')
  })

  it('remove deletes a single row', async () => {
    const id = await store.addEntry({ dbId: 'db-1', operation: 'a', operationType: 'dml', timestamp: 1, snapshotId: 's1', description: '' })
    await store.remove(id)
    expect(await store.getById(id)).toBeUndefined()
  })

  it('removeByDb drops every row for a dbId', async () => {
    await store.addEntry({ dbId: 'db-1', operation: 'a', operationType: 'dml', timestamp: 1, snapshotId: 's1', description: '' })
    await store.addEntry({ dbId: 'db-2', operation: 'b', operationType: 'dml', timestamp: 2, snapshotId: 's2', description: '' })
    await store.removeByDb('db-1')
    expect(await store.listRecent('db-1')).toEqual([])
    expect(await store.listRecent('db-2')).toHaveLength(1)
  })
})
