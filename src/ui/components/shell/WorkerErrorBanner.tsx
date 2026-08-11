/**
 * WorkerErrorBanner — global toast for `useDatabase` errors.
 *
 * The Worker can fail in three broad ways:
 *  - boot failure (VFS not registered, WASM missing, etc.);
 *  - crash during a query (interrupted, out of memory);
 *  - recovery limit exceeded (the user closed the previous DBs).
 *
 * The hook surfaces every one of these as a string in `error` and
 * exposes a `retry()` method. This banner wraps the two: when an
 * error is present we render a non-blocking toast pinned to the
 * bottom-right of the viewport with a "Reintentar" button that calls
 * `retry()`. The user can dismiss it for the rest of the session
 * (we keep the dismissal in component state — no Dexie write so a
 * reload re-surfaces the error).
 */
import { useCallback, useState } from 'react'
import { AlertTriangle, RefreshCw, X } from 'lucide-react'

import { useDatabase } from '../../../hooks/useDatabase'
import { useTranslation } from '../../../core/i18n/i18n'
import styles from './WorkerErrorBanner.module.css'

export function WorkerErrorBanner(): React.ReactNode {
  const { error, retry, status } = useDatabase()
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState<boolean>(false)

  const handleRetry = useCallback(() => {
    setDismissed(false)
    void retry()
  }, [retry])

  if (error === null || dismissed) return null

  // Don't show the banner while the recovery is in progress — the
  // status pill in the TopBar already tells the user.
  if (status === 'recovering' || status === 'initializing') return null

  return (
    <div
      className={styles.banner}
      role="alert"
      aria-live="assertive"
      data-testid="worker-error-banner"
    >
      <AlertTriangle size={16} aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        <strong className={styles.title}>{t('error.generic')}</strong>
        <p className={styles.message}>{error}</p>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.retryButton}
          onClick={handleRetry}
          data-testid="worker-error-retry"
        >
          <RefreshCw size={12} aria-hidden="true" /> {t('common.retry')}
        </button>
        <button
          type="button"
          className={styles.dismissButton}
          onClick={() => setDismissed(true)}
          aria-label={t('common.close')}
          data-testid="worker-error-dismiss"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default WorkerErrorBanner
