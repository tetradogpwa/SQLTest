/**
 * Tests for `QueryHistoryStore` — covers insertion, retrieval, and
 * the 100-entry LRU cap.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QueryHistoryStore } from '../../../src/core/persistence/query-history'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'

describe('QueryHistoryStore', () => {
  let db: SqlAcademyDB
  let store: QueryHistoryStore

  beforeEach(() => {
    db = createTestDb()
    store = new QueryHistoryStore(db)
  })

  afterEach(async () => {
    await resetTestDb(db)
  })

  /* ------------------------------------------------------------------ *
   *  addEntry / getRecent                                                 *
   * ------------------------------------------------------------------ */

  it('appends an entry and getRecent returns it', async () => {
    await store.addEntry(1, 'SELECT 1', true, 5)
    const recent = await store.getRecent(1)
    expect(recent).toHaveLength(1)
    expect(recent[0]?.sql).toBe('SELECT 1')
    expect(recent[0]?.success).toBe(true)
    expect(recent[0]?.executionMs).toBe(5)
  })

  it('returns entries newest-first', async () => {
    await store.addEntry(1, 'SELECT 1', true, 1)
    await new Promise((r) => setTimeout(r, 2))
    await store.addEntry(1, 'SELECT 2', true, 1)
    const recent = await store.getRecent(1)
    expect(recent[0]?.sql).toBe('SELECT 2')
    expect(recent[1]?.sql).toBe('SELECT 1')
  })

  it('filters by dbId', async () => {
    await store.addEntry(1, 'SELECT 1', true, 1)
    await store.addEntry(2, 'SELECT 2', true, 1)
    expect(await store.getRecent(1)).toHaveLength(1)
    expect(await store.getRecent(2)).toHaveLength(1)
    expect((await store.getRecent(1))[0]?.sql).toBe('SELECT 1')
    expect((await store.getRecent(2))[0]?.sql).toBe('SELECT 2')
  })

  it('honors the limit argument', async () => {
    for (let i = 0; i < 5; i += 1) {
      await store.addEntry(1, `SELECT ${i}`, true, 1)
      await new Promise((r) => setTimeout(r, 1))
    }
    const recent = await store.getRecent(1, 3)
    expect(recent).toHaveLength(3)
    // Newest first → 4, 3, 2.
    expect(recent.map((r) => r.sql)).toEqual(['SELECT 4', 'SELECT 3', 'SELECT 2'])
  })

  it('records failed queries with an error message', async () => {
    await store.addEntry(1, 'SELECT bogus', false, 5, 'no such column: bogus')
    const recent = await store.getRecent(1)
    expect(recent[0]?.success).toBe(false)
    expect(recent[0]?.errorMessage).toBe('no such column: bogus')
  })

  /* ------------------------------------------------------------------ *
   *  enforceLimit — the 101st entry evicts the first                     *
   * ------------------------------------------------------------------ */

  it('enforceLimit trims the history to the default cap of 100', async () => {
    // Insert 105 entries; the oldest 5 must be evicted.
    for (let i = 0; i < 105; i += 1) {
      await store.addEntry(1, `SELECT ${i}`, true, 1)
    }
    const removed = await store.enforceLimit(1)
    expect(removed).toBe(5)
    const all = await store.getRecent(1)
    expect(all).toHaveLength(100)
    // Newest entry is preserved.
    expect(all[0]?.sql).toBe('SELECT 104')
    // The oldest 5 (SELECT 0..SELECT 4) are gone.
    expect(all.some((r) => r.sql === 'SELECT 0')).toBe(false)
    expect(all.some((r) => r.sql === 'SELECT 4')).toBe(false)
  })

  it('enforceLimit is a no-op when below the cap', async () => {
    await store.addEntry(1, 'SELECT 1', true, 1)
    const removed = await store.enforceLimit(1)
    expect(removed).toBe(0)
  })

  it('enforceLimit honours a custom cap', async () => {
    for (let i = 0; i < 10; i += 1) {
      await store.addEntry(1, `SELECT ${i}`, true, 1)
    }
    const removed = await store.enforceLimit(1, 3)
    expect(removed).toBe(7)
    const all = await store.getRecent(1)
    expect(all).toHaveLength(3)
  })

  /* ------------------------------------------------------------------ *
   *  clear                                                                *
   * ------------------------------------------------------------------ */

  it('clear drops every entry for a given dbId only', async () => {
    await store.addEntry(1, 'SELECT 1', true, 1)
    await store.addEntry(2, 'SELECT 2', true, 1)
    await store.clear(1)
    expect(await store.getRecent(1)).toEqual([])
    expect(await store.getRecent(2)).toHaveLength(1)
  })
})
