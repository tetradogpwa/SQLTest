/**
 * Databases page — list of user databases with create / import / export /
 * rename / delete actions.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ Header: title + subtitle + "Create" + "Import" CTAs              │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ Search box                                                       │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ Empty state OR table                                             │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Data flow:
 *   - The list comes from {@link useUserDatabases} (live Dexie query).
 *   - The four actions (open / rename / export / delete) are wired to
 *     the hook and to a tiny navigation callback for "Open in
 *     playground".
 *   - The two modals (Create / Import) are local state — open + close
 *     just toggles a boolean.
 *
 * No file is ever touched from the Main Thread; the Worker is the
 * source of truth for the bytes, Dexie is the source of truth for the
 * list.
 */
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database as DatabaseIcon, FileUp, Plus, Search } from 'lucide-react'

import { useUserDatabases } from '../../hooks/useUserDatabases'
import { useDatabase } from '../../hooks/useDatabase'
import { useTranslation } from '../../core/i18n/i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import type { Database as DatabaseRow } from '../../core/persistence'

import { CreateDatabaseDialog } from '../components/databases/CreateDatabaseDialog'
import { ImportDatabaseDialog } from '../components/databases/ImportDatabaseDialog'
import { RowActions } from '../components/databases/RowActions'

import styles from './page.module.css'
import databasesStyles from './databases.module.css'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatRelative(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp
  if (diff < 60_000) return 'hace un momento'
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)} h`
  if (diff < 7 * 86_400_000) return `hace ${Math.floor(diff / 86_400_000)} d`
  return new Date(timestamp).toLocaleDateString('es-ES')
}

function originLabelKey(origin: DatabaseRow['origin']): string {
  return `databases.origin.${origin}`
}

export function DatabasesPage(): React.ReactNode {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { databases, loading, create, importFile, exportFile, rename, delete: deleteDb } =
    useUserDatabases()
  const { setActiveDb, registerDb } = useDatabase()

  const [createOpen, setCreateOpen] = useState<boolean>(false)
  const [importOpen, setImportOpen] = useState<boolean>(false)
  const [renameTarget, setRenameTarget] = useState<DatabaseRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DatabaseRow | null>(null)
  const [search, setSearch] = useState<string>('')

  const filtered = useMemo<ReadonlyArray<DatabaseRow>>(() => {
    const q = search.trim().toLowerCase()
    if (q === '') return databases
    return databases.filter((d) => d.name.toLowerCase().includes(q))
  }, [databases, search])

  const handleCreate = useCallback(
    async (name: string) => {
      await create(name)
    },
    [create],
  )

  const handleImport = useCallback(
    async (file: File, displayName: string) => {
      await importFile(file, displayName)
    },
    [importFile],
  )

  const handleOpen = useCallback(
    (db: DatabaseRow) => {
      // The Dexie row id encodes the Worker's numeric dbId. Extract it
      // and use it for `setActiveDb`. We also register the filename so
      // the Worker can re-open it after a crash.
      const match = /^db-(\d+)$/.exec(db.id)
      if (!match || !match[1]) return
      const numericDbId = Number(match[1])
      setActiveDb(numericDbId)
      // The playground reads its filename from a constant, so we don't
      // know the exact filename here. The Worker can derive it from
      // the user DB list, but for now we just navigate.
      void registerDb(numericDbId, `${db.name}.sqlite3`)
      navigate('/playground')
    },
    [navigate, setActiveDb, registerDb],
  )

  const handleRename = useCallback((db: DatabaseRow) => {
    setRenameTarget(db)
  }, [])

  const handleExport = useCallback(
    async (db: DatabaseRow) => {
      try {
        const { blob, filename } = await exportFile(db.id)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.style.display = 'none'
        document.body.appendChild(a)
        a.click()
        a.remove()
        // Defer revoke so the browser has time to start the download.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[databases] export failed:', err)
      }
    },
    [exportFile],
  )

  const handleDelete = useCallback((db: DatabaseRow) => {
    setDeleteTarget(db)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteDb(deleteTarget.id)
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, deleteDb])

  const confirmRename = useCallback(
    async (newName: string) => {
      if (!renameTarget) return
      await rename(renameTarget.id, newName)
      setRenameTarget(null)
    },
    [renameTarget, rename],
  )

  return (
    <div className={styles.page} data-testid="databases-page">
      <header className={styles.pageHeader}>
        <div>
          <h1>
            <DatabaseIcon size={22} aria-hidden="true" style={{ verticalAlign: 'middle' }} />{' '}
            {t('databases.title')}
          </h1>
          <p>{t('databases.subtitle')}</p>
        </div>
        <div className={databasesStyles.headerActions}>
          <button
            type="button"
            className={databasesStyles.primaryButton}
            onClick={() => setCreateOpen(true)}
            disabled={loading}
            data-testid="databases-create-button"
          >
            <Plus size={14} aria-hidden="true" /> {t('databases.create')}
          </button>
          <button
            type="button"
            className={databasesStyles.secondaryButton}
            onClick={() => setImportOpen(true)}
            disabled={loading}
            data-testid="databases-import-button"
          >
            <FileUp size={14} aria-hidden="true" /> {t('databases.import')}
          </button>
        </div>
      </header>

      <div className={databasesStyles.searchRow}>
        <div className={databasesStyles.searchField}>
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('databases.search.placeholder')}
            aria-label={t('databases.search.placeholder')}
            data-testid="databases-search"
          />
        </div>
        {loading ? (
          <span className={databasesStyles.loadingBadge} data-testid="databases-loading">
            {t('common.loading')}
          </span>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState} data-testid="databases-empty">
          <DatabaseIcon size={32} className={styles.emptyStateIcon} aria-hidden="true" />
          <p className={styles.emptyStateTitle}>
            {databases.length === 0 ? t('databases.empty') : 'Sin resultados'}
          </p>
          <p className={styles.emptyStateMessage}>
            {databases.length === 0 ? t('databases.emptyHint') : 'Prueba con otro nombre.'}
          </p>
        </div>
      ) : (
        <div className={databasesStyles.tableWrapper}>
          <table className={databasesStyles.table} data-testid="databases-table">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">{t('databases.size')}</th>
                <th scope="col">{t('databases.updated')}</th>
                <th scope="col">Origen</th>
                <th scope="col" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((db) => (
                <tr key={db.id} data-testid={`databases-row-${db.id}`} data-db-id={db.id}>
                  <td className={databasesStyles.nameCell}>
                    <DatabaseIcon size={14} aria-hidden="true" />
                    <span title={db.name}>{db.name}</span>
                  </td>
                  <td className={databasesStyles.sizeCell} title={`${db.sizeBytes} bytes`}>
                    {formatBytes(db.sizeBytes)}
                  </td>
                  <td className={databasesStyles.updatedCell}>{formatRelative(db.updatedAt)}</td>
                  <td>
                    <span
                      className={databasesStyles.originBadge}
                      data-origin={db.origin}
                      data-testid={`databases-origin-${db.id}`}
                    >
                      {t(originLabelKey(db.origin))}
                    </span>
                  </td>
                  <td className={databasesStyles.actionsCell}>
                    <RowActions
                      database={db}
                      onOpen={handleOpen}
                      onRename={handleRename}
                      onExport={handleExport}
                      onDelete={handleDelete}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateDatabaseDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <ImportDatabaseDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSubmit={handleImport}
      />

      {renameTarget !== null ? (
        <RenameDialog
          database={renameTarget}
          onClose={() => setRenameTarget(null)}
          onConfirm={confirmRename}
        />
      ) : null}
      {deleteTarget !== null ? (
        <DeleteConfirmDialog
          database={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  Local modals (rename + delete confirmation)                        *
 * ------------------------------------------------------------------ */

function RenameDialog({
  database,
  onClose,
  onConfirm,
}: {
  database: DatabaseRow
  onClose: () => void
  onConfirm: (newName: string) => Promise<void>
}): React.ReactNode {
  const { t } = useTranslation()
  const [name, setName] = useState<string>(database.name)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useFocusTrap<HTMLDivElement>(true)
  const handle = async (): Promise<void> => {
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm(name.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }
  return (
    <div
      className={databasesStyles.modalBackdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
      data-testid="rename-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        className={databasesStyles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-dialog-title"
        data-testid="rename-dialog"
        tabIndex={-1}
      >
        <h2 id="rename-dialog-title" className={databasesStyles.modalTitle}>
          {t('databases.confirmRename.title')}
        </h2>
        <input
          className={databasesStyles.modalInput}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
          disabled={submitting}
          data-testid="rename-dialog-name"
        />
        {error !== null ? (
          <p className={databasesStyles.modalError} role="alert">
            {error}
          </p>
        ) : null}
        <div className={databasesStyles.modalActions}>
          <button
            type="button"
            className={databasesStyles.secondaryButton}
            onClick={onClose}
            disabled={submitting}
            data-testid="rename-dialog-cancel"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={databasesStyles.primaryButton}
            onClick={() => void handle()}
            disabled={submitting || name.trim().length === 0}
            data-testid="rename-dialog-confirm"
          >
            {t('databases.confirmRename.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirmDialog({
  database,
  onClose,
  onConfirm,
}: {
  database: DatabaseRow
  onClose: () => void
  onConfirm: () => Promise<void>
}): React.ReactNode {
  const { t } = useTranslation()
  const [submitting] = useState<boolean>(false)
  const dialogRef = useFocusTrap<HTMLDivElement>(true)
  return (
    <div
      className={databasesStyles.modalBackdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
      data-testid="delete-confirm-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        className={databasesStyles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-dialog-title"
        data-testid="delete-confirm-dialog"
        tabIndex={-1}
      >
        <h2 id="delete-confirm-dialog-title" className={databasesStyles.modalTitle}>
          {t('databases.confirmDelete.title')}
        </h2>
        <p>{t('databases.confirmDelete.message')}</p>
        <p className={databasesStyles.modalDbName}>
          <DatabaseIcon size={14} aria-hidden="true" /> <strong>{database.name}</strong>
        </p>
        <div className={databasesStyles.modalActions}>
          <button
            type="button"
            className={databasesStyles.secondaryButton}
            onClick={onClose}
            disabled={submitting}
            data-testid="delete-confirm-dialog-cancel"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={databasesStyles.dangerButton}
            onClick={() => void onConfirm()}
            disabled={submitting}
            data-testid="delete-confirm-dialog-confirm"
          >
            {submitting ? t('common.loading') : t('databases.confirmDelete.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DatabasesPage
