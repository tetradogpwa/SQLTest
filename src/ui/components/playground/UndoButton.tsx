/**
 * UndoButton — single button that reverts the most recent destructive
 * operation on the active database.
 *
 * The hook reads from the `undoHistory` Dexie table; when there is at
 * least one entry we render a button labelled with the operation's
 * short description. On click, we ask the Worker to restore the
 * snapshot the entry points to.
 *
 * The button is hidden when there are no undo entries (the user
 * either ran no destructive operations or already undid them all).
 *
 * Note: this only undoes the *last* operation. A future enhancement
 * could expose a list; for the MVP the single button matches the
 * roadmap's "↶ Deshace último cambio" requirement.
 */
import { useCallback, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Undo2 } from 'lucide-react'

import { useDatabase } from '../../../hooks/useDatabase'
import { undoStore } from '../../../core/persistence'
import { useTranslation } from '../../../core/i18n/i18n'
import styles from './UndoButton.module.css'

export interface UndoButtonProps {
  /** Worker numeric dbId. */
  dbId: number | null
  /** Dexie string id used to key the undo history. */
  storageKey: string
  /**
   * Optional override of the description that goes in the title and
   * aria-label. Defaults to the undo entry's `description`.
   */
}

export function UndoButton({ dbId, storageKey }: UndoButtonProps): React.ReactNode {
  const { t } = useTranslation()
  const { api, ready } = useDatabase()
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const undoResult = useLiveQuery(
    async () => undoStore.listRecent(storageKey, 1),
    [storageKey],
    [],
  )
  const latest = undoResult?.[0] ?? null

  const handleUndo = useCallback(async () => {
    if (!api || !latest || dbId == null) return
    setBusy(true)
    setError(null)
    try {
      // Best-effort auto-snapshot before the restore, so the user can
      // roll back the undo itself if they change their mind.
      try {
        await api.snapshot(dbId, 'pre-undo', 'pre-restore')
      } catch {
        // non-fatal
      }
      await api.restore(dbId, latest.snapshotId)
      // Remove the entry we just consumed.
      if (latest.id !== undefined) {
        await undoStore.remove(latest.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [api, latest, dbId])

  if (!latest) {
    // Nothing to undo — render an invisible placeholder so the
    // toolbar doesn't jump when the entry appears / disappears.
    return (
      <span
        className={styles.placeholder}
        data-testid="undo-button-placeholder"
        aria-hidden="true"
      />
    )
  }

  const description = latest.description || t('playground.undo.label')

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void handleUndo()}
        disabled={!ready || busy || dbId == null}
        aria-label={t('playground.undo.title')}
        title={description}
        data-testid="undo-button"
      >
        <Undo2 size={12} aria-hidden="true" /> {t('playground.undo.label')}
      </button>
      {error !== null ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}

export default UndoButton
