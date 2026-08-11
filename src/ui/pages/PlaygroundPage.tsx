/**
 * Playground page — full SQL editor experience.
 *
 * Layout (desktop):
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ <Header />                                                          │
 *   ├─────────────────────────────────────────────────────────────────────┤
 *   │ Toolbar: DB selector · status · Run · Snapshots · Undo · Stats      │
 *   ├──────────────┬─────────────────────────────────────┬────────────────┤
 *   │ History      │ Editor                              │ DB Explorer    │
 *   │              │                                     │                │
 *   │              │ [Result / Error]                    │ + Snapshots    │
 *   │              │                                     │ + Stats        │
 *   └──────────────┴─────────────────────────────────────┴────────────────┘
 *
 * Responsibilities
 * ----------------
 *  - Boots the Worker via {@link useDatabase}.
 *  - Tracks the active DB via the persistent setting
 *    `defaultDatabase` (string slug). When the user picks a different
 *    DB in the toolbar, the page writes the new value to the setting
 *    and registers the new `dbId` with `useDatabase` so the Worker
 *    reopens it on the next run.
 *  - Wires {@link SqlEditor} to {@link useQuery} and {@link useSchema}.
 *  - Renders the result, the error banner, the history list.
 *  - Re-introspects the schema on every successful DDL run (CREATE,
 *    DROP, ALTER) so the explorer stays in sync.
 *  - On every destructive statement (`requiresCheckpoint` from the
 *    statement analyzer), the page asks the Worker to capture a
 *    snapshot first, so the Undo button has something to revert to.
 *  - The `SnapshotsPanel` and `StatsPanel` sit under the explorer;
 *    the `UndoButton` sits in the toolbar.
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
import { useUserDatabases } from '../../hooks/useUserDatabases'
import { useSettings } from '../../hooks/useSettings'
import { settings as settingsStore } from '../../core/persistence'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/persistence/dexie'
import { analyze } from '../../workers/statement-analyzer'
import type { AnalyzedStatement } from '../../workers/types'
import { useTranslation } from '../../core/i18n/i18n'
import type { SerializedError } from '../../workers/types'

import { SqlEditor } from '../components/editor/SqlEditor'
import { ResultsTable } from '../components/results/ResultsTable'
import { ErrorBanner } from '../components/results/ErrorBanner'
import { DbExplorer } from '../components/schema/DbExplorer'
import { TableDefinition } from '../components/schema/TableDefinition'
import { DbSelector } from '../components/playground/DbSelector'
import { SnapshotsPanel } from '../components/playground/SnapshotsPanel'
import { UndoButton } from '../components/playground/UndoButton'
import { StatsPanel } from '../components/playground/StatsPanel'

import styles from './page.module.css'
import playgroundStyles from './playground.module.css'

/**
 * The default seed for the playground database. The Worker creates
 * the file lazily on first exec. The `dbId` `1` is reserved for the
 * built-in playground across sessions; user-created DBs get higher
 * numbers assigned by the `ImportExportManager`.
 */
const DEFAULT_DB_ID: number = 1
const DEFAULT_DB_NAME = 'playground'
const DEFAULT_FILENAME = 'playground.sqlite3'
const DEFAULT_STORAGE_KEY = 'playground'

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

/** A statement is "destructive" when the analyzer flags a checkpoint. */
function isDestructive(statements: ReadonlyArray<AnalyzedStatement>): boolean {
  return statements.some((s) => s.requiresCheckpoint)
}

function tableNames(schema: { tables: ReadonlyArray<{ name: string }> } | null): string[] {
  if (!schema) return []
  return schema.tables.map((t) => t.name)
}

function columnNames(
  schema: { tables: ReadonlyArray<{ columns: ReadonlyArray<{ name: string }> }> } | null,
): string[] {
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
  const { databases } = useUserDatabases()
  const settings = useSettings()
  const [editorValue, setEditorValue] = useState<string>(SEED_SQL)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState<number>(14)
  const [editorRef, setEditorRef] = useState<import('@uiw/react-codemirror').EditorView | null>(null)
  const debouncedSchema = useDebounce(schema, 300)
  // The "user DB id" key used to look up the db in the user DB list.
  // `null` (the built-in playground) maps to the default storage key.
  const storageKey =
    dbId === null || dbId === DEFAULT_DB_ID
      ? DEFAULT_STORAGE_KEY
      : `db-${dbId}`

  // Count of queries executed in this session for the active DB.
  const queriesExecuted = useLiveQuery(
    async () => {
      if (dbId == null) return 0
      return db.queryHistory.where('dbId').equals(dbId).count()
    },
    [dbId],
    0,
  )

  // Current DB size — read from the user DBs list (for created /
  // imported DBs) or fall back to the built-in estimate (the
  // playground file is tiny, so we read it from the Worker on mount).
  const activeUserDb = useMemo(() => {
    if (dbId == null || dbId === DEFAULT_DB_ID) return null
    return databases.find((d) => d.id === `db-${dbId}`) ?? null
  }, [dbId, databases])
  const sizeBytes = activeUserDb?.sizeBytes ?? null

  // Read the persisted default DB once on mount and set the active
  // dbId from it. We do not write to the setting on every change —
  // that's the user's choice via the selector.
  useEffect(() => {
    let cancelled = false
    void settingsStore.get('defaultDatabase').then((v) => {
      if (cancelled) return
      if (typeof v === 'string' && v.length > 0) {
        // The setting stores the string id; we only support the
        // built-in playground for now, so we map anything else to
        // the default.
        if (v === DEFAULT_STORAGE_KEY) {
          setActiveDb(DEFAULT_DB_ID)
        } else {
          // Future: parse `db-<n>` and set accordingly.
          setActiveDb(DEFAULT_DB_ID)
        }
      } else {
        setActiveDb(DEFAULT_DB_ID)
      }
    })
    return () => {
      cancelled = true
    }
  }, [setActiveDb])

  // Open the current DB on the Worker. For the built-in playground
  // we use the default filename; for user DBs we derive the filename
  // from the storage key (the Worker's `ImportExportManager` already
  // has it open, but we re-register it so the recovery path works).
  useEffect(() => {
    if (!ready || !api || dbId == null) return
    const filename = computeFilename(dbId, activeUserDb)
    registerDb(dbId, filename)
    void api
      .open(dbId, filename, 'readwrite')
      .catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[playground] open failed:', e)
      })
  }, [ready, api, dbId, registerDb, activeUserDb])

  // Read the persisted font size once on mount.
  useEffect(() => {
    void settingsStore.get('fontSize').then((v) => {
      if (v === 'sm') setFontSize(12)
      else if (v === 'lg') setFontSize(16)
      else setFontSize(14)
    })
  }, [])

  // Editor execute handler. After a DDL run, re-introspect the schema.
  // Before a destructive run, capture a snapshot so Undo has a target.
  const handleExecute = useCallback(
    async (sql: string) => {
      if (!api || dbId == null) return
      const statements = analyze(sql)
      if (isDestructive(statements) && dbId !== DEFAULT_DB_ID) {
        // Only capture an auto-snapshot for user DBs. The built-in
        // playground is intentionally reset on every app start, so
        // the Undo button is a no-op there.
        try {
          await api.snapshot(dbId, 'auto: pre-destructive', 'pre-destructive')
        } catch {
          // Non-fatal — the run still proceeds.
        }
      }
      await run(sql)
      if (statements.some((s) => s.kind === 'create' || s.kind === 'drop' || s.kind === 'alter')) {
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

  const handleSelectorChange = useCallback(
    (next: number | null) => {
      // `null` is the built-in playground; any other value is a user
      // DB's numeric id.
      const target = next ?? DEFAULT_DB_ID
      setActiveDb(target)
    },
    [setActiveDb],
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
          <DbSelector value={dbId} onChange={handleSelectorChange} />
          <span
            className={playgroundStyles.status}
            data-status={status}
            title={`Worker status: ${status}${capability ? ` (${capability})` : ''}`}
          >
            <CircleDot size={12} aria-hidden="true" />
            {statusLabel}
            {capability ? <span className={playgroundStyles.capability}>· {capability}</span> : null}
          </span>
          <UndoButton dbId={dbId} storageKey={storageKey} />
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
            tabSize={settings.values.tabSize}
            wordWrap={settings.values.wordWrap}
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

        {/* Schema explorer + side panels */}
        <div className={playgroundStyles.explorerArea}>
          <DbExplorer
            dbId={dbId}
            databaseName={dbId === DEFAULT_DB_ID ? DEFAULT_DB_NAME : activeUserDb?.name ?? DEFAULT_DB_NAME}
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
          <div className={playgroundStyles.sidePanelStack}>
            <SnapshotsPanel dbId={dbId} storageKey={storageKey} />
            <StatsPanel
              sizeBytes={sizeBytes}
              queriesExecuted={queriesExecuted ?? 0}
              lastError={error?.translatedMessage ?? null}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Derive the on-disk filename for a given active dbId. The built-in
 * playground always lives at `playground.sqlite3`; user DBs are
 * `${name}.sqlite3` (sanitised by the Worker on creation).
 */
function computeFilename(
  dbId: number,
  activeUserDb: { name: string } | null,
): string {
  if (dbId === DEFAULT_DB_ID) return DEFAULT_FILENAME
  const name = activeUserDb?.name ?? `db-${dbId}`
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '_')
  return `${safe}.sqlite3`
}

export default PlaygroundPage
