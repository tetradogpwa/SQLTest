/**
 * Tests for SnapshotsPanel.
 *
 * The panel reads from `snapshotMetadata` via `useLiveQuery`. The
 * Worker side is mocked via `useDatabase`. We assert:
 *  - the empty state shows when there are no snapshots
 *  - a "Create snapshot" button calls api.snapshot
 *  - the list renders rows for each snapshot
 *  - restore / delete actions call the right api methods
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { db as defaultDb } from '../../../../src/core/persistence/dexie'

let fakeApi = {
  snapshot: vi.fn(async () => ({ id: 'snap-1' })),
  restore: vi.fn(async () => undefined),
  deleteSnapshot: vi.fn(async () => undefined),
}

vi.mock('../../../../src/hooks/useDatabase', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/hooks/useDatabase')>()
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

import { SnapshotsPanel } from '../../../../src/ui/components/playground/SnapshotsPanel'

beforeEach(async () => {
  vi.clearAllMocks()
  fakeApi = {
    snapshot: vi.fn(async () => ({ id: 'snap-1' })),
    restore: vi.fn(async () => undefined),
    deleteSnapshot: vi.fn(async () => undefined),
  }
  await defaultDb.open()
  await defaultDb.snapshotMetadata.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SnapshotsPanel', () => {
  it('renders the empty state when there are no snapshots', async () => {
    render(<SnapshotsPanel dbId={1} storageKey="playground" />)
    await waitFor(() => {
      expect(screen.getByTestId('snapshots-empty')).toBeTruthy()
    })
  })

  it('creates a snapshot on click', async () => {
    render(<SnapshotsPanel dbId={1} storageKey="playground" />)
    fireEvent.click(screen.getByTestId('snapshots-create-button'))
    await waitFor(() => {
      expect(fakeApi.snapshot).toHaveBeenCalledWith(1, 'manual', 'manual')
    })
  })

  it('renders rows for existing snapshots', async () => {
    await defaultDb.snapshotMetadata.add({
      dbId: 'playground',
      snapshotId: 'snap-1',
      label: 'mi-snap',
      createdAt: Date.now(),
      sizeBytes: 1024,
      reason: 'manual',
    })
    render(<SnapshotsPanel dbId={1} storageKey="playground" />)
    await waitFor(() => {
      expect(screen.getByTestId('snapshot-item-snap-1')).toBeTruthy()
    })
  })

  it('restore button calls api.restore', async () => {
    await defaultDb.snapshotMetadata.add({
      dbId: 'playground',
      snapshotId: 'snap-1',
      label: 'mi-snap',
      createdAt: Date.now(),
      sizeBytes: 0,
      reason: 'manual',
    })
    render(<SnapshotsPanel dbId={1} storageKey="playground" />)
    await waitFor(() => {
      expect(screen.getByTestId('snapshot-restore-snap-1')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('snapshot-restore-snap-1'))
    await waitFor(() => {
      expect(fakeApi.restore).toHaveBeenCalledWith(1, 'snap-1')
    })
  })

  it('delete button calls api.deleteSnapshot and drops the row', async () => {
    await defaultDb.snapshotMetadata.add({
      dbId: 'playground',
      snapshotId: 'snap-1',
      label: 'mi-snap',
      createdAt: Date.now(),
      sizeBytes: 0,
      reason: 'manual',
    })
    render(<SnapshotsPanel dbId={1} storageKey="playground" />)
    await waitFor(() => {
      expect(screen.getByTestId('snapshot-delete-snap-1')).toBeTruthy()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('snapshot-delete-snap-1'))
    })
    await waitFor(() => {
      expect(fakeApi.deleteSnapshot).toHaveBeenCalledWith(1, 'snap-1')
    })
    const rows = await defaultDb.snapshotMetadata.where('dbId').equals('playground').toArray()
    expect(rows.length).toBe(0)
  })
})
