/**
 * Progress store.
 *
 * Persists lesson / exercise completion and per-attempt statistics. Two
 * tables back this store:
 *
 *  - `progress` — one row per (lessonId, exerciseId), upserted on
 *    completion. Holds the timestamp of the first successful run plus
 *    optional analytics (`hintsUsed`, `timeMs`).
 *
 *  - `exerciseStats` — append-only log of every attempt (submit / run /
 *    hint / reveal) for the "recent attempts" feed and the analytics
 *    panel. This is **not** LRU-pruned: the table is small in practice
 *    (one row per interaction, and the user does not interact millions
 *    of times per session) and the data is needed for pedagogy.
 *
 * Course-level totals are computed on demand by `getCourseProgress()`
 * — we do not denormalise because the course catalog lives in
 * `content/` and a denormalised counter would drift whenever a new
 * course is added.
 */

import type { SqlAcademyDB } from './dexie'
import { db as defaultDb } from './dexie'
import type { ExerciseStat, Progress } from './types'

/** Aggregated progress for a single lesson. */
export interface LessonProgress {
  completed: boolean
  completedAt?: number
  exercisesCompleted: number
}

/** Aggregated progress for the whole course. */
export interface CourseProgress {
  totalLessons: number
  completedLessons: number
  totalExercises: number
  completedExercises: number
  /** 0..100, integer percent. */
  percent: number
}

/**
 * Source of truth for the "course shape" — which lessons and exercises
 * exist. The persistence layer is intentionally content-agnostic: the
 * `core/content/` module injects a concrete provider at app boot.
 * Until then, the default provider reports an empty course so the
 * percentage is `0` (rather than throwing).
 */
export type CourseCatalogProvider = () => {
  totalLessons: number
  /** Map of lessonId → list of exerciseIds in that lesson. */
  exercisesByLesson: Map<string, string[]>
}

const emptyCatalogProvider: CourseCatalogProvider = () => ({
  totalLessons: 0,
  exercisesByLesson: new Map<string, string[]>(),
})

export class ProgressStore {
  private readonly db: SqlAcademyDB
  private readonly getCatalog: CourseCatalogProvider

  constructor(
    dbInstance: SqlAcademyDB = defaultDb,
    options: {
      catalogProvider?: CourseCatalogProvider
    } = {},
  ) {
    this.db = dbInstance
    this.getCatalog = options.catalogProvider ?? emptyCatalogProvider
  }

  /* ------------------------------------------------------------------ *
   *  Mutations                                                          *
   * ------------------------------------------------------------------ */

  /**
   * Mark every exercise of `lessonId` as completed *if and only if* the
   * caller has actually finished them. In practice the lesson page
   * calls this only when the user reaches the lesson-end screen; the
   * per-exercise `markExerciseCompleted` is the granular source of
   * truth that backs this bulk operation.
   */
  async markLessonCompleted(lessonId: string, completedAt: number = Date.now()): Promise<void> {
    const { exercisesByLesson } = this.getCatalog()
    const exerciseIds = exercisesByLesson.get(lessonId) ?? []
    await this.db.transaction('rw', this.db.progress, this.db.exerciseStats, async () => {
      for (const exerciseId of exerciseIds) {
        await this.upsertProgressRow(lessonId, exerciseId, completedAt)
      }
    })
  }

  /**
   * Mark a single exercise as completed. The row is upserted on
   * `[lessonId+exerciseId]` so a second call (e.g. the user re-runs
   * the exercise) does not create duplicates — the timestamp moves
   * forward only if the new one is later.
   */
  async markExerciseCompleted(
    exerciseId: string,
    lessonId: string,
    completedAt: number = Date.now(),
    hintsUsed?: number,
    timeMs?: number,
  ): Promise<void> {
    await this.db.transaction('rw', this.db.progress, this.db.exerciseStats, async () => {
      await this.upsertProgressRow(lessonId, exerciseId, completedAt, hintsUsed, timeMs)
      await this.db.exerciseStats.add({
        exerciseId,
        timestamp: completedAt,
        attemptType: 'submit',
        correct: true,
        durationMs: timeMs,
        hintsUsed,
      })
    })
  }

  /**
   * Record a non-final attempt (run, hint, reveal, failed submit).
   * The `progress` table is **not** touched — only `exerciseStats`.
   */
  async markExerciseAttempted(
    exerciseId: string,
    lessonId: string,
    success: boolean,
    hintsUsed?: number,
  ): Promise<void> {
    // `lessonId` is part of the signature so future per-lesson
    // analytics can pivot on it; for now we only persist the
    // exercise-level row.
    void lessonId
    await this.db.exerciseStats.add({
      exerciseId,
      timestamp: Date.now(),
      attemptType: success ? 'run' : 'submit',
      correct: success,
      hintsUsed,
    })
  }

  /* ------------------------------------------------------------------ *
   *  Queries                                                            *
   * ------------------------------------------------------------------ */

  async getLessonProgress(lessonId: string): Promise<LessonProgress> {
    const rows = await this.db.progress.where({ lessonId }).toArray()
    const completed = rows.length > 0
    const completedAt = completed
      ? rows.reduce((max, r) => Math.max(max, r.completedAt), 0)
      : undefined
    return { completed, completedAt, exercisesCompleted: rows.length }
  }

  /**
   * Aggregate progress for the whole course. The denominator is
   * sourced from the content catalog (so adding a new exercise makes
   * the percentage automatically reflect it), while the numerator
   * comes from the `progress` table.
   */
  async getCourseProgress(): Promise<CourseProgress> {
    const { totalLessons, exercisesByLesson } = this.getCatalog()
    const totalExercises = Array.from(exercisesByLesson.values()).reduce(
      (n, list) => n + list.length,
      0,
    )
    const [progressRows, distinctLessons] = await Promise.all([
      this.db.progress.toArray(),
      this.db.progress.orderBy('lessonId').uniqueKeys(),
    ])
    const completedExercises = progressRows.length
    const completedLessons = distinctLessons.length
    const percent =
      totalExercises === 0
        ? 0
        : Math.round((completedExercises / totalExercises) * 100)
    return {
      totalLessons,
      completedLessons,
      totalExercises,
      completedExercises,
      percent,
    }
  }

  async isExerciseCompleted(exerciseId: string): Promise<boolean> {
    // The `progress` table does not index `exerciseId` standalone, so
    // we scan the (small) full table and filter. The course has at
    // most a few hundred exercises so the linear scan is fine; if it
    // ever becomes a bottleneck we can add a secondary index.
    const rows = await this.db.progress.toArray()
    return rows.some((r) => r.exerciseId === exerciseId)
  }

  /**
   * Latest N exercise attempts, newest first. Used by the
   * "Recent activity" widget on the dashboard.
   *
   * The `exerciseStats` schema (RESEARCH.md §12.1) does not index
   * `timestamp` as a standalone column — it only participates in the
   * `[exerciseId+timestamp]` compound. A query like `orderBy('timestamp')`
   * therefore cannot use an index. We pay for a full scan here; the
   * table is small in practice (one row per interaction) and the
   * dashboard only shows the last few.
   */
  async getRecentExerciseAttempts(limit: number): Promise<ExerciseStat[]> {
    const all = await this.db.exerciseStats.toArray()
    return all
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  /**
   * Wipe both `progress` and `exerciseStats`. Used by the
   * "Reset progress" button (with a confirmation dialog upstream).
   */
  async resetAllProgress(): Promise<void> {
    await this.db.transaction('rw', this.db.progress, this.db.exerciseStats, async () => {
      await this.db.progress.clear()
      await this.db.exerciseStats.clear()
    })
  }

  /* ------------------------------------------------------------------ *
   *  Internal helpers                                                   *
   * ------------------------------------------------------------------ */

  private async upsertProgressRow(
    lessonId: string,
    exerciseId: string,
    completedAt: number,
    hintsUsed?: number,
    timeMs?: number,
  ): Promise<void> {
    // Look for an existing row to avoid clobbering a *better* (earlier
    // or richer) record with a sparser one.
    const existing = await this.db.progress
      .where('[lessonId+exerciseId]')
      .equals([lessonId, exerciseId])
      .first()
    if (!existing) {
      const row: Progress = {
        lessonId,
        exerciseId,
        completedAt,
        ...(hintsUsed !== undefined ? { hintsUsed } : {}),
        ...(timeMs !== undefined ? { timeMs } : {}),
      }
      await this.db.progress.add(row)
      return
    }
    // If we already have a row, only move the timestamp forward
    // (a re-run is not a regression) and prefer the larger hintsUsed
    // (the user is allowed to have improved).
    const next: Partial<Progress> = {}
    if (completedAt > existing.completedAt) next.completedAt = completedAt
    if (hintsUsed !== undefined) {
      next.hintsUsed = Math.max(existing.hintsUsed ?? 0, hintsUsed)
    }
    if (timeMs !== undefined) {
      next.timeMs = Math.max(existing.timeMs ?? 0, timeMs)
    }
    if (Object.keys(next).length === 0) return
    await this.db.progress.update(existing.id!, next)
  }
}

export const progressStore = new ProgressStore()
