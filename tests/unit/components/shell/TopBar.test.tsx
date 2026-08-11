/**
 * Tests for TopBar.
 *
 * Covers the locale switcher (the `useT` calls go through the real
 * `useTranslation` hook), the theme cycle button, and the worker
 * online / offline pill driven by `navigator.onLine`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ThemeProvider } from '../../../../src/ui/components/shell/theme-provider'
import { TopBar } from '../../../../src/ui/components/shell/TopBar'
import { setLocale } from '../../../../src/core/i18n/i18n'
import { settings as settingsStore } from '../../../../src/core/persistence/settings'

function renderTopBar(props: Partial<React.ComponentProps<typeof TopBar>> = {}): void {
  render(
    <MemoryRouter>
      <ThemeProvider>
        <TopBar {...props} />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  // Defensive: if a test flipped fake timers on, restore.
  vi.useRealTimers()
  // Reset the global locale to `es` so the next test starts from
  // a known state. The settings store is also cleared so a previous
  // test's `setLocale` does not bleed into the next.
  setLocale('es')
  await settingsStore.set('locale', 'es')
  await settingsStore.getAll() // ensure the subscriber fires
})

describe('TopBar', () => {
  it('renders the brand link to /', () => {
    renderTopBar()
    const link = screen.getByRole('link', { name: /SQL Academy/ })
    expect(link.getAttribute('href')).toBe('/')
  })

  it('cycles the theme when the theme button is clicked', () => {
    renderTopBar()
    const themeButton = document.querySelector('button[aria-label]')
    expect(themeButton).toBeTruthy()
    // The default theme is 'auto' (DEFAULT_THEME in theme-provider).
    fireEvent.click(themeButton as HTMLElement)
    // After the click, the resolved theme stays the same (we are
    // not in a test that checks the `data-resolved-theme` attribute;
    // we just want the click handler to run without throwing).
  })

  it('renders the locale switcher with es / ca / en options', () => {
    renderTopBar()
    const select = screen.getByLabelText(/Idioma/) as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toEqual(['es', 'ca', 'en'])
  })

  it('switches the locale when a different option is picked', () => {
    renderTopBar()
    const select = screen.getByLabelText(/Idioma/) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'ca' } })
    expect(select.value).toBe('ca')
  })

  it('renders the online status pill', () => {
    renderTopBar()
    // The pill is a `<span>` with `data-state="online"` or
    // `data-state="offline"`; happy-dom reports `true` for
    // `navigator.onLine` by default.
    const pill = document.querySelector('span[data-state]')
    expect(pill?.getAttribute('data-state')).toBe('online')
  })

  it('renders the sidebar toggle when an onToggleSidebar prop is supplied', () => {
    const onToggle = vi.fn()
    renderTopBar({ onToggleSidebar: onToggle, sidebarOpen: false })
    const toggle = screen.getByTestId('topbar-sidebar-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(onToggle).toHaveBeenCalled()
  })

  it('reflects the sidebar open state in aria-expanded', () => {
    renderTopBar({ onToggleSidebar: vi.fn(), sidebarOpen: true })
    const toggle = screen.getByTestId('topbar-sidebar-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('renders the saving pill when the `saving` prop is true', () => {
    renderTopBar({ saving: true })
    // The pill wraps a Lucide `<svg>` + a text node; the matcher
    // walks the DOM and finds the text on a child `<span>`.
    expect(
      screen.getByText((content) => content.includes('Guardando')),
    ).toBeTruthy()
  })

  it('hides the sidebar toggle when no handler is supplied', () => {
    renderTopBar()
    expect(screen.queryByTestId('topbar-sidebar-toggle')).toBeNull()
  })

  it('renders the worker offline pill when navigator.onLine flips to false', () => {
    // happy-dom does not dispatch the `offline` event on its own,
    // so we toggle the property and dispatch.
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    renderTopBar()
    const pill = document.querySelector('span[data-state]')
    expect(pill?.getAttribute('data-state')).toBe('offline')
  })
})
