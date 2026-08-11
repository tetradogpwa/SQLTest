/**
 * Unit tests para `hint-engine.ts`.
 *
 * Cubre:
 *   - Política `after` por cada valor (`never`, `after-failure`, `after-2-failures`, `after-3-failures`).
 *   - Selección secuencial por `hintsRevealed`.
 *   - Sin hints desbloqueados → null.
 *   - Pista contextual cuando hay error de "no such table" / "no such column" / "syntax error".
 *   - `formatHint` produce un string Markdown-ish, con locale es/ca/en.
 */

import { describe, it, expect } from 'vitest'
import {
  pickNextHint,
  pickNextHintBundle,
  planContextualHint,
  formatHint,
} from '../../../src/core/exercises'
import type { Exercise, Hint } from '../../../src/core/exercises'
import type { SerializedError, QueryResult } from '../../../src/workers/types'

function mkHint(overrides: Partial<Hint> = {}): Hint {
  return {
    level: 1,
    text: 'pista por defecto',
    after: 'after-failure',
    type: 'conceptual',
    ...overrides,
  }
}

function mkExercise(hints: Hint[]): Exercise {
  return {
    id: 'test-001',
    lessonId: 'lesson-1',
    type: 'writeQuery',
    title: 'Test',
    prompt: 'prompt',
    solution: 'SELECT 1',
    solutionExplanation: 'porque sí',
    validation: [{ type: 'result', orderMatters: false }],
    hints,
    difficulty: 1,
    tags: [],
    databaseId: 'db-1',
  }
}

const emptyError: SerializedError | null = null
const emptyResult: QueryResult | null = null

describe('hint-engine', () => {
  it('"never" → nunca se desbloquea (solo vía Solution)', () => {
    const ex = mkExercise([
      mkHint({ after: 'never', text: 'solución completa' }),
    ])
    const hint = pickNextHint({
      exercise: ex,
      attempts: 999,
      lastError: emptyError,
      lastResult: emptyResult,
      hintsRevealed: 0,
    })
    expect(hint).toBeNull()
  })

  it('"after-failure" → se desbloquea con 1 intento', () => {
    const ex = mkExercise([mkHint({ after: 'after-failure' })])
    expect(
      pickNextHint({
        exercise: ex,
        attempts: 0,
        lastError: emptyError,
        lastResult: emptyResult,
        hintsRevealed: 0,
      }),
    ).toBeNull()
    const h = pickNextHint({
      exercise: ex,
      attempts: 1,
      lastError: emptyError,
      lastResult: emptyResult,
      hintsRevealed: 0,
    })
    expect(h).not.toBeNull()
    expect(h!.text).toBe('pista por defecto')
  })

  it('"after-2-failures" → requiere 2 intentos', () => {
    const ex = mkExercise([mkHint({ after: 'after-2-failures' })])
    expect(
      pickNextHint({
        exercise: ex,
        attempts: 1,
        lastError: emptyError,
        lastResult: emptyResult,
        hintsRevealed: 0,
      }),
    ).toBeNull()
    const h = pickNextHint({
      exercise: ex,
      attempts: 2,
      lastError: emptyError,
      lastResult: emptyResult,
      hintsRevealed: 0,
    })
    expect(h).not.toBeNull()
  })

  it('"after-3-failures" → requiere 3 intentos', () => {
    const ex = mkExercise([mkHint({ after: 'after-3-failures' })])
    expect(
      pickNextHint({
        exercise: ex,
        attempts: 2,
        lastError: emptyError,
        lastResult: emptyResult,
        hintsRevealed: 0,
      }),
    ).toBeNull()
    const h = pickNextHint({
      exercise: ex,
      attempts: 3,
      lastError: emptyError,
      lastResult: emptyResult,
      hintsRevealed: 0,
    })
    expect(h).not.toBeNull()
  })

  it('revelado secuencial por hintsRevealed', () => {
    const ex = mkExercise([
      mkHint({ text: 'h1', after: 'after-failure' }),
      mkHint({ text: 'h2', after: 'after-failure' }),
      mkHint({ text: 'h3', after: 'after-2-failures' }),
    ])
    const r1 = pickNextHint({
      exercise: ex,
      attempts: 1,
      lastError: emptyError,
      lastResult: emptyResult,
      hintsRevealed: 0,
    })
    const r2 = pickNextHint({
      exercise: ex,
      attempts: 1,
      lastError: emptyError,
      lastResult: emptyResult,
      hintsRevealed: 1,
    })
    const r3 = pickNextHint({
      exercise: ex,
      attempts: 2,
      lastError: emptyError,
      lastResult: emptyResult,
      hintsRevealed: 2,
    })
    expect(r1?.text).toBe('h1')
    expect(r2?.text).toBe('h2')
    expect(r3?.text).toBe('h3')
    // r4 no existe
    const r4 = pickNextHint({
      exercise: ex,
      attempts: 99,
      lastError: emptyError,
      lastResult: emptyResult,
      hintsRevealed: 3,
    })
    expect(r4).toBeNull()
  })

  it('filtra hints que aún no se desbloquean', () => {
    const ex = mkExercise([
      mkHint({ text: 'h1', after: 'after-failure' }),
      mkHint({ text: 'h2', after: 'after-3-failures' }),
    ])
    // Con 1 intento, solo h1 está desbloqueada.
    const h = pickNextHint({
      exercise: ex,
      attempts: 1,
      lastError: emptyError,
      lastResult: emptyResult,
      hintsRevealed: 0,
    })
    expect(h?.text).toBe('h1')
  })

  it('sintetiza pista contextual cuando hay "no such table"', () => {
    const ex = mkExercise([mkHint({ after: 'after-failure' })])
    const bundle = pickNextHintBundle({
      exercise: ex,
      attempts: 1,
      lastError: {
        code: 'SQLITE_ERROR',
        message: 'no such table: usr',
        translatedMessage: 'no existe la tabla',
      },
      lastResult: emptyResult,
      hintsRevealed: 0,
    })
    expect(bundle.sequential).not.toBeNull()
    expect(bundle.contextual).not.toBeNull()
    expect(bundle.contextual!.text).toContain('usr')
  })

  it('sintetiza pista contextual cuando hay "no such column"', () => {
    const plan = planContextualHint({
      code: 'SQLITE_ERROR',
      message: 'no such column: usrname',
      translatedMessage: '',
    })
    expect(plan.kind).toBe('missing-column')
    expect(plan.token).toBe('usrname')
  })

  it('sintetiza pista contextual cuando hay syntax error', () => {
    const plan = planContextualHint({
      code: 'SQLITE_ERROR',
      message: 'near "FROM": syntax error',
      translatedMessage: '',
    })
    expect(plan.kind).toBe('syntax')
  })

  it('formatHint produce Markdown-ish con tipo y nivel', () => {
    const h = mkHint({ type: 'conceptual', level: 1, text: 'recuerda el WHERE' })
    const md = formatHint(h, 'es')
    expect(md).toContain('Pista conceptual')
    expect(md).toContain('nivel 1')
    expect(md).toContain('recuerda el WHERE')
    // bloque de cita Markdown
    expect(md).toContain('>')
  })

  it('formatHint acepta locales ca y en (cubre fallback)', () => {
    const h = mkHint({ type: 'syntactic', level: 2 })
    const ca = formatHint(h, 'ca')
    const en = formatHint(h, 'en')
    expect(ca).toContain('Pista sintàctica')
    expect(en).toContain('Syntactic hint')
    // sufijo de locale cuando no es es
    expect(ca).toContain('locale: ca')
    expect(en).toContain('locale: en')
  })
})
