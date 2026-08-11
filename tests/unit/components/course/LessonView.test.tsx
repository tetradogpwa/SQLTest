/**
 * Tests for `LessonView`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { LessonView } from '../../../../src/ui/components/course/LessonView'
import type { Exercise, Level, Lesson } from '../../../../src/content/types'

function mkExercise(id: string, lessonId: string, title: string, type: Exercise['type'] = 'writeQuery'): Exercise {
  return {
    id,
    lessonId,
    type,
    title,
    prompt: `prompt for ${title}`,
    solution: 'SELECT 1',
    solutionExplanation: 'trivial',
    validation: [{ type: 'result', orderMatters: false }],
    hints: [],
    difficulty: 3,
    tags: [],
    databaseId: 'library',
  }
}

const LESSON: Lesson = {
  id: 'L1.1',
  order: 1,
  title: 'SELECT básico',
  description: 'Aprende a hacer SELECTs.',
  objectives: [
    'Escribir consultas SELECT',
    'Aplicar filtros con WHERE',
    'Ordenar y limitar',
  ],
  exercises: [
    mkExercise('L1.1-e1', 'L1.1', 'Lista todos los libros'),
    mkExercise('L1.1-e2', 'L1.1', 'Libros después del 2000', 'predictResult'),
    mkExercise('L1.1-e3', 'L1.1', 'Encuentra el error', 'findError'),
  ],
}

const LEVEL: Level = {
  id: 'L1',
  order: 1,
  title: 'Biblioteca',
  description: 'Nivel uno',
  databaseId: 'library',
  lessons: [LESSON],
}

afterEach(() => {
  cleanup()
})

describe('LessonView', () => {
  it('renders the lesson title, description and objectives', () => {
    render(
      <LessonView
        lesson={LESSON}
        level={LEVEL}
        completedExerciseIds={new Set()}
        onSelectExercise={() => undefined}
      />,
    )
    expect(screen.getByTestId('lesson-view')).toBeInTheDocument()
    expect(screen.getByTestId('lesson-title').textContent).toContain('SELECT básico')
    expect(screen.getByTestId('lesson-objective-0').textContent).toContain('Escribir')
    expect(screen.getByTestId('lesson-objective-1').textContent).toContain('Aplicar')
    expect(screen.getByTestId('lesson-objective-2').textContent).toContain('Ordenar')
  })

  it('renders one card per exercise with the right type and difficulty', () => {
    render(
      <LessonView
        lesson={LESSON}
        level={LEVEL}
        completedExerciseIds={new Set()}
        onSelectExercise={() => undefined}
      />,
    )
    expect(screen.getByTestId('exercise-card-L1.1-e1')).toBeInTheDocument()
    expect(screen.getByTestId('exercise-card-L1.1-e2')).toBeInTheDocument()
    expect(screen.getByTestId('exercise-card-L1.1-e3')).toBeInTheDocument()
    // Type badge uses the friendly Spanish label.
    expect(screen.getByTestId('exercise-type-L1.1-e2').textContent).toContain('Predecir')
    // Difficulty is shown as stars.
    expect(screen.getByTestId('exercise-difficulty-L1.1-e1').textContent).toBe('★★★☆☆')
  })

  it('fires onSelectExercise with the clicked exercise id', () => {
    const handler = vi.fn()
    render(
      <LessonView
        lesson={LESSON}
        level={LEVEL}
        completedExerciseIds={new Set()}
        onSelectExercise={handler}
      />,
    )
    fireEvent.click(screen.getByTestId('exercise-start-L1.1-e2'))
    expect(handler).toHaveBeenCalledWith('L1.1-e2')
  })

  it('marks completed exercises and switches the start button to "Repetir"', () => {
    render(
      <LessonView
        lesson={LESSON}
        level={LEVEL}
        completedExerciseIds={new Set(['L1.1-e1'])}
        onSelectExercise={() => undefined}
      />,
    )
    const card = screen.getByTestId('exercise-card-L1.1-e1')
    expect(card.dataset.completed).toBe('true')
    expect(screen.getByTestId('exercise-completed-L1.1-e1')).toBeInTheDocument()
    expect(screen.getByTestId('exercise-start-L1.1-e1').textContent).toContain('Repetir')
  })
})
