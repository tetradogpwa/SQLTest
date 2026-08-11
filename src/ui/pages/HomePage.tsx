/**
 * Home page — landing screen.
 *
 * Welcomes the user, surfaces the primary CTAs (course / playground /
 * databases) and shows a "your progress" summary driven by the
 * progress store. While the course catalog is still empty, the
 * progress card is in its "empty" state.
 */

import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Database, PlayCircle, Sparkles } from 'lucide-react'
import { useTranslation } from '../../core/i18n/i18n'
import { progressStore } from '../../core/persistence'
import styles from './page.module.css'

interface QuickLink {
  to: string
  iconKey: 'course' | 'playground' | 'databases'
  labelKey: string
  descriptionKey: string
}

const QUICK_LINKS: ReadonlyArray<QuickLink> = [
  {
    to: '/course',
    iconKey: 'course',
    labelKey: 'home.openCourse',
    descriptionKey: 'course.subtitle',
  },
  {
    to: '/playground',
    iconKey: 'playground',
    labelKey: 'home.openPlayground',
    descriptionKey: 'playground.subtitle',
  },
  {
    to: '/databases',
    iconKey: 'databases',
    labelKey: 'home.manageDatabases',
    descriptionKey: 'databases.subtitle',
  },
]

function QuickLinkIcon({ iconKey }: { iconKey: QuickLink['iconKey'] }): React.ReactNode {
  switch (iconKey) {
    case 'course':
      return <BookOpen size={18} aria-hidden="true" />
    case 'playground':
      return <PlayCircle size={18} aria-hidden="true" />
    case 'databases':
      return <Database size={18} aria-hidden="true" />
    default:
      return <Sparkles size={18} aria-hidden="true" />
  }
}

export function HomePage(): React.ReactNode {
  const { t } = useTranslation()

  const courseProgress = useLiveQuery(
    async () => progressStore.getCourseProgress(),
    [],
    { totalLessons: 0, completedLessons: 0, totalExercises: 0, completedExercises: 0, percent: 0 },
  )

  return (
    <div className={styles.page} data-testid="home-page">
      <header className={styles.pageHeader}>
        <h1>{t('home.welcome')}</h1>
        <p>{t('home.subtitle')}</p>
      </header>

      <section aria-label={t('home.quickLinks')}>
        <h2 className={styles.visuallyHidden}>{t('home.quickLinks')}</h2>
        <div className={styles.cardGrid}>
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={styles.card}
              aria-label={t(link.labelKey)}
            >
              <span className={styles.cardIcon}>
                <QuickLinkIcon iconKey={link.iconKey} />
              </span>
              <span className={styles.cardTitle}>{t(link.labelKey)}</span>
              <span className={styles.cardDescription}>{t(link.descriptionKey)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label={t('home.progress.title')}>
        <h2 style={{ marginBottom: 'var(--space-3)' }}>{t('home.progress.title')}</h2>
        {courseProgress.totalLessons === 0 ? (
          <div className={styles.emptyState}>
            <Sparkles size={32} className={styles.emptyStateIcon} aria-hidden="true" />
            <p className={styles.emptyStateMessage}>{t('home.progress.empty')}</p>
            <Link to="/course" className={styles.button}>
              {t('home.openCourse')}
            </Link>
          </div>
        ) : (
          <div className={styles.card}>
            <span className={styles.cardTitle}>
              {t('home.progress.lessonsCompleted', {
                done: courseProgress.completedLessons,
                total: courseProgress.totalLessons,
              })}
            </span>
            <span className={styles.badge} data-tone="primary">
              {t('home.progress.percent', { percent: courseProgress.percent })}
            </span>
          </div>
        )}
      </section>
    </div>
  )
}

export default HomePage
