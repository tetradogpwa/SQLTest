/**
 * SnapshotsPanel — list of snapshots for the active playground DB.
 *
 * The component is mostly **read-only** + a "Create snapshot" button
 * and per-row "Restore" / "Delete" buttons. It does not own the
 * snapshot lifecycle — that's the Worker's job. The Main Thread
 * subscribes to the `snapshotMetadata` Dexie table via `useLiveQuery`
 * so the panel re-renders as soon as the Worker emits
 * `snapshot:created`.
 *
 * The mapping between the Worker's numeric `dbId` and the Dexie
 * `dbId` (string) is `string(numeric)` for the built-in playground
 * and the user DBs follow the `db-<numeric>` pattern. To keep the
 * playground self-contained, the panel uses a `dbId` prop (the string
 * identifier) the parent computes.
 */
import { useCallback, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, RotateCcw, Trash2 } from 'lucide-react'

import { useDatabase } from '../../../hooks/useDatabase'
import { snapshotMetadataStore } from '../../../core/persistence'
import { useTranslation } from '../../../core/i18n/i18n'
import styles from './SnapshotsPanel.module.css'

export interface SnapshotsPanelProps {
  /** The numeric dbId the Worker uses, or `null` for the built-in playground. */
  dbId: number | null
  /** The Dexie string id used to key the metadata table. */
  storageKey: string
}

const DEFAULT_LABEL = 'manual'

function formatTimeAgo(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp
  if (diff < 60_000) return 'hace un momento'
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)} h`
  return new Date(timestamp).toLocaleString('es-ES')
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function SnapshotsPanel({
  dbId,
  storageKey,
}: SnapshotsPanelProps): React.ReactNode {
  const { t } = useTranslation()
  const { api, ready } = useDatabase()
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const snapshotsResult = useLiveQuery(
    async () => snapshotMetadataStore.listByDb(storageKey),
    [storageKey],
    [],
  )
  const snapshots = snapshotsResult ?? []

  const handleCreate = useCallback(async () => {
    if (!api || dbId == null) return
    setBusy(true)
    setError(null)
    try {
      await api.snapshot(dbId, DEFAULT_LABEL, 'manual')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [api, dbId])

  const handleRestore = useCallback(
    async (snapId: string) => {
      if (!api || dbId == null) return
      setBusy(true)
      setError(null)
      try {
        await api.restore(dbId, snapId)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [api, dbId],
  )

  const handleDelete = useCallback(
    async (snapId: string) => {
      if (!api || dbId == null) return
      setBusy(true)
      setError(null)
      try {
        await api.deleteSnapshot(dbId, snapId)
        // The Worker does not currently emit a `snapshot:deleted`
        // event, so we manually clean up the metadata row.
        const row = await snapshotMetadataStore.getBySnapshotId(storageKey, snapId)
        if (row?.id !== undefined) {
          await snapshotMetadataStore.remove(row.id)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [api, dbId, storageKey],
  )

  return (
    <section className={styles.panel} data-testid="snapshots-panel" aria-label={t('playground.snapshots.title')}>
      <header className={styles.header}>
        <h2 className={styles.title}>
          <Camera size={14} aria-hidden="true" /> {t('playground.snapshots.title')}
        </h2>
        <button
          type="button"
          className={styles.createButton}
          onClick={() => void handleCreate()}
          disabled={!ready || busy || dbId == null}
          data-testid="snapshots-create-button"
        >
          <Camera size={12} aria-hidden="true" /> {t('playground.snapshots.create')}
        </button>
      </header>
      {error !== null ? (
        <p className={styles.error} role="alert" data-testid="snapshots-error">
          {error}
        </p>
      ) : null}
      {snapshots.length === 0 ? (
        <p className={styles.empty} data-testid="snapshots-empty">
          {t('playground.snapshots.empty')}
        </p>
      ) : (
        <ul className={styles.list} data-testid="snapshots-list">
          {snapshots.map((snap) => (
            <li
              key={snap.id ?? snap.snapshotId}
              className={styles.item}
              data-testid={`snapshot-item-${snap.snapshotId}`}
              data-reason={snap.reason}
            >
              <div className={styles.itemMain}>
                <span className={styles.itemLabel} title={snap.label}>
                  {snap.label}
                </span>
                <span className={styles.itemMeta}>
                  <span
                    className={styles.reasonBadge}
                    data-reason={snap.reason}
                    data-testid={`snapshot-reason-${snap.snapshotId}`}
                  >
                    {t(`playground.snapshots.reason.${snap.reason}`)}
                  </span>
                  <span className={styles.itemSize} title={`${snap.sizeBytes} bytes`}>
                    {formatBytes(snap.sizeBytes)}
                  </span>
                  <span className={styles.itemTime}>{formatTimeAgo(snap.createdAt)}</span>
                </span>
              </div>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.restoreButton}
                  onClick={() => void handleRestore(snap.snapshotId)}
                  disabled={busy}
                  data-testid={`snapshot-restore-${snap.snapshotId}`}
                  aria-label={t('playground.snapshots.restore')}
                  title={t('playground.snapshots.restore')}
                >
                  <RotateCcw size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => void handleDelete(snap.snapshotId)}
                  disabled={busy}
                  data-testid={`snapshot-delete-${snap.snapshotId}`}
                  aria-label={t('playground.snapshots.delete')}
                  title={t('playground.snapshots.delete')}
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default SnapshotsPanel
