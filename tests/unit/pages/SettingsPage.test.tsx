/**
 * Tests for the SettingsPage.
 *
 * The page composes `useSettings`, `useTheme`, `useTranslation`, and
 * `useBuildInfo`. We:
 *  - mock the persistence module so the test uses the live Dexie
 *    singleton with a fresh per-file name (the default helper would
 *    also work, but we want a simpler API for the page tests);
 *  - render the page inside a `MemoryRouter` so the back link resolves.
 *
 * Covers:
 *  - all five sections render with the right `data-testid`
 *  - changing the font size persists
 *  - changing the locale calls `setLocale` (which persists)
 *  - the About section exposes the build version
 *  - the Clear progress confirm dialog appears + invokes the wipe
 *  - the Reset confirm dialog appears + invokes `resetAll`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { db as defaultDb } from '../../../src/core/persistence/dexie'
import { settings as settingsStore } from '../../../src/core/persistence/settings'
import { progressStore, editorDrafts } from '../../../src/core/persistence'
import { ThemeProvider } from '../../../src/ui/components/shell/theme-provider'

beforeEach(async () => {
  // Reset the settings store + dependent tables so each test starts
  // from a known state.
  await defaultDb.open()
  await defaultDb.settings.clear()
  await defaultDb.progress.clear()
  await defaultDb.exerciseStats.clear()
  await defaultDb.editorDrafts.clear()
  await defaultDb.queryHistory.clear()
  await defaultDb.savedQueries.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

import { SettingsPage } from '../../../src/ui/pages/SettingsPage'

function Page(): React.ReactNode {
  return (
    <MemoryRouter>
      <ThemeProvider>
        <SettingsPage />
      </ThemeProvider>
    </MemoryRouter>
  )
}

describe('SettingsPage (integration)', () => {
  it('renders all five sections', async () => {
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByTestId('settings-section-appearance')).toBeTruthy()
      expect(screen.getByTestId('settings-section-editor')).toBeTruthy()
      expect(screen.getByTestId('settings-section-language')).toBeTruthy()
      expect(screen.getByTestId('settings-section-data')).toBeTruthy()
      expect(screen.getByTestId('settings-section-about')).toBeTruthy()
    })
  })

  it('exposes the build version + build id in the About section', async () => {
    render(<Page />)
    await waitFor(() => {
      const version = screen.getByTestId('settings-version')
      expect(version.textContent).toBeTruthy()
    })
    expect(screen.getByTestId('settings-build-id').textContent).toBeTruthy()
  })

  it('changes the font size and persists it', async () => {
    render(<Page />)
    const lg = await screen.findByTestId('settings-fontsize-lg')
    await waitFor(() => expect((lg as HTMLButtonElement).disabled).toBe(false))
    await act(async () => {
      fireEvent.click(lg)
    })
    await waitFor(async () => {
      expect(await settingsStore.get('fontSize')).toBe('lg')
    })
  })

  it('changes the tab size and persists it', async () => {
    render(<Page />)
    const tab4 = await screen.findByTestId('settings-tabsize-4')
    await waitFor(() => expect((tab4 as HTMLButtonElement).disabled).toBe(false))
    await act(async () => {
      fireEvent.click(tab4)
    })
    await waitFor(async () => {
      expect(await settingsStore.get('tabSize')).toBe(4)
    })
  })

  it('toggles word wrap and persists it', async () => {
    render(<Page />)
    const on = await screen.findByTestId('settings-wordwrap-on')
    await waitFor(() => expect((on as HTMLButtonElement).disabled).toBe(false))
    await act(async () => {
      fireEvent.click(on)
    })
    await waitFor(async () => {
      expect(await settingsStore.get('wordWrap')).toBe(true)
    })
  })

  it('switches the locale and persists it', async () => {
    render(<Page />)
    const ca = await screen.findByTestId('settings-locale-ca')
    await act(async () => {
      fireEvent.click(ca)
    })
    await waitFor(async () => {
      expect(await settingsStore.get('locale')).toBe('ca')
    })
  })

  it('opens the clear-progress confirm and wipes the data on confirm', async () => {
    // Seed a couple of progress + draft rows so the wipe is observable.
    await defaultDb.progress.add({
      lessonId: 'l1',
      exerciseId: 'e1',
      completedAt: Date.now(),
    })
    await defaultDb.editorDrafts.add({
      contextType: 'playground',
      contextId: 'pg',
      content: 'SELECT 1',
      updatedAt: Date.now(),
    })
    expect(await defaultDb.progress.count()).toBe(1)
    expect(await defaultDb.editorDrafts.count()).toBe(1)

    render(<Page />)
    const clearBtn = await screen.findByTestId('settings-clear-progress')
    fireEvent.click(clearBtn)
    await waitFor(() => {
      expect(screen.getByTestId('settings-clear-confirm')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('settings-clear-confirm-confirm'))
    await waitFor(async () => {
      expect(await defaultDb.progress.count()).toBe(0)
      expect(await defaultDb.editorDrafts.count()).toBe(0)
    })
  })

  it('opens the reset confirm and restores defaults', async () => {
    // First change a setting so we can detect the reset.
    await settingsStore.set('fontSize', 'lg')
    await settingsStore.set('wordWrap', true)
    render(<Page />)
    const reset = await screen.findByTestId('settings-reset')
    fireEvent.click(reset)
    await waitFor(() => {
      expect(screen.getByTestId('settings-reset-confirm')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('settings-reset-confirm-confirm'))
    await waitFor(async () => {
      expect(await settingsStore.get('fontSize')).toBe('md')
      expect(await settingsStore.get('wordWrap')).toBe(false)
    })
  })

  it('shows a toast after a successful export-config action', async () => {
    render(<Page />)
    const exportBtn = await screen.findByTestId('settings-export-config')
    await act(async () => {
      fireEvent.click(exportBtn)
    })
    await waitFor(() => {
      expect(screen.getByTestId('settings-toast')).toBeTruthy()
    })
  })

  it('progressStore and editorDrafts singletons are exposed', () => {
    // Smoke check: the page imports these so the wipe works. The test
    // catches accidental renames.
    expect(progressStore).toBeTruthy()
    expect(editorDrafts).toBeTruthy()
  })
})
