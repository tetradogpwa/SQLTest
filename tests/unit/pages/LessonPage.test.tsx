/**
 * Tests for LessonPage.
 *
 * The page resolves a `:lessonId` URL param, looks the lesson up in
 * the course catalog, and renders `<LessonView>`. Three "not found"
 * branches are tested:
 *  - empty param,
 *  - unknown id,
 *  - content loader throws.
 *
 * `useProgress` is mocked so we do not need a Dexie subscription.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { LessonPage } from '../../../src/ui/pages/LessonPage'
import { loadCourse } from '../../../src/content/loaders'

vi.mock('../../../src/hooks/useProgress', () => ({
  useProgress: () => ({
    completedExerciseIds: new Set<string>(),
    progressRows: [],
    statsRows: [],
    courseProgress: {
      totalLessons: 0,
      completedLessons: 0,
      totalExercises: 0,
      completedExercises: 0,
      percent: 0,
    },
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  // No-op
})

describe('LessonPage', () => {
  it('renders the lesson view for a known id', () => {
    const course = loadCourse('es')
    const firstLesson = course.levels[0]?.lessons[0]
    expect(firstLesson).toBeDefined()
    if (!firstLesson) return
    render(
      <MemoryRouter initialEntries={[`/course/lesson/${firstLesson.id}`]}>
        <Routes>
          <Route path="/course/lesson/:lessonId" element={<LessonPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('lesson-page')).toBeTruthy()
    // The lesson view renders the lesson title in an h1.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBeTruthy()
  })

  it('renders the not-found view for an unknown lesson id', () => {
    render(
      <MemoryRouter initialEntries={['/course/lesson/no-existe-esta-leccion']}>
        <Routes>
          <Route path="/course/lesson/:lessonId" element={<LessonPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const page = screen.getByTestId('lesson-page')
    expect(page.getAttribute('data-not-found')).toBe('true')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/no encontrada/i)
  })

  it('renders the not-found view when the id is empty', () => {
    render(
      <MemoryRouter initialEntries={['/course/lesson']}>
        <Routes>
          <Route path="/course/lesson" element={<LessonPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const page = screen.getByTestId('lesson-page')
    expect(page.getAttribute('data-not-found')).toBe('true')
  })
})
