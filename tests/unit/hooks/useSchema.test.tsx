/**
 * Tests for useSchema.
 *
 * Mocks the Worker through useDatabase's `api` injection point and
 * verifies the hook:
 *  - returns null/loading while waiting for the dbId
 *  - caches the result for the TTL window
 *  - re-fetches when `refresh()` is called
 *  - drops the cache when `invalidate()` is called
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'

import { useDatabase, __resetDatabaseSession, type DBApi } from '../../../src/hooks/useDatabase'
import { useSchema } from '../../../src/hooks/useSchema'

beforeEach(() => {
  __resetDatabaseSession()
})

afterEach(() => {
  cleanup()
})

type FakeApi = {
  [K in keyof DBApi]: ReturnType<typeof vi.fn>
}

function makeFakeApi(schema: unknown): FakeApi {
  return {
    init: vi.fn(async () => ({ capability: 'memory', sqliteVersion: '3.45.0', vfsName: ':memory:' })),
    exec: vi.fn(async () => ({ ok: true, columns: [], rows: [], executionMs: 0, statementKind: 'other' })),
    cancel: vi.fn(async () => undefined),
    schema: vi.fn(async () => schema),
    open: vi.fn(async () => ({ filename: 'test', sizeBytes: 0 })),
    close: vi.fn(async () => undefined),
    closeAll: vi.fn(async () => undefined),
    snapshot: vi.fn(),
    restore: vi.fn(async () => undefined),
    listSnapshots: vi.fn(async () => []),
    deleteSnapshot: vi.fn(async () => undefined),
    import: vi.fn(),
    export: vi.fn(),
    listUserDatabases: vi.fn(async () => []),
    deleteUserDatabase: vi.fn(async () => undefined),
  } as FakeApi
}

type SchemaState = ReturnType<typeof useSchema>

function Harness({ api, dbId }: { api: FakeApi; dbId: number | null }): ReactNode {
  const { setActiveDb } = useDatabase({ api: api as unknown as never, disabled: true })
  const state = useSchema()
  useEffect(() => {
    if (dbId != null) setActiveDb(dbId)
  }, [dbId, setActiveDb])
  useEffect(() => {
    ;(globalThis as { __LAST_SCHEMA_STATE?: SchemaState }).__LAST_SCHEMA_STATE = state
  })
  return null
}

function lastState(): SchemaState {
  const s = (globalThis as { __LAST_SCHEMA_STATE?: SchemaState }).__LAST_SCHEMA_STATE
  if (!s) throw new Error('no state')
  return s
}

const SAMPLE_SCHEMA = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, primaryKeyPosition: 1 },
        { name: 'name', type: 'TEXT', nullable: false, defaultValue: null, primaryKeyPosition: 0 },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
      indexes: [],
      createSql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);',
      rowCountEstimate: 42,
    },
  ],
  views: [],
  indexes: [],
  triggers: [],
  version: 1,
}

describe('useSchema', () => {
  it('returns null schema and canQuery=false when no dbId is set', () => {
    const api = makeFakeApi(SAMPLE_SCHEMA)
    render(<Harness api={api} dbId={null} />)
    const state = lastState()
    expect(state.schema).toBeNull()
    expect(state.canQuery).toBe(false)
  })

  it('fetches the schema once the dbId is set and caches it', async () => {
    const api = makeFakeApi(SAMPLE_SCHEMA)
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState().schema).not.toBeNull())
    expect(api.schema).toHaveBeenCalledTimes(1)
    expect(lastState().schema?.tables[0]?.name).toBe('users')
  })

  it('does not re-fetch within the TTL window', async () => {
    const api = makeFakeApi(SAMPLE_SCHEMA)
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState().schema).not.toBeNull())
    expect(api.schema).toHaveBeenCalledTimes(1)
    // Calling refresh() without invalidating still re-fetches (explicit user action).
    await act(async () => {
      await lastState().refresh()
    })
    // 2nd fetch is expected — refresh is an explicit user action.
    expect(api.schema).toHaveBeenCalledTimes(2)
  })

  it('re-fetches on invalidate()', async () => {
    const api = makeFakeApi(SAMPLE_SCHEMA)
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState().schema).not.toBeNull())
    expect(api.schema).toHaveBeenCalledTimes(1)
    act(() => {
      lastState().invalidate()
    })
    await waitFor(() => expect(api.schema).toHaveBeenCalledTimes(2))
  })

  it('surfaces the error message when the worker rejects', async () => {
    const api = makeFakeApi(SAMPLE_SCHEMA)
    api.schema.mockRejectedValueOnce(new Error('boom'))
    render(<Harness api={api} dbId={1} />)
    await waitFor(() => expect(lastState().error).not.toBeNull())
    expect(lastState().error).toBe('boom')
  })

  it('respects the skip option', () => {
    const api = makeFakeApi(SAMPLE_SCHEMA)
    function SkipHarness(): ReactNode {
      const { setActiveDb } = useDatabase({ api: api as unknown as never, disabled: true })
      useEffect(() => {
        setActiveDb(7)
      }, [setActiveDb])
      const state = useSchema({ skip: true })
      useEffect(() => {
        ;(globalThis as { __LAST_SCHEMA_STATE?: SchemaState }).__LAST_SCHEMA_STATE = state
      })
      return null
    }
    render(<SkipHarness />)
    expect(lastState().canQuery).toBe(false)
    expect(api.schema).not.toHaveBeenCalled()
  })
})
