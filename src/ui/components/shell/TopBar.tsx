/**
 * Top bar.
 *
 * Always-visible header that:
 *  - Renders the brand + name as a link to `/`.
 *  - Shows a worker-online indicator (green when the SQLite Worker is
 *    ready, red when it is not — the actual lifecycle is wired in a
 *    later phase; today the indicator is driven by `navigator.onLine`).
 *  - Shows an autosave "Saving…" pill when the editor has unflushed
 *    changes. For the MVP shell this is a manual toggle so the
 *    indicator is visible without a real editor.
 *  - Hosts the theme switcher (light / dark / auto cycle button).
 *  - Hosts a language selector.
 *  - Hosts a placeholder user menu (no auth in MVP).
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cloud, CloudOff, Moon, Save, Sun, MonitorSmartphone } from 'lucide-react'
import { useTheme, type ThemeChoice } from './theme-provider'
import { useTranslation, type Locale } from '../../../core/i18n/i18n'
import styles from './shell.module.css'

/**
 * Returns `true` if the browser reports it has network connectivity.
 * This is a *best-effort* signal — true offline (PWA) does not
 * necessarily mean `navigator.onLine === false`, but the inverse
 * (`false`) is reliable enough to drive a "Worker offline" indicator.
 */
function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const handleOnline = (): void => setOnline(true)
    const handleOffline = (): void => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
  return online
}

const THEME_ORDER: ReadonlyArray<ThemeChoice> = ['light', 'dark', 'auto']

const THEME_ICONS: Record<ThemeChoice, typeof Sun> = {
  light: Sun,
  dark: Moon,
  auto: MonitorSmartphone,
}

const LOCALE_OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: 'es', label: 'ES' },
  { value: 'ca', label: 'CA' },
  { value: 'en', label: 'EN' },
]

export interface TopBarProps {
  /** Toggle the mobile sidebar. Hidden on desktop. */
  onToggleSidebar?: () => void
  /** Whether the mobile sidebar drawer is currently open. */
  sidebarOpen?: boolean
  /** Sidebar toggle label (used as the button's accessible name). */
  sidebarToggleLabel?: string
  /** External signal that the editor is flushing drafts. */
  saving?: boolean
}

export function TopBar({
  onToggleSidebar,
  sidebarOpen = false,
  sidebarToggleLabel,
  saving,
}: TopBarProps): React.ReactNode {
  const { t, locale, setLocale } = useTranslation()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const online = useOnlineStatus()

  const ThemeIcon = THEME_ICONS[theme]
  const themeLabel = {
    light: t('topbar.theme.light'),
    dark: t('topbar.theme.dark'),
    auto: t('topbar.theme.auto'),
  }[theme]

  const cycleTheme = (): void => {
    const idx = THEME_ORDER.indexOf(theme)
    const safeIdx = idx < 0 ? 0 : idx
    const next = THEME_ORDER[(safeIdx + 1) % THEME_ORDER.length] as ThemeChoice
    void setTheme(next)
  }

  return (
    <header className={styles.topbar} role="banner">
      <div className={styles.topbarLeft}>
        {onToggleSidebar ? (
          <button
            type="button"
            className={styles.iconButton}
            aria-label={sidebarToggleLabel ?? t('nav.toggleSidebar')}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar-drawer"
            onClick={onToggleSidebar}
            data-testid="topbar-sidebar-toggle"
          >
            <MenuIcon />
          </button>
        ) : null}
        <Link to="/" className={styles.brandLink} aria-label={t('app.title')}>
          <span className={styles.brandLogo} aria-hidden="true">
            {t('app.shortName')}
          </span>
          <span className={styles.brandName}>{t('app.title')}</span>
        </Link>
      </div>

      <div className={styles.topbarRight}>
        <span
          className={styles.statusPill}
          data-state={online ? 'online' : 'offline'}
          aria-live="polite"
          title={online ? t('topbar.workerOnline') : t('topbar.workerOffline')}
        >
          <span className={styles.statusDot} aria-hidden="true" />
          {online ? <Cloud size={14} aria-hidden="true" /> : <CloudOff size={14} aria-hidden="true" />}
          <span className={styles.visuallyHidden}>
            {online ? t('topbar.workerOnline') : t('topbar.workerOffline')}
          </span>
        </span>

        {saving ? (
          <span className={styles.statusPill} data-state="saving" aria-live="polite">
            <Save size={14} aria-hidden="true" />
            <span>{t('topbar.saving')}</span>
          </span>
        ) : null}

        <button
          type="button"
          className={styles.iconButton}
          onClick={cycleTheme}
          aria-label={`${themeLabel} — ${t('common.confirm')}`}
          aria-pressed={theme === 'auto' ? false : undefined}
          title={`${t('topbar.theme.auto')} (actual: ${themeLabel})`}
          data-resolved-theme={resolvedTheme}
        >
          <ThemeIcon size={18} aria-hidden="true" />
        </button>

        <label className={styles.visuallyHidden} htmlFor="topbar-locale">
          {t('topbar.language')}
        </label>
        <select
          id="topbar-locale"
          className={styles.languageSelect}
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          aria-label={t('topbar.language')}
        >
          {LOCALE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <span className={styles.userMenu} aria-label={t('topbar.user.placeholder')}>
          <span className={styles.userAvatar} aria-hidden="true">
            {t('topbar.user.placeholder').charAt(0).toUpperCase()}
          </span>
          <span>{t('topbar.user.placeholder')}</span>
        </span>
      </div>
    </header>
  )
}

/** Sidebar toggle icon (hamburger). Kept inline to avoid an extra import. */
function MenuIcon(): React.ReactNode {
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
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

// No external state needed beyond `useTheme()` for the shell MVP.
