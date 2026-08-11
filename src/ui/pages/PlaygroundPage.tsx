/**
 * Playground page — full SQL editor experience.
 *
 * Layout (desktop):
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ <Header />                                                          │
 *   ├──────────────┬─────────────────────────────────────┬────────────────┤
 *   │ History      │ Editor                              │ DB Explorer    │
 *   │              │                                     │                │
 *   │              │ [Result / Error]                    │                │
 *   └──────────────┴─────────────────────────────────────┴────────────────┘
 *
 * Layout (mobile, < 768px): the sidebars stack under the editor.
 *
 * Responsibilities
 * ----------------
 *  - Boots the Worker via {@link useDatabase}.
 *  - Picks the *active* database from the persisted `defaultDatabase`
 *    setting (for now we just default to a small in-memory `library`
 *    seed; full DatabaseManager UI lands in a later phase).
 *  - Wires {@link SqlEditor} to {@link useQuery} and {@link useSchema}.
 *  - Renders the result, the error banner, and the history list.
 *  - Re-introspects the schema on every successful DDL run (CREATE,
 *    DROP, ALTER) so the explorer stays in sync.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Database as DatabaseIcon,
  Play,
  Square,
  Clock,
  CircleDot,
  Save,
  Trash2,
} from 'lucide-react'

import { useDatabase } from '../../hooks/useDatabase'
import { useQuery } from '../../hooks/useQuery'
import { useSchema } from '../../hooks/useSchema'
import { useDebounce } from '../../hooks/useDebounce'
import { SqlEditor } from '../components/editor/SqlEditor'
import { ResultsTable } from '../components/results/ResultsTable'
import { ErrorBanner } from '../components/results/ErrorBanner'
import { DbExplorer } from '../components/schema/DbExplorer'
import { TableDefinition } from '../components/schema/TableDefinition'
import { settings } from '../../core/persistence'
import { useTranslation } from '../../core/i18n/i18n'
import type { DatabaseSchema } from '../../workers/types'
import type { SerializedError } from '../../workers/types'

import styles from './page.module.css'
import playgroundStyles from './playground.module.css'

/**
 * The default seed for the playground database. In a later phase this
 * is replaced by a real "import or create" flow wired to the Worker.
 */
const DEFAULT_DB_ID = 1
const DEFAULT_DB_NAME = 'playground'
const DEFAULT_FILENAME = 'playground.sqlite3'

const SEED_SQL = `-- Bienvenido al Playground SQL.
-- Pulsa Ctrl/Cmd+Enter para ejecutar.
-- Crea una tabla, inserta datos y prueba consultas.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  total REAL NOT NULL,
  status TEXT DEFAULT 'pending'
);

-- Datos de ejemplo
INSERT INTO users (id, name, email) VALUES
  (1, 'Ada Lovelace', '[email protected]'),
  (2, 'Alan Turing', '[email protected]'),
  (3, 'Grace Hopper', '[email protected]')
ON CONFLICT (id) DO NOTHING;

INSERT INTO orders (id, user_id, total, status) VALUES
  (1, 1, 99.99, 'paid'),
  (2, 2, 149.50, 'pending'),
  (3, 1, 24.00, 'paid')
ON CONFLICT (id) DO NOTHING;

-- Tu primera consulta
SELECT u.name, COUNT(o.id) AS num_orders, COALESCE(SUM(o.total), 0) AS total_spent
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id
ORDER BY total_spent DESC;
`

/**
 * Detect a DDL statement by simple keyword sniffing. The Worker also
 * classifies statements via `analyze()`; this is a defensive client-
 * side check so we only re-introspect the schema when really needed.
 */
function isDdl(sql: string): boolean {
  return /\b(CREATE|DROP|ALTER|RENAME)\b/i.test(sql)
}

function tableNames(schema: DatabaseSchema | null): string[] {
  if (!schema) return []
  return schema.tables.map((t) => t.name)
}

function columnNames(schema: DatabaseSchema | null): string[] {
  if (!schema) return []
  return schema.tables.flatMap((t) => t.columns.map((c) => c.name))
}

export function PlaygroundPage(): React.ReactNode {
  const { t } = useTranslation()
  const { api, dbId, setActiveDb, ready, status, capability, error: dbError, registerDb } =
    useDatabase()
  const { schema, loading: schemaLoading, error: schemaError, refresh: refreshSchema, invalidate: invalidateSchema } =
    useSchema()
  const { run, result, loading, error, history, clearHistory, cancel, executionMs } = useQuery()
  const [editorValue, setEditorValue] = useState<string>(SEED_SQL)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState<number>(14)
  const [editorRef, setEditorRef] = useState<import('@uiw/react-codemirror').EditorView | null>(null)
  const debouncedSchema = useDebounce(schema, 300)

  // Set the default database on first mount and ensure the Worker has
  // a DB to talk to. The `registerDb` call records the mapping so the
  // hook can reopen it after a Worker crash.
  useEffect(() => {
    if (dbId == null) setActiveDb(DEFAULT_DB_ID)
  }, [dbId, setActiveDb])

  useEffect(() => {
    if (ready && api && dbId != null) {
      // Fire-and-forget open. If the file doesn't exist yet, the
      // Worker will create it on the first exec. We register the
      // (dbId, filename) pair so the Worker manager knows to reopen
      // it on recovery.
      registerDb(dbId, DEFAULT_FILENAME)
      void api
        .open(dbId, DEFAULT_FILENAME, 'readwrite')
        .catch((e: unknown) => {
          // eslint-disable-next-line no-console
          console.warn('[playground] open failed:', e)
        })
    }
  }, [ready, api, dbId, registerDb])

  // Read the persisted font size once on mount.
  useEffect(() => {
    void settings.get('fontSize').then((v) => {
      if (v === 'sm') setFontSize(12)
      else if (v === 'lg') setFontSize(16)
      else setFontSize(14)
    })
  }, [])

  // Editor execute handler. After a DDL run, re-introspect the schema.
  const handleExecute = useCallback(
    async (sql: string) => {
      if (!api || dbId == null) return
      await run(sql)
      if (isDdl(sql)) {
        invalidateSchema()
        void refreshSchema()
      }
    },
    [api, dbId, run, invalidateSchema, refreshSchema],
  )

  const insertAtCursor = useCallback(
    (ref: { table: string; column: string }) => {
      if (!editorRef) return
      const view = editorRef
      const head = view.state.selection.main.head
      const insert = `${ref.table}.${ref.column}`
      view.dispatch({
        changes: { from: head, insert },
        selection: { anchor: head + insert.length },
      })
      view.focus()
    },
    [editorRef],
  )

  const handleEditorReady = useCallback(
    (view: import('@uiw/react-codemirror').EditorView) => {
      setEditorRef(view)
    },
    [],
  )

  const statusLabel =
    status === 'ready'
      ? 'Worker conectado'
      : status === 'initializing' || status === 'recovering'
        ? 'Inicializando…'
        : status === 'dead'
          ? 'Worker sin conexión'
          : 'Sin inicializar'

  const knownTables = useMemo(() => tableNames(debouncedSchema), [debouncedSchema])
  const knownColumns = useMemo(() => columnNames(debouncedSchema), [debouncedSchema])

  return (
    <div className={styles.page} data-testid="playground-page">
      <header className={styles.pageHeader}>
        <h1>
          <DatabaseIcon size={22} aria-hidden="true" style={{ verticalAlign: 'middle' }} />{' '}
          {t('playground.title')}
        </h1>
        <p>{t('playground.subtitle')}</p>
      </header>

      <div className={playgroundStyles.toolbar} role="toolbar" aria-label="Barra de herramientas del editor">
        <div className={playgroundStyles.toolbarLeft}>
          <span
            className={playgroundStyles.status}
            data-status={status}
            title={`Worker status: ${status}${capability ? ` (${capability})` : ''}`}
          >
            <CircleDot size={12} aria-hidden="true" />
            {statusLabel}
            {capability ? <span className={playgroundStyles.capability}>· {capability}</span> : null}
          </span>
        </div>
        <div className={playgroundStyles.toolbarRight}>
          {loading ? (
            <button
              type="button"
              className={playgroundStyles.dangerButton}
              onClick={() => void cancel()}
              aria-label="Detener consulta"
            >
              <Square size={14} aria-hidden="true" /> Detener
            </button>
          ) : (
            <button
              type="button"
              className={playgroundStyles.primaryButton}
              onClick={() => void handleExecute(editorValue)}
              disabled={!ready || loading}
              aria-label="Ejecutar consulta (Ctrl+Enter)"
              data-testid="run-button"
            >
              <Play size={14} aria-hidden="true" /> Ejecutar
            </button>
          )}
          {executionMs != null ? (
            <span className={playgroundStyles.execTime} title="Tiempo de ejecución">
              <Clock size={12} aria-hidden="true" /> {executionMs}ms
            </span>
          ) : null}
        </div>
      </div>

      {dbError ? (
        <div className={playgroundStyles.errorShell} role="alert">
          <strong>Error del motor SQL:</strong> {dbError}
        </div>
      ) : null}

      <div className={playgroundStyles.layout}>
        {/* History sidebar */}
        <aside className={playgroundStyles.history} aria-label="Historial de consultas">
          <header className={playgroundStyles.asideHeader}>
            <span>Historial</span>
            {history.length > 0 ? (
              <button
                type="button"
                className={playgroundStyles.linkButton}
                onClick={() => void clearHistory()}
                aria-label="Limpiar historial"
              >
                <Trash2 size={12} aria-hidden="true" /> Limpiar
              </button>
            ) : null}
          </header>
          {history.length === 0 ? (
            <p className={playgroundStyles.asideEmpty}>
              Aún no has ejecutado ninguna consulta.
            </p>
          ) : (
            <ul className={playgroundStyles.historyList}>
              {history.map((entry) => (
                <li
                  key={entry.id ?? `${entry.executedAt}-${entry.sql}`}
                  className={`${playgroundStyles.historyItem} ${
                    entry.success ? '' : playgroundStyles.historyError
                  }`}
                >
                  <button
                    type="button"
                    className={playgroundStyles.historyButton}
                    onClick={() => setEditorValue(entry.sql)}
                    title={entry.sql}
                  >
                    <span className={playgroundStyles.historySql}>
                      {entry.sql.split('\n')[0]?.slice(0, 60) ?? ''}
                    </span>
                    <span className={playgroundStyles.historyMeta}>
                      <Clock size={10} aria-hidden="true" /> {entry.executionMs}ms
                      {!entry.success ? ' · error' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Editor + results */}
        <div className={playgroundStyles.editorArea}>
          <SqlEditor
            value={editorValue}
            onChange={setEditorValue}
            onExecute={handleExecute}
            schemaContext={debouncedSchema}
            runSelectionOnly={false}
            fontSize={fontSize}
            height="360px"
            ariaLabel="Editor SQL del playground"
            onReady={handleEditorReady}
          />
          {error ? (
            <ErrorBanner
              error={error as SerializedError}
              knownTables={knownTables}
              knownColumns={knownColumns}
            />
          ) : null}
          {result && result.ok && result.columns && result.rows ? (
            <ResultsTable
              columns={result.columns}
              rows={result.rows}
              truncated={!!result.truncated}
              maxRows={100}
            />
          ) : null}
          {result && !result.ok && !error ? (
            <div className={playgroundStyles.resultPlaceholder}>
              <Save size={20} aria-hidden="true" /> La consulta no devolvió resultados.
            </div>
          ) : null}
          {!result && !loading ? (
            <div className={playgroundStyles.resultPlaceholder}>
              Ejecuta una query para ver resultados. Atajo: <kbd>Ctrl</kbd>+<kbd>Enter</kbd>
            </div>
          ) : null}
        </div>

        {/* Schema explorer */}
        <div className={playgroundStyles.explorerArea}>
          <DbExplorer
            dbId={dbId}
            databaseName={DEFAULT_DB_NAME}
            schema={debouncedSchema}
            loading={schemaLoading}
            error={schemaError}
            selectedTable={selectedTable}
            onSelectTable={setSelectedTable}
            onRefresh={() => void refreshSchema()}
            onInsertColumnAtCursor={insertAtCursor}
          />
          <TableDefinition
            table={
              selectedTable && debouncedSchema
                ? debouncedSchema.tables.find((t) => t.name === selectedTable) ?? null
                : null
            }
            onInsertColumn={(column) => {
              if (selectedTable) {
                insertAtCursor({ table: selectedTable, column })
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default PlaygroundPage
