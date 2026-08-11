/**
 * StatsPanel — small panel with the playground's session metrics.
 *
 * Reads three things:
 *  - the DB size (from the `queryHistory` row's `dbId` and the
 *    `useUserDatabases` list's `sizeBytes` for user DBs; for the
 *    built-in playground we read from `OPEN_DATABASE.sizeBytes` via
 *    a one-shot `useState` + `api.open`).
 *  - the number of queries executed in this session
 *    (`queryHistory.count`).
 *  - the last error message from the most recent run
 *    (the `useQuery` hook's `error` prop).
 *
 * The panel is purely presentational; the parent passes the values.
 */
import { useTranslation } from '../../../core/i18n/i18n'
import styles from './StatsPanel.module.css'

export interface StatsPanelProps {
  sizeBytes: number | null
  queriesExecuted: number
  lastError: string | null
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function StatsPanel({
  sizeBytes,
  queriesExecuted,
  lastError,
}: StatsPanelProps): React.ReactNode {
  const { t } = useTranslation()
  return (
    <section className={styles.panel} data-testid="stats-panel" aria-label={t('playground.stats.title')}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('playground.stats.title')}</h2>
      </header>
      <dl className={styles.list}>
        <div className={styles.row}>
          <dt className={styles.label}>{t('playground.stats.size')}</dt>
          <dd className={styles.value} data-testid="stats-size">
            {sizeBytes === null ? '—' : formatBytes(sizeBytes)}
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.label}>{t('playground.stats.queries')}</dt>
          <dd className={styles.value} data-testid="stats-queries">
            {queriesExecuted}
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.label}>{t('playground.stats.lastError')}</dt>
          <dd
            className={`${styles.value} ${lastError ? styles.error : ''}`}
            data-testid="stats-last-error"
          >
            {lastError ?? '—'}
          </dd>
        </div>
      </dl>
    </section>
  )
}

export default StatsPanel
