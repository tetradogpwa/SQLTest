/**
 * Tests for ResultsTable.
 *
 * Covers the empty state, the happy path, NULL rendering, sorting,
 * truncation of long cells, and the truncated banner.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import { ResultsTable } from '../../../../src/ui/components/results/ResultsTable'

afterEach(() => {
  cleanup()
})

describe('ResultsTable', () => {
  it('renders the empty message when there are no rows', () => {
    render(<ResultsTable columns={['id', 'name']} rows={[]} />)
    expect(screen.getByText(/Ejecuta una query para ver resultados/i)).toBeTruthy()
  })

  it('renders the rows and column headers', () => {
    render(
      <ResultsTable
        columns={['id', 'name']}
        rows={[
          [1, 'Ada'],
          [2, 'Bo'],
        ]}
      />,
    )
    expect(screen.getByText('id')).toBeTruthy()
    expect(screen.getByText('name')).toBeTruthy()
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('Bo')).toBeTruthy()
  })

  it('renders NULL values as a "NULL" badge', () => {
    render(
      <ResultsTable
        columns={['id', 'name']}
        rows={[
          [1, null],
          [2, undefined],
        ]}
      />,
    )
    const nullCells = screen.getAllByLabelText('NULL value')
    expect(nullCells.length).toBe(2)
    expect(nullCells[0]?.textContent).toBe('NULL')
  })

  it('truncates long cell values to maxCellLength', () => {
    const long = 'x'.repeat(500)
    render(
      <ResultsTable columns={['blob']} rows={[[long]]} maxCellLength={50} />,
    )
    const cell = screen.getByTitle(long)
    expect(cell.textContent?.length).toBeLessThanOrEqual(51) // 50 + ellipsis
    expect(cell.textContent?.endsWith('…')).toBe(true)
  })

  it('sorts by column header click (asc → desc → null)', () => {
    render(
      <ResultsTable
        columns={['id', 'name']}
        rows={[
          [3, 'Charlie'],
          [1, 'Ada'],
          [2, 'Bo'],
        ]}
      />,
    )
    const nameHeader = screen.getByText('name')
    fireEvent.click(nameHeader)
    // After one click → ascending by name.
    const rowsAfterAsc = screen.getAllByRole('row')
    // header row + 3 data rows
    expect(rowsAfterAsc.length).toBe(4)
    // Row 0 is the header, row 1 should be Ada (asc by name).
    const cellsInRow1 = within(rowsAfterAsc[1] as HTMLElement).getAllByText(/Ada|Bo|Charlie/)
    expect(cellsInRow1[0]?.textContent).toBe('Ada')
    // Click again → descending.
    fireEvent.click(nameHeader)
    const rowsAfterDesc = screen.getAllByRole('row')
    const cellsInRow1Desc = within(rowsAfterDesc[1] as HTMLElement).getAllByText(/Ada|Bo|Charlie/)
    expect(cellsInRow1Desc[0]?.textContent).toBe('Charlie')
    // Click again → unsorted (back to original order).
    fireEvent.click(nameHeader)
    const rowsAfterUnsort = screen.getAllByRole('row')
    const cellsInRow1Unsort = within(rowsAfterUnsort[1] as HTMLElement).getAllByText(/Ada|Bo|Charlie/)
    expect(cellsInRow1Unsort[0]?.textContent).toBe('Charlie') // original order
    void nameHeader
  })

  it('shows the truncated banner when truncated=true', () => {
    render(
      <ResultsTable
        columns={['id']}
        rows={[[1]]}
        truncated
        truncatedMessage="truncado!"
      />,
    )
    expect(screen.getByText('truncado!')).toBeTruthy()
  })

  it('caps visible rows to maxRows (and reports the cap in the header)', () => {
    const rows = Array.from({ length: 500 }, (_, i) => [i])
    render(<ResultsTable columns={['id']} rows={rows} maxRows={10} />)
    // The summary shows the range. The exact text depends on locale, but it
    // includes "filas" and a "1–10" or "1 - 10" string.
    const html = document.body.textContent ?? ''
    expect(html).toMatch(/10/)
    expect(html).toMatch(/500|filas/i)
    // We should not render all 500 rows.
    const renderedRows = document.querySelectorAll('tbody tr')
    expect(renderedRows.length).toBeLessThanOrEqual(10)
  })
})
