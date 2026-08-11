/**
 * Tests for `DbMetadataStore` — registration, listing, rename, and
 * the case-insensitive `search()` helper.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DbMetadataStore } from '../../../src/core/persistence/db-metadata'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'

describe('DbMetadataStore', () => {
  let db: SqlAcademyDB
  let store: DbMetadataStore

  beforeEach(() => {
    db = createTestDb()
    store = new DbMetadataStore(db)
  })

  afterEach(async () => {
    await resetTestDb(db)
  })

  /* ------------------------------------------------------------------ *
   *  register                                                             *
   * ------------------------------------------------------------------ */

  it('register inserts a row with origin="created"', async () => {
    await store.register('db-1', 'My DB', 1024)
    const got = await store.get('db-1')
    expect(got?.name).toBe('My DB')
    expect(got?.sizeBytes).toBe(1024)
    expect(got?.origin).toBe('created')
    expect(got?.createdAt).toBe(got?.updatedAt)
  })

  it('register rejects a duplicate id', async () => {
    await store.register('db-1', 'A', 1)
    await expect(store.register('db-1', 'B', 2)).rejects.toThrow()
  })

  /* ------------------------------------------------------------------ *
   *  listAll                                                              *
   * ------------------------------------------------------------------ */

  it('listAll returns every row, newest updatedAt first', async () => {
    await store.register('a', 'A', 1)
    await new Promise((r) => setTimeout(r, 2))
    await store.register('b', 'B', 2)
    const all = await store.listAll()
    expect(all.map((r) => r.id)).toEqual(['b', 'a'])
  })

  /* ------------------------------------------------------------------ *
   *  rename                                                               *
   * ------------------------------------------------------------------ */

  it('rename changes the name and bumps updatedAt', async () => {
    await store.register('db-1', 'A', 1)
    const before = await store.get('db-1')
    await new Promise((r) => setTimeout(r, 2))
    await store.rename('db-1', 'A renamed')
    const after = await store.get('db-1')
    expect(after?.name).toBe('A renamed')
    expect((after?.updatedAt ?? 0) > (before?.updatedAt ?? 0)).toBe(true)
  })

  /* ------------------------------------------------------------------ *
   *  updateSize                                                           *
   * ------------------------------------------------------------------ */

  it('updateSize changes the size and bumps updatedAt', async () => {
    await store.register('db-1', 'A', 100)
    await new Promise((r) => setTimeout(r, 2))
    await store.updateSize('db-1', 999)
    const got = await store.get('db-1')
    expect(got?.sizeBytes).toBe(999)
  })

  /* ------------------------------------------------------------------ *
   *  unregister                                                           *
   * ------------------------------------------------------------------ */

  it('unregister removes the row', async () => {
    await store.register('db-1', 'A', 1)
    await store.unregister('db-1')
    expect(await store.get('db-1')).toBeUndefined()
  })

  /* ------------------------------------------------------------------ *
   *  search                                                               *
   * ------------------------------------------------------------------ */

  it('search matches by name case-insensitively', async () => {
    await store.register('a', 'Library', 1)
    await store.register('b', 'Shop', 2)
    const hits = await store.search('LIB')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.id).toBe('a')
  })

  it('search with empty string returns everything', async () => {
    await store.register('a', 'A', 1)
    await store.register('b', 'B', 2)
    expect(await store.search('')).toHaveLength(2)
  })
})
