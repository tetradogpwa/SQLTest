/**
 * Tests for useUserDatabases.
 *
 * The hook relies on `useDatabase` (Worker wrapper) and Dexie's live
 * query. We:
 *  - mock `useDatabase` to return a fake api
 *  - use a fresh Dexie instance per test so the shared fake-idb shim
 *    does not bleed rows across files
 *
 * Cover:
 *  - returns the live list (initially empty)
 *  - create() calls api.createUserDatabase + adds a Dexie row
 *  - importFile() rejects empty / oversized files
 *  - exportFile() returns a Blob and uses the Dexie row's name
 *  - rename() updates the row in Dexie
 *  - delete() removes the row + cascades to snapshots/undo
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'

import { db as defaultDb } from '../../../src/core/persistence/dexie'
import { dbMetadata } from '../../../src/core/persistence'

beforeEach(async () => {
  // `defaultDb` is the singleton from src; we re-point the
  // `dbMetadata` singleton at the test Dexie so the hook reads /
  // writes through it.
  ;(dbMetadata as unknown as { db: typeof defaultDb }).db = defaultDb
  await defaultDb.open()
  await defaultDb.databases.clear()
  await defaultDb.snapshotMetadata.clear()
  await defaultDb.undoHistory.clear()
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await defaultDb.databases.clear()
  await defaultDb.snapshotMetadata.clear()
  await defaultDb.undoHistory.clear()
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await defaultDb.databases.clear()
  await defaultDb.snapshotMetadata.clear()
  await defaultDb.undoHistory.clear()
})

type FakeApi = {
  createUserDatabase: ReturnType<typeof vi.fn>
  import: ReturnType<typeof vi.fn>
  export: ReturnType<typeof vi.fn>
  listUserDatabases: ReturnType<typeof vi.fn>
  deleteUserDatabase: ReturnType<typeof vi.fn>
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

import { useUserDatabases } from '../../../src/hooks/useUserDatabases'

function makeFakeApi(): FakeApi {
  return {
    createUserDatabase: vi.fn(async (name: string) => ({ dbId: 42, sizeBytes: 0, name })),
    import: vi.fn(async () => ({ dbId: 99, sizeBytes: 1024 })),
    export: vi.fn(async () => new Uint8Array([0xde, 0xad, 0xbe, 0xef])),
    listUserDatabases: vi.fn(async () => []),
    deleteUserDatabase: vi.fn(async () => undefined),
  }
}

interface HookHandle<T> {
  current: T | null
}

function captureHandle<T>(): HookHandle<T> {
  return { current: null }
}

function Harness({ handle }: { handle: HookHandle<ReturnType<typeof useUserDatabases>> }): ReactNode {
  const result = useUserDatabases()
  useEffect(() => {
    handle.current = result
  })
  return null
}

describe('useUserDatabases', () => {
  it('starts with an empty list and no error', async () => {
    fakeApi = makeFakeApi()
    const handle = captureHandle<ReturnType<typeof useUserDatabases>>()
    render(<Harness handle={handle} />)
    await waitFor(() => {
      expect(handle.current?.databases.length).toBe(0)
    })
    expect(handle.current?.loading).toBe(false)
    expect(handle.current?.error).toBeNull()
  })

  it('create() calls the worker and adds a Dexie row', async () => {
    fakeApi = makeFakeApi()
    const handle = captureHandle<ReturnType<typeof useUserDatabases>>()
    render(<Harness handle={handle} />)
    await waitFor(() => expect(handle.current).not.toBeNull())
    const row: { id: string; name: string } = await act(async () =>
      handle.current!.create('mi-db'),
    )
    expect(fakeApi.createUserDatabase).toHaveBeenCalledWith('mi-db')
    expect(row.name).toBe('mi-db')
    expect(row.id).toMatch(/^db-/)
    await waitFor(() => {
      expect(handle.current?.databases.length).toBe(1)
    })
    const [entry] = handle.current!.databases
    expect(entry?.name).toBe('mi-db')
    expect(entry?.origin).toBe('created')
  })

  it('create() rejects invalid names', async () => {
    fakeApi = makeFakeApi()
    const handle = captureHandle<ReturnType<typeof useUserDatabases>>()
    render(<Harness handle={handle} />)
    await waitFor(() => expect(handle.current).not.toBeNull())
    await act(async () => {
      await expect(handle.current!.create('   ')).rejects.toThrow()
      await expect(handle.current!.create('a/b')).rejects.toThrow()
    })
    expect(fakeApi.createUserDatabase).not.toHaveBeenCalled()
  })

  it('importFile() rejects empty files', async () => {
    fakeApi = makeFakeApi()
    const handle = captureHandle<ReturnType<typeof useUserDatabases>>()
    render(<Harness handle={handle} />)
    await waitFor(() => expect(handle.current).not.toBeNull())
    const file = new File([new Uint8Array(0)], 'empty.db', { type: 'application/octet-stream' })
    await act(async () => {
      await expect(handle.current!.importFile(file)).rejects.toThrow()
    })
    expect(fakeApi.import).not.toHaveBeenCalled()
  })

  it('importFile() rejects files larger than 100 MB', async () => {
    fakeApi = makeFakeApi()
    const handle = captureHandle<ReturnType<typeof useUserDatabases>>()
    render(<Harness handle={handle} />)
    await waitFor(() => expect(handle.current).not.toBeNull())
    const file = new File([new Uint8Array(10)], 'huge.db')
    Object.defineProperty(file, 'size', { value: 200 * 1024 * 1024 })
    await act(async () => {
      await expect(handle.current!.importFile(file)).rejects.toThrow(/límite/)
    })
    expect(fakeApi.import).not.toHaveBeenCalled()
  })

  it('importFile() uploads the file and adds a row', async () => {
    fakeApi = makeFakeApi()
    const handle = captureHandle<ReturnType<typeof useUserDatabases>>()
    render(<Harness handle={handle} />)
    await waitFor(() => expect(handle.current).not.toBeNull())
    const file = new File([new Uint8Array(1024)], 'imported.db', {
      type: 'application/octet-stream',
    })
    const row: { id: string; origin: string } = await act(async () =>
      handle.current!.importFile(file, 'imported'),
    )
    expect(fakeApi.import).toHaveBeenCalled()
    expect(row.origin).toBe('imported')
    await waitFor(() => {
      expect(handle.current?.databases.length).toBe(1)
    })
  })

  it('exportFile() returns a Blob', async () => {
    fakeApi = makeFakeApi()
    const handle = captureHandle<ReturnType<typeof useUserDatabases>>()
    render(<Harness handle={handle} />)
    await waitFor(() => expect(handle.current).not.toBeNull())
    await act(async () => {
      await handle.current!.create('exportable')
    })
    await waitFor(() => {
      expect(handle.current?.databases.length).toBe(1)
    })
    const id = handle.current!.databases[0]!.id
    const result: { blob: Blob; filename: string } = await act(async () =>
      handle.current!.exportFile(id),
    )
    expect(result.filename).toBe('exportable.sqlite3')
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result?.blob.size).toBe(4)
  })

  it('rename() updates the Dexie row', async () => {
    fakeApi = makeFakeApi()
    const handle = captureHandle<ReturnType<typeof useUserDatabases>>()
    render(<Harness handle={handle} />)
    await waitFor(() => expect(handle.current).not.toBeNull())
    await act(async () => {
      await handle.current!.create('original')
    })
    await waitFor(() => {
      expect(handle.current?.databases.length).toBe(1)
    })
    const id = handle.current!.databases[0]!.id
    await act(async () => {
      await handle.current!.rename(id, 'renombrada')
    })
    await waitFor(() => {
      expect(handle.current?.databases[0]?.name).toBe('renombrada')
    })
  })

  it('rename() rejects invalid names', async () => {
    fakeApi = makeFakeApi()
    const handle = captureHandle<ReturnType<typeof useUserDatabases>>()
    render(<Harness handle={handle} />)
    await waitFor(() => expect(handle.current).not.toBeNull())
    await act(async () => {
      await handle.current!.create('original')
    })
    await waitFor(() => {
      expect(handle.current?.databases.length).toBe(1)
    })
    const id = handle.current!.databases[0]!.id
    await act(async () => {
      await expect(handle.current!.rename(id, '')).rejects.toThrow()
      await expect(handle.current!.rename(id, 'a/b')).rejects.toThrow()
    })
  })

  it('delete() removes the row and cascades snapshots/undo', async () => {
    fakeApi = makeFakeApi()
    const handle = captureHandle<ReturnType<typeof useUserDatabases>>()
    render(<Harness handle={handle} />)
    await waitFor(() => expect(handle.current).not.toBeNull())
    await act(async () => {
      await handle.current!.create('to-delete')
    })
    await waitFor(() => {
      expect(handle.current?.databases.length).toBe(1)
    })
    const id = handle.current!.databases[0]!.id
    await defaultDb.snapshotMetadata.add({
      dbId: id,
      snapshotId: 'snap-1',
      label: 'manual',
      createdAt: Date.now(),
      sizeBytes: 0,
      reason: 'manual',
    })
    await defaultDb.undoHistory.add({
      dbId: id,
      operation: 'DELETE FROM x',
      operationType: 'dml',
      timestamp: Date.now(),
      snapshotId: 'snap-1',
      description: 'deletion',
    })
    await act(async () => {
      await handle.current!.delete(id)
    })
    await waitFor(() => {
      expect(handle.current?.databases.length).toBe(0)
    })
    const snapshots = await defaultDb.snapshotMetadata.where('dbId').equals(id).toArray()
    const undos = await defaultDb.undoHistory.where('dbId').equals(id).toArray()
    expect(snapshots.length).toBe(0)
    expect(undos.length).toBe(0)
  })
})
