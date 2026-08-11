/**
 * Tests for `CourseSidebar`.
 *
 * Strategy: build a tiny static course (4 lessons × 3 exercises) and
 * assert on rendering, completion marks and click behaviour.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { CourseSidebar } from '../../../../src/ui/components/course/CourseSidebar'
import type { Course, Exercise, Level, Lesson } from '../../../../src/content/types'

function mkExercise(id: string, lessonId: string, title: string): Exercise {
  return {
    id,
    lessonId,
    type: 'writeQuery',
    title,
    prompt: `prompt for ${title}`,
    solution: 'SELECT 1',
    solutionExplanation: 'trivial',
    validation: [{ type: 'result', orderMatters: false }],
    hints: [],
    difficulty: 1,
    tags: [],
    databaseId: 'library',
  }
}

function mkLesson(id: string, order: number, title: string): Lesson {
  return {
    id,
    order,
    title,
    description: `${title} description`,
    objectives: ['obj1', 'obj2'],
    exercises: [
      mkExercise(`${id}-e1`, id, `${title} - e1`),
      mkExercise(`${id}-e2`, id, `${title} - e2`),
      mkExercise(`${id}-e3`, id, `${title} - e3`),
    ],
  }
}

function mkLevel(id: string, order: number, title: string): Level {
  return {
    id,
    order,
    title,
    description: `${title} description`,
    databaseId: 'library',
    lessons: [
      mkLesson(`${id}.1`, 1, `${title} 1`),
      mkLesson(`${id}.2`, 2, `${title} 2`),
    ],
  }
}

const COURSE: Course = {
  id: 'test-course',
  locale: 'es',
  version: '1.0.0',
  title: 'Curso de prueba',
  description: 'Un curso sintético para tests.',
  levels: [mkLevel('L1', 1, 'Nivel Uno'), mkLevel('L2', 2, 'Nivel Dos')],
  databases: [],
}

afterEach(() => {
  cleanup()
})

describe('CourseSidebar', () => {
  it('renders the sidebar, all levels, lessons and exercises', () => {
    render(
      <CourseSidebar
        course={COURSE}
        onSelectExercise={() => undefined}
        completedExerciseIds={new Set()}
      />,
    )
    expect(screen.getByTestId('course-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('level-L1')).toBeInTheDocument()
    expect(screen.getByTestId('level-L2')).toBeInTheDocument()
    expect(screen.getByTestId('lesson-L1.1')).toBeInTheDocument()
    expect(screen.getByTestId('lesson-L1.2')).toBeInTheDocument()
    expect(screen.getByTestId('exercise-L1.1-e1')).toBeInTheDocument()
    expect(screen.getByTestId('exercise-L1.1-e3')).toBeInTheDocument()
    expect(screen.getByTestId('exercise-L2.2-e1')).toBeInTheDocument()
  })

  it('marks completed exercises with data-completed="true" and shows a check', () => {
    const completed = new Set<string>(['L1.1-e1', 'L1.1-e2'])
    render(
      <CourseSidebar
        course={COURSE}
        onSelectExercise={() => undefined}
        completedExerciseIds={completed}
      />,
    )
    const e1 = screen.getByTestId('exercise-L1.1-e1') as HTMLButtonElement
    const e3 = screen.getByTestId('exercise-L1.1-e3') as HTMLButtonElement
    expect(e1.dataset.completed).toBe('true')
    expect(e3.dataset.completed).toBe('false')
    // The check icon is rendered via Check icon (lucide).
    expect(e1.querySelector('svg')).toBeTruthy()
  })

  it('fires onSelectExercise with the right id when an exercise is clicked', () => {
    const handler = vi.fn()
    render(
      <CourseSidebar
        course={COURSE}
        onSelectExercise={handler}
        completedExerciseIds={new Set()}
      />,
    )
    fireEvent.click(screen.getByTestId('exercise-L1.2-e2'))
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('L1.2-e2')
  })

  it('highlights the active exercise', () => {
    render(
      <CourseSidebar
        course={COURSE}
        activeExerciseId="L2.1-e2"
        onSelectExercise={() => undefined}
        completedExerciseIds={new Set()}
      />,
    )
    const e2 = screen.getByTestId('exercise-L2.1-e2') as HTMLButtonElement
    expect(e2.dataset.active).toBe('true')
    expect(e2.getAttribute('aria-current')).toBe('page')
  })

  it('renders the per-level progress text and bar fill', () => {
    const completed = new Set<string>(['L1.1-e1', 'L1.1-e2'])
    const { container } = render(
      <CourseSidebar
        course={COURSE}
        onSelectExercise={() => undefined}
        completedExerciseIds={completed}
      />,
    )
    // L1 has 6 exercises total (2 lessons × 3), of which 2 are done.
    const level1 = screen.getByTestId('level-progress-L1')
    const fill = level1.querySelector('[data-testid="progress-fill"]') as HTMLElement
    expect(fill.style.width).toBe('33%')
    expect(level1.textContent).toContain('2 / 6')
    // L2 has 0 done, so its fill is empty.
    const level2 = screen.getByTestId('level-progress-L2')
    const l2Fill = level2.querySelector('[data-testid="progress-fill"]') as HTMLElement
    expect(l2Fill.style.width).toBe('0%')
    // Sanity: no global test-id collisions (we used `container` only to
    // import the variable — `screen` already covers the assertions).
    expect(container).toBeTruthy()
  })
})
