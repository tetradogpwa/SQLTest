/**
 * TableDefinition — full description of a single table.
 *
 * Renders the columns, primary key, foreign keys, unique constraints,
 * check constraints, and indexes for a {@link TableInfo}. Designed
 * to live next to the `DbExplorer` (or below the editor) as a
 * detailed view.
 *
 * The component is purely presentational: it takes a `TableInfo` and
 * renders. The parent owns selection state and database / schema
 * fetching.
 */
import { useMemo } from 'react'
import { Columns3, KeyRound, Link2, Lock, ListChecks, FileCode2 } from 'lucide-react'

import type { TableInfo } from '../../../workers/types'
import styles from './schema.module.css'

export interface TableDefinitionProps {
  table: TableInfo | null
  /**
   * Optional "insert into editor" callback. When provided, the
   * column-name cells become buttons.
   */
  onInsertColumn?: (column: string) => void
}

function iconForType(type: string): string {
  const upper = type.toUpperCase()
  if (upper.includes('INT')) return '#'
  if (upper.includes('CHAR') || upper.includes('TEXT') || upper.includes('CLOB')) return 'A'
  if (upper.includes('REAL') || upper.includes('FLOAT') || upper.includes('DOUBLE') || upper.includes('NUMERIC')) return '1.2'
  if (upper.includes('BLOB')) return '0x'
  if (upper.includes('TIMESTAMP') || upper.includes('DATE') || upper.includes('TIME')) return '⌚'
  if (upper.includes('BOOL')) return '✓✗'
  return '?';
}

export function TableDefinition({
  table,
  onInsertColumn,
}: TableDefinitionProps): React.ReactNode {
  const sortedColumns = useMemo(() => {
    if (!table) return []
    return [...table.columns].sort((a, b) => {
      // PK columns first, in their declared order.
      if (a.primaryKeyPosition > 0 && b.primaryKeyPosition > 0) {
        return a.primaryKeyPosition - b.primaryKeyPosition
      }
      if (a.primaryKeyPosition > 0) return -1
      if (b.primaryKeyPosition > 0) return 1
      return 0
    })
  }, [table])

  if (!table) {
    return (
      <div className={styles.tableDefEmpty} data-testid="table-definition-empty">
        <Columns3 size={20} aria-hidden="true" />
        <p>Selecciona una tabla en el explorador para ver su definición.</p>
      </div>
    )
  }

  return (
    <div className={styles.tableDef} data-testid="table-definition">
      <header className={styles.tableDefHeader}>
        <h3 className={styles.tableDefTitle}>
          <Columns3 size={16} aria-hidden="true" /> {table.name}
        </h3>
        <p className={styles.tableDefSub}>
          {table.columns.length} columnas · ~{table.rowCountEstimate.toLocaleString('es-ES')} filas
        </p>
      </header>

      <table className={styles.columnTable}>
        <thead>
          <tr>
            <th scope="col" className={styles.colName}>
              Nombre
            </th>
            <th scope="col" className={styles.colType}>
              Tipo
            </th>
            <th scope="col" className={styles.colNull}>
              Nulo
            </th>
            <th scope="col" className={styles.colDefault}>
              Por defecto
            </th>
            <th scope="col" className={styles.colKey}>
              Claves
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedColumns.map((col) => (
            <tr key={`${table.name}-${col.name}`} className={styles.columnRow}>
              <td className={styles.colName}>
                {onInsertColumn ? (
                  <button
                    type="button"
                    className={styles.insertButton}
                    onClick={() => onInsertColumn(col.name)}
                    title="Insertar en el editor"
                    data-testid={`table-def-column-${col.name}`}
                  >
                    {col.name}
                  </button>
                ) : (
                  col.name
                )}
              </td>
              <td className={styles.colType}>
                <span
                  className={styles.typeIcon}
                  aria-hidden="true"
                  data-type={col.type}
                >
                  {iconForType(col.type)}
                </span>
                <span>{col.type}</span>
              </td>
              <td className={styles.colNull}>
                {col.nullable ? (
                  <span className={styles.muted}>Sí</span>
                ) : (
                  <span className={styles.nn}>NOT NULL</span>
                )}
              </td>
              <td className={styles.colDefault}>
                {col.defaultValue ? <code>{col.defaultValue}</code> : <span className={styles.muted}>—</span>}
              </td>
              <td className={styles.colKey}>
                {col.primaryKeyPosition > 0 ? (
                  <span className={styles.pkBadge} title="Primary Key">
                    <KeyRound size={10} aria-hidden="true" /> PK
                  </span>
                ) : null}
                {table.foreignKeys.some((fk) => fk.from === col.name) ? (
                  <span className={styles.fkBadge} title="Foreign Key">
                    <Link2 size={10} aria-hidden="true" /> FK
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {table.foreignKeys.length > 0 ? (
        <section className={styles.tableDefSection} aria-labelledby="fk-heading">
          <h4 id="fk-heading" className={styles.tableDefSectionTitle}>
            <Link2 size={14} aria-hidden="true" /> Foreign Keys
          </h4>
          <ul className={styles.constraintList}>
            {table.foreignKeys.map((fk, i) => (
              <li key={`fk-${i}`} className={styles.constraintItem}>
                <code>{fk.from}</code> → <code>{fk.table}.{fk.to}</code>
                {fk.onUpdate ? <span className={styles.muted}> · ON UPDATE {fk.onUpdate}</span> : null}
                {fk.onDelete ? <span className={styles.muted}> · ON DELETE {fk.onDelete}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {table.uniqueConstraints.length > 0 ? (
        <section className={styles.tableDefSection}>
          <h4 className={styles.tableDefSectionTitle}>
            <Lock size={14} aria-hidden="true" /> Unique Constraints
          </h4>
          <ul className={styles.constraintList}>
            {table.uniqueConstraints.map((cols, i) => (
              <li key={`uq-${i}`} className={styles.constraintItem}>
                <code>({cols.join(', ')})</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {table.checkConstraints.length > 0 ? (
        <section className={styles.tableDefSection}>
          <h4 className={styles.tableDefSectionTitle}>
            <ListChecks size={14} aria-hidden="true" /> Check Constraints
          </h4>
          <ul className={styles.constraintList}>
            {table.checkConstraints.map((expr, i) => (
              <li key={`ck-${i}`} className={styles.constraintItem}>
                <code>{expr}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className={styles.tableDefDetails}>
        <summary className={styles.tableDefSummary}>
          <FileCode2 size={12} aria-hidden="true" /> DDL
        </summary>
        <pre className={styles.tableDefDDL}>
          <code>{table.createSql}</code>
        </pre>
      </details>
    </div>
  )
}

export default TableDefinition
