/**
 * Smoke tests for DatabasesPage.
 *
 * The page composes `useUserDatabases` (which we mock) + React Router
 * (which we wrap in a memory router). The tests assert the happy path:
 *  - empty state renders
 *  - the table renders when there is at least one DB
 *  - the create / import modals open on button click
 *  - the delete confirmation flow calls the hook's delete method
 *  - the rename confirmation flow calls the hook's rename method
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { db as defaultDb } from '../../../src/core/persistence/dexie'

// Mock the persistence singleton so the page reads from the test Dexie.
vi.mock('../../../src/core/persistence', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/core/persistence')>()
  return { ...mod }
})

// Mock the user-databases hook so we don't need a real Worker.
const mockHookState = {
  databases: [] as Array<{
    id: string
    name: string
    createdAt: number
    updatedAt: number
    sizeBytes: number
    origin: 'created' | 'imported' | 'bundled'
  }>,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(async () => undefined),
  create: vi.fn(async (name: string) => ({
    id: 'db-new',
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sizeBytes: 0,
    origin: 'created' as const,
  })),
  importFile: vi.fn(async () => ({
    id: 'db-imp',
    name: 'imported',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sizeBytes: 0,
    origin: 'imported' as const,
  })),
  exportFile: vi.fn(async () => ({ blob: new Blob(), filename: 'x.db' })),
  rename: vi.fn(async (id: string, name: string) => ({
    id,
    name,
    createdAt: 0,
    updatedAt: Date.now(),
    sizeBytes: 0,
    origin: 'created' as const,
  })),
  delete: vi.fn(async () => undefined),
}

vi.mock('../../../src/hooks/useUserDatabases', () => ({
  useUserDatabases: () => mockHookState,
}))

vi.mock('../../../src/hooks/useDatabase', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/hooks/useDatabase')>()
  return {
    ...mod,
    useDatabase: () => ({
      api: null,
      dbId: null,
      setActiveDb: vi.fn(),
      ready: false,
      initializing: false,
      error: null,
      initResult: null,
      capability: null,
      status: 'uninitialized',
      registerDb: vi.fn(),
      unregisterDb: vi.fn(),
      retry: vi.fn(async () => undefined),
    }),
  }
})

import { DatabasesPage } from '../../../src/ui/pages/DatabasesPage'

beforeEach(async () => {
  vi.clearAllMocks()
  mockHookState.databases = []
  mockHookState.loading = false
  mockHookState.error = null
  await defaultDb.open()
  await defaultDb.databases.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function Page(): React.ReactNode {
  return (
    <MemoryRouter>
      <DatabasesPage />
    </MemoryRouter>
  )
}

describe('DatabasesPage (smoke)', () => {
  it('renders the empty state when there are no databases', async () => {
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByTestId('databases-page')).toBeTruthy()
    })
    expect(screen.getByTestId('databases-empty')).toBeTruthy()
  })

  it('renders the table when there is at least one database', async () => {
    mockHookState.databases = [
      {
        id: 'db-1',
        name: 'primera',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sizeBytes: 1024,
        origin: 'created',
      },
    ]
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByTestId('databases-table')).toBeTruthy()
    })
    expect(screen.getByTestId('databases-row-db-1')).toBeTruthy()
  })

  it('opens the create dialog on button click', async () => {
    render(<Page />)
    fireEvent.click(screen.getByTestId('databases-create-button'))
    await waitFor(() => {
      expect(screen.getByTestId('create-database-dialog')).toBeTruthy()
    })
  })

  it('opens the import dialog on button click', async () => {
    render(<Page />)
    fireEvent.click(screen.getByTestId('databases-import-button'))
    await waitFor(() => {
      expect(screen.getByTestId('import-database-dialog')).toBeTruthy()
    })
  })

  it('filters the table by the search input', async () => {
    mockHookState.databases = [
      {
        id: 'db-1',
        name: 'alpha',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sizeBytes: 0,
        origin: 'created',
      },
      {
        id: 'db-2',
        name: 'beta',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sizeBytes: 0,
        origin: 'created',
      },
    ]
    render(<Page />)
    const search = screen.getByTestId('databases-search') as HTMLInputElement
    await act(async () => {
      fireEvent.change(search, { target: { value: 'alp' } })
    })
    await waitFor(() => {
      expect(screen.queryByTestId('databases-row-db-1')).toBeTruthy()
      expect(screen.queryByTestId('databases-row-db-2')).toBeNull()
    })
  })

  it('opens the delete confirm modal and calls the hook delete', async () => {
    mockHookState.databases = [
      {
        id: 'db-1',
        name: 'alpha',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sizeBytes: 0,
        origin: 'created',
      },
    ]
    render(<Page />)
    fireEvent.click(screen.getByTestId('row-actions-trigger-db-1'))
    fireEvent.click(screen.getByTestId('row-action-delete-db-1'))
    await waitFor(() => {
      expect(screen.getByTestId('delete-confirm-dialog')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('delete-confirm-dialog-confirm'))
    await waitFor(() => {
      expect(mockHookState.delete).toHaveBeenCalledWith('db-1')
    })
  })
})
