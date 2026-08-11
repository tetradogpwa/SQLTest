/**
 * Application router.
 *
 * Built with `createBrowserRouter` from `react-router-dom@7`. Each
 * route maps to a page component in `src/ui/pages/`. The POCs from
 * `pocs/ui/` are still mounted at `/poc/*` so they remain reachable
 * from the production build.
 *
 * Course sub-routes
 * -----------------
 *  - `/course`                → CoursePage (sidebar + Outlet)
 *  - `/course/level/:id`      → LevelPage (4 lessons as a list)
 *  - `/course/lesson/:id`     → LessonPage (lesson header + exercise cards)
 *  - `/course/exercise/:id`   → ExercisePage (the "play" view)
 *
 * The CoursePage route renders the sidebar *and* an `<Outlet />` so
 * navigating between lessons / exercises keeps the sidebar mounted
 * (no flicker, the active exercise stays highlighted).
 *
 * Route table
 * -----------
 *  /                     → HomePage
 *  /course               → CoursePage
 *  /course/level/:id     → LevelPage
 *  /course/lesson/:id    → LessonPage
 *  /course/exercise/:id  → ExercisePage
 *  /playground           → PlaygroundPage
 *  /databases            → DatabasesPage
 *  /settings             → SettingsPage
 *  /poc/3, /poc/6        → POC pages (kept from the scaffold)
 *  *                     → NotFoundPage
 */

import { createBrowserRouter, RouterProvider, Link, Outlet } from 'react-router-dom'
import { AppShell } from './ui/components/shell/AppShell'
import { HomePage } from './ui/pages/HomePage'
import { CoursePage } from './ui/pages/CoursePage'
import { LessonPage } from './ui/pages/LessonPage'
import { ExercisePage } from './ui/pages/ExercisePage'
import { LevelPage } from './ui/pages/LevelPage'
import { PlaygroundPage } from './ui/pages/PlaygroundPage'
import { DatabasesPage } from './ui/pages/DatabasesPage'
import { SettingsPage } from './ui/pages/SettingsPage'
import { NotFoundPage } from './ui/pages/NotFoundPage'
import { Poc3Pwa } from '../pocs/ui/poc-3-pwa'
import { Poc6Codemirror } from '../pocs/ui/poc-6-codemirror'

/**
 * Root layout — wraps every page with the AppShell. The router
 * injects the matched child route through `<Outlet />`.
 */
function RootLayout(): React.ReactNode {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

/**
 * POC layout — the POCs render outside the AppShell because they
 * each manage their own full-page styling.
 */
function PocLayout(): React.ReactNode {
  return (
    <div style={{ padding: 'var(--space-4)' }}>
      <p style={{ marginBottom: 'var(--space-3)' }}>
        <Link to="/">← Volver a la app</Link>
      </p>
      <Outlet />
    </div>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'course',
        element: <CoursePage />,
        children: [
          { index: true, element: <CourseEmpty /> },
          { path: 'level/:levelId', element: <LevelPage /> },
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
  {
    path: '/poc',
    element: <PocLayout />,
    children: [
      { path: '3', element: <Poc3Pwa /> },
      { path: '6', element: <Poc6Codemirror /> },
    ],
  },
])

/**
 * Placeholder shown when the user lands on `/course` without any
 * child route selected. Encourages them to pick a level / lesson
 * from the sidebar.
 */
function CourseEmpty(): React.ReactNode {
  return (
    <div
      style={{
        padding: 'var(--space-8) var(--space-6)',
        textAlign: 'center',
        color: 'var(--color-text-muted)',
      }}
      data-testid="course-empty"
    >
      <h2 style={{ marginBottom: 'var(--space-3)' }}>Elige una lección o un ejercicio</h2>
      <p>Usa el menú lateral para empezar a practicar SQL.</p>
    </div>
  )
}

export function AppRouter(): React.ReactNode {
  return <RouterProvider router={router} />
}
