/**
 * CreateDatabaseDialog — modal for creating a brand-new empty database.
 *
 * The dialog is a **controlled** component: the parent owns the open
 * state, the dialog just emits `onClose` / `onCreated`. The actual
 * creation goes through {@link useUserDatabases}, which the parent
 * passes in via `onSubmit` (we keep the dialog dumb so it can be
 * unit-tested without a real Worker).
 *
 * Validation rules:
 *  - name is required, max 64 chars
 *  - only letters, digits, spaces, dot, dash and underscore
 *
 * Errors from the Worker surface as a red banner; the dialog stays
 * open so the user can retry without re-typing.
 */
import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'

import { useTranslation } from '../../../core/i18n/i18n'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { validateDatabaseName } from '../../../core/services/userDatabasesService'
import styles from './Dialog.module.css'

export interface CreateDatabaseDialogProps {
  open: boolean
  onClose: () => void
  /** Called with the trimmed name. The parent calls `useUserDatabases().create`. */
  onSubmit: (name: string) => Promise<unknown>
}

export function CreateDatabaseDialog({
  open,
  onClose,
  onSubmit,
}: CreateDatabaseDialogProps): React.ReactNode {
  const { t } = useTranslation()
  const [name, setName] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useFocusTrap<HTMLDivElement>(open)

  // Reset on every open. The initial focus is handled by the
  // focus trap (which lands on the first focusable — the name input).
  useEffect(() => {
    if (open) {
      setName('')
      setError(null)
      setSubmitting(false)
    }
    return undefined
  }, [open])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const validation = validateDatabaseName(name)
      const validationError = validation.ok ? null : validation.key
      if (validationError !== null) {
        setError(t(validationError))
        return
      }
      setSubmitting(true)
      setError(null)
      try {
        await onSubmit(name.trim())
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setSubmitting(false)
      }
    },
    [name, onSubmit, onClose, t],
  )

  // Close on Escape (but not while submitting).
  useEffect(() => {
    if (!open) return undefined
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, submitting, onClose])

  if (!open) return null

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
      data-testid="create-database-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-database-dialog-title"
        data-testid="create-database-dialog"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <h2 id="create-database-dialog-title" className={styles.title}>
            {t('databases.createDialog.title')}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={submitting}
            aria-label={t('common.close')}
            data-testid="create-database-dialog-close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <form onSubmit={handleSubmit} className={styles.body} noValidate>
          <label className={styles.label} htmlFor="create-database-dialog-name">
            {t('databases.createDialog.nameLabel')}
          </label>
          <input
            id="create-database-dialog-name"
            className={styles.input}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (error !== null) setError(null)
            }}
            placeholder={t('databases.createDialog.namePlaceholder')}
            maxLength={64}
            disabled={submitting}
            autoComplete="off"
            spellCheck={false}
            data-testid="create-database-dialog-name"
          />
          {error !== null ? (
            <p className={styles.error} role="alert" data-testid="create-database-dialog-error">
              {error}
            </p>
          ) : null}
          <footer className={styles.footer}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClose}
              disabled={submitting}
              data-testid="create-database-dialog-cancel"
            >
              {t('databases.createDialog.cancel')}
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={submitting || name.trim().length === 0}
              data-testid="create-database-dialog-submit"
            >
              {submitting ? t('common.loading') : t('databases.createDialog.submit')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

export default CreateDatabaseDialog
