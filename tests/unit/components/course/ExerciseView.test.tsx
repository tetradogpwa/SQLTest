/**
 * Tests for `ExerciseView`.
 *
 * Strategy:
 *  - Mock `useDatabase` to return a fake ready api.
 *  - Mock `useExercise` to return a controllable state (we assert on
 *    the rendered toolbar / result area without exercising the real
 *    runner). This keeps the test fast and deterministic.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mutable state for the mocked useExercise.
const mockExerciseState = {
  status: 'ready' as 'idle' | 'starting' | 'ready' | 'running' | 'failed',
  attempts: 0,
  lastResult: null as unknown,
  lastError: null as unknown,
  checkReport: null as unknown,
  run: vi.fn(async (_sql: string) => undefined),
  check: vi.fn(async () => ({
    allPassed: true,
    results: [],
    passedCount: 0,
    failedCount: 0,
  })),
  reset: vi.fn(async () => undefined),
  revealNextHint: vi.fn(() => null),
  revealSolution: vi.fn(async () => undefined),
  destroy: vi.fn(() => undefined),
  hintsRevealed: 0,
  lastPatterns: [],
  solution: null,
  runner: {} as never,
}

vi.mock('../../../../src/hooks/useExercise', () => ({
  useExercise: () => mockExerciseState,
}))

vi.mock('../../../../src/hooks/useDatabase', () => ({
  useDatabase: () => ({
    api: {} as never,
    dbId: 1,
    setActiveDb: () => undefined,
    ready: true,
    initializing: false,
    error: null,
    initResult: { capability: 'memory', sqliteVersion: '3.45.0', vfsName: ':memory:' },
    capability: 'memory',
    status: 'ready',
    registerDb: () => undefined,
    unregisterDb: () => undefined,
    retry: async () => undefined,
  }),
}))

import { ExerciseView } from '../../../../src/ui/components/course/ExerciseView'
import type { DatabaseSeed, Exercise, Level, Lesson } from '../../../../src/content/types'

const EXERCISE: Exercise = {
  id: 'L1.1-e1',
  lessonId: 'L1.1',
  type: 'writeQuery',
  title: 'Lista todos los libros',
  prompt: 'Muestra el id, título y año de publicación de los libros.',
  starterCode: '-- escribe tu SQL\n',
  solution: 'SELECT id, titulo, anio_publicacion FROM libros',
  solutionExplanation: 'trivial',
  validation: [{ type: 'result', orderMatters: true }],
  hints: [],
  difficulty: 2,
  tags: ['select', 'order-by'],
  databaseId: 'library',
}

const LESSON: Lesson = {
  id: 'L1.1',
  order: 1,
  title: 'SELECT básico',
  description: 'Aprende a hacer SELECTs.',
  objectives: ['objetivo 1'],
  exercises: [EXERCISE],
}

const LEVEL: Level = {
  id: 'L1',
  order: 1,
  title: 'Biblioteca',
  description: 'Nivel uno',
  databaseId: 'library',
  lessons: [LESSON],
}

const DATABASE: DatabaseSeed = {
  id: 'library',
  name: 'Biblioteca',
  description: 'Catálogo de una biblioteca',
  sql: 'CREATE TABLE libros (id INTEGER);',
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockExerciseState.status = 'ready'
  mockExerciseState.lastResult = null
  mockExerciseState.lastError = null
  mockExerciseState.checkReport = null
})

describe('ExerciseView', () => {
  it('renders the title, prompt, type badge and tags', () => {
    render(
      <MemoryRouter>
        <ExerciseView
          exercise={EXERCISE}
          level={LEVEL}
          lesson={LESSON}
          database={DATABASE}
        />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('exercise-view')).toBeInTheDocument()
    expect(screen.getByTestId('exercise-title').textContent).toContain('Lista todos')
    expect(screen.getByTestId('exercise-prompt').textContent).toContain('Muestra el id')
    expect(screen.getByTestId('exercise-type-badge').textContent).toContain('Escribir')
    expect(screen.getByTestId('exercise-tags').textContent).toContain('select')
    expect(screen.getByTestId('exercise-tags').textContent).toContain('order-by')
    // Difficulty is 2 → 2 filled stars out of 5.
    expect(screen.getByTestId('exercise-difficulty').textContent).toBe('★★☆☆☆')
  })

  it('has Ejecutar and Comprobar buttons; clicking Ejecutar calls run()', async () => {
    render(
      <MemoryRouter>
        <ExerciseView
          exercise={EXERCISE}
          level={LEVEL}
          lesson={LESSON}
          database={DATABASE}
        />
      </MemoryRouter>,
    )
    const runButton = screen.getByTestId('run-button') as HTMLButtonElement
    const checkButton = screen.getByTestId('check-button') as HTMLButtonElement
    expect(runButton).toBeInTheDocument()
    expect(checkButton).toBeInTheDocument()
    fireEvent.click(checkButton)
    await waitFor(() => expect(mockExerciseState.check).toHaveBeenCalled())
    fireEvent.click(runButton)
    await waitFor(() => expect(mockExerciseState.run).toHaveBeenCalled())
  })

  it('reset() is called when clicking "Reiniciar ejercicio"', async () => {
    render(
      <MemoryRouter>
        <ExerciseView
          exercise={EXERCISE}
          level={LEVEL}
          lesson={LESSON}
          database={DATABASE}
        />
      </MemoryRouter>,
    )
    const resetButton = screen.getByTestId('reset-button')
    fireEvent.click(resetButton)
    await waitFor(() => expect(mockExerciseState.reset).toHaveBeenCalled())
  })

  it('renders the validation report when checkReport is set', () => {
    mockExerciseState.checkReport = {
      allPassed: false,
      results: [
        { passed: true, message: 'columnas correctas', strategyType: 'schema' },
        { passed: false, message: 'falta una fila', strategyType: 'result' },
      ],
      passedCount: 1,
      failedCount: 1,
    }
    render(
      <MemoryRouter>
        <ExerciseView
          exercise={EXERCISE}
          level={LEVEL}
          lesson={LESSON}
          database={DATABASE}
        />
      </MemoryRouter>,
    )
    const report = screen.getByTestId('validation-report')
    expect(report).toBeInTheDocument()
    expect(report.dataset.allPassed).toBe('false')
    expect(screen.getByTestId('validation-row-schema')).toBeInTheDocument()
    expect(screen.getByTestId('validation-row-result')).toBeInTheDocument()
  })
})
