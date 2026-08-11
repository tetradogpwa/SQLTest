/**
 * useProgress — reactive view on top of `progressStore`.
 *
 * Reads the `progress` table from Dexie via `useLiveQuery` and exposes
 * derived data structures (sets of completed/attempted exercise ids,
 * completion-per-level map) that the UI can consume without rebuilding
 * the logic in every component.
 *
 * Why not just call `progressStore` directly?
 *
 *   - The store API is `async`. The UI wants a synchronous snapshot
 *     that re-renders on changes. `useLiveQuery` bridges that gap.
 *   - We want the completion-by-level map pre-computed against the
 *     *current* course (so the sidebar can show "3 / 7" without
 *     re-walking the catalog on every render).
 *
 * The hook is **read-only** with respect to the in-memory course: it
 * never mutates the catalog and never re-loads it. `loadCourse('es')`
 * is synchronous (RESEARCH §14.1) so we can call it at the top of
 * `useLiveQuery` and let React depend on the returned `Course`.
 */
import { useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { loadCourse } from '../content/loaders'
import type { Course } from '../content/types'
import { progressStore } from '../core/persistence/progress-store'

/** Aggregate progress for a single level. */
export interface LevelCompletion {
  /** Number of exercises in the level that are completed. */
  done: number
  /** Total exercises in the level. */
  total: number
  /** `done / total` in [0, 1]. 0 when total is 0. */
  pct: number
}

export interface UseProgressResult {
  /** Ids of exercises whose `progress` row has a non-null `completedAt`. */
  completedExerciseIds: Set<string>
  /**
   * Ids of exercises that have at least one `exerciseStats` row. This is
   * a strict superset of `completedExerciseIds` (every completion is
   * also an attempt). The UI uses it to render "attempted but not yet
   * passed" badges.
   */
  attemptedExerciseIds: Set<string>
  /**
   * Ids of lessons for which every exercise has a `progress` row. A
   * lesson counts as completed when its 6-7 exercises are all done.
   */
  completedLessonIds: Set<string>
  /**
   * `Map<levelId, LevelCompletion>` for every level of the course.
   * Computed against the loaded course so the UI can iterate it
   * without touching `loadCourse` again.
   */
  completionByLevel: Map<string, LevelCompletion>
  /**
   * The loaded course used to compute the completion map. Exposed so
   * consumers (e.g. the sidebar) don't have to call `loadCourse` again.
   */
  course: Course
  /**
   * Mark a single attempt at an exercise. `success === true` writes
   * an `attemptType: 'run'` row; `false` writes `attemptType: 'submit'`.
   * Completion bookkeeping is **not** touched here.
   */
  markAttempted(exerciseId: string, success: boolean): Promise<void>
  /**
   * Mark an exercise as completed. If this finishes the last exercise
   * of the lesson, the lesson is also marked as completed (the
   * `progress` table will have one row per `(lessonId, exerciseId)`).
   */
  markCompleted(
    exerciseId: string,
    lessonId: string,
    hintsUsed?: number,
    timeMs?: number,
  ): Promise<void>
  /** Wipe all progress (use with a confirmation dialog upstream). */
  reset(): Promise<void>
}

/**
 * Reactive progress hook.
 *
 * The hook re-renders whenever any row of the `progress` table changes
 * (Dexie's live query) or the catalog is updated (future-proofing;
 * today the catalog is static).
 */
export function useProgress(): UseProgressResult {
  // Load the course once per render. `loadCourse` is memoised inside
  // the loader so the call is effectively free; we still wrap it in
  // `useMemo` so React doesn't see a new `Course` object every render
  // (the course is frozen and lives in a module-level cache).
  const course = useMemo<Course>(() => loadCourse('es'), [])

  // We use two live queries: one over `progress` (for completions) and
  // one over `exerciseStats` (for attempts). Both are tiny tables and
  // the `useLiveQuery` diff is shallow, so this is fine.
  const progressRows = useLiveQuery(() => progressStore['db'].progress.toArray(), [], [])
  const statsRows = useLiveQuery(() => progressStore['db'].exerciseStats.toArray(), [], [])

  const completedExerciseIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>()
    for (const row of progressRows ?? []) {
      if (row.completedAt && row.completedAt > 0) {
        ids.add(row.exerciseId)
      }
    }
    return ids
  }, [progressRows])

  const attemptedExerciseIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>()
    for (const row of statsRows ?? []) {
      if (row.exerciseId) ids.add(row.exerciseId)
    }
    // Completed is always a subset of attempted; ensure that's the case
    // even if `exerciseStats` was wiped independently.
    for (const id of completedExerciseIds) ids.add(id)
    return ids
  }, [statsRows, completedExerciseIds])

  // Lesson completion: a lesson is "completed" iff every one of its
  // exercises is in `completedExerciseIds`.
  const completedLessonIds = useMemo<Set<string>>(() => {
    const set = new Set<string>()
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        if (lesson.exercises.length === 0) continue
        let allDone = true
        for (const ex of lesson.exercises) {
          if (!completedExerciseIds.has(ex.id)) {
            allDone = false
            break
          }
        }
        if (allDone) set.add(lesson.id)
      }
    }
    return set
  }, [course, completedExerciseIds])

  // Per-level completion: {done, total, pct}.
  const completionByLevel = useMemo<Map<string, LevelCompletion>>(() => {
    const out = new Map<string, LevelCompletion>()
    for (const level of course.levels) {
      let total = 0
      let done = 0
      for (const lesson of level.lessons) {
        total += lesson.exercises.length
        for (const ex of lesson.exercises) {
          if (completedExerciseIds.has(ex.id)) done += 1
        }
      }
      out.set(level.id, {
        done,
        total,
        pct: total === 0 ? 0 : done / total,
      })
    }
    return out
  }, [course, completedExerciseIds])

  const markAttempted = useCallback(
    async (exerciseId: string, success: boolean): Promise<void> => {
      // We need the lessonId to satisfy the store's signature; the
      // caller (useExercise) usually knows it. We accept that the
      // hook can't infer it from `exerciseId` alone (the exercise
      // itself knows its lesson, but the store API takes the lessonId
      // explicitly for clarity). The pages wire this through.
      const lessonId = resolveLessonId(course, exerciseId)
      await progressStore.markExerciseAttempted(exerciseId, lessonId, success)
    },
    [course],
  )

  const markCompleted = useCallback(
    async (exerciseId: string, lessonId: string, hintsUsed?: number, timeMs?: number): Promise<void> => {
      await progressStore.markExerciseCompleted(
        exerciseId,
        lessonId,
        Date.now(),
        hintsUsed,
        timeMs,
      )
      // If this completes the lesson, also stamp the lesson row. We
      // re-read the *fresh* `progress` table (the closure-captured
      // `completedExerciseIds` is one render behind) and the catalog
      // to count the exercises of the lesson.
      const lesson = findLesson(course, lessonId)
      if (lesson) {
        const allRows = await progressStore['db'].progress.toArray()
        const completedNow = new Set<string>(allRows.map((r) => r.exerciseId))
        const allDone = lesson.exercises.every(
          (ex) => completedNow.has(ex.id) || ex.id === exerciseId,
        )
        if (allDone) {
          await progressStore.markLessonCompleted(lessonId)
        }
      }
    },
    [course],
  )

  const reset = useCallback(async (): Promise<void> => {
    await progressStore.resetAllProgress()
  }, [])

  return {
    completedExerciseIds,
    attemptedExerciseIds,
    completedLessonIds,
    completionByLevel,
    course,
    markAttempted,
    markCompleted,
    reset,
  }
}

/* ------------------------------------------------------------------ *
 *  Internal helpers                                                   *
 * ------------------------------------------------------------------ */

/** Walk the course to find the lesson that owns `exerciseId`. */
function findLesson(course: Course, exerciseId: string) {
  for (const level of course.levels) {
    for (const lesson of level.lessons) {
      for (const ex of lesson.exercises) {
        if (ex.id === exerciseId) return lesson
      }
    }
  }
  return null
}

/**
 * Resolve the lessonId of an exercise from the catalog. We use this in
 * `markAttempted` to keep the public signature ergonomic (the hook
 * caller doesn't have to know the lessonId; only the exerciseId).
 */
function resolveLessonId(course: Course, exerciseId: string): string {
  const lesson = findLesson(course, exerciseId)
  if (!lesson) {
    // The store tolerates any string here, so we fall back to the
    // exercise id itself. The page-level guard (ExercisePage only
    // renders a known exercise) means we never hit this in practice.
    return exerciseId
  }
  return lesson.id
}
