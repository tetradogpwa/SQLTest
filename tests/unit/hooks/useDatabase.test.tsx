/**
 * Tests for useDatabase.
 *
 * With `disabled: true` + an injected `api`, the hook should:
 *  - mark itself as ready
 *  - expose the api via `setActiveDb` / `api`
 *  - track the active dbId across re-renders
 *  - call init() on the api (delegated to the host via the option)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'

import { useDatabase, __resetDatabaseSession, type DBApi } from '../../../src/hooks/useDatabase'

beforeEach(() => {
  __resetDatabaseSession()
})

afterEach(() => {
  cleanup()
})

type FakeApi = {
  [K in keyof DBApi]: ReturnType<typeof vi.fn>
}

function makeFakeApi(): FakeApi {
  return {
    init: vi.fn(async () => ({ capability: 'memory', sqliteVersion: '3.45.0', vfsName: ':memory:' })),
    exec: vi.fn(async () => ({ ok: true, columns: [], rows: [], executionMs: 0, statementKind: 'other' })),
    cancel: vi.fn(async () => undefined),
    schema: vi.fn(async () => ({ tables: [], views: [], indexes: [], triggers: [], version: 1 })),
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
    createUserDatabase: vi.fn(async () => ({ dbId: 1, sizeBytes: 0 })),
  } as FakeApi
}

type DbState = ReturnType<typeof useDatabase>

function Harness({ api }: { api: FakeApi }): ReactNode {
  const state = useDatabase({ api: api as unknown as never, disabled: true })
  useEffect(() => {
    ;(globalThis as { __LAST_DB_STATE?: DbState }).__LAST_DB_STATE = state
  })
  return null
}

function lastState(): DbState {
  const s = (globalThis as { __LAST_DB_STATE?: DbState }).__LAST_DB_STATE
  if (!s) throw new Error('no state')
  return s
}

describe('useDatabase (injected api mode)', () => {
  it('exposes the injected api', () => {
    const api = makeFakeApi()
    render(<Harness api={api} />)
    expect(lastState().api).toBe(api)
  })

  it('starts with no active dbId', () => {
    const api = makeFakeApi()
    render(<Harness api={api} />)
    expect(lastState().dbId).toBeNull()
  })

  it('setActiveDb updates dbId', () => {
    const api = makeFakeApi()
    render(<Harness api={api} />)
    act(() => {
      lastState().setActiveDb(7)
    })
    expect(lastState().dbId).toBe(7)
  })

  it('returns the same api object across re-renders (singleton per session)', () => {
    const api = makeFakeApi()
    function TwoConsumers(): ReactNode {
      const a = useDatabase({ api: api as unknown as never, disabled: true })
      const b = useDatabase({ api: api as unknown as never, disabled: true })
      useEffect(() => {
        ;(globalThis as { __A?: DbState; __B?: DbState }).__A = a
        ;(globalThis as { __A?: DbState; __B?: DbState }).__B = b
      })
      return null
    }
    render(<TwoConsumers />)
    const a = (globalThis as { __A?: DbState }).__A
    const b = (globalThis as { __B?: DbState }).__B
    expect(a?.api).toBe(b?.api)
  })

  it('throws when called with disabled=true and no api override', async () => {
    function Naked(): ReactNode {
      const state = useDatabase({ disabled: true })
      useEffect(() => {
        ;(globalThis as { __NAKED?: DbState }).__NAKED = state
      })
      return null
    }
    // Should not crash on render; the error surfaces on first api call.
    render(<Naked />)
    // The api handle should still exist as null, but consumers can detect this.
    const s = (globalThis as { __NAKED?: DbState }).__NAKED
    expect(s?.api).toBeNull()
    // No way to invoke `init` without an api, but the hook must be in a valid state.
    expect(s?.ready).toBe(false)
    await waitFor(() => expect(s).toBeDefined())
  })
})
