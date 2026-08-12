/**
 * Tests for `studyDbService` — exhaustive coverage of the pure
 * pieces of the "study mode" feature.
 */
import { describe, expect, it } from 'vitest'

import {
  buildStudyDbDbKey,
  buildStudyDbLabel,
  buildStudyDbSeed,
  hasStudyDbSeed,
  lessonIdFromSelectionKey,
  studyDbSelectionKey,
  validateStudyDbSelection,
} from '../../../src/core/services/studyDbService'
import type { Exercise } from '../../../src/core/exercises/types'

/* ------------------------------------------------------------------ *
 *  Helpers                                                              *
 * ------------------------------------------------------------------ */

function makeExercise(seed?: string): Exercise {
  return {
    id: 'L1.1-e1',
    lessonId: 'L1.1',
    type: 'writeQuery',
    title: 'Test',
    prompt: 'p',
    solution: 'SELECT 1',
    solutionExplanation: 'e',
    validation: [],
    hints: [],
    difficulty: 1,
    tags: [],
    databaseId: 'library',
    ...(seed !== undefined ? { lessonDbSeed: seed } : {}),
  } as Exercise
}

/* ------------------------------------------------------------------ *
 *  buildStudyDbSeed                                                    *
 * ------------------------------------------------------------------ */

describe('buildStudyDbSeed', () => {
  it('returns the trimmed seed when present', () => {
    expect(buildStudyDbSeed(makeExercise('  SELECT 1;  '))).toBe('SELECT 1;')
  })

  it('returns the empty string when the seed is undefined', () => {
    expect(buildStudyDbSeed(makeExercise(undefined))).toBe('')
  })

  it('returns the empty string when the exercise is null / undefined', () => {
    expect(buildStudyDbSeed(null)).toBe('')
    expect(buildStudyDbSeed(undefined)).toBe('')
  })

  it('returns the empty string when the seed is whitespace-only', () => {
    expect(buildStudyDbSeed(makeExercise('   '))).toBe('')
    expect(buildStudyDbSeed(makeExercise('\n\n\t'))).toBe('')
  })

  it('handles a multi-statement seed', () => {
    const seed = `CREATE TABLE t(x INTEGER);\nINSERT INTO t VALUES (1);`
    expect(buildStudyDbSeed(makeExercise(seed))).toBe(seed)
  })

  it('returns the empty string for a non-Exercise shape (defensive)', () => {
    // The service is documented to take `Exercise | null |
    // undefined`. Anything else (a `Lesson`, a plain object) is
    // treated as "no seed" so the runner can be called with a
    // broader input without crashing.
    expect(buildStudyDbSeed({} as unknown as Exercise)).toBe('')
  })
})

/* ------------------------------------------------------------------ *
 *  hasStudyDbSeed                                                      *
 * ------------------------------------------------------------------ */

describe('hasStudyDbSeed', () => {
  it('returns true when the seed is non-empty', () => {
    expect(hasStudyDbSeed(makeExercise('SELECT 1'))).toBe(true)
  })

  it('returns false when the seed is empty / whitespace', () => {
    expect(hasStudyDbSeed(makeExercise(''))).toBe(false)
    expect(hasStudyDbSeed(makeExercise('   '))).toBe(false)
  })

  it('returns false when the exercise is null', () => {
    expect(hasStudyDbSeed(null)).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 *  buildStudyDbLabel                                                    *
 * ------------------------------------------------------------------ */

describe('buildStudyDbLabel', () => {
  it('joins the lesson title and the db name with a dash', () => {
    expect(buildStudyDbLabel('Biblioteca', 'Mi estudio')).toBe('Biblioteca — Mi estudio')
  })

  it('trims surrounding whitespace on both parts', () => {
    expect(buildStudyDbLabel('  Biblioteca  ', '  Mi estudio  ')).toBe(
      'Biblioteca — Mi estudio',
    )
  })

  it('falls back to "Lección" / "BD" when the inputs are empty', () => {
    expect(buildStudyDbLabel('', '')).toBe('Lección — BD')
    expect(buildStudyDbLabel('   ', '   ')).toBe('Lección — BD')
  })

  it('preserves unicode in the lesson title', () => {
    expect(buildStudyDbLabel('Biblioteca Municipal', 'Prova amb accents')).toBe(
      'Biblioteca Municipal — Prova amb accents',
    )
  })
})

/* ------------------------------------------------------------------ *
 *  validateStudyDbSelection                                            *
 * ------------------------------------------------------------------ */

describe('validateStudyDbSelection', () => {
  it('accepts a well-formed db-<digits> id', () => {
    expect(validateStudyDbSelection('db-42')).toEqual({ ok: true, dbId: 'db-42' })
  })

  it('trims the input before validating', () => {
    expect(validateStudyDbSelection('  db-7  ')).toEqual({ ok: true, dbId: 'db-7' })
  })

  it('accepts large numeric suffixes', () => {
    expect(validateStudyDbSelection('db-1000000')).toEqual({
      ok: true,
      dbId: 'db-1000000',
    })
  })

  it('rejects an empty string', () => {
    expect(validateStudyDbSelection('')).toEqual({
      ok: false,
      key: 'studyDb.empty',
    })
  })

  it('rejects null / undefined', () => {
    expect(validateStudyDbSelection(null)).toEqual({ ok: false, key: 'studyDb.empty' })
    expect(validateStudyDbSelection(undefined)).toEqual({ ok: false, key: 'studyDb.empty' })
  })

  it('rejects whitespace-only input', () => {
    expect(validateStudyDbSelection('   ')).toEqual({ ok: false, key: 'studyDb.empty' })
  })

  it('rejects ids without the `db-` prefix', () => {
    expect(validateStudyDbSelection('42')).toEqual({ ok: false, key: 'studyDb.unknown' })
    expect(validateStudyDbSelection('user-42')).toEqual({ ok: false, key: 'studyDb.unknown' })
  })

  it('rejects ids with the `db-` prefix but no digits', () => {
    expect(validateStudyDbSelection('db-')).toEqual({ ok: false, key: 'studyDb.unknown' })
    expect(validateStudyDbSelection('db-abc')).toEqual({ ok: false, key: 'studyDb.unknown' })
  })

  it('rejects ids with non-digit characters mixed in', () => {
    expect(validateStudyDbSelection('db-4-2')).toEqual({ ok: false, key: 'studyDb.unknown' })
    expect(validateStudyDbSelection('db-4.2')).toEqual({ ok: false, key: 'studyDb.unknown' })
  })
})

/* ------------------------------------------------------------------ *
 *  studyDbSelectionKey / lessonIdFromSelectionKey                      *
 * ------------------------------------------------------------------ */

describe('studyDbSelectionKey', () => {
  it('produces a `studyDb:<id>` key', () => {
    expect(studyDbSelectionKey('L1.1')).toBe('studyDb:L1.1')
  })

  it('produces a different key for a different lesson', () => {
    expect(studyDbSelectionKey('L1.1')).not.toBe(studyDbSelectionKey('L1.2'))
  })
})

describe('lessonIdFromSelectionKey', () => {
  it('returns the lessonId for a valid key', () => {
    expect(lessonIdFromSelectionKey('studyDb:L1.1')).toBe('L1.1')
  })

  it('returns null for a key without the `studyDb:` prefix', () => {
    expect(lessonIdFromSelectionKey('L1.1')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(lessonIdFromSelectionKey('')).toBeNull()
  })

  it('returns null for a non-string input', () => {
    expect(lessonIdFromSelectionKey(null as unknown as string)).toBeNull()
    expect(lessonIdFromSelectionKey(undefined as unknown as string)).toBeNull()
    expect(lessonIdFromSelectionKey(42 as unknown as string)).toBeNull()
  })

  it('round-trips with studyDbSelectionKey', () => {
    const lessonIds = ['L1.1', 'L2.3', 'L99.99-e1']
    for (const id of lessonIds) {
      expect(lessonIdFromSelectionKey(studyDbSelectionKey(id))).toBe(id)
    }
  })
})

/* ------------------------------------------------------------------ *
 *  buildStudyDbDbKey (defensive — placeholder for future use)          *
 * ------------------------------------------------------------------ */

describe('buildStudyDbDbKey', () => {
  it('produces a key derived from the lessonId + a slug', () => {
    expect(buildStudyDbDbKey('L1.1', 'library')).toMatch(/^L1\.1-library/)
  })

  it('lower-cases the slug', () => {
    expect(buildStudyDbDbKey('L1.1', 'My Study')).toBe('L1.1-my-study')
  })

  it('replaces forbidden characters with -', () => {
    expect(buildStudyDbDbKey('L1.1', 'mi estudio!')).toBe('L1.1-mi-estudio')
  })

  it('trims leading / trailing - from the slug', () => {
    expect(buildStudyDbDbKey('L1.1', '---library---')).toBe('L1.1-library')
  })

  it('truncates the slug at 32 chars', () => {
    const long = 'a'.repeat(50)
    const result = buildStudyDbDbKey('L1.1', long)
    const slug = result.slice('L1.1-'.length)
    expect(slug.length).toBeLessThanOrEqual(32)
  })

  it('falls back to "default" when the slug is empty after the strip', () => {
    expect(buildStudyDbDbKey('L1.1', '!!!')).toBe('L1.1-default')
    expect(buildStudyDbDbKey('L1.1', '   ')).toBe('L1.1-default')
  })
})
