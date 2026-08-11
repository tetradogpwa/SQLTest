/**
 * Tests for the ResultsTable component.
 *
 * Covers:
 *  - basic rendering (rows, columns, empty state)
 *  - NULL handling (NULL value rendered as italic text)
 *  - long-cell truncation + tooltip
 *  - header sort cycle
 *  - row count summary
 *  - truncated banner
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within, fireEvent } from '@testing-library/react'

import { ResultsTable } from '../../../src/ui/components/results/ResultsTable'

afterEach(() => {
  cleanup()
})

describe('ResultsTable — basic rendering', () => {
  it('renders rows and columns', () => {
    render(
      <ResultsTable
        columns={['id', 'name']}
        rows={[
          [1, 'Alice'],
          [2, 'Bob'],
        ]}
      />,
    )
    expect(screen.getByTestId('results-table')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders the empty state when rows is empty', () => {
    render(<ResultsTable columns={['a', 'b']} rows={[]} />)
    expect(screen.getByTestId('results-table-empty')).toBeInTheDocument()
    expect(screen.getByText(/Ejecuta una query/)).toBeInTheDocument()
  })
})

describe('ResultsTable — NULL handling', () => {
  it('renders NULL values with the literal "NULL" text', () => {
    render(
      <ResultsTable
        columns={['id', 'name']}
        rows={[
          [1, null],
          [2, undefined],
        ]}
      />,
    )
    const nulls = screen.getAllByLabelText('NULL value')
    expect(nulls.length).toBe(2)
  })
})

describe('ResultsTable — long cells', () => {
  it('truncates cells longer than maxCellLength and exposes a tooltip', () => {
    const long = 'x'.repeat(500)
    render(
      <ResultsTable
        columns={['id', 'text']}
        rows={[[1, long]]}
        maxCellLength={50}
      />,
    )
    const truncated = screen.getByText(/x+…$/)
    expect(truncated.textContent?.length).toBeLessThanOrEqual(52)
    // The full text is reachable via the `title` attribute on the wrapping span.
    const cell = truncated.closest('span')
    expect(cell).not.toBeNull()
    expect(cell?.getAttribute('title')).toBe(long)
  })
})

describe('ResultsTable — sorting', () => {
  it('sorts a column ascending on first click', () => {
    render(
      <ResultsTable
        columns={['id', 'name']}
        rows={[
          [3, 'Charlie'],
          [1, 'Alice'],
          [2, 'Bob'],
        ]}
      />,
    )
    const idHeader = screen.getByRole('button', { name: /Ordenar por id/ })
    fireEvent.click(idHeader)
    // After sort asc: 1, 2, 3
    const rows = screen.getAllByRole('row').slice(1) // skip header
    expect(within(rows[0] as HTMLElement).getByText('1')).toBeInTheDocument()
    expect(within(rows[0] as HTMLElement).getByText('Alice')).toBeInTheDocument()
  })

  it('cycles to descending on second click', () => {
    render(
      <ResultsTable
        columns={['id']}
        rows={[[1], [2], [3]]}
      />,
    )
    const idHeader = screen.getByRole('button', { name: /Ordenar por id/ })
    fireEvent.click(idHeader)
    fireEvent.click(idHeader)
    const rows = screen.getAllByRole('row').slice(1)
    expect((rows[0] as HTMLElement).textContent).toContain('3')
  })
})

describe('ResultsTable — truncated banner + summary', () => {
  it('shows the truncated banner when truncated is true', () => {
    render(
      <ResultsTable
        columns={['id']}
        rows={[[1]]}
        truncated
        truncatedMessage="Truncado, añade LIMIT"
      />,
    )
    expect(screen.getByTestId('results-table-banner')).toBeInTheDocument()
    expect(screen.getByText(/Truncado/)).toBeInTheDocument()
  })

  it('does not show the banner when truncated is false', () => {
    render(<ResultsTable columns={['id']} rows={[[1]]} />)
    expect(screen.queryByTestId('results-table-banner')).toBeNull()
  })

  it('shows the row count summary', () => {
    render(<ResultsTable columns={['id']} rows={[[1], [2], [3]]} />)
    expect(screen.getByText(/Mostrando 1–3 de 3 filas/)).toBeInTheDocument()
  })
})

describe('ResultsTable — row click', () => {
  it('calls onRowClick when a row is clicked', () => {
    let captured: { row: unknown[]; idx: number } | null = null as { row: unknown[]; idx: number } | null
    render(
      <ResultsTable
        columns={['id', 'name']}
        rows={[[1, 'Alice']]}
        onRowClick={(row, idx) => {
          captured = { row: row as unknown[], idx }
        }}
      />,
    )
    const row = screen.getByText('Alice').closest('tr')
    expect(row).not.toBeNull()
    fireEvent.click(row!)
    expect(captured).not.toBeNull()
    expect(captured?.row).toEqual([1, 'Alice'])
    expect(captured?.idx).toBe(0)
  })
})
