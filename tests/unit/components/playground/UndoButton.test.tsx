/**
 * Tests for UndoButton.
 *
 * The button is hidden when there are no undo entries and shows the
 * description of the most recent entry otherwise. Clicking it calls
 * `api.restore` with the entry's snapshotId and removes the row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { db as defaultDb } from '../../../../src/core/persistence/dexie'

let fakeApi = {
  restore: vi.fn(async () => undefined),
  snapshot: vi.fn(async () => ({ id: 'auto' })),
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

import { UndoButton } from '../../../../src/ui/components/playground/UndoButton'

beforeEach(async () => {
  vi.clearAllMocks()
  fakeApi = {
    restore: vi.fn(async () => undefined),
    snapshot: vi.fn(async () => ({ id: 'auto' })),
  }
  await defaultDb.open()
  await defaultDb.undoHistory.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('UndoButton', () => {
  it('renders a placeholder when there are no undo entries', () => {
    render(<UndoButton dbId={1} storageKey="playground" />)
    expect(screen.getByTestId('undo-button-placeholder')).toBeTruthy()
    expect(screen.queryByTestId('undo-button')).toBeNull()
  })

  it('renders the button when there is an undo entry', async () => {
    await defaultDb.undoHistory.add({
      dbId: 'playground',
      operation: 'DELETE FROM users',
      operationType: 'dml',
      timestamp: Date.now(),
      snapshotId: 'snap-1',
      description: 'Borrar todos los usuarios',
    })
    render(<UndoButton dbId={1} storageKey="playground" />)
    await waitFor(() => {
      expect(screen.getByTestId('undo-button')).toBeTruthy()
    })
  })

  it('clicks call api.restore and remove the entry', async () => {
    await defaultDb.undoHistory.add({
      dbId: 'playground',
      operation: 'DELETE FROM users',
      operationType: 'dml',
      timestamp: Date.now(),
      snapshotId: 'snap-1',
      description: 'Borrar todos los usuarios',
    })
    render(<UndoButton dbId={1} storageKey="playground" />)
    await waitFor(() => {
      expect(screen.getByTestId('undo-button')).toBeTruthy()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('undo-button'))
    })
    await waitFor(() => {
      expect(fakeApi.restore).toHaveBeenCalledWith(1, 'snap-1')
    })
    const rows = await defaultDb.undoHistory.where('dbId').equals('playground').toArray()
    expect(rows.length).toBe(0)
  })
})
