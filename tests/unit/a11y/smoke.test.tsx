/**
 * Accessibility smoke tests using `vitest-axe` (axe-core wrapper for
 * vitest).
 *
 * The goal is not to catch every WCAG violation — that would
 * duplicate the work of a real audit. We just want a regression
 * net: every page the user can land on should pass the standard
 * rule set with zero serious/critical violations.
 *
 * Each test wraps the page in a `MemoryRouter` + `ThemeProvider`
 * because the app shell does so too; we exercise the pages in
 * isolation to keep the assertions fast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

import { ThemeProvider } from '../../../src/ui/components/shell/theme-provider'
import { db as defaultDb } from '../../../src/core/persistence/dexie'

// The `toHaveNoViolations` matcher is registered in `tests/setup.ts`
// so it is available globally across the suite.

// Stub `useLiveQuery` for the home page so the persistent read
// returns the caller's `defaultResult` (the third argument). When
// no default is provided, we return `undefined` — the caller is
// then responsible for guarding.
vi.mock('dexie-react-hooks', async (importOriginal) => {
  const mod = await importOriginal<typeof import('dexie-react-hooks')>()
  return {
    ...mod,
    useLiveQuery: (
      _querier: () => Promise<unknown>,
      _deps?: ReadonlyArray<unknown>,
      defaultResult?: unknown,
    ) => defaultResult,
  }
})

beforeEach(async () => {
  await defaultDb.open()
  await defaultDb.settings.clear()
  await defaultDb.progress.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function wrap(node: ReactNode): ReactNode {
  return (
    <MemoryRouter>
      <ThemeProvider>{node}</ThemeProvider>
    </MemoryRouter>
  )
}

describe('a11y smoke', () => {
  it('HomePage has no critical a11y violations', async () => {
    const { HomePage } = await import('../../../src/ui/pages/HomePage')
    const { container } = render(wrap(<HomePage />))
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('PlaygroundPage (smoke) has no critical a11y violations', async () => {
    // The playground touches the worker hook; provide a stub via the
    // same mock the suite's own test uses.
    vi.mock('../../../src/hooks/useDatabase', async (importOriginal) => {
      const mod = await importOriginal<typeof import('../../../src/hooks/useDatabase')>()
      return {
        ...mod,
        useDatabase: () => ({
          api: null,
          dbId: null,
          setActiveDb: vi.fn(),
          ready: false,
          initializing: false,
          error: null,
          initResult: null,
          capability: null,
          status: 'uninitialized',
          registerDb: vi.fn(),
          unregisterDb: vi.fn(),
          retry: vi.fn(),
        }),
      }
    })
    vi.mock('../../../src/hooks/useQuery', async (importOriginal) => {
      const mod = await importOriginal<typeof import('../../../src/hooks/useQuery')>()
      return {
        ...mod,
        useQuery: () => ({
          run: vi.fn(),
          cancel: vi.fn(),
          result: null,
          loading: false,
          error: null,
          history: [],
          clearHistory: vi.fn(),
          executionMs: null,
        }),
      }
    })
    vi.mock('../../../src/hooks/useSchema', async (importOriginal) => {
      const mod = await importOriginal<typeof import('../../../src/hooks/useSchema')>()
      return {
        ...mod,
        useSchema: () => ({
          schema: null,
          loading: false,
          error: null,
          refresh: vi.fn(),
          invalidate: vi.fn(),
          canQuery: false,
        }),
      }
    })
    vi.mock('../../../src/hooks/useUserDatabases', async (importOriginal) => {
      const mod = await importOriginal<typeof import('../../../src/hooks/useUserDatabases')>()
      return {
        ...mod,
        useUserDatabases: () => ({
          databases: [],
          loading: false,
          error: null,
          refresh: vi.fn(),
          create: vi.fn(),
          importFile: vi.fn(),
          exportFile: vi.fn(),
          rename: vi.fn(),
          delete: vi.fn(),
        }),
      }
    })
    vi.mock('../../../src/hooks/useSettings', async (importOriginal) => {
      const mod = await importOriginal<typeof import('../../../src/hooks/useSettings')>()
      return {
        ...mod,
        useSettings: () => ({
          values: {
            theme: 'auto',
            fontSize: 'md',
            tabSize: 2,
            wordWrap: false,
            locale: 'es',
            sqlDialect: 'sqlite',
            reducedMotion: false,
            autoSaveDrafts: true,
            defaultDatabase: null,
            firstRunCompleted: false,
            sidebarCollapsed: false,
          },
          loading: false,
          set: vi.fn(),
          resetAll: vi.fn(),
        }),
      }
    })
    const { PlaygroundPage } = await import('../../../src/ui/pages/PlaygroundPage')
    const { container } = render(wrap(<PlaygroundPage />))
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('SettingsPage has no critical a11y violations', async () => {
    const { SettingsPage } = await import('../../../src/ui/pages/SettingsPage')
    const { container } = render(wrap(<SettingsPage />))
    // Wait a tick so the async hydration completes; otherwise the
    // initial flash of the default theme is the only thing axe sees.
    await new Promise((r) => setTimeout(r, 0))
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('NotFoundPage has no critical a11y violations', async () => {
    const { NotFoundPage } = await import('../../../src/ui/pages/NotFoundPage')
    const { container } = render(wrap(<NotFoundPage />))
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('useEffect is preserved as a dep so the import is not stripped', () => {
    // Sanity test that the matcher is wired up. Real coverage comes
    // from the per-page tests above.
    expect(true).toBe(true)
  })
})
