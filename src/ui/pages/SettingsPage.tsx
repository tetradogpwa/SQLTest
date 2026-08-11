/**
 * Settings page — single source of truth for user-facing preferences.
 *
 * Sections
 * --------
 * 1. **Apariencia** — theme (light / dark / auto).
 * 2. **Editor** — font size, tab size, word wrap, auto-save drafts.
 * 3. **Idioma** — UI locale (es / ca / en).
 * 4. **Datos** — clear progress, export configuration.
 * 5. **Acerca de** — version, build id, links.
 *
 * All controls are wired through {@link useSettings}, which is
 * reactive over the `settings` Dexie store. A change here propagates
 * to every other consumer (theme provider, editor, locale) without
 * page reloads.
 *
 * Destructive actions (clear progress, restore defaults) render a
 * confirm modal before they fire. The page never deletes bytes from
 * OPFS — it only touches Dexie and the locale/theme editor surface.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  Info,
  MonitorSmartphone,
  Moon,
  Save,
  Sun,
  Trash2,
} from 'lucide-react'

import { useSettings } from '../../hooks/useSettings'
import { useTheme, type ThemeChoice } from '../components/shell/theme-provider'
import { useTranslation, SUPPORTED_LOCALES, type Locale } from '../../core/i18n/i18n'
import { useBuildInfo } from '../../hooks/useBuildInfo'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import type { Settings } from '../../core/persistence'
import { progressStore, editorDrafts } from '../../core/persistence'
import { db as defaultDb } from '../../core/persistence/dexie'

import styles from './page.module.css'
import settingsStyles from './settings.module.css'

type FontSizeChoice = Settings['fontSize']
type TabSizeChoice = Settings['tabSize']

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

const TAB_SIZE_OPTIONS: ReadonlyArray<{ value: TabSizeChoice; labelKey: string }> = [
  { value: 2, labelKey: 'settings.tabSize.2' },
  { value: 4, labelKey: 'settings.tabSize.4' },
]

const REPO_URL = 'https://github.com/anomalyco/opencode'
const DOCS_URL = 'https://github.com/anomalyco/opencode#readme'

export function SettingsPage(): React.ReactNode {
  const { t, locale, setLocale } = useTranslation()
  const { theme, setTheme } = useTheme()
  const settings = useSettings()
  const build = useBuildInfo()
  const [toast, setToast] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState<boolean>(false)
  const [confirmClear, setConfirmClear] = useState<boolean>(false)
  const [busy, setBusy] = useState<boolean>(false)

  // Auto-dismiss the toast.
  useEffect(() => {
    if (toast === null) return undefined
    const id = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(id)
  }, [toast])

  const handleFontSize = useCallback(
    (next: FontSizeChoice) => {
      void settings.set({ fontSize: next })
    },
    [settings],
  )

  const handleTabSize = useCallback(
    (next: TabSizeChoice) => {
      void settings.set({ tabSize: next })
    },
    [settings],
  )

  const handleWordWrap = useCallback(
    (next: boolean) => {
      void settings.set({ wordWrap: next })
    },
    [settings],
  )

  const handleAutoSave = useCallback(
    (next: boolean) => {
      void settings.set({ autoSaveDrafts: next })
    },
    [settings],
  )

  const handleLocale = useCallback(
    (next: Locale) => {
      setLocale(next)
    },
    [setLocale],
  )

  const handleTheme = useCallback(
    (next: ThemeChoice) => {
      void setTheme(next)
    },
    [setTheme],
  )

  const handleExportConfig = useCallback(async () => {
    try {
      const blob = new Blob([JSON.stringify(settings.values, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'sql-academy-settings.json'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setToast(t('settings.data.exportConfig.done'))
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[settings] export failed:', e)
    }
  }, [settings.values, t])

  const handleClearProgress = useCallback(async () => {
    setBusy(true)
    try {
      // Drop the lightweight metadata (progress + drafts + history).
      // User DB bytes and snapshots stay in OPFS — the user can
      // delete those from the Databases page.
      await Promise.all([
        progressStore['db'].progress.clear(),
        progressStore['db'].exerciseStats.clear(),
        editorDrafts['db'].editorDrafts.clear(),
        defaultDb.queryHistory.clear(),
        defaultDb.savedQueries.clear(),
        // Don't touch `databases` (the user's DB list lives there) or
        // `snapshotMetadata` / `undoHistory` (those belong to specific
        // DBs and get cleaned up by `useUserDatabases.delete`).
      ])
      setToast(t('settings.data.clearProgress.done'))
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[settings] clear progress failed:', e)
    } finally {
      setBusy(false)
      setConfirmClear(false)
    }
  }, [t])

  const handleResetAll = useCallback(async () => {
    setBusy(true)
    try {
      await settings.resetAll()
      setToast(t('settings.reset'))
    } finally {
      setBusy(false)
      setConfirmReset(false)
    }
  }, [settings, t])

  const v = settings.values

  return (
    <div className={styles.page} data-testid="settings-page">
      <header className={styles.pageHeader}>
        <h1>{t('settings.title')}</h1>
        <p>{t('settings.subtitle')}</p>
      </header>

      {toast !== null ? (
        <div className={settingsStyles.toast} role="status" data-testid="settings-toast">
          <Check size={14} aria-hidden="true" /> {toast}
        </div>
      ) : null}

      {/* ───────────────── Apariencia ───────────────── */}
      <section
        aria-label={t('settings.section.appearance')}
        data-testid="settings-section-appearance"
      >
        <h2 className={settingsStyles.sectionTitle}>
          {t('settings.section.appearance')}
        </h2>

        <div className={settingsStyles.card}>
          <span className={settingsStyles.cardTitle}>{t('settings.theme.label')}</span>
          <div
            className={settingsStyles.optionRow}
            role="radiogroup"
            aria-label={t('settings.theme.label')}
          >
            {THEME_OPTIONS.map(({ value, Icon, labelKey }) => {
              const selected = theme === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={settingsStyles.option}
                  data-selected={selected || undefined}
                  onClick={() => handleTheme(value)}
                  data-testid={`settings-theme-${value}`}
                >
                  <Icon size={14} aria-hidden="true" /> {t(labelKey)}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ───────────────── Editor ───────────────── */}
      <section
        aria-label={t('settings.section.editor')}
        data-testid="settings-section-editor"
      >
        <h2 className={settingsStyles.sectionTitle}>{t('settings.section.editor')}</h2>

        <div className={settingsStyles.card}>
          <span className={settingsStyles.cardTitle}>{t('settings.fontSize.label')}</span>
          <div
            className={settingsStyles.optionRow}
            role="radiogroup"
            aria-label={t('settings.fontSize.label')}
          >
            {FONT_SIZE_OPTIONS.map(({ value, labelKey }) => {
              const selected = v.fontSize === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={settingsStyles.option}
                  data-selected={selected || undefined}
                  onClick={() => handleFontSize(value)}
                  disabled={settings.loading}
                  data-testid={`settings-fontsize-${value}`}
                >
                  {t(labelKey)}
                </button>
              )
            })}
          </div>
        </div>

        <div className={settingsStyles.card}>
          <span className={settingsStyles.cardTitle}>{t('settings.tabSize.label')}</span>
          <div
            className={settingsStyles.optionRow}
            role="radiogroup"
            aria-label={t('settings.tabSize.label')}
          >
            {TAB_SIZE_OPTIONS.map(({ value, labelKey }) => {
              const selected = v.tabSize === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={settingsStyles.option}
                  data-selected={selected || undefined}
                  onClick={() => handleTabSize(value)}
                  disabled={settings.loading}
                  data-testid={`settings-tabsize-${value}`}
                >
                  {t(labelKey)}
                </button>
              )
            })}
          </div>
        </div>

        <div className={settingsStyles.card}>
          <span className={settingsStyles.cardTitle}>{t('settings.wordWrap.label')}</span>
          <div
            className={settingsStyles.optionRow}
            role="radiogroup"
            aria-label={t('settings.wordWrap.label')}
          >
            <button
              type="button"
              role="radio"
              aria-checked={v.wordWrap}
              className={settingsStyles.option}
              data-selected={v.wordWrap || undefined}
              onClick={() => handleWordWrap(true)}
              data-testid="settings-wordwrap-on"
            >
              {t('settings.wordWrap.on')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!v.wordWrap}
              className={settingsStyles.option}
              data-selected={!v.wordWrap || undefined}
              onClick={() => handleWordWrap(false)}
              data-testid="settings-wordwrap-off"
            >
              {t('settings.wordWrap.off')}
            </button>
          </div>
        </div>

        <div className={settingsStyles.card}>
          <label
            className={settingsStyles.toggleRow}
            htmlFor="settings-autosave"
          >
            <Save size={16} aria-hidden="true" />
            <span className={settingsStyles.cardTitle}>
              {t('settings.autoSave.label')}
            </span>
            <input
              id="settings-autosave"
              type="checkbox"
              checked={v.autoSaveDrafts}
              onChange={(e) => handleAutoSave(e.target.checked)}
              disabled={settings.loading}
              data-testid="settings-autosave"
            />
          </label>
        </div>
      </section>

      {/* ───────────────── Idioma ───────────────── */}
      <section
        aria-label={t('settings.section.language')}
        data-testid="settings-section-language"
      >
        <h2 className={settingsStyles.sectionTitle}>
          {t('settings.section.language')}
        </h2>
        <div className={settingsStyles.card}>
          <span className={settingsStyles.cardTitle}>{t('settings.locale.label')}</span>
          <div
            className={settingsStyles.optionRow}
            role="radiogroup"
            aria-label={t('settings.locale.label')}
          >
            {SUPPORTED_LOCALES.map((value) => {
              const selected = locale === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={settingsStyles.option}
                  data-selected={selected || undefined}
                  onClick={() => handleLocale(value)}
                  data-testid={`settings-locale-${value}`}
                >
                  {t(`settings.locale.${value}`)}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ───────────────── Datos ───────────────── */}
      <section
        aria-label={t('settings.section.data')}
        data-testid="settings-section-data"
      >
        <h2 className={settingsStyles.sectionTitle}>{t('settings.section.data')}</h2>
        <div className={settingsStyles.card}>
          <div className={settingsStyles.dataRow}>
            <span className={settingsStyles.cardTitle}>
              {t('settings.data.exportConfig')}
            </span>
            <button
              type="button"
              className={settingsStyles.secondaryButton}
              onClick={() => void handleExportConfig()}
              data-testid="settings-export-config"
            >
              <Download size={14} aria-hidden="true" /> {t('settings.data.exportConfig')}
            </button>
          </div>
        </div>
        <div className={settingsStyles.card}>
          <div className={settingsStyles.dataRow}>
            <span className={settingsStyles.cardTitle}>
              <AlertTriangle size={14} aria-hidden="true" className={settingsStyles.dangerIcon} />
              {t('settings.data.clearProgress')}
            </span>
            <button
              type="button"
              className={settingsStyles.dangerButton}
              onClick={() => setConfirmClear(true)}
              data-testid="settings-clear-progress"
            >
              <Trash2 size={14} aria-hidden="true" /> {t('settings.data.clearProgress')}
            </button>
          </div>
        </div>
        <div className={settingsStyles.card}>
          <div className={settingsStyles.dataRow}>
            <span className={settingsStyles.cardTitle}>{t('settings.reset')}</span>
            <button
              type="button"
              className={settingsStyles.secondaryButton}
              onClick={() => setConfirmReset(true)}
              data-testid="settings-reset"
            >
              {t('settings.reset')}
            </button>
          </div>
        </div>
      </section>

      {/* ───────────────── Acerca de ───────────────── */}
      <section
        aria-label={t('settings.section.about')}
        data-testid="settings-section-about"
      >
        <h2 className={settingsStyles.sectionTitle}>{t('settings.section.about')}</h2>
        <div className={settingsStyles.card}>
          <dl className={settingsStyles.aboutList}>
            <div className={settingsStyles.aboutRow}>
              <dt className={settingsStyles.aboutLabel}>
                <Info size={12} aria-hidden="true" /> {t('settings.about.version')}
              </dt>
              <dd className={settingsStyles.aboutValue} data-testid="settings-version">
                {build.version}
              </dd>
            </div>
            <div className={settingsStyles.aboutRow}>
              <dt className={settingsStyles.aboutLabel}>
                {t('settings.about.build')}
              </dt>
              <dd className={settingsStyles.aboutValue} data-testid="settings-build-id">
                <code>{build.buildId}</code>
              </dd>
            </div>
            <div className={settingsStyles.aboutRow}>
              <dt className={settingsStyles.aboutLabel}>
                {t('settings.about.builtAt')}
              </dt>
              <dd className={settingsStyles.aboutValue}>
                {build.builtAt
                  ? new Date(build.builtAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-ES')
                  : '—'}
              </dd>
            </div>
            <div className={settingsStyles.aboutRow}>
              <dt className={settingsStyles.aboutLabel}>
                {t('settings.about.docs')}
              </dt>
              <dd className={settingsStyles.aboutValue}>
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={settingsStyles.aboutLink}
                >
                  {DOCS_URL}
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              </dd>
            </div>
            <div className={settingsStyles.aboutRow}>
              <dt className={settingsStyles.aboutLabel}>
                {t('settings.about.repo')}
              </dt>
              <dd className={settingsStyles.aboutValue}>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={settingsStyles.aboutLink}
                >
                  {REPO_URL}
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className={settingsStyles.bottomNav}>
        <Link to="/" className={settingsStyles.backLink}>
          ← {t('common.back')}
        </Link>
      </div>

      {confirmReset ? (
        <ConfirmDialog
          title={t('settings.reset')}
          message={t('settings.reset.confirm')}
          confirmLabel={t('settings.reset')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => void handleResetAll()}
          busy={busy}
          testIdPrefix="settings-reset-confirm"
        />
      ) : null}
      {confirmClear ? (
        <ConfirmDialog
          title={t('settings.data.clearProgress')}
          message={t('settings.data.clearProgress.confirm')}
          confirmLabel={t('settings.data.clearProgress')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => void handleClearProgress()}
          busy={busy}
          tone="danger"
          testIdPrefix="settings-clear-confirm"
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  Local confirm dialog                                              *
 * ------------------------------------------------------------------ */

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onCancel,
  onConfirm,
  busy,
  tone = 'default',
  testIdPrefix,
}: {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onCancel: () => void
  onConfirm: () => Promise<void> | void
  busy: boolean
  tone?: 'default' | 'danger'
  testIdPrefix: string
}): React.ReactNode {
  const dialogRef = useFocusTrap<HTMLDivElement>(true)
  return (
    <div
      className={settingsStyles.modalBackdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
      data-testid={`${testIdPrefix}-backdrop`}
    >
      <div
        ref={dialogRef}
        className={settingsStyles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testIdPrefix}-title`}
        data-testid={testIdPrefix}
        tabIndex={-1}
      >
        <h2 id={`${testIdPrefix}-title`} className={settingsStyles.modalTitle}>
          {title}
        </h2>
        <p className={settingsStyles.modalMessage}>{message}</p>
        <div className={settingsStyles.modalActions}>
          <button
            type="button"
            className={settingsStyles.secondaryButton}
            onClick={onCancel}
            disabled={busy}
            data-testid={`${testIdPrefix}-cancel`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? settingsStyles.dangerButton : settingsStyles.primaryButton}
            onClick={() => void onConfirm()}
            disabled={busy}
            data-testid={`${testIdPrefix}-confirm`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
