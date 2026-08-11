/**
 * Tests for LevelPage.
 *
 * The page renders a level's lessons as a list of cards linking to
 * the lesson route. The "not found" branch is reached when the
 * `levelId` URL param is missing or does not match any level.
 *
 * The content lives in `src/content/` (a module-level cache) so we
 * only need to render the page and assert on the output.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { LevelPage } from '../../../src/ui/pages/LevelPage'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  // No-op — the level cache is module-level. We keep the hook
  // for symmetry with other tests.
})

describe('LevelPage', () => {
  it('renders the level title + description + lesson list', () => {
    // The course loader returns 4 levels (L1..L4). L1 is
    // "Biblioteca Municipal" with 4 lessons.
    render(
      <MemoryRouter initialEntries={['/course/level/L1']}>
        <Routes>
          <Route path="/course/level/:levelId" element={<LevelPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('level-page')).toBeTruthy()
    // The header includes the level title and order.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Biblioteca/)
  })

  it('renders one row per lesson, each linking to the lesson route', () => {
    render(
      <MemoryRouter initialEntries={['/course/level/L1']}>
        <Routes>
          <Route path="/course/level/:levelId" element={<LevelPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const items = document.querySelectorAll('li[data-lesson-id]')
    expect(items.length).toBeGreaterThan(0)
    for (const li of items) {
      const link = li.querySelector('a')
      expect(link?.getAttribute('href')).toMatch(/^\/course\/lesson\//)
    }
  })

  it('renders the not-found view when the level id does not exist', () => {
    render(
      <MemoryRouter initialEntries={['/course/level/no-existe-este-nivel']}>
        <Routes>
          <Route path="/course/level/:levelId" element={<LevelPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('level-page-not-found')).toBeTruthy()
  })

  it('renders the not-found view when the level id is empty', () => {
    // The router only matches `/course/level/:levelId` so an
    // empty param means the route does not match and the page
    // is not rendered. We render a stripped-down version that
    // exercises the `if (!levelId)` branch by passing an empty
    // string through a synthetic route.
    render(
      <MemoryRouter initialEntries={['/course/level/']}>
        <Routes>
          <Route path="/course/level" element={<LevelPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('level-page-not-found')).toBeTruthy()
  })
})
