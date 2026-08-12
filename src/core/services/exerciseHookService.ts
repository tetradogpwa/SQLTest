/**
 * Exercise hook service.
 *
 * Pure-TS pieces of `useExercise` that don't need the React
 * lifecycle. The hook is the React adapter (state, refs, effects);
 * the service owns the deterministic decisions that are
 * testable in pure vitest.
 *
 * Why these live in a service and not in the runner:
 *  - `resolveExerciseContext` does a catalog lookup and a
 *    placeholder fallback. It is called on every render; the
 *    service makes the fallback branch testable in isolation.
 *  - `toSerializedError` is a defensive wrapper for thrown values
 *    that may or may not be a `SerializedError` (Comlink, raw
 *    Error, plain object). The hook calls it on the `run` /
 *    `check` catch arms; the service makes the type-narrowing
 *    testable.
 *  - `generateSessionId` is a small pure function that produces
 *    the per-mount session id used as an OPFS filename prefix.
 *    Exposing it lets tests assert the format.
 */
import type { Exercise } from '../../core/exercises/types'
import type { Course, Lesson } from '../../content/types'
import type { SerializedError } from '../../workers/types'

/* ------------------------------------------------------------------ *
 *  Catalog resolution                                                  *
 * ------------------------------------------------------------------ */

export interface ResolvedExerciseContext {
  exercise: Exercise
  lesson: Lesson
}

/**
 * Find an exercise in the course catalog. When the id is unknown
 * (which the ExercisePage guard prevents in production) we return a
 * placeholder so the type-checker stays happy and the UI renders a
 * "(ejercicio no encontrado)" heading instead of crashing.
 */
export function resolveExerciseContext(
  course: Course,
  exerciseId: string,
): ResolvedExerciseContext {
  for (const level of course.levels) {
    for (const lesson of level.lessons) {
      for (const ex of lesson.exercises) {
        if (ex.id === exerciseId) return { exercise: ex, lesson }
      }
    }
  }
  return {
    exercise: {
      id: exerciseId,
      lessonId: 'unknown',
      type: 'writeQuery',
      title: '(ejercicio no encontrado)',
      prompt: '',
      solution: '',
      solutionExplanation: '',
      validation: [],
      hints: [],
      difficulty: 1,
      tags: [],
      databaseId: 'unknown',
    },
    lesson: {
      id: 'unknown',
      order: 0,
      title: '(lección desconocida)',
      description: '',
      objectives: [],
      exercises: [],
    },
  }
}

/* ------------------------------------------------------------------ *
 *  Error wrapping                                                      *
 * ------------------------------------------------------------------ */

/**
 * Wrap an unknown thrown value in a `SerializedError`. Comlink
 * rejections come through as plain objects (already shaped like
 * `SerializedError`); native `Error` instances get a generic
 * `UNEXPECTED` code; anything else is coerced to a string and
 * wrapped in the same shape.
 */
export function toSerializedError(e: unknown): SerializedError {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    return e as SerializedError
  }
  const message = e instanceof Error ? e.message : String(e)
  return {
    code: 'UNEXPECTED',
    message,
    translatedMessage: `Error inesperado: ${message}.`,
  }
}

/* ------------------------------------------------------------------ *
 *  Session id generation                                              *
 * ------------------------------------------------------------------ */

/**
 * Generate a per-mount session id. We use `Date.now()` + `Math.random`
 * to avoid pulling in a UUID library; the id is only used as an
 * OPFS filename prefix so collisions are acceptable (they would
 * just overwrite the file).
 */
export function generateSessionId(
  now: () => number = () => Date.now(),
  random: () => number = Math.random,
): string {
  return `s-${now().toString(36)}-${random().toString(36).slice(2, 10)}`
}
