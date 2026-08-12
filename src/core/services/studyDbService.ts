/**
 * Study DB service.
 *
 * Pure-TS logic for the "study mode" feature. A lesson can be
 * studied against a persistent user DB (instead of the
 * per-session working-copy the runner creates by default). The
 * user picks the study DB on the lesson page, the runner reads
 * the same setting and uses that DB, and a "Reset" button
 * re-applies the seed so the user can start the lesson over.
 *
 * This module owns the pure decisions:
 *  - extracting the SQL seed from a lesson
 *  - building the display label for a study DB
 *  - validating the user's "use this DB" choice
 *
 * I/O (Dexie write, Worker call to re-seed) lives in the hook
 * `useStudyDb` and the runner.
 */
import type { Exercise } from '../../core/exercises/types'

/* ------------------------------------------------------------------ *
 *  Seed derivation                                                      *
 * ------------------------------------------------------------------ */

/**
 * Return the SQL the runner should execute to (re)seed the study
 * DB. The exercise's `lessonDbSeed` is the canonical source;
 * when absent, the seed is empty (the runner no-ops).
 *
 * The function trims trailing whitespace and returns the empty
 * string for an absent / empty seed so the caller can just do
 * `if (seed) await api.exec(...)`.
 */
export function buildStudyDbSeed(exercise: Exercise | null | undefined): string {
  if (!exercise) return ''
  const seed = exercise.lessonDbSeed
  if (typeof seed !== 'string') return ''
  return seed.trim()
}

/**
 * True when the seed is non-empty. Convenience wrapper so the
 * runner can use it in a conditional.
 */
export function hasStudyDbSeed(exercise: Exercise | null | undefined): boolean {
  return buildStudyDbSeed(exercise).length > 0
}

/* ------------------------------------------------------------------ *
 *  Display labels                                                      *
 * ------------------------------------------------------------------ */

/**
 * Build the label shown in the lesson page's "DB de estudio"
 * selector. The format is `<lesson-title> — <display-name>` so the
 * user can tell at a glance which lesson / DB a row refers to
 * (especially important when a user creates one study DB per
 * lesson — the names would otherwise collide).
 */
export function buildStudyDbLabel(lessonTitle: string, dbName: string): string {
  const lesson = lessonTitle.trim() || 'Lección'
  const name = dbName.trim() || 'BD'
  return `${lesson} — ${name}`
}

/* ------------------------------------------------------------------ *
 *  Validation                                                          *
 * ------------------------------------------------------------------ */

/**
 * Result of a study-DB selection. The hook turns `ok: false` into
 * a UI error; the success case carries the same fields the runner
 * needs.
 */
export type StudyDbValidation =
  | { ok: true; dbId: string }
  | { ok: false; key: 'studyDb.empty' | 'studyDb.unknown' }

/**
 * Validate the user's choice of study DB. The selection is
 * represented by a `dbId` (the Dexie row id, e.g. `db-42`).
 *
 * The validator rejects:
 *  - empty / whitespace-only ids
 *  - ids that don't match the `db-<digits>` format (defensive —
 *    a foreign row could theoretically be in the table)
 */
export function validateStudyDbSelection(dbId: string | null | undefined): StudyDbValidation {
  if (typeof dbId !== 'string') return { ok: false, key: 'studyDb.empty' }
  const trimmed = dbId.trim()
  if (trimmed.length === 0) return { ok: false, key: 'studyDb.empty' }
  if (!/^db-\d+$/.test(trimmed)) return { ok: false, key: 'studyDb.unknown' }
  return { ok: true, dbId: trimmed }
}

/* ------------------------------------------------------------------ *
 *  Selection key (per-lesson)                                          *
 * ------------------------------------------------------------------ */

/**
 * The Dexie row id used to store the per-lesson study-DB selection.
 * The format is `studyDb:<lessonId>` so multiple lessons can have
 * independent selections without colliding.
 */
export function studyDbSelectionKey(lessonId: string): string {
  return `studyDb:${lessonId}`
}

/**
 * Inverse of `studyDbSelectionKey` — returns the lessonId that the
 * key refers to. The caller uses this to validate that the key in
 * the table actually refers to a known lesson.
 */
export function lessonIdFromSelectionKey(key: string): string | null {
  if (typeof key !== 'string') return null
  if (!key.startsWith('studyDb:')) return null
  return key.slice('studyDb:'.length)
}

/* ------------------------------------------------------------------ *
 *  Composite key (lesson + dbSlug)                                   *
 * ------------------------------------------------------------------ */

/**
 * Build a secondary key for the per-lesson study-DB row. The
 * format is `<lessonId>-<slug>` so the UI can list candidate
 * study DBs (e.g. "L1.1-library", "L1.1-my-experiments") without
 * scanning the whole `databases` table. The slug is a
 * lowercased + alphanumeric-only version of the original name.
 */
export function buildStudyDbDbKey(lessonId: string, dbName: string): string {
  const slug = dbName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const safeSlug = slug.length > 0 ? slug.slice(0, 32) : 'default'
  return `${lessonId}-${safeSlug}`
}
