/**
 * ResultsTable — virtualised result grid.
 *
 * Renders the columns + rows of a successful query. Behaviour:
 *
 *  - NULL values are rendered as "NULL" in italic, muted text.
 *  - Long cells are truncated to `maxCellLength` (default 200) and
 *    reveal the full value via the native `title` tooltip on hover.
 *  - Click on a column header to sort by that column (ascending, then
 *    descending, then unsorted). Sorting is stable within the visible
 *    page; for truncated data sets the order is applied to the
 *    pre-truncated `rows` so the user can still scan the top N.
 *  - When `rows.length > virtualThreshold` (default 100) the table
 *    switches to a virtualised renderer. We do **not** ship
 *    `react-window` (bundle cost) — we hand-roll a windowed renderer
 *    over the visible scroll container. The windowing strategy is the
 *    "absolute positioning with translateY" pattern from CodeMirror's
 *    own list widget; it scales to tens of thousands of rows in O(1)
 *    per scroll event.
 *  - A header summary reports the row count: "Mostrando 1–100 de 1 234
 *    filas". A yellow banner is shown when `truncated === true` to
 *    nudge the user toward adding a `LIMIT` clause.
 *
 * Props
 * -----
 *  - `columns` — column names.
 *  - `rows` — `unknown[][]` aligned with `columns`. `null` and
 *    `undefined` cells are rendered as the literal `NULL`.
 *  - `truncated` — when `true`, the banner is shown.
 *  - `maxRows` — display cap. Defaults to 100 (we never show more
 *    than this even if `rows` is longer; the rest is paginated on
 *    demand). Pass `Infinity` to disable the cap.
 *  - `maxCellLength` — character cap per cell. Default 200.
 *  - `virtualThreshold` — row count above which windowing kicks in.
 *    Default 100.
 *  - `rowHeight` — pixel height of a single row, used for the
 *    virtualised renderer. Default 30.
 *  - `onRowClick` — optional click handler.
 *  - `emptyMessage` — shown when there are no rows. Default
 *    "Ejecuta una query para ver resultados".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import styles from './results.module.css'

export interface ResultsTableProps {
  columns: ReadonlyArray<string>
  rows: ReadonlyArray<ReadonlyArray<unknown>>
  truncated?: boolean
  maxRows?: number
  maxCellLength?: number
  virtualThreshold?: number
  rowHeight?: number
  emptyMessage?: string
  /** When provided, rows are clickable. */
  onRowClick?: (row: ReadonlyArray<unknown>, index: number) => void
  /** Show a "truncated" banner when `truncated === true`. */
  truncatedMessage?: string
  /** Compact density (smaller row height). */
  dense?: boolean
}

type SortDir = 'asc' | 'desc' | null

function isNullish(value: unknown): boolean {
  return value === null || value === undefined
}

function normaliseForSort(value: unknown): number | string | null {
  if (isNullish(value)) return null
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'boolean') return value ? 1 : 0
  // Try to parse as a number if it looks like one.
  if (typeof value === 'string') {
    const asNumber = Number(value)
    if (!Number.isNaN(asNumber) && value.trim() !== '') return asNumber
    return value
  }
  // For binary / objects, fall back to string representation.
  return String(value)
}

function compare(a: number | string | null, b: number | string | null): number {
  // NULLs sort last regardless of direction (standard SQL semantics).
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

function truncate(value: string, max: number): { text: string; full: string } {
  if (value.length <= max) return { text: value, full: value }
  return { text: value.slice(0, max) + '…', full: value }
}

function renderCell(value: unknown, max: number): React.ReactNode {
  if (isNullish(value)) {
    return (
      <span className={styles.nullCell} aria-label="NULL value">
        NULL
      </span>
    )
  }
  if (typeof value === 'object' && value !== null) {
    const text = JSON.stringify(value)
    const { text: short, full } = truncate(text, max)
    return (
      <span className={styles.cell} title={full}>
        {short}
      </span>
    )
  }
  const text = String(value)
  const { text: short, full } = truncate(text, max)
  return (
    <span className={styles.cell} title={full}>
      {short}
    </span>
  )
}

export function ResultsTable({
  columns,
  rows,
  truncated = false,
  maxRows = 100,
  maxCellLength = 200,
  virtualThreshold = 100,
  rowHeight = 30,
  emptyMessage = 'Ejecuta una query para ver resultados.',
  onRowClick,
  truncatedMessage = 'Resultado truncado a 10.000 filas. Añade LIMIT a tu consulta.',
  dense = false,
}: ResultsTableProps): React.ReactNode {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  // Sort the data when a column header is clicked. The sort is stable
  // enough for UI purposes: we use `Array.prototype.sort`, which is
  // stable in modern V8.
  const sortedRows = useMemo(() => {
    if (sortCol == null || sortDir == null) return rows
    const out = rows.slice()
    out.sort((a, b) => {
      const av = normaliseForSort(a[sortCol])
      const bv = normaliseForSort(b[sortCol])
      return sortDir === 'asc' ? compare(av, bv) : -compare(av, bv)
    })
    return out
  }, [rows, sortCol, sortDir])

  const visibleRows = useMemo(() => {
    if (maxRows === Infinity || sortedRows.length <= maxRows) return sortedRows
    return sortedRows.slice(0, maxRows)
  }, [sortedRows, maxRows])

  const handleHeaderClick = useCallback(
    (idx: number) => {
      if (sortCol !== idx) {
        setSortCol(idx)
        setSortDir('asc')
        return
      }
      // Cycle: asc → desc → null.
      if (sortDir === 'asc') {
        setSortDir('desc')
      } else if (sortDir === 'desc') {
        setSortDir(null)
        setSortCol(null)
      } else {
        setSortDir('asc')
      }
    },
    [sortCol, sortDir],
  )

  // Virtualisation state.
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState<number>(0)
  const [viewportHeight, setViewportHeight] = useState<number>(600)
  const useVirtual = visibleRows.length > virtualThreshold

  useEffect(() => {
    const el = containerRef.current
    if (!el || !useVirtual) return undefined
    const onScroll = (): void => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    // Measure the viewport once on mount and on resize.
    const ro = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight)
    })
    ro.observe(el)
    setViewportHeight(el.clientHeight)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [useVirtual])

  const effectiveRowHeight = dense ? Math.max(20, rowHeight - 6) : rowHeight

  const windowed = useMemo(() => {
    if (!useVirtual) return null
    const overscan = 6
    const startIdx = Math.max(0, Math.floor(scrollTop / effectiveRowHeight) - overscan)
    const visibleCount = Math.ceil(viewportHeight / effectiveRowHeight) + overscan * 2
    const endIdx = Math.min(visibleRows.length, startIdx + visibleCount)
    return {
      startIdx,
      endIdx,
      items: visibleRows.slice(startIdx, endIdx),
    }
  }, [useVirtual, scrollTop, viewportHeight, effectiveRowHeight, visibleRows])

  // Empty state.
  if (rows.length === 0) {
    return (
      <div
        className={styles.empty}
        role="status"
        data-testid="results-table-empty"
      >
        {emptyMessage}
      </div>
    )
  }

  const start = 1
  const end = visibleRows.length
  const total = rows.length

  return (
    <div className={styles.wrapper} data-testid="results-table">
      {truncated ? (
        <div className={styles.banner} role="status" data-testid="results-table-banner">
          <span aria-hidden="true">⚠</span> {truncatedMessage}
        </div>
      ) : null}

      <div className={styles.summary} aria-live="polite">
        Mostrando {start}–{end} de {total.toLocaleString('es-ES')} filas
        {sortCol != null && sortDir != null && columns[sortCol] != null ? (
          <span className={styles.sortBadge}>
            · ordenado por <strong>{columns[sortCol]}</strong>{' '}
            ({sortDir === 'asc' ? 'ascendente' : 'descendente'})
          </span>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className={`${styles.tableContainer} ${useVirtual ? styles.virtual : ''}`}
        role="region"
        aria-label="Resultados de la consulta"
        tabIndex={0}
      >
        <table
          className={styles.table}
          style={
            useVirtual
              ? { display: 'block', position: 'relative' }
              : undefined
          }
        >
          <thead className={styles.thead}>
            <tr>
              {columns.map((col, idx) => {
                const ariaSort: 'ascending' | 'descending' | 'none' =
                  sortCol === idx
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : sortDir === 'desc'
                        ? 'descending'
                        : 'none'
                    : 'none'
                return (
                  <th
                    key={`${col}-${idx}`}
                    scope="col"
                    aria-sort={ariaSort}
                    className={styles.th}
                    onClick={() => handleHeaderClick(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleHeaderClick(idx)
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Ordenar por ${col}`}
                  >
                    <span className={styles.thLabel}>{col}</span>
                    <span className={styles.sortIcon} aria-hidden="true">
                      {sortCol === idx
                        ? sortDir === 'asc'
                          ? '▲'
                          : sortDir === 'desc'
                            ? '▼'
                            : '⇅'
                        : ''}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {!useVirtual
              ? visibleRows.map((row, rowIdx) => (
                  <tr
                    key={`row-${rowIdx}`}
                    className={onRowClick ? styles.rowClickable : undefined}
                    onClick={onRowClick ? () => onRowClick(row, rowIdx) : undefined}
                  >
                    {row.map((cell, cellIdx) => (
                      <td
                        key={`cell-${rowIdx}-${cellIdx}`}
                        className={styles.td}
                      >
                        {renderCell(cell, maxCellLength)}
                      </td>
                    ))}
                  </tr>
                ))
              : windowed?.items.map((row, i) => {
                  const rowIdx = (windowed?.startIdx ?? 0) + i
                  return (
                    <tr
                      key={`row-${rowIdx}`}
                      className={onRowClick ? styles.rowClickable : undefined}
                      onClick={onRowClick ? () => onRowClick(row, rowIdx) : undefined}
                      style={{
                        position: 'absolute',
                        top: rowIdx * effectiveRowHeight,
                        left: 0,
                        right: 0,
                        height: effectiveRowHeight,
                        display: 'table',
                        tableLayout: 'auto',
                      }}
                    >
                      {row.map((cell, cellIdx) => (
                        <td
                          key={`cell-${rowIdx}-${cellIdx}`}
                          className={styles.td}
                        >
                          {renderCell(cell, maxCellLength)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
            {useVirtual ? (
              <tr
                aria-hidden="true"
                style={{
                  height: visibleRows.length * effectiveRowHeight,
                  position: 'relative',
                  pointerEvents: 'none',
                }}
              >
                <td colSpan={columns.length} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ResultsTable
