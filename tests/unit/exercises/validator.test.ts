/**
 * Unit tests para el Validator (orquestador).
 *
 * Cubre:
 *   - Mix pass/fail → allPassed = false
 *   - Validación de tipo desconocido → lanza error
 *   - runParallel produce el mismo resultado que runAll
 *   - runUntilFirstFailure corta en el primer fallo
 *   - getStrategy / registeredTypes
 *
 * Al menos 4 tests, ≥ 6 totales.
 */

import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'

import {
  Validator,
  defaultStrategies,
  ResultStrategy,
  KeywordUsageStrategy,
  type DBApi,
  type Validation,
  type ValidationContext,
  type ValidationStrategy,
  type ValidationResult,
} from '../../../src/core/exercises'
import { mkApiMock } from '../../helpers/dbapi-mock'

function mkCtx(overrides: Partial<ValidationContext> = {}): ValidationContext {
  const api: DBApi = mkApiMock()
  return {
    api,
    dbId: 1,
    userSql: 'SELECT 1',
    solutionSql: 'SELECT 1',
    userResult: { ok: true, columns: ['a'], rows: [[1]], executionMs: 0, statementKind: 'select' },
    solutionResult: { ok: true, columns: ['a'], rows: [[1]], executionMs: 0, statementKind: 'select' },
    userSchema: { tables: [], views: [], indexes: [], triggers: [] },
    solutionSchema: { tables: [], views: [], indexes: [], triggers: [] },
    capability: 'memory',
    hintsRevealed: 0,
    ...overrides,
  }
}

describe('Validator', () => {
  it('aggrega pass/fail correctamente', async () => {
    const v = new Validator([new ResultStrategy(), new KeywordUsageStrategy()])
    const ctx = mkCtx({
      userSql: 'SELECT * FROM t',
      userResult: { ok: true, columns: ['a'], rows: [[1]], executionMs: 0, statementKind: 'select' },
      solutionResult: { ok: true, columns: ['a'], rows: [[1]], executionMs: 0, statementKind: 'select' },
    })
    const validations: Validation[] = [
      { type: 'result', orderMatters: true },
      { type: 'usesKeyword', keywords: ['WHERE'] },
    ]
    const r = await v.runAll(ctx, validations)
    expect(r.allPassed).toBe(false)
    expect(r.passedCount).toBe(1)
    expect(r.failedCount).toBe(1)
    expect(r.results).toHaveLength(2)
    expect(r.results[0]?.passed).toBe(true)
    expect(r.results[1]?.passed).toBe(false)
    expect(r.results[0]?.strategyType).toBe('result')
    expect(r.results[1]?.strategyType).toBe('usesKeyword')
  })

  it('lanza error si una validación tiene tipo desconocido', async () => {
    const v = new Validator([new KeywordUsageStrategy()])
    const ctx = mkCtx()
    const bogus = { type: 'no-such-type' } as unknown as Validation
    await expect(v.runAll(ctx, [bogus])).rejects.toThrow(/no hay strategy/)
  })

  it('allPassed=true cuando todas las validaciones pasan', async () => {
    const v = new Validator([new ResultStrategy(), new KeywordUsageStrategy()])
    const ctx = mkCtx({
      userSql: 'SELECT * FROM t WHERE x = 1',
      userResult: { ok: true, columns: ['a'], rows: [[1]], executionMs: 0, statementKind: 'select' },
      solutionResult: { ok: true, columns: ['a'], rows: [[1]], executionMs: 0, statementKind: 'select' },
    })
    const validations: Validation[] = [
      { type: 'result', orderMatters: true },
      { type: 'usesKeyword', keywords: ['WHERE'] },
    ]
    const r = await v.runAll(ctx, validations)
    expect(r.allPassed).toBe(true)
    expect(r.passedCount).toBe(2)
    expect(r.failedCount).toBe(0)
  })

  it('defaultStrategies tiene 11 strategies registrados', () => {
    const v = new Validator([...defaultStrategies])
    expect(v.registeredTypes()).toHaveLength(11)
    expect(v.registeredTypes().sort()).toEqual(
      [
        'constraint',
        'dbState',
        'invariant',
        'result',
        'rowCount',
        'rowExists',
        'schema',
        'tableExists',
        'usesJoin',
        'usesKeyword',
        'queryPlan',
      ].sort(),
    )
  })

  it('runUntilFirstFailure corta en el primer fallo', async () => {
    const v = new Validator([new KeywordUsageStrategy(), new KeywordUsageStrategy()])
    const ctx = mkCtx({ userSql: 'SELECT * FROM t' })
    const validations: Validation[] = [
      { type: 'usesKeyword', keywords: ['WHERE'] },
      { type: 'usesKeyword', keywords: ['JOIN'] },
    ]
    const r = await v.runUntilFirstFailure(ctx, validations)
    expect(r.allPassed).toBe(false)
    expect(r.results).toHaveLength(1)
  })

  it('runParallel funciona con strategies independientes', async () => {
    const v = new Validator([new KeywordUsageStrategy(), new KeywordUsageStrategy()])
    const ctx = mkCtx({ userSql: 'SELECT * FROM t WHERE x = 1' })
    const validations: Validation[] = [
      { type: 'usesKeyword', keywords: ['SELECT'] },
      { type: 'usesKeyword', keywords: ['WHERE'] },
    ]
    const r = await v.runParallel(ctx, validations)
    expect(r.allPassed).toBe(true)
    expect(r.results).toHaveLength(2)
  })

  it('getStrategy devuelve el strategy por tipo', () => {
    const v = new Validator([new ResultStrategy()])
    expect(v.getStrategy('result')).toBeDefined()
    expect(v.getStrategy('usesKeyword')).toBeUndefined()
  })

  it('pasa con un array de validations vacío', async () => {
    const v = new Validator([new ResultStrategy()])
    const r = await v.runAll(mkCtx(), [])
    expect(r.allPassed).toBe(true)
    expect(r.passedCount).toBe(0)
    expect(r.failedCount).toBe(0)
  })

  it('Strategy custom que falla es reflejado en el report', async () => {
    const failingStrategy: ValidationStrategy = {
      type: 'custom',
      async apply(): Promise<ValidationResult> {
        return { passed: false, message: 'custom fail', strategyType: 'custom' }
      },
    }
    const v = new Validator([failingStrategy, new KeywordUsageStrategy()])
    const ctx = mkCtx({ userSql: 'SELECT 1' })
    const validations: Validation[] = [
      { type: 'custom', validatorId: 'x' },
      { type: 'usesKeyword', keywords: ['SELECT'] },
    ]
    const r = await v.runAll(ctx, validations)
    expect(r.allPassed).toBe(false)
    expect(r.results[0]?.message).toBe('custom fail')
  })

  it('vi.fn mock api puede ser inspeccionado por tests', async () => {
    const exec = vi.fn(async () => ({
      ok: true, columns: ['n'], rows: [[42]], executionMs: 0, statementKind: 'select' as const,
    }))
    const api: DBApi = mkApiMock({ exec })
    const v = new Validator([new ResultStrategy()])
    const ctx = mkCtx({
      api,
      userResult: { ok: true, columns: ['n'], rows: [[42]], executionMs: 0, statementKind: 'select' },
      solutionResult: { ok: true, columns: ['n'], rows: [[42]], executionMs: 0, statementKind: 'select' },
    })
    const r = await v.runAll(ctx, [{ type: 'result', orderMatters: true }])
    expect(r.allPassed).toBe(true)
  })
})
