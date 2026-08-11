/**
 * Tests for the DbExplorer sidebar.
 *
 * Covers:
 *  - Empty state when no database is selected.
 *  - Renders the table tree when a schema is provided.
 *  - Click handler fires `onSelectTable`.
 *  - Refresh button calls `onRefresh`.
 *  - Selected row gets the highlight.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { DbExplorer } from '../../../../src/ui/components/schema/DbExplorer'
import type { DatabaseSchema } from '../../../../src/workers/types'

afterEach(() => {
  cleanup()
})

const SCHEMA: DatabaseSchema = {
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
      rowCountEstimate: 5,
      createSql: '',
    },
    {
      name: 'orders',
      columns: [
        { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, primaryKeyPosition: 1 },
        { name: 'total', type: 'REAL', nullable: false, defaultValue: null, primaryKeyPosition: 0 },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
      rowCountEstimate: 42,
      createSql: '',
    },
  ],
  views: [],
  indexes: [],
  triggers: [],
}

describe('DbExplorer — empty states', () => {
  it('renders the "no database" empty state when dbId is null', () => {
    render(
      <DbExplorer
        dbId={null}
        schema={null}
        selectedTable={null}
        onSelectTable={() => undefined}
      />,
    )
    expect(screen.getByTestId('db-explorer-empty')).toBeInTheDocument()
    expect(screen.getByText(/No hay base de datos activa/)).toBeInTheDocument()
  })

  it('renders an error message when an error is provided', () => {
    render(
      <DbExplorer
        dbId={1}
        schema={null}
        error="Introspección fallida"
        selectedTable={null}
        onSelectTable={() => undefined}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Introspección fallida')
  })
})

describe('DbExplorer — tree rendering', () => {
  it('renders the table list grouped under "Tablas"', () => {
    render(
      <DbExplorer
        dbId={1}
        schema={SCHEMA}
        selectedTable={null}
        onSelectTable={() => undefined}
      />,
    )
    expect(screen.getByTestId('db-explorer-tree')).toBeInTheDocument()
    expect(screen.getByTestId('db-explorer-item-users')).toBeInTheDocument()
    expect(screen.getByTestId('db-explorer-item-orders')).toBeInTheDocument()
  })

  it('highlights the selected table', () => {
    render(
      <DbExplorer
        dbId={1}
        schema={SCHEMA}
        selectedTable="orders"
        onSelectTable={() => undefined}
      />,
    )
    const item = screen.getByTestId('db-explorer-item-orders')
    // The data-testid is on the button itself; the aria-current
    // marker is what the production code uses for the selection.
    expect(item.getAttribute('aria-current')).toBe('true')
    // Also check the parent <li> gets the visual "selected" class.
    const liEl = item.closest('li')
    expect(liEl?.className).toContain('selected')
  })
})

describe('DbExplorer — click handlers', () => {
  it('fires onSelectTable when a table is clicked', () => {
    const onSelect = vi.fn()
    render(
      <DbExplorer
        dbId={1}
        schema={SCHEMA}
        selectedTable={null}
        onSelectTable={onSelect}
      />,
    )
    fireEvent.click(screen.getByTestId('db-explorer-item-users'))
    expect(onSelect).toHaveBeenCalledWith('users')
  })

  it('fires onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn()
    render(
      <DbExplorer
        dbId={1}
        schema={SCHEMA}
        selectedTable={null}
        onSelectTable={() => undefined}
        onRefresh={onRefresh}
      />,
    )
    fireEvent.click(screen.getByTestId('db-explorer-refresh'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('fires onInsertColumnAtCursor when a column button is clicked', () => {
    const onInsert = vi.fn()
    render(
      <DbExplorer
        dbId={1}
        schema={SCHEMA}
        selectedTable="users"
        onSelectTable={() => undefined}
        onInsertColumnAtCursor={onInsert}
      />,
    )
    const columnButtons = screen.getAllByTitle('Insertar columna en el editor')
    fireEvent.click(columnButtons[0]!)
    expect(onInsert).toHaveBeenCalledWith({ table: 'users', column: 'id' })
  })
})
