/**
 * Settings page.
 *
 * Two controls are wired for the MVP shell:
 *  - Theme switcher (light / dark / auto).
 *  - Font size selector (sm / md / lg).
 *
 * Both delegate to the same `settings` store used by the rest of the
 * app, so changes take effect immediately and persist across reloads.
 */

import { useEffect, useState } from 'react'
import { MonitorSmartphone, Moon, Save, Sun } from 'lucide-react'
import { useTheme, type ThemeChoice } from '../components/shell/theme-provider'
import { useTranslation } from '../../core/i18n/i18n'
import { settings } from '../../core/persistence'
import type { Settings } from '../../core/persistence'
import styles from './page.module.css'

type FontSizeChoice = Settings['fontSize']

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemeChoice
  Icon: typeof Sun
  labelKey: string
}> = [
  { value: 'light', Icon: Sun, labelKey: 'settings.theme.light' },
  { value: 'dark', Icon: Moon, labelKey: 'settings.theme.dark' },
  { value: 'auto', Icon: MonitorSmartphone, labelKey: 'settings.theme.auto' },
]

const FONT_SIZE_OPTIONS: ReadonlyArray<{ value: FontSizeChoice; labelKey: string }> = [
  { value: 'sm', labelKey: 'settings.fontSize.sm' },
  { value: 'md', labelKey: 'settings.fontSize.md' },
  { value: 'lg', labelKey: 'settings.fontSize.lg' },
]

export function SettingsPage(): React.ReactNode {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()

  // Local UI state mirrors the persisted value, hydrating on mount
  // and re-syncing whenever the store notifies.
  const [fontSize, setFontSize] = useState<FontSizeChoice>('md')
  const [autoSave, setAutoSave] = useState<boolean>(true)
  const [hydrated, setHydrated] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null

    void (async () => {
      try {
        const [fs, autosave] = await Promise.all([
          settings.get('fontSize'),
          settings.get('autoSaveDrafts'),
        ])
        if (cancelled) return
        setFontSize(fs)
        setAutoSave(autosave)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[settings-page] failed to read settings:', err)
      } finally {
        if (!cancelled) setHydrated(true)
      }

      unsubscribe = settings.subscribe((snapshot) => {
        setFontSize(snapshot.fontSize)
        setAutoSave(snapshot.autoSaveDrafts)
      })
    })()

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [])

  const handleFontSizeChange = (next: FontSizeChoice): void => {
    setFontSize(next)
    void settings.set('fontSize', next).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[settings-page] failed to persist fontSize:', err)
    })
  }

  const handleAutoSaveChange = (next: boolean): void => {
    setAutoSave(next)
    void settings.set('autoSaveDrafts', next).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[settings-page] failed to persist autoSaveDrafts:', err)
    })
  }

  return (
    <div className={styles.page} data-testid="settings-page">
      <header className={styles.pageHeader}>
        <h1>{t('settings.title')}</h1>
        <p>{t('settings.subtitle')}</p>
      </header>

      <section aria-label={t('settings.section.appearance')}>
        <h2 style={{ marginBottom: 'var(--space-3)' }}>{t('settings.section.appearance')}</h2>

        <div className={styles.card} style={{ gap: 'var(--space-3)' }}>
          <span className={styles.cardTitle}>{t('settings.theme.label')}</span>
          <div
            role="radiogroup"
            aria-label={t('settings.theme.label')}
            style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
          >
            {THEME_OPTIONS.map(({ value, Icon, labelKey }) => {
              const selected = theme === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={styles.button}
                  data-variant={selected ? undefined : 'ghost'}
                  onClick={() => {
                    void setTheme(value)
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                  {t(labelKey)}
                </button>
              )
            })}
          </div>
        </div>

        <div className={styles.card} style={{ marginTop: 'var(--space-3)', gap: 'var(--space-3)' }}>
          <span className={styles.cardTitle}>{t('settings.fontSize.label')}</span>
          <div
            role="radiogroup"
            aria-label={t('settings.fontSize.label')}
            style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
          >
            {FONT_SIZE_OPTIONS.map(({ value, labelKey }) => {
              const selected = fontSize === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={styles.button}
                  data-variant={selected ? undefined : 'ghost'}
                  onClick={() => handleFontSizeChange(value)}
                  disabled={!hydrated}
                >
                  {t(labelKey)}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section aria-label={t('settings.section.editor')}>
        <h2 style={{ marginBottom: 'var(--space-3)' }}>{t('settings.section.editor')}</h2>

        <div className={styles.card} style={{ gap: 'var(--space-3)' }}>
          <span className={styles.cardTitle}>
            <Save size={16} aria-hidden="true" style={{ marginRight: 'var(--space-2)' }} />
            {t('topbar.saving')}
          </span>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            <input
              type="checkbox"
              checked={autoSave}
              onChange={(e) => handleAutoSaveChange(e.target.checked)}
            />
            {t('topbar.saving')}
          </label>
        </div>
      </section>
    </div>
  )
}

export default SettingsPage
