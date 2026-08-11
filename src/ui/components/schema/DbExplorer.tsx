/**
 * DbExplorer — sidebar that exposes the schema of the active database.
 *
 * Shows a tree:
 *
 *   ┌─ <database> (refresh ⟳)
 *   ├─ Tables
 *   │   ├─ users       (3)
 *   │   ├─ orders      (12)
 *   │   └─ products    (0)
 *   ├─ Views
 *   ├─ Indexes
 *   └─ Triggers
 *
 * Each table is clickable. The component is **controlled**:
 *
 *  - `selectedTable` is the currently focused table (used by the
 *    sibling `TableDefinition` panel to render details).
 *  - `onSelectTable` fires on click and on keyboard activation.
 *  - `onInsertAtCursor` (optional) is called when the user clicks the
 *    "insert column at cursor" action on a column. This is the bridge
 *    to the editor (Fase 6 polish; we keep it optional here so the
 *    Playground can integrate it incrementally).
 *
 * Empty state
 * ------------
 * When no database is selected (or the schema is still loading) the
 * component renders a contextual empty state. The "Refresh" button
 * triggers a re-introspection via the `onRefresh` callback.
 */
import { useMemo, useState } from 'react'
import {
  ChevronRight,
  Database as DatabaseIcon,
  Eye,
  Hash,
  KeyRound,
  RefreshCw,
  Sparkles,
  Table2,
  Zap,
} from 'lucide-react'

import type { DatabaseSchema, TableInfo } from '../../../workers/types'
import styles from './schema.module.css'

export interface DbExplorerProps {
  /** Active `dbId`. When `null` we show the empty state. */
  dbId: number | null
  /** Optional display name for the database. */
  databaseName?: string | null
  /** Live schema snapshot. */
  schema: DatabaseSchema | null
  /** Loading state. */
  loading?: boolean
  /** Error message. */
  error?: string | null
  /** Currently selected table. */
  selectedTable: string | null
  onSelectTable: (tableName: string | null) => void
  /** Refresh button handler. */
  onRefresh?: () => void
  /**
   * Optional callback when the user clicks "insert into editor" on a
   * column. Receives the column reference (`tableName.columnName`).
   */
  onInsertColumnAtCursor?: (ref: { table: string; column: string }) => void
}

interface Group {
  key: 'tables' | 'views' | 'indexes' | 'triggers'
  label: string
  icon: typeof Table2
  count: number
  open: boolean
  items: Array<{ name: string; sub: string }>
}

function summariseTable(t: TableInfo): string {
  return `${t.columns.length} cols`
}

export function DbExplorer({
  dbId,
  databaseName,
  schema,
  loading = false,
  error = null,
  selectedTable,
  onSelectTable,
  onRefresh,
  onInsertColumnAtCursor,
}: DbExplorerProps): React.ReactNode {
  // Local UI state: which groups are expanded.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    tables: true,
    views: true,
    indexes: false,
    triggers: false,
  })

  const groups = useMemo<Group[]>(() => {
    if (!schema) return []
    return [
      {
        key: 'tables',
        label: 'Tablas',
        icon: Table2,
        count: schema.tables.length,
        open: !!openGroups.tables,
        items: schema.tables.map((t) => ({
          name: t.name,
          sub: `${summariseTable(t)} · ~${t.rowCountEstimate} filas`,
        })),
      },
      {
        key: 'views',
        label: 'Vistas',
        icon: Eye,
        count: schema.views.length,
        open: !!openGroups.views,
        items: schema.views.map((v) => ({ name: v.name, sub: 'vista' })),
      },
      {
        key: 'indexes',
        label: 'Índices',
        icon: Hash,
        count: schema.indexes.length,
        open: !!openGroups.indexes,
        items: schema.indexes.map((i) => ({
          name: i.name,
          sub: `${i.table}${i.unique ? ' · UNIQUE' : ''}`,
        })),
      },
      {
        key: 'triggers',
        label: 'Triggers',
        icon: Zap,
        count: schema.triggers.length,
        open: !!openGroups.triggers,
        items: schema.triggers.map((tr) => ({
          name: tr.name,
          sub: tr.table,
        })),
      },
    ]
  }, [schema, openGroups])

  const toggleGroup = (key: Group['key']): void => {
    setOpenGroups((g) => ({ ...g, [key]: !g[key] }))
  }

  // Empty states.
  if (dbId == null) {
    return (
      <aside className={styles.explorer} aria-label="Explorador de base de datos">
        <div className={styles.header}>
          <DatabaseIcon size={16} aria-hidden="true" />
          <span className={styles.title}>Explorador</span>
        </div>
        <div className={styles.empty} data-testid="db-explorer-empty">
          <Sparkles size={20} aria-hidden="true" />
          <p>No hay base de datos activa.</p>
          <p className={styles.emptyHint}>
            Crea o selecciona una base de datos para ver su esquema.
          </p>
        </div>
      </aside>
    )
  }

  if (error) {
    return (
      <aside className={styles.explorer} aria-label="Explorador de base de datos">
        <div className={styles.header}>
          <DatabaseIcon size={16} aria-hidden="true" />
          <span className={styles.title}>Explorador</span>
          {onRefresh ? (
            <button
              type="button"
              className={styles.iconButton}
              onClick={onRefresh}
              aria-label="Reintentar introspección"
            >
              <RefreshCw size={14} />
            </button>
          ) : null}
        </div>
        <div className={styles.error} role="alert">
          {error}
        </div>
      </aside>
    )
  }

  return (
    <aside className={styles.explorer} aria-label="Explorador de base de datos">
      <div className={styles.header}>
        <DatabaseIcon size={16} aria-hidden="true" />
        <span className={styles.title} title={databaseName ?? undefined}>
          {databaseName ?? `DB #${dbId}`}
        </span>
        {onRefresh ? (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onRefresh}
            aria-label="Reintentar introspección"
            data-testid="db-explorer-refresh"
          >
            <RefreshCw size={14} className={loading ? styles.spinning : ''} />
          </button>
        ) : null}
      </div>

      {loading && schema == null ? (
        <div className={styles.loading} data-testid="db-explorer-loading">
          Cargando esquema…
        </div>
      ) : null}

      {schema ? (
        <ul className={styles.tree} role="tree" data-testid="db-explorer-tree">
          {groups.map((group) => {
            if (group.count === 0) return null
            const Icon = group.icon
            return (
              <li key={group.key} className={styles.treeGroup} role="treeitem" aria-expanded={group.open}>
                <button
                  type="button"
                  className={styles.groupHeader}
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={group.open}
                >
                  <ChevronRight
                    size={12}
                    className={group.open ? styles.chevronOpen : styles.chevronClosed}
                    aria-hidden="true"
                  />
                  <Icon size={14} aria-hidden="true" />
                  <span>{group.label}</span>
                  <span className={styles.badge}>{group.count}</span>
                </button>
                {group.open ? (
                  <ul className={styles.treeItems} role="group">
                    {group.items.map((item) => {
                      const isSelected = group.key === 'tables' && selectedTable === item.name
                      return (
                        <li
                          key={`${group.key}-${item.name}`}
                          className={`${styles.treeItem} ${isSelected ? styles.selected : ''}`}
                        >
                          <button
                            type="button"
                            className={styles.itemButton}
                            onClick={() =>
                              group.key === 'tables' ? onSelectTable(item.name) : undefined
                            }
                            aria-current={isSelected ? 'true' : undefined}
                            data-testid={`db-explorer-item-${item.name}`}
                          >
                            <span className={styles.itemName}>{item.name}</span>
                            <span className={styles.itemSub}>{item.sub}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}

          {selectedTable && schema ? (
            <li className={styles.tableDetail}>
              <h3 className={styles.detailTitle}>
                <KeyRound size={14} aria-hidden="true" /> Columnas de{' '}
                <code>{selectedTable}</code>
                </h3>
              <ul className={styles.columnList}>
                {(
                  schema.tables.find((t) => t.name === selectedTable)?.columns ?? []
                ).map((c) => (
                  <li
                    key={`${selectedTable}-${c.name}`}
                    className={styles.columnItem}
                  >
                    <button
                      type="button"
                      className={styles.columnButton}
                      onClick={() =>
                        onInsertColumnAtCursor?.({ table: selectedTable, column: c.name })
                      }
                      title="Insertar columna en el editor"
                    >
                      <span className={styles.columnName}>{c.name}</span>
                      <span className={styles.columnType}>{c.type}</span>
                      {c.primaryKeyPosition > 0 ? (
                        <span className={styles.pkBadge}>PK</span>
                      ) : null}
                      {!c.nullable ? (
                        <span className={styles.nnBadge}>NN</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ) : null}
        </ul>
      ) : null}
    </aside>
  )
}

export default DbExplorer
