/**
 * Collapsible navigation sidebar.
 *
 * Renders the primary navigation (Home / Course / Playground /
 * Databases / Settings) and a course-progress widget. The collapse
 * state is persisted via the settings store under the `sidebarCollapsed`
 * key (added at the type level — falls back to `false` on first run).
 *
 * Mobile: the sidebar becomes a slide-over drawer toggled by the
 * TopBar's hamburger button. On desktop it is always visible and
 * collapses to a 64px icon rail.
 */

import { useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Database, Home, PlayCircle, Settings as SettingsIcon, BookOpen } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from '../../../core/i18n/i18n'
import { progressStore, settings } from '../../../core/persistence'
import styles from './shell.module.css'

export interface SidebarProps {
  /** Render the slide-over style (mobile) vs. always-visible (desktop). */
  variant?: 'rail' | 'drawer'
  /** When `variant === 'drawer'`, controls whether the drawer is open. */
  mobileOpen?: boolean
  /** Click handler for the backdrop (closes the drawer on mobile). */
  onRequestClose?: () => void
  /** Optional explicit "is collapsed" override; if absent, settings wins. */
  collapsed?: boolean
  /** Called when the user toggles the collapsed state. */
  onCollapsedChange?: (next: boolean) => void
}

interface NavItem {
  to: string
  labelKey: string
  Icon: typeof Home
  end?: boolean
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { to: '/', labelKey: 'nav.home', Icon: Home, end: true },
  { to: '/course', labelKey: 'nav.course', Icon: BookOpen },
  { to: '/playground', labelKey: 'nav.playground', Icon: PlayCircle },
  { to: '/databases', labelKey: 'nav.databases', Icon: Database },
  { to: '/settings', labelKey: 'nav.settings', Icon: SettingsIcon },
]

export function Sidebar({
  variant = 'rail',
  mobileOpen = false,
  onRequestClose,
  collapsed: collapsedOverride,
  onCollapsedChange,
}: SidebarProps): React.ReactNode {
  const { t } = useTranslation()
  const [persistedCollapsed, setPersistedCollapsed] = useState<boolean>(false)
  const [hydrated, setHydrated] = useState<boolean>(false)

  // Read the persisted collapsed state once and re-read on every change.
  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null

    void (async () => {
      try {
        const value = await settings.get('sidebarCollapsed')
        if (!cancelled) setPersistedCollapsed(Boolean(value))
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[sidebar] failed to read collapsed state:', err)
      } finally {
        if (!cancelled) setHydrated(true)
      }

      unsubscribe = settings.subscribe((snapshot) => {
        setPersistedCollapsed(snapshot.sidebarCollapsed)
      })
    })()

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [])

  const collapsed = collapsedOverride ?? persistedCollapsed

  const handleToggleCollapse = useCallback((): void => {
    const next = !collapsed
    setPersistedCollapsed(next)
    onCollapsedChange?.(next)
    void settings.set('sidebarCollapsed', next).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[sidebar] failed to persist collapsed state:', err)
    })
  }, [collapsed, onCollapsedChange])

  // Course progress — driven by Dexie live query. Empty until the
  // course catalog is wired in a later phase, which is what we want
  // for the MVP.
  const courseProgress = useLiveQuery(
    async () => progressStore.getCourseProgress(),
    [],
    { totalLessons: 0, completedLessons: 0, totalExercises: 0, completedExercises: 0, percent: 0 },
  )
  const percent = courseProgress?.percent ?? 0

  const isDrawer = variant === 'drawer'
  const showExpandedLabels = !collapsed || isDrawer

  return (
    <>
      {isDrawer ? (
        <button
          type="button"
          className={styles.sidebarBackdrop}
          data-visible={mobileOpen ? 'true' : 'false'}
          aria-hidden={!mobileOpen}
          tabIndex={mobileOpen ? 0 : -1}
          onClick={onRequestClose}
        />
      ) : null}

      <nav
        className={styles.sidebar}
        data-variant={variant}
        data-collapsed={showExpandedLabels ? 'false' : 'true'}
        data-mobile-open={isDrawer && mobileOpen ? 'true' : 'false'}
        aria-label={t('nav.home')}
        aria-hidden={isDrawer && !mobileOpen ? true : undefined}
      >
        <button
          type="button"
          className={styles.sidebarLink}
          onClick={handleToggleCollapse}
          aria-pressed={collapsed}
          aria-label={t('nav.toggleSidebar')}
          style={{ display: isDrawer ? 'none' : 'inline-flex' }}
        >
          <CollapseIcon collapsed={collapsed} />
          {showExpandedLabels ? <span className={styles.sidebarLabel}>—</span> : null}
        </button>

        <ul className={styles.sidebarNav}>
          {NAV_ITEMS.map(({ to, labelKey, Icon, end }) => (
            <li key={to} className={styles.sidebarItem}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  isActive ? `${styles.sidebarLink} ${styles.sidebarLinkActive}` : styles.sidebarLink
                }
                onClick={isDrawer ? onRequestClose : undefined}
                title={t(labelKey)}
              >
                <Icon aria-hidden="true" />
                {showExpandedLabels ? (
                  <span className={styles.sidebarLabel}>{t(labelKey)}</span>
                ) : null}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className={styles.sidebarProgress} aria-label={t('sidebar.progress')}>
          {showExpandedLabels ? (
            <span className={styles.sidebarProgressTitle}>{t('sidebar.progress')}</span>
          ) : null}
          <div
            className={styles.sidebarProgressBar}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            title={`${percent}%`}
          >
            <div className={styles.sidebarProgressFill} style={{ width: `${percent}%` }} />
          </div>
          {showExpandedLabels ? (
            <span className={styles.sidebarProgressText}>
              {hydrated && percent > 0
                ? t('home.progress.percent', { percent })
                : t('sidebar.progress.empty')}
            </span>
          ) : null}
        </div>
      </nav>
    </>
  )
}

function CollapseIcon({ collapsed }: { collapsed: boolean }): React.ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
