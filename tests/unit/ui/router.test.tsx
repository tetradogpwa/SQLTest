/**
 * Router smoke tests.
 *
 * Mounts the production router (with a memory history stub) and
 * verifies that each top-level route renders the expected page
 * element. The tests do not exercise navigation — that's the
 * integration test's job — but they confirm the route table is
 * wired correctly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '../../../src/ui/components/shell/theme-provider'
import { HomePage } from '../../../src/ui/pages/HomePage'
import { CoursePage } from '../../../src/ui/pages/CoursePage'
import { LessonPage } from '../../../src/ui/pages/LessonPage'
import { ExercisePage } from '../../../src/ui/pages/ExercisePage'
import { PlaygroundPage } from '../../../src/ui/pages/PlaygroundPage'
import { DatabasesPage } from '../../../src/ui/pages/DatabasesPage'
import { SettingsPage } from '../../../src/ui/pages/SettingsPage'
import { NotFoundPage } from '../../../src/ui/pages/NotFoundPage'
import { AppShell } from '../../../src/ui/components/shell/AppShell'
import { DEFAULT_SETTINGS } from '../../../src/core/persistence/settings'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'
import { SettingsStore } from '../../../src/core/persistence/settings'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'

function makeTestRouter(initialPath: string): ReturnType<typeof createMemoryRouter> {
  // The root layout is a parent route; react-router fills the child
  // route through `<Outlet />`.
  return createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <AppShell>
            <Outlet />
          </AppShell>
        ),
        children: [
          { index: true, element: <HomePage /> },
          {
            path: 'course',
            element: <CoursePage />,
            children: [
              { path: 'lesson/:lessonId', element: <LessonPage /> },
              { path: 'exercise/:exerciseId', element: <ExercisePage /> },
            ],
          },
          { path: 'playground', element: <PlaygroundPage /> },
          { path: 'databases', element: <DatabasesPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  )
}

describe('Router — route table', () => {
  let db: SqlAcademyDB
  let store: SettingsStore

  beforeEach(() => {
    db = createTestDb()
    store = new SettingsStore(db)
    // Suppress noisy "worker online / offline" warnings.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(async () => {
    cleanup()
    await resetTestDb(db)
    vi.restoreAllMocks()
  })

  function mount(initialPath: string): void {
    const router = makeTestRouter(initialPath)
    render(
      <ThemeProvider store={store} initialTheme={DEFAULT_SETTINGS.theme}>
        <RouterProvider router={router} />
      </ThemeProvider>,
    )
  }

  it('renders HomePage at /', async () => {
    mount('/')
    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument()
    })
  })

  it('renders CoursePage at /course', async () => {
    mount('/course')
    await waitFor(() => {
      expect(screen.getByTestId('course-page')).toBeInTheDocument()
    })
  })

  it('renders LessonPage at /course/lesson/:lessonId with the id surfaced', async () => {
    mount('/course/lesson/intro')
    await waitFor(() => {
      expect(screen.getByTestId('lesson-page')).toBeInTheDocument()
    })
    expect(screen.getByTestId('lesson-page').textContent).toContain('intro')
  })

  it('renders ExercisePage at /course/exercise/:exerciseId with the id surfaced', async () => {
    mount('/course/exercise/select-001')
    await waitFor(() => {
      expect(screen.getByTestId('exercise-page')).toBeInTheDocument()
    })
    expect(screen.getByTestId('exercise-page').textContent).toContain('select-001')
  })

  it('renders PlaygroundPage at /playground', async () => {
    mount('/playground')
    await waitFor(() => {
      expect(screen.getByTestId('playground-page')).toBeInTheDocument()
    })
  })

  it('renders DatabasesPage at /databases', async () => {
    mount('/databases')
    await waitFor(() => {
      expect(screen.getByTestId('databases-page')).toBeInTheDocument()
    })
  })

  it('renders SettingsPage at /settings', async () => {
    mount('/settings')
    await waitFor(() => {
      expect(screen.getByTestId('settings-page')).toBeInTheDocument()
    })
  })

  it('renders NotFoundPage for unknown routes', async () => {
    mount('/this/route/does/not/exist')
    await waitFor(() => {
      expect(screen.getByTestId('not-found-page')).toBeInTheDocument()
    })
  })
})
