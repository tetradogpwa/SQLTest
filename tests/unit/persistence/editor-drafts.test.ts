/**
 * Tests for `EditorDraftStore` — the debounced-autosave target. Note
 * that debounce itself lives in the React hook; this suite only
 * exercises the storage layer.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { EditorDraftStore } from '../../../src/core/persistence/editor-drafts'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'

describe('EditorDraftStore', () => {
  let db: SqlAcademyDB
  let store: EditorDraftStore

  beforeEach(() => {
    db = createTestDb()
    store = new EditorDraftStore(db)
  })

  afterEach(async () => {
    await resetTestDb(db)
  })

  /* ------------------------------------------------------------------ *
   *  save / load                                                          *
   * ------------------------------------------------------------------ */

  it('round-trips a draft', async () => {
    await store.saveDraft('exercise', 'ex-1', 'SELECT 1')
    const loaded = await store.loadDraft('exercise', 'ex-1')
    expect(loaded).toBe('SELECT 1')
  })

  it('returns null for a draft that was never saved', async () => {
    const loaded = await store.loadDraft('exercise', 'never')
    expect(loaded).toBeNull()
  })

  it('keeps drafts of different contexts isolated', async () => {
    await store.saveDraft('exercise', 'ex-1', 'SELECT 1')
    await store.saveDraft('playground', 'pg-1', 'CREATE TABLE t(x INT)')
    expect(await store.loadDraft('exercise', 'ex-1')).toBe('SELECT 1')
    expect(await store.loadDraft('playground', 'pg-1')).toBe('CREATE TABLE t(x INT)')
  })

  it('upserts on re-save (one row per context)', async () => {
    await store.saveDraft('exercise', 'ex-1', 'SELECT 1')
    await store.saveDraft('exercise', 'ex-1', 'SELECT 2')
    const drafts = await store.getDraftsByContext('exercise')
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.content).toBe('SELECT 2')
  })

  /* ------------------------------------------------------------------ *
   *  delete                                                               *
   * ------------------------------------------------------------------ */

  it('deletes a single draft', async () => {
    await store.saveDraft('exercise', 'ex-1', 'SELECT 1')
    await store.deleteDraft('exercise', 'ex-1')
    expect(await store.loadDraft('exercise', 'ex-1')).toBeNull()
  })

  it('deleteDraft is a no-op for an unknown draft', async () => {
    await expect(
      store.deleteDraft('exercise', 'never'),
    ).resolves.toBeUndefined()
  })

  /* ------------------------------------------------------------------ *
   *  getMostRecentDraft                                                   *
   * ------------------------------------------------------------------ */

  it('returns the most recent draft across all contexts', async () => {
    await store.saveDraft('exercise', 'ex-1', 'SELECT 1')
    await new Promise((r) => setTimeout(r, 5))
    await store.saveDraft('playground', 'pg-1', 'CREATE TABLE t(x INT)')
    const recent = await store.getMostRecentDraft()
    expect(recent?.contextType).toBe('playground')
    expect(recent?.content).toBe('CREATE TABLE t(x INT)')
  })

  it('returns null when there are no drafts at all', async () => {
    expect(await store.getMostRecentDraft()).toBeNull()
  })

  /* ------------------------------------------------------------------ *
   *  pruneOlderThan                                                       *
   * ------------------------------------------------------------------ */

  it('prunes drafts older than the cutoff and returns the count', async () => {
    await store.saveDraft('exercise', 'ex-1', 'old')
    // Backdate the row by writing then manually updating updatedAt.
    const all = await store.getDraftsByContext('exercise')
    expect(all).toHaveLength(1)
    const id = all[0]?.id
    expect(id).toBeDefined()
    await db.editorDrafts.update(id!, { updatedAt: Date.now() - 10_000 })

    await store.saveDraft('exercise', 'ex-2', 'fresh')
    const removed = await store.pruneOlderThan(5_000)
    expect(removed).toBe(1)
    expect(await store.loadDraft('exercise', 'ex-1')).toBeNull()
    expect(await store.loadDraft('exercise', 'ex-2')).toBe('fresh')
  })

  it('returns 0 when no drafts are old enough', async () => {
    await store.saveDraft('exercise', 'ex-1', 'fresh')
    const removed = await store.pruneOlderThan(60_000)
    expect(removed).toBe(0)
  })
})
