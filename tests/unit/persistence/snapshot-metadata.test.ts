/**
 * Tests for `SnapshotMetadataStore` — insert, list, lookup by
 * `snapshotId`, and the LRU prune.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SnapshotMetadataStore } from '../../../src/core/persistence/snapshot-metadata-store'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'

describe('SnapshotMetadataStore', () => {
  let db: SqlAcademyDB
  let store: SnapshotMetadataStore

  beforeEach(() => {
    db = createTestDb()
    store = new SnapshotMetadataStore(db)
  })

  afterEach(async () => {
    await resetTestDb(db)
  })

  /* ------------------------------------------------------------------ *
   *  add / listByDb                                                       *
   * ------------------------------------------------------------------ */

  it('add inserts a row and listByDb returns it', async () => {
    const id = await store.add({
      dbId: 'db-1',
      snapshotId: 'snap-1',
      label: 'before DELETE',
      createdAt: 1000,
      sizeBytes: 512,
      reason: 'manual',
    })
    expect(typeof id).toBe('number')
    const list = await store.listByDb('db-1')
    expect(list).toHaveLength(1)
    expect(list[0]?.snapshotId).toBe('snap-1')
  })

  it('listByDb orders by createdAt desc', async () => {
    await store.add({ dbId: 'db-1', snapshotId: 's1', label: '', createdAt: 1000, sizeBytes: 1, reason: 'auto' })
    await store.add({ dbId: 'db-1', snapshotId: 's2', label: '', createdAt: 3000, sizeBytes: 1, reason: 'auto' })
    await store.add({ dbId: 'db-1', snapshotId: 's3', label: '', createdAt: 2000, sizeBytes: 1, reason: 'auto' })
    const list = await store.listByDb('db-1')
    expect(list.map((r) => r.snapshotId)).toEqual(['s2', 's3', 's1'])
  })

  /* ------------------------------------------------------------------ *
   *  getById / getBySnapshotId                                            *
   * ------------------------------------------------------------------ */

  it('getById fetches a single row by its primary key', async () => {
    const id = await store.add({
      dbId: 'db-1', snapshotId: 's1', label: 'l',
      createdAt: 1, sizeBytes: 1, reason: 'manual',
    })
    const got = await store.getById(id)
    expect(got?.snapshotId).toBe('s1')
  })

  it('getBySnapshotId finds the row by the OPFS filename', async () => {
    await store.add({ dbId: 'db-1', snapshotId: 'snap-abc', label: '', createdAt: 1, sizeBytes: 1, reason: 'auto' })
    await store.add({ dbId: 'db-1', snapshotId: 'snap-def', label: '', createdAt: 2, sizeBytes: 1, reason: 'auto' })
    const got = await store.getBySnapshotId('db-1', 'snap-def')
    expect(got?.snapshotId).toBe('snap-def')
  })

  /* ------------------------------------------------------------------ *
   *  remove / removeByDb                                                  *
   * ------------------------------------------------------------------ */

  it('remove drops a single row', async () => {
    const id = await store.add({ dbId: 'db-1', snapshotId: 's1', label: '', createdAt: 1, sizeBytes: 1, reason: 'auto' })
    await store.remove(id)
    expect(await store.getById(id)).toBeUndefined()
  })

  it('removeByDb drops every row for a dbId', async () => {
    await store.add({ dbId: 'db-1', snapshotId: 'a', label: '', createdAt: 1, sizeBytes: 1, reason: 'auto' })
    await store.add({ dbId: 'db-1', snapshotId: 'b', label: '', createdAt: 2, sizeBytes: 1, reason: 'auto' })
    await store.add({ dbId: 'db-2', snapshotId: 'c', label: '', createdAt: 3, sizeBytes: 1, reason: 'auto' })
    await store.removeByDb('db-1')
    expect(await store.listByDb('db-1')).toEqual([])
    expect(await store.listByDb('db-2')).toHaveLength(1)
  })

  /* ------------------------------------------------------------------ *
   *  prune — LRU                                                          *
   * ------------------------------------------------------------------ */

  it('prune keeps the 5 newest, drops the rest', async () => {
    for (let i = 0; i < 8; i += 1) {
      await store.add({
        dbId: 'db-1', snapshotId: `s${i}`, label: '',
        createdAt: 1000 + i, sizeBytes: 1, reason: 'auto',
      })
    }
    const removed = await store.prune('db-1', 5)
    expect(removed).toBe(3)
    const kept = await store.listByDb('db-1')
    expect(kept).toHaveLength(5)
    expect(kept.map((r) => r.snapshotId)).toEqual(['s7', 's6', 's5', 's4', 's3'])
  })

  it('prune is a no-op when below the cap', async () => {
    await store.add({ dbId: 'db-1', snapshotId: 'a', label: '', createdAt: 1, sizeBytes: 1, reason: 'auto' })
    expect(await store.prune('db-1', 5)).toBe(0)
  })
})
