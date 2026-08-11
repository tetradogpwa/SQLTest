/**
 * Theme provider.
 *
 * Responsibilities
 * ----------------
 * 1. Apply the active theme to `<html data-theme="...">` so CSS tokens
 *    resolve correctly (see `src/ui/styles/tokens.css`).
 * 2. Resolve the `'auto'` value to `'light'` or `'dark'` using
 *    `prefers-color-scheme` (and a live `matchMedia` listener).
 * 3. Subscribe to the persisted `settings` store so any change made
 *    via `settings.set('theme', X)` propagates to the DOM without a
 *    page reload.
 * 4. Expose a `useTheme()` hook returning the *user-facing* value
 *    (`theme`, one of `'light' | 'dark' | 'auto'`) and the *resolved*
 *    value (`resolvedTheme`, one of `'light' | 'dark'`), plus a
 *    `setTheme()` helper that goes through the settings store.
 *
 * FOUC mitigation
 * ---------------
 * `main.tsx` reads `localStorage` (or the default) **synchronously** before
 * the first React render and stamps `data-theme` onto `<html>`. By the time
 * `<ThemeProvider>` mounts the attribute is already correct, so the
 * provider only needs to keep it in sync after hydration.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { settings } from '../../../core/persistence'
import type { Settings } from '../../../core/persistence'
import type { SettingsStore } from '../../../core/persistence/settings'

export type ThemeChoice = Settings['theme'] // 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

export interface ThemeContextValue {
  /** The raw value the user picked (may be `'auto'`). */
  theme: ThemeChoice
  /** What `theme` resolves to once `'auto'` has been compared to the OS. */
  resolvedTheme: ResolvedTheme
  /**
   * Update the persisted theme. Returns a promise that resolves once
   * the settings write has been committed and React has re-rendered.
   */
  setTheme: (next: ThemeChoice) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export interface ThemeProviderProps {
  children: ReactNode
  /**
   * Override the settings store in tests. Defaults to the singleton
   * exported from `@/core/persistence`.
   */
  store?: Pick<SettingsStore, 'get' | 'set' | 'subscribe'> | null
  /**
   * Initial theme used while the settings store is being read. Keeps
   * the first paint deterministic in tests and during SSR.
   */
  initialTheme?: ThemeChoice
  /**
   * Override `matchMedia` for tests. Defaults to the global one.
   */
  matchMediaImpl?: typeof window.matchMedia | null
}

const DEFAULT_THEME: ThemeChoice = 'auto'

function resolveAutoTheme(mediaQuery: MediaQueryList | null): ResolvedTheme {
  if (!mediaQuery) return 'dark'
  return mediaQuery.matches ? 'light' : 'dark'
}

/**
 * Pure helper exported for tests. Given a `theme` value and the
 * `prefers-color-scheme` matcher, returns the concrete resolved value.
 */
export function resolveTheme(theme: ThemeChoice, mediaQuery: MediaQueryList | null): ResolvedTheme {
  if (theme === 'auto') return resolveAutoTheme(mediaQuery)
  return theme
}

export function ThemeProvider({
  children,
  store,
  initialTheme = DEFAULT_THEME,
  matchMediaImpl,
}: ThemeProviderProps): ReactNode {
  const effectiveStore = store ?? settings
  const mqImpl =
    matchMediaImpl ??
    (typeof window !== 'undefined' ? window.matchMedia.bind(window) : null)

  const [theme, setThemeState] = useState<ThemeChoice>(initialTheme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(initialTheme, mqImpl ? mqImpl('(prefers-color-scheme: light)') : null),
  )

  // Sync the DOM attribute whenever the resolved theme changes.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const html = document.documentElement
    // The user-facing value is preserved on the attribute so CSS
    // `[data-theme="auto"]` selectors can match. Resolved theme is
    // stamped on a separate attribute for components that want it.
    html.setAttribute('data-theme', theme)
    html.setAttribute('data-resolved-theme', resolvedTheme)
  }, [theme, resolvedTheme])

  // Load the persisted theme on mount and subscribe to changes.
  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null

    void (async () => {
      try {
        const persisted = await effectiveStore.get('theme')
        if (cancelled) return
        if (persisted) setThemeState(persisted)
      } catch (err) {
        // IndexedDB may fail in private mode / SSR / tests. Default theme
        // already painted, so we just log and continue.
        // eslint-disable-next-line no-console
        console.warn('[theme-provider] failed to read persisted theme:', err)
      }

      if (typeof effectiveStore.subscribe === 'function') {
        unsubscribe = effectiveStore.subscribe((snapshot) => {
          if (cancelled) return
          setThemeState(snapshot.theme)
        })
      }
    })()

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [effectiveStore])

  // Listen to OS changes when theme === 'auto'.
  useEffect(() => {
    if (!mqImpl) return
    const mq = mqImpl('(prefers-color-scheme: light)')
    const handler = (e: MediaQueryListEvent): void => {
      setResolvedTheme(e.matches ? 'light' : 'dark')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mqImpl])

  // Whenever `theme` changes, recompute the resolved value.
  useEffect(() => {
    if (!mqImpl) {
      setResolvedTheme(theme === 'light' ? 'light' : 'dark')
      return
    }
    setResolvedTheme(resolveTheme(theme, mqImpl('(prefers-color-scheme: light)')))
  }, [theme, mqImpl])

  const setTheme = useCallback(
    async (next: ThemeChoice): Promise<void> => {
      // Optimistic update — the subscriber will overwrite if the write
      // succeeds (which it always should), and we keep the local state
      // in sync if the write fails.
      setThemeState(next)
      try {
        await effectiveStore.set('theme', next)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[theme-provider] failed to persist theme:', err)
      }
    },
    [effectiveStore],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme() must be used inside <ThemeProvider>')
  }
  return ctx
}
