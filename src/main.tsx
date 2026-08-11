/**
 * Application bootstrap.
 *
 * Responsibilities
 * ----------------
 *  1. Resolve the persisted theme *synchronously* from IndexedDB and
 *     stamp it onto `<html data-theme>` before the first React render
 *     to avoid a flash of unstyled content (FOUC).
 *  2. Mount React, wrap the tree with the global providers
 *     (`ThemeProvider` is enough for the MVP) and the router.
 *  3. Import global stylesheets in the correct order:
 *       reset.css  →  tokens.css  →  global.css
 *
 * The POC stylesheet is also imported because the scaffold re-uses
 * some shared classes.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './ui/components/shell/theme-provider'
import App from './App'
import { settings, DEFAULT_SETTINGS } from './core/persistence'
import './ui/styles/reset.css'
import './ui/styles/tokens.css'
import './ui/styles/global.css'
import '../pocs/ui/poc.css'

/**
 * Read the persisted theme *synchronously* from `localStorage` (fast
 * cache) or fall back to the default. We intentionally avoid the
 * async Dexie path here because we must paint before the first React
 * render.
 *
 * The `ThemeProvider` will replace this value with the canonical one
 * once Dexie resolves, so any mismatch is self-healing.
 */
function readInitialTheme(): 'light' | 'dark' | 'auto' {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS.theme
  try {
    const fromStorage = window.localStorage.getItem('sql-academy:theme')
    if (
      fromStorage === 'light' ||
      fromStorage === 'dark' ||
      fromStorage === 'auto'
    ) {
      return fromStorage
    }
  } catch {
    // localStorage can throw in private mode — ignore and fall back.
  }
  return DEFAULT_SETTINGS.theme
}

function applyInitialThemeToDom(): void {
  if (typeof document === 'undefined') return
  const theme = readInitialTheme()
  const html = document.documentElement
  html.setAttribute('data-theme', theme)
  // Resolved theme is the value the CSS will actually use; for FOUC
  // prevention we approximate it with `prefers-color-scheme`.
  const prefersLight =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  const resolved = theme === 'auto' ? (prefersLight ? 'light' : 'dark') : theme
  html.setAttribute('data-resolved-theme', resolved)
}

applyInitialThemeToDom()

// Keep the localStorage cache in sync with the settings store. This
// is a one-shot subscription — the ThemeProvider owns the live
// updates while the app is mounted, but the cache must be primed
// for the very first paint on the next load.
if (typeof window !== 'undefined') {
  void settings.get('theme').then((value) => {
    try {
      window.localStorage.setItem('sql-academy:theme', value)
    } catch {
      // Ignore — best-effort cache.
    }
  })
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Root element #root not found in index.html')
}

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
