/**
 * Tests for `SavedQueriesStore` — CRUD plus the case-insensitive
 * `search()` helper.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SavedQueriesStore } from '../../../src/core/persistence/saved-queries'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'

describe('SavedQueriesStore', () => {
  let db: SqlAcademyDB
  let store: SavedQueriesStore

  beforeEach(() => {
    db = createTestDb()
    store = new SavedQueriesStore(db)
  })

  afterEach(async () => {
    await resetTestDb(db)
  })

  /* ------------------------------------------------------------------ *
   *  save / getById                                                       *
   * ------------------------------------------------------------------ */

  it('save persists the row and returns the new id', async () => {
    const id = await store.save(1, 'Top users', 'SELECT * FROM users LIMIT 10', 'First 10 users')
    expect(typeof id).toBe('number')
    const got = await store.getById(id)
    expect(got?.name).toBe('Top users')
    expect(got?.sql).toBe('SELECT * FROM users LIMIT 10')
    expect(got?.description).toBe('First 10 users')
    expect(got?.createdAt).toBe(got?.updatedAt)
  })

  it('save without a description leaves the field undefined', async () => {
    const id = await store.save(1, 'Q', 'SELECT 1')
    const got = await store.getById(id)
    expect(got?.description).toBeUndefined()
  })

  /* ------------------------------------------------------------------ *
   *  update                                                               *
   * ------------------------------------------------------------------ */

  it('update applies a partial patch and bumps updatedAt', async () => {
    const id = await store.save(1, 'Old', 'SELECT 1')
    const before = await store.getById(id)
    await new Promise((r) => setTimeout(r, 2))
    await store.update(id, { name: 'New' })
    const after = await store.getById(id)
    expect(after?.name).toBe('New')
    expect(after?.sql).toBe('SELECT 1') // untouched
    expect((after?.updatedAt ?? 0) > (before?.updatedAt ?? 0)).toBe(true)
  })

  /* ------------------------------------------------------------------ *
   *  delete                                                               *
   * ------------------------------------------------------------------ */

  it('delete removes the row', async () => {
    const id = await store.save(1, 'Q', 'SELECT 1')
    await store.delete(id)
    expect(await store.getById(id)).toBeUndefined()
  })

  /* ------------------------------------------------------------------ *
   *  listByDb / listAll                                                   *
   * ------------------------------------------------------------------ */

  it('listByDb filters by dbId and orders by updatedAt desc', async () => {
    const a = await store.save(1, 'A1', 'SELECT 1')
    await new Promise((r) => setTimeout(r, 2))
    const a2 = await store.save(1, 'A2', 'SELECT 2')
    await store.save(2, 'B1', 'SELECT 3')
    const rows = await store.listByDb(1)
    expect(rows.map((r) => r.id)).toEqual([a2, a])
  })

  it('listAll returns every row', async () => {
    await store.save(1, 'A', 'SELECT 1')
    await store.save(2, 'B', 'SELECT 2')
    const all = await store.listAll()
    expect(all).toHaveLength(2)
  })

  /* ------------------------------------------------------------------ *
   *  search                                                               *
   * ------------------------------------------------------------------ */

  it('search matches name case-insensitively', async () => {
    await store.save(1, 'Top users', 'SELECT * FROM users LIMIT 10')
    await store.save(1, 'Active orders', 'SELECT * FROM orders')
    const hits = await store.search('top')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.name).toBe('Top users')
  })

  it('search matches the SQL body', async () => {
    await store.save(1, 'Q1', 'SELECT * FROM products WHERE price > 100')
    await store.save(1, 'Q2', 'SELECT * FROM users')
    const hits = await store.search('products')
    expect(hits).toHaveLength(1)
  })

  it('search matches the description', async () => {
    await store.save(1, 'Q1', 'SELECT 1', 'count of things')
    const hits = await store.search('count')
    expect(hits).toHaveLength(1)
  })

  it('search with empty string returns everything', async () => {
    await store.save(1, 'A', 'SELECT 1')
    await store.save(2, 'B', 'SELECT 2')
    expect(await store.search('')).toHaveLength(2)
  })
})
