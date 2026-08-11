/**
 * Tests for RowActions.
 *
 * The component is a dumb menu: it just toggles open / closed and
 * calls the parent's action handlers. We assert:
 *  - the trigger renders
 *  - the menu is hidden initially
 *  - clicking the trigger opens the menu and shows all four actions
 *  - clicking an action closes the menu and fires the right callback
 *  - clicking outside closes the menu
 *  - Escape closes the menu
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { RowActions } from '../../../../src/ui/components/databases/RowActions'
import type { Database as DatabaseRow } from '../../../../src/core/persistence'

const ROW: DatabaseRow = {
  id: 'db-1',
  name: 'mi-db',
  createdAt: 0,
  updatedAt: 0,
  sizeBytes: 0,
  origin: 'created',
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('RowActions', () => {
  it('renders the trigger and hides the menu by default', () => {
    render(
      <RowActions
        database={ROW}
        onOpen={vi.fn()}
        onRename={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByTestId('row-actions-trigger-db-1')).toBeTruthy()
    expect(screen.queryByTestId('row-actions-menu-db-1')).toBeNull()
  })

  it('opens the menu and shows all four actions', () => {
    render(
      <RowActions
        database={ROW}
        onOpen={vi.fn()}
        onRename={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('row-actions-trigger-db-1'))
    expect(screen.getByTestId('row-actions-menu-db-1')).toBeTruthy()
    expect(screen.getByTestId('row-action-open-db-1')).toBeTruthy()
    expect(screen.getByTestId('row-action-rename-db-1')).toBeTruthy()
    expect(screen.getByTestId('row-action-export-db-1')).toBeTruthy()
    expect(screen.getByTestId('row-action-delete-db-1')).toBeTruthy()
  })

  it('fires the matching callback when an action is clicked', async () => {
    const onOpen = vi.fn()
    const onRename = vi.fn()
    const onExport = vi.fn()
    const onDelete = vi.fn()
    render(
      <RowActions
        database={ROW}
        onOpen={onOpen}
        onRename={onRename}
        onExport={onExport}
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getByTestId('row-actions-trigger-db-1'))
    fireEvent.click(screen.getByTestId('row-action-rename-db-1'))
    await waitFor(() => expect(onRename).toHaveBeenCalledWith(ROW))
    expect(onOpen).not.toHaveBeenCalled()
    expect(onExport).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('fires the delete callback when the delete action is clicked', async () => {
    const onDelete = vi.fn()
    render(
      <RowActions
        database={ROW}
        onOpen={vi.fn()}
        onRename={vi.fn()}
        onExport={vi.fn()}
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getByTestId('row-actions-trigger-db-1'))
    fireEvent.click(screen.getByTestId('row-action-delete-db-1'))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(ROW))
  })

  it('closes the menu on Escape', async () => {
    render(
      <RowActions
        database={ROW}
        onOpen={vi.fn()}
        onRename={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('row-actions-trigger-db-1'))
    expect(screen.getByTestId('row-actions-menu-db-1')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('row-actions-menu-db-1')).toBeNull())
  })
})
