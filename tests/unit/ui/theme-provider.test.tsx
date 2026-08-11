/**
 * Tests for `<ThemeProvider>` and `useTheme()`.
 *
 * Covers:
 *  - The default `'auto'` value is resolved using `prefers-color-scheme`.
 *  - Explicit `'light'` / `'dark'` choices are written to `<html>`.
 *  - Subscribing to the settings store and changing the theme
 *    updates the DOM and the React state.
 *  - Calling `setTheme()` from the hook persists to the store.
 *  - `resolveTheme()` is a pure helper exposed for tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, cleanup, waitFor } from '@testing-library/react'

import {
  ThemeProvider,
  resolveTheme,
  useTheme,
  type ThemeChoice,
} from '../../../src/ui/components/shell/theme-provider'
import { DEFAULT_SETTINGS } from '../../../src/core/persistence/settings'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'
import { SettingsStore } from '../../../src/core/persistence/settings'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'

function makeMockMatchMedia(prefersLight: boolean): typeof window.matchMedia {
  return (query: string) =>
    ({
      matches: query.includes('light') ? prefersLight : !prefersLight,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList
}

describe('resolveTheme()', () => {
  it('returns "light" when the user picked "light"', () => {
    const mq = makeMockMatchMedia(true)('(prefers-color-scheme: light)')
    expect(resolveTheme('light', mq)).toBe('light')
    expect(resolveTheme('light', null)).toBe('light')
  })

  it('returns "dark" when the user picked "dark"', () => {
    const mq = makeMockMatchMedia(true)('(prefers-color-scheme: light)')
    expect(resolveTheme('dark', mq)).toBe('dark')
  })

  it('resolves "auto" to "light" when prefers-color-scheme is light', () => {
    const mq = makeMockMatchMedia(true)('(prefers-color-scheme: light)')
    expect(resolveTheme('auto', mq)).toBe('light')
  })

  it('resolves "auto" to "dark" when prefers-color-scheme is dark', () => {
    const mq = makeMockMatchMedia(false)('(prefers-color-scheme: light)')
    expect(resolveTheme('auto', mq)).toBe('dark')
  })

  it('returns "dark" when "auto" and no matchMedia is available', () => {
    expect(resolveTheme('auto', null)).toBe('dark')
  })
})

describe('ThemeProvider', () => {
  let db: SqlAcademyDB
  let store: SettingsStore

  beforeEach(() => {
    db = createTestDb()
    store = new SettingsStore(db)
    // Ensure each test starts with the default `data-theme` so we can
    // observe the provider mutating the DOM.
    document.documentElement.setAttribute('data-theme', 'auto')
    document.documentElement.setAttribute('data-resolved-theme', 'dark')
  })

  afterEach(async () => {
    cleanup()
    await resetTestDb(db)
  })

  it('applies the initial theme to <html>', async () => {
    const matchMediaImpl = makeMockMatchMedia(false)
    render(
      <ThemeProvider initialTheme="light" store={store} matchMediaImpl={matchMediaImpl}>
        <div />
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
      expect(document.documentElement.getAttribute('data-resolved-theme')).toBe('light')
    })
  })

  it('reads the persisted theme on mount', async () => {
    await store.set('theme', 'dark')
    render(
      <ThemeProvider store={store} matchMediaImpl={makeMockMatchMedia(true)}>
        <div />
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })

  it('falls back to the default theme when nothing is persisted', async () => {
    // Store is empty, so DEFAULT_SETTINGS.theme (auto) wins.
    render(
      <ThemeProvider store={store} matchMediaImpl={makeMockMatchMedia(false)}>
        <div />
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('auto')
      expect(document.documentElement.getAttribute('data-resolved-theme')).toBe('dark')
    })
  })

  it('updates <html> when the settings store changes the theme', async () => {
    render(
      <ThemeProvider store={store} matchMediaImpl={makeMockMatchMedia(false)}>
        <div />
      </ThemeProvider>,
    )

    // Wait for the initial paint.
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('auto')
    })

    await act(async () => {
      await store.set('theme', 'light')
    })

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
      expect(document.documentElement.getAttribute('data-resolved-theme')).toBe('light')
    })
  })

  it('useTheme() returns the current theme + setTheme()', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }): React.ReactNode => (
      <ThemeProvider store={store} matchMediaImpl={makeMockMatchMedia(false)}>
        {children}
      </ThemeProvider>
    )

    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.theme).toBe(DEFAULT_SETTINGS.theme)
    })

    await act(async () => {
      await result.current.setTheme('dark' as ThemeChoice)
    })

    await waitFor(() => {
      expect(result.current.theme).toBe('dark')
      expect(result.current.resolvedTheme).toBe('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    // The change must have been persisted.
    expect(await store.get('theme')).toBe('dark')
  })

  it('resolves "auto" to the OS preference on first paint', async () => {
    render(
      <ThemeProvider initialTheme="auto" store={store} matchMediaImpl={makeMockMatchMedia(true)}>
        <div />
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('auto')
      expect(document.documentElement.getAttribute('data-resolved-theme')).toBe('light')
    })
  })
})
