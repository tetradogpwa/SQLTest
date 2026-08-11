/**
 * ImportDatabaseDialog — modal for importing a `.db` / `.sqlite3` file.
 *
 * Two ways to provide the file:
 *   1. Drag & drop a file onto the dropzone.
 *   2. Click the dropzone to open a native file picker.
 *
 * The dialog is **controlled** and dumb — the actual upload goes
 * through {@link useUserDatabases.importFile} which the parent passes
 * via `onSubmit`. The dialog just validates the picked file (size,
 * extension) and emits the `File` object.
 *
 * Errors from the Worker surface as a red banner; the dialog stays
 * open so the user can retry with a different file.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { FileUp, Upload, X } from 'lucide-react'

import { useTranslation } from '../../../core/i18n/i18n'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import styles from './Dialog.module.css'

export interface ImportDatabaseDialogProps {
  open: boolean
  onClose: () => void
  /** Called with the picked file + optional display name. */
  onSubmit: (file: File, displayName: string) => Promise<unknown>
}

const MAX_IMPORT_BYTES = 100 * 1024 * 1024 // 100 MB
const ACCEPTED_EXTENSIONS = ['db', 'sqlite', 'sqlite3', 's3db']

function isAcceptedFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ACCEPTED_EXTENSIONS.includes(ext)
}

export function ImportDatabaseDialog({
  open,
  onClose,
  onSubmit,
}: ImportDatabaseDialogProps): React.ReactNode {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [displayName, setDisplayName] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dialogRef = useFocusTrap<HTMLDivElement>(open)

  useEffect(() => {
    if (open) {
      setFile(null)
      setDisplayName('')
      setError(null)
      setSubmitting(false)
      setDragging(false)
    }
    return undefined
  }, [open])

  const handleFile = useCallback(
    (picked: File | null) => {
      if (!picked) return
      if (!isAcceptedFile(picked)) {
        setError(t('databases.importDialog.error.file'))
        setFile(null)
        return
      }
      if (picked.size > MAX_IMPORT_BYTES) {
        setError(t('databases.importDialog.error.tooBig'))
        setFile(null)
        return
      }
      setError(null)
      setFile(picked)
      // Default the display name to the filename (without extension).
      if (displayName.trim().length === 0) {
        const baseName = picked.name.replace(/\.[^.]+$/, '')
        setDisplayName(baseName)
      }
    },
    [displayName, t],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!file) {
        setError(t('databases.importDialog.error.file'))
        return
      }
      setSubmitting(true)
      setError(null)
      try {
        const name = displayName.trim() || file.name
        await onSubmit(file, name)
        onClose()
      } catch (err) {
        setError(
          err instanceof Error
            ? `${t('databases.importDialog.error.failed')}: ${err.message}`
            : t('databases.importDialog.error.failed'),
        )
      } finally {
        setSubmitting(false)
      }
    },
    [file, displayName, onSubmit, onClose, t],
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
      data-testid="import-database-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-database-dialog-title"
        data-testid="import-database-dialog"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <h2 id="import-database-dialog-title" className={styles.title}>
            {t('databases.importDialog.title')}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={submitting}
            aria-label={t('common.close')}
            data-testid="import-database-dialog-close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <form onSubmit={handleSubmit} className={styles.body} noValidate>
          <div
            className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const dropped = e.dataTransfer.files[0]
              if (dropped) handleFile(dropped)
            }}
            data-testid="import-database-dialog-dropzone"
            aria-label={t('databases.importDialog.dropzone')}
          >
            <Upload size={28} aria-hidden="true" />
            <span>{t('databases.importDialog.dropzone')}</span>
            <span className={styles.hint}>{t('databases.importDialog.pickFile')}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".db,.sqlite,.sqlite3,.s3db"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null
                handleFile(picked)
                // Reset the input so picking the same file twice fires
                // onChange again.
                e.target.value = ''
              }}
              style={{ display: 'none' }}
              data-testid="import-database-dialog-file-input"
            />
          </div>

          {file !== null ? (
            <p className={styles.fileName} data-testid="import-database-dialog-file-name">
              <FileUp size={14} aria-hidden="true" /> {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          ) : null}

          <label className={styles.label} htmlFor="import-database-dialog-name">
            {t('databases.importDialog.nameLabel')}
          </label>
          <input
            id="import-database-dialog-name"
            className={styles.input}
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value)
              if (error !== null) setError(null)
            }}
            maxLength={64}
            disabled={submitting}
            autoComplete="off"
            spellCheck={false}
            data-testid="import-database-dialog-name"
          />

          {error !== null ? (
            <p className={styles.error} role="alert" data-testid="import-database-dialog-error">
              {error}
            </p>
          ) : null}

          <footer className={styles.footer}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClose}
              disabled={submitting}
              data-testid="import-database-dialog-cancel"
            >
              {t('databases.createDialog.cancel')}
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={submitting || file === null}
              data-testid="import-database-dialog-submit"
            >
              {submitting ? t('common.loading') : t('databases.importDialog.submit')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

export default ImportDatabaseDialog
