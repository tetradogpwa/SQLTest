/**
 * Tests for `PersistenceService` — the Worker → Dexie bridge. We do
 * not spin up a real Worker; the service is fully usable without
 * `attach()` and the message handlers are the only behaviour that
 * matters in this POC.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { persistence, type PersistenceMessage } from '../../../src/core/persistence/persistence-service'
import { editorDrafts } from '../../../src/core/persistence/editor-drafts'
import { dbMetadata } from '../../../src/core/persistence/db-metadata'
import { queryHistory } from '../../../src/core/persistence/query-history'
import { snapshotMetadataStore } from '../../../src/core/persistence/snapshot-metadata-store'
import { undoStore } from '../../../src/core/persistence/undo-store'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'

describe('PersistenceService', () => {
  let db: SqlAcademyDB

  beforeEach(() => {
    // Force the singletons to use a fresh DB. We do this by
    // instantiating the stores the service delegates to with a
    // unique DB name. The simplest way is to re-import the modules
    // with a `vi.resetModules()` + `vi.doMock`, but a less invasive
    // approach is to clear the default DB between tests. The default
    // singleton is shared across tests in the file, so we use a
    // `beforeEach` to wipe the affected tables.
    db = createTestDb()
  })

  afterEach(async () => {
    // Reset the default singleton's tables so the next test starts
    // clean. We open the default singleton and clear everything.
    const { db: defaultDb } = await import('../../../src/core/persistence/dexie')
    await Promise.all([
      defaultDb.settings.clear(),
      defaultDb.progress.clear(),
      defaultDb.databases.clear(),
      defaultDb.queryHistory.clear(),
      defaultDb.savedQueries.clear(),
      defaultDb.editorDrafts.clear(),
      defaultDb.snapshotMetadata.clear(),
      defaultDb.undoHistory.clear(),
      defaultDb.exerciseStats.clear(),
    ])
    await resetTestDb(db)
  })

  /* ------------------------------------------------------------------ *
   *  attach / detach                                                      *
   * ------------------------------------------------------------------ */

  it('starts detached and reports isAttached() === false', () => {
    expect(persistence.isAttached()).toBe(false)
    expect(persistence.getWorkerApi()).toBeNull()
  })

  it('attach / detach toggles the worker reference', () => {
    const fakeWorker = { restore: async () => undefined }
    persistence.attach(fakeWorker)
    expect(persistence.isAttached()).toBe(true)
    expect(persistence.getWorkerApi()).toBe(fakeWorker)
    persistence.detach()
    expect(persistence.isAttached()).toBe(false)
  })

  /* ------------------------------------------------------------------ *
   *  handleMessage — one assertion per variant                           *
   * ------------------------------------------------------------------ */

  it('snapshot:created → adds a row to snapshotMetadata', async () => {
    const msg: PersistenceMessage = {
      type: 'snapshot:created',
      dbId: 'db-1',
      snapId: 'snap-1',
      label: 'before DELETE',
      sizeBytes: 256,
      reason: 'manual',
      timestamp: 1000,
    }
    await persistence.handleMessage(msg)
    const got = await snapshotMetadataStore.getBySnapshotId('db-1', 'snap-1')
    expect(got?.sizeBytes).toBe(256)
    expect(got?.reason).toBe('manual')
  })

  it('undo:entry → adds a row to undoStore', async () => {
    const msg: PersistenceMessage = {
      type: 'undo:entry',
      dbId: 'db-1',
      operation: 'DELETE FROM users',
      operationType: 'dml',
      affectedRows: 15,
      timestamp: 2000,
      snapshotId: 'snap-1',
      description: 'DELETE FROM users (15 filas)',
    }
    await persistence.handleMessage(msg)
    const recent = await undoStore.listRecent('db-1')
    expect(recent).toHaveLength(1)
    expect(recent[0]?.affectedRows).toBe(15)
  })

  it('query:executed → adds a row to queryHistory', async () => {
    const msg: PersistenceMessage = {
      type: 'query:executed',
      dbId: 7,
      sql: 'SELECT 1',
      success: true,
      executionMs: 4,
      timestamp: 3000,
    }
    await persistence.handleMessage(msg)
    const recent = await queryHistory.getRecent(7)
    expect(recent).toHaveLength(1)
    expect(recent[0]?.sql).toBe('SELECT 1')
  })

  it('db:registered → inserts a new row, or refreshes size if it already exists', async () => {
    await persistence.handleMessage({
      type: 'db:registered',
      dbId: 'db-1',
      name: 'Library',
      sizeBytes: 1024,
      timestamp: 1000,
    })
    const got = await dbMetadata.get('db-1')
    expect(got?.name).toBe('Library')
    expect(got?.sizeBytes).toBe(1024)

    // A second registration (e.g. after a re-import) must NOT throw
    // — the service refreshes the size instead.
    await persistence.handleMessage({
      type: 'db:registered',
      dbId: 'db-1',
      name: 'Library',
      sizeBytes: 2048,
      timestamp: 2000,
    })
    const got2 = await dbMetadata.get('db-1')
    expect(got2?.sizeBytes).toBe(2048)
  })

  it('db:deleted → cascades through every related store', async () => {
    // Seed: one snapshot, one undo entry, one dbMetadata row.
    await snapshotMetadataStore.add({
      dbId: 'db-1', snapshotId: 's1', label: '',
      createdAt: 1, sizeBytes: 1, reason: 'manual',
    })
    await undoStore.addEntry({
      dbId: 'db-1', operation: 'a', operationType: 'dml',
      timestamp: 1, snapshotId: 's1', description: '',
    })
    await dbMetadata.register('db-1', 'Library', 100)
    await persistence.handleMessage({
      type: 'db:deleted',
      dbId: 'db-1',
      timestamp: 9_999,
    })
    expect(await dbMetadata.get('db-1')).toBeUndefined()
    expect(await snapshotMetadataStore.listByDb('db-1')).toEqual([])
    expect(await undoStore.listRecent('db-1')).toEqual([])
  })

  it('db:sizeChanged → updates only the size column', async () => {
    await dbMetadata.register('db-1', 'A', 100)
    await persistence.handleMessage({
      type: 'db:sizeChanged',
      dbId: 'db-1',
      sizeBytes: 999,
      timestamp: 1000,
    })
    const got = await dbMetadata.get('db-1')
    expect(got?.sizeBytes).toBe(999)
    expect(got?.name).toBe('A') // unchanged
  })

  /* ------------------------------------------------------------------ *
   *  draft helpers — delegate to editorDrafts                            *
   * ------------------------------------------------------------------ */

  it('saveDraft / loadDraft delegate to editorDrafts', async () => {
    await persistence.saveDraft('exercise', 'ex-1', 'SELECT 1')
    expect(await persistence.loadDraft('exercise', 'ex-1')).toBe('SELECT 1')
    expect(await editorDrafts.loadDraft('exercise', 'ex-1')).toBe('SELECT 1')
  })

  it('deleteDraft removes the draft', async () => {
    await persistence.saveDraft('exercise', 'ex-1', 'SELECT 1')
    await persistence.deleteDraft('exercise', 'ex-1')
    expect(await persistence.loadDraft('exercise', 'ex-1')).toBeNull()
  })
})
