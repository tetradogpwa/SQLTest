/**
 * Tests for PlaygroundPage (smoke / integration).
 *
 * Mocks the heavy layer:
 *  - `useDatabase` is replaced with a version that returns a fake api
 *  - the persistence module is mocked
 *
 * Verifies:
 *  - the page renders the editor + the DB explorer
 *  - running a query calls `api.exec`
 *  - a query error renders the ErrorBanner
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

// Mock the persistence module so the page does not touch real Dexie.
vi.mock('../../../src/core/persistence', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/core/persistence')>()
  return {
    ...mod,
    settings: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      on: vi.fn(() => () => undefined),
    },
  }
})

// Mock the i18n hook to return stable keys.
vi.mock('../../../src/core/i18n/i18n', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/core/i18n/i18n')>()
  return {
    ...mod,
    useTranslation: () => ({ t: (k: string) => k, locale: 'es', setLocale: () => undefined }),
  }
})

// A mutable holder for the fake api so the test can read the latest
// spy calls and the consumer can grab the api handle.
type FakeApi = {
  exec: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  schema: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
}

let fakeApi: FakeApi

vi.mock('../../../src/hooks/useDatabase', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/hooks/useDatabase')>()
  return {
    ...mod,
    useDatabase: () => ({
      api: fakeApi as unknown as never,
      dbId: 1,
      setActiveDb: vi.fn(),
      ready: true,
      initializing: false,
      error: null,
      initResult: { capability: 'memory', sqliteVersion: '3.45.0', vfsName: ':memory:' },
      capability: 'memory',
      status: 'ready',
      registerDb: vi.fn(),
      unregisterDb: vi.fn(),
      retry: vi.fn(async () => undefined),
    }),
  }
})

vi.mock('../../../src/hooks/useSchema', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/hooks/useSchema')>()
  return {
    ...mod,
    useSchema: () => ({
      schema: { tables: [], views: [], indexes: [], triggers: [], version: 1 },
      loading: false,
      error: null,
      refresh: vi.fn(async () => undefined),
      invalidate: vi.fn(),
      canQuery: true,
    }),
  }
})

// Mock useQuery so we don't need a real Worker. Track the latest
// `result` so the page can render the success state.
import type { ReactNode } from 'react'
import { useState } from 'react'

vi.mock('../../../src/hooks/useQuery', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/hooks/useQuery')>()
  return {
    ...mod,
    useQuery: () => {
      const [loading, setLoading] = useState(false)
      const [result, setResult] = useState<unknown>(null)
      const [error, setError] = useState<unknown>(null)
      const [executionMs, setExecutionMs] = useState<number | null>(null)
      const run = async (sql: string): Promise<void> => {
        setLoading(true)
        try {
          const r = (await fakeApi.exec(1, sql)) as { ok: boolean; error?: unknown }
          if (r.ok) {
            setResult(r)
            setExecutionMs(5)
          } else {
            setError(r.error)
          }
        } finally {
          setLoading(false)
        }
      }
      return {
        result,
        loading,
        error,
        history: [],
        executionMs,
        run,
        cancel: vi.fn(async () => undefined),
        clearHistory: vi.fn(async () => undefined),
      }
    },
  }
})

import { PlaygroundPage } from '../../../src/ui/pages/PlaygroundPage'

function makeFakeApi(): FakeApi {
  return {
    exec: vi.fn(async () => ({
      ok: true,
      columns: ['id', 'name'],
      rows: [[1, 'Ada']],
      executionMs: 3,
      statementKind: 'select',
    })),
    open: vi.fn(async () => ({ filename: 'playground', sizeBytes: 0 })),
    schema: vi.fn(async () => ({ tables: [], views: [], indexes: [], triggers: [], version: 1 })),
    cancel: vi.fn(async () => undefined),
  }
}

beforeEach(() => {
  fakeApi = makeFakeApi()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function Page(): ReactNode {
  return <PlaygroundPage />
}

describe('PlaygroundPage (smoke)', () => {
  it('renders the editor and the DB explorer panels', async () => {
    render(<Page />)
    await waitFor(() => {
      const editor = document.querySelector('.cm-editor') ?? document.querySelector('[data-testid="sql-editor"]')
      const explorer =
        document.querySelector('[data-testid="db-explorer-empty"]') ??
        document.querySelector('[data-testid="db-explorer-tree"]') ??
        document.querySelector('[data-testid="db-explorer-loading"]')
      expect(editor).toBeTruthy()
      expect(explorer).toBeTruthy()
    })
  })

  it('runs a query when the user presses the run button (mocked)', async () => {
    render(<Page />)
    const runButton = await screen.findByTestId('run-button')
    await waitFor(() => expect((runButton as HTMLButtonElement).disabled).toBe(false))
    await act(async () => {
      fireEvent.click(runButton)
    })
    await waitFor(() => expect(fakeApi.exec).toHaveBeenCalled())
  })

  it('renders the ErrorBanner when the query fails', async () => {
    fakeApi.exec.mockResolvedValue({
      ok: false,
      error: {
        code: 'SQLITE_ERROR',
        message: 'no such table: foo',
        translatedMessage: 'No existe la tabla `foo`',
        table: 'foo',
      },
      executionMs: 1,
      statementKind: 'select',
    })
    render(<Page />)
    const runButton = await screen.findByTestId('run-button')
    await waitFor(() => expect((runButton as HTMLButtonElement).disabled).toBe(false))
    await act(async () => {
      fireEvent.click(runButton)
    })
    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeTruthy()
    })
  })
})
