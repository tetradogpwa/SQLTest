/**
 * Databases page — placeholder.
 *
 * A list of the user's databases with import / export controls. The
 * actual worker-backed implementation lands in a later phase.
 */

import { Database } from 'lucide-react'
import { useTranslation } from '../../core/i18n/i18n'
import styles from './page.module.css'

export function DatabasesPage(): React.ReactNode {
  const { t } = useTranslation()
  return (
    <div className={styles.page} data-testid="databases-page">
      <header className={styles.pageHeader}>
        <h1>{t('databases.title')}</h1>
        <p>{t('databases.subtitle')}</p>
      </header>

      <div className={styles.emptyState}>
        <Database size={32} className={styles.emptyStateIcon} aria-hidden="true" />
        <p className={styles.emptyStateTitle}>{t('common.comingSoon')}</p>
        <p className={styles.emptyStateMessage}>{t('databases.empty')}</p>
      </div>
    </div>
  )
}

export default DatabasesPage
