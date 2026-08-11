/**
 * 404 page.
 *
 * Renders a friendly message and a link back to the home page.
 */

import { Link } from 'react-router-dom'
import { Home, SearchX } from 'lucide-react'
import { useTranslation } from '../../core/i18n/i18n'
import styles from './page.module.css'

export function NotFoundPage(): React.ReactNode {
  const { t } = useTranslation()
  return (
    <div className={styles.page} data-testid="not-found-page">
      <header className={styles.pageHeader}>
        <h1>404 — {t('notFound.title')}</h1>
        <p>{t('notFound.message')}</p>
      </header>

      <div className={styles.emptyState}>
        <SearchX size={40} className={styles.emptyStateIcon} aria-hidden="true" />
        <Link to="/" className={styles.button}>
          <Home size={16} aria-hidden="true" />
          {t('notFound.backHome')}
        </Link>
      </div>
    </div>
  )
}

export default NotFoundPage
