/**
 * LessonStudySection — per-lesson "study mode" UI.
 *
 * Lives on the lesson page. The user can:
 *  - Pick a user DB as the study DB (or create a new one).
 *  - Reset the study DB (re-applies the seed).
 *  - Disable study mode (the runner falls back to a per-session
 *    working-copy).
 *
 * All decisions live in `useStudyDb`; this component is pure
 * presentation.
 */
import { useCallback, useState } from 'react'
import { Database, RefreshCw, X } from 'lucide-react'

import { useStudyDb } from '../../hooks/useStudyDb'
import { useUserDatabases } from '../../hooks/useUserDatabases'
import { useTranslation } from '../../core/i18n/i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import styles from './LessonStudySection.module.css'

export interface LessonStudySectionProps {
  lessonId: string
  /** The expected `databaseId` of this lesson (filter user DBs). */
  lessonDatabaseId: string
}

const NUMERIC_PREFIX = 'db-'

function toNumericDbId(rowId: string | null | undefined): number | null {
  if (!rowId) return null
  if (!rowId.startsWith(NUMERIC_PREFIX)) return null
  const n = Number(rowId.slice(NUMERIC_PREFIX.length))
  return Number.isFinite(n) ? n : null
}

export function LessonStudySection({
  lessonId,
  lessonDatabaseId,
}: LessonStudySectionProps): React.ReactNode {
  const { t } = useTranslation()
  const { databases } = useUserDatabases()
  const {
    selectedDbId,
    selectedDb,
    ready,
    select,
    clear,
    reset,
  } = useStudyDb(lessonId)
  const [pickerOpen, setPickerOpen] = useState<boolean>(false)
  const [confirmReset, setConfirmReset] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useFocusTrap<HTMLDivElement>(pickerOpen)
  const confirmRef = useFocusTrap<HTMLDivElement>(confirmReset)

  // User DBs that match the lesson's `databaseId`. The lesson's
  // exercises all share the same seed, so the study DB must be
  // a copy of the same seed.
  const candidateDbs = databases.filter((d) => d.id.startsWith(NUMERIC_PREFIX))

  const handleSelect = useCallback(
    async (rowId: string) => {
      setError(null)
      try {
        await select(rowId)
        setPickerOpen(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [select],
  )

  const handleClear = useCallback(async () => {
    setError(null)
    await clear()
  }, [clear])

  const handleReset = useCallback(async () => {
    setError(null)
    try {
      const count = await reset()
      setConfirmReset(false)
      if (count === 0) {
        setError('La lección no tiene una semilla para restaurar.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [reset])

  const numericDbId = toNumericDbId(selectedDbId)

  return (
    <section
      className={styles.section}
      data-testid="lesson-study-section"
      aria-label={t('study.section.label')}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>{t('study.section.title')}</h2>
        <p className={styles.description}>{t('study.section.description')}</p>
      </header>

      {!ready ? (
        <p className={styles.placeholder} data-testid="study-loading">
          {t('common.loading')}
        </p>
      ) : selectedDb && numericDbId !== null ? (
        <div className={styles.active} data-testid="study-active">
          <div className={styles.dbInfo}>
            <Database size={16} aria-hidden="true" />
            <div>
              <strong className={styles.dbName} data-testid="study-active-name">
                {selectedDb.name}
              </strong>
              <p className={styles.dbMeta}>
                {t('study.active.explained', { name: selectedDb.name })}
              </p>
            </div>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setConfirmReset(true)}
              data-testid="study-reset-button"
            >
              <RefreshCw size={14} aria-hidden="true" /> {t('study.reset')}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setPickerOpen(true)}
              data-testid="study-change-button"
            >
              {t('study.change')}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => void handleClear()}
              data-testid="study-disable-button"
            >
              <X size={14} aria-hidden="true" /> {t('study.disable')}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.empty} data-testid="study-empty">
          <p>{t('study.empty.explained', { dbId: lessonDatabaseId })}</p>
          {candidateDbs.length > 0 ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setPickerOpen(true)}
              data-testid="study-pick-button"
            >
              {t('study.pick')}
            </button>
          ) : (
            <p className={styles.hint}>
              {t('study.empty.noDbs', { href: '/databases' })}
            </p>
          )}
        </div>
      )}

      {error !== null ? (
        <p className={styles.error} role="alert" data-testid="study-error">
          {error}
        </p>
      ) : null}

      {/* Picker dialog */}
      {pickerOpen ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false)
          }}
          data-testid="study-picker-backdrop"
        >
          <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="study-picker-title"
            tabIndex={-1}
            data-testid="study-picker-dialog"
          >
            <h2 id="study-picker-title" className={styles.dialogTitle}>
              {t('study.pick.title')}
            </h2>
            <p className={styles.dialogDescription}>
              {t('study.pick.description', { dbId: lessonDatabaseId })}
            </p>
            {candidateDbs.length > 0 ? (
              <ul className={styles.candidateList} data-testid="study-candidate-list">
                {candidateDbs.map((db) => (
                  <li key={db.id} className={styles.candidateItem}>
                    <button
                      type="button"
                      className={styles.candidateButton}
                      onClick={() => void handleSelect(db.id)}
                      data-testid={`study-candidate-${db.id}`}
                    >
                      <Database size={14} aria-hidden="true" />
                      <span>{db.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>{t('study.empty.noDbs', { href: '/databases' })}</p>
            )}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setPickerOpen(false)}
                data-testid="study-picker-close"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Reset confirm dialog */}
      {confirmReset ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmReset(false)
          }}
          data-testid="study-confirm-backdrop"
        >
          <div
            ref={confirmRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="study-confirm-title"
            tabIndex={-1}
            data-testid="study-confirm-dialog"
          >
            <h2 id="study-confirm-title" className={styles.dialogTitle}>
              {t('study.reset.confirm.title')}
            </h2>
            <p className={styles.dialogDescription}>
              {t('study.reset.confirm.message', { name: selectedDb?.name ?? '' })}
            </p>
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setConfirmReset(false)}
                data-testid="study-confirm-cancel"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => void handleReset()}
                data-testid="study-confirm-confirm"
              >
                {t('study.reset.confirm.action')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Hidden marker for tests that need the numeric dbId. */}
      {numericDbId !== null ? (
        <span data-testid="study-numeric-dbId" hidden>
          {numericDbId}
        </span>
      ) : null}
    </section>
  )
}

export default LessonStudySection
