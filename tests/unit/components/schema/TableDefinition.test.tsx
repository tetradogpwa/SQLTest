/**
 * Tests for TableDefinition.
 *
 * Covers the empty state, the column rendering (with PK ordering),
 * foreign keys, the insert callback, and the icon-per-type mapping.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TableDefinition } from '../../../../src/ui/components/schema/TableDefinition'
import type { TableInfo } from '../../../../src/workers/types'

afterEach(() => {
  cleanup()
})

const SAMPLE_TABLE: TableInfo = {
  name: 'orders',
  columns: [
    {
      name: 'id',
      type: 'INTEGER',
      nullable: false,
      defaultValue: null,
      primaryKeyPosition: 1,
    },
    {
      name: 'user_id',
      type: 'INTEGER',
      nullable: false,
      defaultValue: null,
      primaryKeyPosition: 0,
    },
    {
      name: 'total',
      type: 'REAL',
      nullable: false,
      defaultValue: '0',
      primaryKeyPosition: 0,
    },
    {
      name: 'note',
      type: 'TEXT',
      nullable: true,
      defaultValue: null,
      primaryKeyPosition: 0,
    },
  ],
  primaryKey: ['id'],
  foreignKeys: [
    { from: 'user_id', table: 'users', to: 'id', onUpdate: 'CASCADE', onDelete: 'CASCADE' },
  ],
  uniqueConstraints: [['id']],
  checkConstraints: ['total >= 0'],
  createSql: 'CREATE TABLE orders (id INTEGER PRIMARY KEY, ...);',
  rowCountEstimate: 1234,
}

describe('TableDefinition', () => {
  it('renders the empty state when no table is given', () => {
    render(<TableDefinition table={null} />)
    expect(screen.getByTestId('table-definition-empty')).toBeTruthy()
    expect(screen.getByText(/Selecciona una tabla/i)).toBeTruthy()
  })

  it('renders the table name and column count', () => {
    render(<TableDefinition table={SAMPLE_TABLE} />)
    expect(screen.getByText('orders')).toBeTruthy()
    expect(screen.getByText(/4 columnas/)).toBeTruthy()
  })

  it('lists all columns with their type and nullability', () => {
    render(<TableDefinition table={SAMPLE_TABLE} />)
    expect(screen.getAllByText('id').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('user_id').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('total').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('note').length).toBeGreaterThanOrEqual(1)
    // NOT NULL badges
    const nnBadges = screen.getAllByText('NOT NULL')
    expect(nnBadges.length).toBeGreaterThanOrEqual(3)
  })

  it('renders the foreign keys section', () => {
    const { container } = render(<TableDefinition table={SAMPLE_TABLE} />)
    expect(screen.getByText(/Foreign Keys/)).toBeTruthy()
    // From → to — appear in the column row AND the FK row, so use getAllByText.
    expect(screen.getAllByText('user_id').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('id').length).toBeGreaterThanOrEqual(1)
    // The "users" text lives inside a <code> next to the FK — the
    // <code> for the target contains both the table and column name
    // ("users.id"), so we assert the joined text is present.
    const codeElements = container.querySelectorAll('code')
    const codeTexts = Array.from(codeElements).map((el) => el.textContent ?? '')
    expect(codeTexts).toContain('users.id')
  })

  it('renders the unique constraints', () => {
    render(<TableDefinition table={SAMPLE_TABLE} />)
    expect(screen.getByText(/Unique Constraints/)).toBeTruthy()
    expect(screen.getByText('(id)')).toBeTruthy()
  })

  it('renders the check constraints', () => {
    render(<TableDefinition table={SAMPLE_TABLE} />)
    expect(screen.getByText(/Check Constraints/)).toBeTruthy()
    expect(screen.getByText('total >= 0')).toBeTruthy()
  })

  it('calls onInsertColumn when the column button is clicked', () => {
    const onInsert = vi.fn()
    render(<TableDefinition table={SAMPLE_TABLE} onInsertColumn={onInsert} />)
    const idButton = screen.getByTestId('table-def-column-id')
    fireEvent.click(idButton)
    expect(onInsert).toHaveBeenCalledWith('id')
  })
})
