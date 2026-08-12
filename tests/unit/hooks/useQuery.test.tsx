/**
 * Tests for the useQuery hook.
 *
 * Mocks the Worker by injecting a fake `api` into `useDatabase` so
 * the hook can be exercised without spinning up a real Worker. The
 * tests cover the basic flow (run / result / error / history) plus
 * the timeout-cancellation path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'

import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'

import { useDatabase, __resetDatabaseSession, type DBApi } from '../../../src/hooks/useDatabase'
import { useQuery, MAX_HISTORY_ENTRIES } from '../../../src/hooks/useQuery'
import { db as defaultDb } from '../../../src/core/persistence/dexie'

// ────────────────────────────────────────────────────────────────────
// Test DB + module reset
// ────────────────────────────────────────────────────────────────────

let testDb: SqlAcademyDB

beforeEach(async () => {
  testDb = createTestDb()
  __resetDatabaseSession()
  // Wipe the shared singleton so history is clean for each test.
  await defaultDb.queryHistory.clear()
})

afterEach(async () => {
  await resetTestDb(testDb)
  cleanup()
})

// ────────────────────────────────────────────────────────────────────
// Fake DBAPI factory
// ────────────────────────────────────────────────────────────────────

type FakeApi = {
  [K in keyof DBApi]: ReturnType<typeof vi.fn>
}

function makeFakeApi(): FakeApi {
  return {
    init: vi.fn(async () => ({ capability: 'memory', sqliteVersion: '3.45.0', vfsName: ':memory:' })),
    exec: vi.fn(async () => ({
      ok: true,
      columns: [],
      rows: [],
      executionMs: 0,
      statementKind: 'other',
    })),
    cancel: vi.fn(async () => undefined),
    schema: vi.fn(async () => ({ tables: [], views: [], indexes: [], triggers: [] })),
    open: vi.fn(async () => ({ filename: 'test', sizeBytes: 0 })),
    close: vi.fn(async () => undefined),
    closeAll: vi.fn(async () => undefined),
    listUserDatabases: vi.fn(async () => []),
    deleteUserDatabase: vi.fn(async () => undefined),
    import: vi.fn(),
    export: vi.fn(),
    listSnapshots: vi.fn(async () => []),
    snapshot: vi.fn(),
    restore: vi.fn(async () => undefined),
    deleteSnapshot: vi.fn(async () => undefined),
  } as FakeApi
}

// ────────────────────────────────────────────────────────────────────
// Test harness
// ────────────────────────────────────────────────────────────────────

type QueryState = ReturnType<typeof useQuery>

function Harness({ api, dbId }: { api: FakeApi; dbId: number }): ReactNode {
  const { setActiveDb } = useDatabase({
    api: api as unknown as never,
    disabled: true,
  })
  const state = useQuery()
  useEffect(() => {
    setActiveDb(dbId)
  }, [dbId, setActiveDb])
  // Expose state on globalThis for the test to read. We use a
  // ref-style read in a useEffect that fires once on mount + when
  // the relevant primitive fields change.
  useEffect(() => {
    ;(globalThis as { __LAST_QUERY_STATE?: QueryState }).__LAST_QUERY_STATE = state
  })
  return null
}

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

function lastState(): QueryState {
  const s = (globalThis as { __LAST_QUERY_STATE?: QueryState }).__LAST_QUERY_STATE
  if (!s) throw new Error('no state')
  return s
}

describe('useQuery', () => {
  it('runs a successful query and surfaces the result', async () => {
    const api = makeFakeApi()
    api.exec.mockResolvedValue({
      ok: true,
      columns: ['id', 'name'],
      rows: [[1, 'Ada']],
      executionMs: 7,
      statementKind: 'select',
    })
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState()).toBeDefined())
    await act(async () => {
      await lastState().run('SELECT * FROM users')
    })
    await waitFor(() => expect(lastState().result?.ok).toBe(true))
    expect(lastState().result?.columns).toEqual(['id', 'name'])
    expect(lastState().result?.rows).toEqual([[1, 'Ada']])
    expect(lastState().error).toBeNull()
  })

  it('captures the SerializedError when the query fails', async () => {
    const api = makeFakeApi()
    api.exec.mockResolvedValue({
      ok: false,
      error: {
        code: 'SQLITE_ERROR',
        message: 'no such table: userss',
        translatedMessage: 'No existe la tabla `userss`',
        offendingToken: 'userss',
        table: 'userss',
        hints: ['¿Quisiste decir `users`?'],
      },
      executionMs: 1,
      statementKind: 'select',
    })
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState()).toBeDefined())
    await act(async () => {
      await lastState().run('SELECT * FROM userss')
    })
    await waitFor(() => expect(lastState().error).not.toBeNull())
    expect(lastState().error?.offendingToken).toBe('userss')
    expect(lastState().error?.table).toBe('userss')
  })

  it('persists the run to the query history store', async () => {
    const api = makeFakeApi()
    api.exec.mockResolvedValue({
      ok: true,
      columns: ['x'],
      rows: [[1]],
      executionMs: 1,
      statementKind: 'select',
    })
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState()).toBeDefined())
    await act(async () => {
      await lastState().run('SELECT 1')
    })
    await waitFor(() => expect(lastState().history.length).toBeGreaterThan(0))
    expect(lastState().history[0]?.sql).toBe('SELECT 1')
    expect(lastState().history[0]?.success).toBe(true)
  })

  it('cancels a long-running query via the timeout', async () => {
    const api = makeFakeApi()
    const resolveExecRef: { current: ((v: unknown) => void) | null } = { current: null }
    api.exec.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExecRef.current = resolve
        }),
    )
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState()).toBeDefined())
    await act(async () => {
      void lastState().run('SELECT heavy_query()', { timeoutMs: 30 })
    })
    // The cancel call should fire before the timeout elapses.
    await waitFor(
      () => {
        expect(api.cancel).toHaveBeenCalled()
      },
      { timeout: 500 },
    )
    // Cleanup: resolve the hanging exec promise so the test process
    // can exit cleanly.
    resolveExecRef.current?.({
      ok: false,
      error: { code: 'TIMEOUT', message: 'timeout', translatedMessage: 'timeout' },
      executionMs: 30,
      statementKind: 'select',
    })
  })

  it('clearHistory wipes the history for the active db', async () => {
    const api = makeFakeApi()
    api.exec.mockResolvedValue({
      ok: true,
      columns: ['x'],
      rows: [[1]],
      executionMs: 1,
      statementKind: 'select',
    })
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState()).toBeDefined())
    await act(async () => {
      await lastState().run('SELECT 1')
    })
    await waitFor(() => expect(lastState().history.length).toBe(1))
    await act(async () => {
      await lastState().clearHistory()
    })
    await waitFor(() => expect(lastState().history.length).toBe(0))
  })

  it('exports MAX_HISTORY_ENTRIES = 10', () => {
    expect(MAX_HISTORY_ENTRIES).toBe(10)
  })

  it('persists a successful run to queryHistory', async () => {
    const api = makeFakeApi()
    api.exec.mockResolvedValue({
      ok: true,
      columns: ['x'],
      rows: [[1]],
      executionMs: 3,
      statementKind: 'select',
    })
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState()).toBeDefined())
    await act(async () => {
      await lastState().run('SELECT 1')
    })
    await waitFor(() => expect(lastState().result?.ok).toBe(true))
    // The hook persists the entry; the live query should pick it
    // up and surface it in `history`.
    await waitFor(() => expect(lastState().history.length).toBe(1))
    expect(lastState().history[0]?.sql).toBe('SELECT 1')
    expect(lastState().history[0]?.success).toBe(true)
  })

  it('persists a failed run to queryHistory with the error message', async () => {
    const api = makeFakeApi()
    api.exec.mockResolvedValue({
      ok: false,
      error: {
        code: 'SQLITE_ERROR',
        message: 'no such table: foo',
        translatedMessage: 'No existe la tabla `foo`',
      },
      executionMs: 1,
      statementKind: 'select',
    })
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState()).toBeDefined())
    await act(async () => {
      await lastState().run('SELECT * FROM foo')
    })
    await waitFor(() => expect(lastState().error).not.toBeNull())
    await waitFor(() => expect(lastState().history.length).toBe(1))
    expect(lastState().history[0]?.sql).toBe('SELECT * FROM foo')
    expect(lastState().history[0]?.success).toBe(false)
    expect(lastState().history[0]?.errorMessage).toBe('no such table: foo')
  })

  it('captures Comlink rejections as a generic SerializedError (worker died)', async () => {
    const api = makeFakeApi()
    api.exec.mockRejectedValue(new Error('Worker terminated'))
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState()).toBeDefined())
    await act(async () => {
      await lastState().run('SELECT 1')
    })
    await waitFor(() => expect(lastState().error).not.toBeNull())
    expect(lastState().error?.code).toBe('WORKER_TERMINATED')
    expect(lastState().error?.translatedMessage).toMatch(/interrumpido/i)
    // A failed run is still persisted to history.
    await waitFor(() => expect(lastState().history.length).toBe(1))
    expect(lastState().history[0]?.success).toBe(false)
  })

  it('does NOT persist history when persistHistory: false', async () => {
    const api = makeFakeApi()
    api.exec.mockResolvedValue({
      ok: true,
      columns: ['x'],
      rows: [[1]],
      executionMs: 1,
      statementKind: 'select',
    })
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState()).toBeDefined())
    await act(async () => {
      await lastState().run('SELECT 1', { persistHistory: false })
    })
    await waitFor(() => expect(lastState().result?.ok).toBe(true))
    // The hook ran the query but did not append to history.
    expect(lastState().history.length).toBe(0)
  })
})
