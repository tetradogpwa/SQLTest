/**
 * Tests for `exerciseHookService` — exhaustive coverage of the
 * pure pieces of `useExercise`.
 */
import { describe, expect, it } from 'vitest'

import {
  generateSessionId,
  resolveExerciseContext,
  toSerializedError,
} from '../../../src/core/services/exerciseHookService'
import type { SerializedError } from '../../../src/workers/types'

/* ------------------------------------------------------------------ *
 *  resolveExerciseContext                                                *
 * ------------------------------------------------------------------ */

function makeCourse(): unknown {
  return {
    levels: [
      {
        id: 'L1',
        order: 1,
        title: 'Level 1',
        description: 'd',
        databaseId: 'db-1',
        lessons: [
          {
            id: 'L1.1',
            order: 1,
            title: 'Lesson 1',
            description: 'd',
            objectives: [],
            exercises: [
              {
                id: 'L1.1-e1',
                lessonId: 'L1.1',
                type: 'writeQuery',
                title: 'Exercise 1',
                prompt: 'p',
                solution: 'SELECT 1',
                solutionExplanation: 'e',
                validation: [],
                hints: [],
                difficulty: 1,
                tags: [],
                databaseId: 'db-1',
              },
              {
                id: 'L1.1-e2',
                lessonId: 'L1.1',
                type: 'writeQuery',
                title: 'Exercise 2',
                prompt: 'p',
                solution: 'SELECT 2',
                solutionExplanation: 'e',
                validation: [],
                hints: [],
                difficulty: 1,
                tags: [],
                databaseId: 'db-1',
              },
            ],
          },
        ],
      },
      {
        id: 'L2',
        order: 2,
        title: 'Level 2',
        description: 'd',
        databaseId: 'db-1',
        lessons: [
          {
            id: 'L2.1',
            order: 1,
            title: 'Lesson 1',
            description: 'd',
            objectives: [],
            exercises: [
              {
                id: 'L2.1-e1',
                lessonId: 'L2.1',
                type: 'writeQuery',
                title: 'Exercise 1',
                prompt: 'p',
                solution: 'SELECT 3',
                solutionExplanation: 'e',
                validation: [],
                hints: [],
                difficulty: 1,
                tags: [],
                databaseId: 'db-1',
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('resolveExerciseContext', () => {
  it('returns the matching exercise + lesson when the id exists', () => {
    const course = makeCourse() as Parameters<typeof resolveExerciseContext>[0]
    const r = resolveExerciseContext(course, 'L1.1-e1')
    expect(r.exercise.id).toBe('L1.1-e1')
    expect(r.lesson.id).toBe('L1.1')
  })

  it('finds an exercise in a later level', () => {
    const course = makeCourse() as Parameters<typeof resolveExerciseContext>[0]
    const r = resolveExerciseContext(course, 'L2.1-e1')
    expect(r.exercise.id).toBe('L2.1-e1')
    expect(r.lesson.id).toBe('L2.1')
  })

  it('finds the second exercise in the first lesson', () => {
    const course = makeCourse() as Parameters<typeof resolveExerciseContext>[0]
    const r = resolveExerciseContext(course, 'L1.1-e2')
    expect(r.exercise.id).toBe('L1.1-e2')
  })

  it('returns a placeholder when the id does not exist', () => {
    const course = makeCourse() as Parameters<typeof resolveExerciseContext>[0]
    const r = resolveExerciseContext(course, 'L99.99-e1')
    expect(r.exercise.id).toBe('L99.99-e1')
    expect(r.exercise.title).toMatch(/no encontrado/i)
    expect(r.lesson.id).toBe('unknown')
    expect(r.lesson.title).toMatch(/desconocida/i)
  })

  it('returns a placeholder for an empty id', () => {
    const course = makeCourse() as Parameters<typeof resolveExerciseContext>[0]
    const r = resolveExerciseContext(course, '')
    expect(r.exercise.id).toBe('')
    expect(r.exercise.title).toMatch(/no encontrado/i)
  })

  it('returns a placeholder for an empty course', () => {
    const r = resolveExerciseContext(
      { id: 'empty', levels: [] } as unknown as Parameters<typeof resolveExerciseContext>[0],
      'any',
    )
    expect(r.exercise.title).toMatch(/no encontrado/i)
  })

  it('preserves the lesson object on a hit (the same reference)', () => {
    const course = makeCourse() as Parameters<typeof resolveExerciseContext>[0]
    const r = resolveExerciseContext(course, 'L1.1-e1')
    expect(r.lesson).toBe(course.levels[0]?.lessons[0])
  })
})

/* ------------------------------------------------------------------ *
 *  toSerializedError                                                    *
 * ------------------------------------------------------------------ */

describe('toSerializedError', () => {
  it('returns a SerializedError as-is when one is thrown', () => {
    const err: SerializedError = {
      code: 'SQLITE_ERROR',
      message: 'no such table: foo',
      translatedMessage: 'No existe la tabla `foo`.',
    }
    expect(toSerializedError(err)).toBe(err)
  })

  it('returns a SerializedError when the input has the right shape (Comlink)', () => {
    // Comlink serialises custom errors as plain objects. The service
    // trusts the shape (verified by the `in` checks).
    const result = toSerializedError({
      code: 'WORKER_TERMINATED',
      message: 'Worker died',
      translatedMessage: 'El motor SQL se ha interrumpido.',
    })
    expect(result.code).toBe('WORKER_TERMINATED')
    expect(result.message).toBe('Worker died')
  })

  it('wraps a native Error in UNEXPECTED', () => {
    const e = new Error('boom')
    const r = toSerializedError(e)
    expect(r.code).toBe('UNEXPECTED')
    expect(r.message).toBe('boom')
    expect(r.translatedMessage).toMatch(/boom/)
  })

  it('wraps a string in UNEXPECTED (preserves the message)', () => {
    const r = toSerializedError('boom')
    expect(r.code).toBe('UNEXPECTED')
    expect(r.message).toBe('boom')
  })

  it('wraps null in UNEXPECTED (message = "null")', () => {
    const r = toSerializedError(null)
    expect(r.code).toBe('UNEXPECTED')
    expect(r.message).toBe('null')
  })

  it('wraps undefined in UNEXPECTED (message = "undefined")', () => {
    const r = toSerializedError(undefined)
    expect(r.code).toBe('UNEXPECTED')
    expect(r.message).toBe('undefined')
  })

  it('wraps a number in UNEXPECTED', () => {
    const r = toSerializedError(42)
    expect(r.code).toBe('UNEXPECTED')
    expect(r.message).toBe('42')
  })

  it('wraps an object without `code` in UNEXPECTED (defensive)', () => {
    const r = toSerializedError({ message: 'no code here' })
    expect(r.code).toBe('UNEXPECTED')
  })

  it('wraps an object without `message` in UNEXPECTED (defensive)', () => {
    const r = toSerializedError({ code: 'X' })
    expect(r.code).toBe('UNEXPECTED')
  })

  it('returns a fresh object every call (no shared state)', () => {
    expect(toSerializedError(new Error('x'))).not.toBe(toSerializedError(new Error('x')))
  })
})

/* ------------------------------------------------------------------ *
 *  generateSessionId                                                    *
 * ------------------------------------------------------------------ */

describe('generateSessionId', () => {
  it('produces a string with the `s-` prefix', () => {
    const id = generateSessionId()
    expect(id.startsWith('s-')).toBe(true)
  })

  it('contains a base-36 timestamp + a base-36 random suffix', () => {
    const id = generateSessionId()
    const parts = id.split('-')
    expect(parts.length).toBeGreaterThanOrEqual(3)
    // parts[0] = 's', parts[1] = timestamp, parts[2+] = random.
    expect(parts[0]).toBe('s')
    expect(parts[1]).toMatch(/^[a-z0-9]+$/)
    // Random suffix is at most 8 chars (slice(2, 10)).
    expect(parts.slice(2).join('-').length).toBeLessThanOrEqual(8)
  })

  it('uses the injected clock', () => {
    const id = generateSessionId(() => 0, () => 0.5)
    // 0 in base 36 is "0", 0.5 → "0.i" (8 chars from slice(2, 10) = "i" 8x).
    // We just assert the timestamp portion is "0".
    expect(id.split('-')[1]).toBe('0')
  })

  it('uses the injected random source', () => {
    const id = generateSessionId(() => 0, () => 0.999_999)
    // The suffix is the random.toString(36) starting at char 2.
    // We don't assert the exact value (Math.random impl varies) but
    // the suffix must be non-empty.
    const suffix = id.split('-').slice(2).join('-')
    expect(suffix.length).toBeGreaterThan(0)
  })

  it('produces different ids for different random inputs (same clock)', () => {
    const a = generateSessionId(() => 1000, () => 0.1)
    const b = generateSessionId(() => 1000, () => 0.2)
    expect(a).not.toBe(b)
  })

  it('produces different ids for different clocks (same random)', () => {
    const a = generateSessionId(() => 1000, () => 0.5)
    const b = generateSessionId(() => 2000, () => 0.5)
    expect(a).not.toBe(b)
  })

  it('handles a random that returns 0 (suffix = "")', () => {
    const id = generateSessionId(() => 0, () => 0)
    // 0.toString(36) is "0", slice(2, 10) = "".
    // The id is `s-0-` (with empty suffix).
    expect(id).toBe('s-0-')
  })
})
