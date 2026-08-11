/**
 * Tests for `ProgressStore` — covers the lesson / exercise completion
 * APIs plus the course-wide percentage calculation. The course
 * catalog is injected so the store does not depend on the
 * (not-yet-existing) `content/lessons/` modules.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  type CourseCatalogProvider,
  ProgressStore,
} from '../../../src/core/persistence/progress-store'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'

/**
 * Builds a 2-lesson, 4-exercise catalog provider. Each lesson has
 * 2 exercises.
 */
function makeCatalog(): CourseCatalogProvider {
  const map = new Map<string, string[]>([
    ['lesson-1', ['ex-1-1', 'ex-1-2']],
    ['lesson-2', ['ex-2-1', 'ex-2-2']],
  ])
  return () => ({ totalLessons: 2, exercisesByLesson: map })
}

describe('ProgressStore', () => {
  let db: SqlAcademyDB
  let store: ProgressStore

  beforeEach(() => {
    db = createTestDb()
    store = new ProgressStore(db, { catalogProvider: makeCatalog() })
  })

  afterEach(async () => {
    await resetTestDb(db)
  })

  /* ------------------------------------------------------------------ *
   *  markLessonCompleted                                                 *
   * ------------------------------------------------------------------ */

  it('marks every exercise of a lesson as completed', async () => {
    await store.markLessonCompleted('lesson-1', 1000)
    const lp = await store.getLessonProgress('lesson-1')
    expect(lp.completed).toBe(true)
    expect(lp.completedAt).toBe(1000)
    expect(lp.exercisesCompleted).toBe(2)
  })

  it('reports a lesson as not completed when the catalog has no exercises', async () => {
    const lp = await store.getLessonProgress('lesson-missing')
    expect(lp.completed).toBe(false)
    expect(lp.exercisesCompleted).toBe(0)
  })

  /* ------------------------------------------------------------------ *
   *  markExerciseCompleted                                                *
   * ------------------------------------------------------------------ */

  it('marks a single exercise as completed and records a stat', async () => {
    await store.markExerciseCompleted('ex-1-1', 'lesson-1', 2000, 2, 4500)
    expect(await store.isExerciseCompleted('ex-1-1')).toBe(true)
    const recent = await store.getRecentExerciseAttempts(10)
    expect(recent).toHaveLength(1)
    expect(recent[0]?.attemptType).toBe('submit')
    expect(recent[0]?.correct).toBe(true)
    expect(recent[0]?.hintsUsed).toBe(2)
    expect(recent[0]?.durationMs).toBe(4500)
  })

  it('is idempotent for a given (lesson, exercise) — re-completing does not duplicate', async () => {
    await store.markExerciseCompleted('ex-1-1', 'lesson-1', 2000)
    await store.markExerciseCompleted('ex-1-1', 'lesson-1', 3000)
    const lp = await store.getLessonProgress('lesson-1')
    expect(lp.exercisesCompleted).toBe(1)
  })

  it('moves the completedAt forward when the second completion is later', async () => {
    await store.markExerciseCompleted('ex-1-1', 'lesson-1', 1000)
    await store.markExerciseCompleted('ex-1-1', 'lesson-1', 2000)
    const lp = await store.getLessonProgress('lesson-1')
    expect(lp.completedAt).toBe(2000)
  })

  it('keeps the older completedAt when the second call is in the past', async () => {
    await store.markExerciseCompleted('ex-1-1', 'lesson-1', 5000)
    await store.markExerciseCompleted('ex-1-1', 'lesson-1', 2000)
    const lp = await store.getLessonProgress('lesson-1')
    expect(lp.completedAt).toBe(5000)
  })

  /* ------------------------------------------------------------------ *
   *  markExerciseAttempted                                                *
   * ------------------------------------------------------------------ */

  it('records a non-final attempt without touching the progress table', async () => {
    await store.markExerciseAttempted('ex-1-1', 'lesson-1', false, 1)
    expect(await store.isExerciseCompleted('ex-1-1')).toBe(false)
    const recent = await store.getRecentExerciseAttempts(10)
    expect(recent).toHaveLength(1)
    expect(recent[0]?.correct).toBe(false)
  })

  /* ------------------------------------------------------------------ *
   *  getCourseProgress                                                    *
   * ------------------------------------------------------------------ */

  it('returns 0% on a fresh install', async () => {
    const cp = await store.getCourseProgress()
    expect(cp).toEqual({
      totalLessons: 2,
      completedLessons: 0,
      totalExercises: 4,
      completedExercises: 0,
      percent: 0,
    })
  })

  it('computes 50% after completing half the exercises', async () => {
    await store.markExerciseCompleted('ex-1-1', 'lesson-1')
    await store.markExerciseCompleted('ex-1-2', 'lesson-1')
    const cp = await store.getCourseProgress()
    expect(cp.completedExercises).toBe(2)
    expect(cp.totalExercises).toBe(4)
    expect(cp.percent).toBe(50)
    // Both exercises live in lesson-1, so exactly one lesson is done.
    expect(cp.completedLessons).toBe(1)
  })

  it('reports 100% after every exercise is completed', async () => {
    for (const ex of ['ex-1-1', 'ex-1-2', 'ex-2-1', 'ex-2-2']) {
      await store.markExerciseCompleted(ex, ex.startsWith('ex-1') ? 'lesson-1' : 'lesson-2')
    }
    const cp = await store.getCourseProgress()
    expect(cp.percent).toBe(100)
    expect(cp.completedLessons).toBe(2)
  })

  /* ------------------------------------------------------------------ *
   *  resetAllProgress                                                     *
   * ------------------------------------------------------------------ */

  it('wipes both progress and exerciseStats', async () => {
    await store.markExerciseCompleted('ex-1-1', 'lesson-1', 1, 0, 100)
    await store.markExerciseAttempted('ex-1-2', 'lesson-1', false)
    await store.resetAllProgress()
    const cp = await store.getCourseProgress()
    expect(cp.completedExercises).toBe(0)
    const recent = await store.getRecentExerciseAttempts(10)
    expect(recent).toEqual([])
  })
})
