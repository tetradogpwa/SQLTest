/**
 * `dbState` strategy (RESEARCH §10.1, §10.3).
 *
 * Ejecuta cada `check.sql` sobre la DB del usuario tras su query y compara
 * el resultado con `check.expected`. Tres formas de `expected`:
 *
 *   - `number`   → compara primera celda de primera fila.
 *   - `boolean`  → idem interpretando 0/1 como false/true.
 *   - `unknown[][]` → compara filas completas (orden, multiset según nº).
 *
 * Pensado para UPDATE/INSERT/DELETE/CREATE donde lo importante es el
 * **estado final** de la DB, no el resultado directo de la query.
 */

import type {
  DatabaseStateCheck,
  DatabaseStateValidation,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from '../types'
import type { QueryResult } from '../../../workers/types'

function compareCheck(
  user: QueryResult,
  expected: DatabaseStateCheck['expected'],
): { ok: true } | { ok: false; reason: string } {
  if (Array.isArray(expected)) {
    // Comparar filas completas (multiset simple).
    const expStr = JSON.stringify([...expected].map((r) => [...r].sort()))
    const gotStr = JSON.stringify([...(user.rows ?? [])].map((r) => [...r].sort()))
    if (expStr === gotStr) return { ok: true }
    return {
      ok: false,
      reason: `esperaba ${JSON.stringify(expected)}, obtuve ${JSON.stringify(user.rows ?? [])}`,
    }
  }
  // number | boolean → primera celda de primera fila.
  const cell = user.rows?.[0]?.[0]
  if (cell === undefined || cell === null) {
    if (expected === 0 || expected === false) return { ok: true }
    return { ok: false, reason: `esperaba ${String(expected)}, obtuve NULL` }
  }
  const num = Number(cell)
  if (typeof expected === 'boolean') {
    const boolOk = expected ? num !== 0 : num === 0
    return boolOk
      ? { ok: true }
      : { ok: false, reason: `esperaba ${expected ? 'TRUE' : 'FALSE'}, obtuve ${String(cell)}` }
  }
  if (Number.isFinite(num) && num === expected) return { ok: true }
  if (String(cell) === String(expected)) return { ok: true }
  return { ok: false, reason: `esperaba ${String(expected)}, obtuve ${String(cell)}` }
}

export class DatabaseStateStrategy implements ValidationStrategy {
  readonly type = 'dbState' as const

  async apply(
    ctx: ValidationContext,
    validation: DatabaseStateValidation,
  ): Promise<ValidationResult> {
    const failures: string[] = []
    const total = validation.checks.length
    let passedCount = 0

    for (let i = 0; i < total; i++) {
      const check = validation.checks[i]!
      let result: QueryResult
      try {
        result = await ctx.api.exec(ctx.dbId, check.sql, { timeoutMs: 3000 })
      } catch (e) {
        failures.push(`check ${i + 1}: error al ejecutar (${(e as Error).message})`)
        continue
      }
      if (!result.ok) {
        failures.push(
          `check ${i + 1}: la consulta de validación falló (${result.error?.message ?? 'sin detalle'})`,
        )
        continue
      }
      const cmp = compareCheck(result, check.expected)
      if (cmp.ok) {
        passedCount++
      } else {
        failures.push(`check ${i + 1}: ${cmp.reason}`)
      }
    }

    if (failures.length === 0) {
      return {
        passed: true,
        message: `${validation.description} (${passedCount}/${total} checks).`,
        strategyType: 'dbState',
      }
    }
    return {
      passed: false,
      message: `${validation.description} (${passedCount}/${total} checks correctos).`,
      details: failures.join(' · '),
      suggestions: [
        'revisa si tu INSERT/UPDATE/DELETE afectó a las filas correctas.',
        'verifica los valores de las columnas afectadas.',
      ],
      strategyType: 'dbState',
    }
  }
}
