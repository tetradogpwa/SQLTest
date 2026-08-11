/**
 * `invariant` strategy (RESEARCH §10.1, §10.4).
 *
 * Una invariante es una **condición declarativa** sobre el estado final
 * de la DB, expresada como SQL. Se compara el resultado de ejecutar la
 * SQL contra el `expectedResult` declarado (columnas + filas).
 *
 * Importante: la SQL de la invariante NO es la SQL del usuario. La
 * invariante la define el autor del ejercicio y se ejecuta sobre la
 * DB resultante.
 *
 * La comparación de filas se hace como multiset (el orden no importa,
 * porque hablamos de "condiciones" no de "resultados").
 */

import type {
  InvariantValidation,
  QueryResultShape,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from '../types'
import type { QueryResult } from '../../../workers/types'

function normalizeCell(c: unknown): unknown {
  if (c === null || c === undefined) return { __null: true }
  if (typeof c === 'boolean') return c ? 1 : 0
  if (typeof c === 'string') {
    const t = c.trim()
    if (t !== '' && !Number.isNaN(Number(t))) return Number(t)
    return t.toLowerCase()
  }
  if (typeof c === 'number') return c
  if (typeof c === 'bigint') return c.toString()
  return String(c)
}

function rowKey(row: unknown[]): string {
  return JSON.stringify(row.map(normalizeCell))
}

function compareShapes(
  user: QueryResult,
  expected: QueryResultShape,
): { equal: boolean; diff?: string } {
  // 1. Columnas — comparamos por conjunto (orden no significativo para
  //    multiset, pero las proyecciones se hacen por nombre).
  const uCols = (user.columns ?? []).map((c: string) => c.toLowerCase())
  const eCols = expected.columns.map((c: string) => c.toLowerCase())
  if (uCols.length !== eCols.length) {
    return {
      equal: false,
      diff: `número de columnas diferente: esperaba ${eCols.length}, obtuve ${uCols.length}`,
    }
  }
  for (const c of eCols) {
    if (!uCols.includes(c)) {
      return { equal: false, diff: `falta la columna "${c}"` }
    }
  }
  for (const c of uCols) {
    if (!eCols.includes(c)) {
      return { equal: false, diff: `columna extra "${c}"` }
    }
  }

  // 2. Filas — multiset.
  const uRows = user.rows ?? []
  const eRows = expected.rows
  if (uRows.length !== eRows.length) {
    return {
      equal: false,
      diff: `número de filas diferente: esperaba ${eRows.length}, obtuve ${uRows.length}`,
    }
  }

  const uMap = new Map<string, number>()
  for (const r of uRows) uMap.set(rowKey(r), (uMap.get(rowKey(r)) ?? 0) + 1)
  for (const r of eRows) {
    const k = rowKey(r)
    const c = uMap.get(k) ?? 0
    if (c === 0) {
      return { equal: false, diff: `falta la fila ${JSON.stringify(r)}` }
    }
    uMap.set(k, c - 1)
  }
  return { equal: true }
}

export class InvariantStrategy implements ValidationStrategy {
  readonly type = 'invariant' as const

  async apply(
    ctx: ValidationContext,
    validation: InvariantValidation,
  ): Promise<ValidationResult> {
    let result
    try {
      result = await ctx.api.exec(ctx.dbId, validation.sql, { timeoutMs: 5000 })
    } catch (e) {
      return {
        passed: false,
        message: 'no se pudo evaluar la invariante.',
        details: (e as Error).message,
        strategyType: 'invariant',
      }
    }
    if (!result.ok) {
      return {
        passed: false,
        message: 'la consulta de la invariante falló.',
        details: result.error?.message,
        strategyType: 'invariant',
      }
    }
    const cmp = compareShapes(result, validation.expectedResult)
    if (cmp.equal) {
      return {
        passed: true,
        message: `invariante cumplida: ${validation.description}`,
        strategyType: 'invariant',
      }
    }
    return {
      passed: false,
      message: `invariante NO cumplida: ${validation.description}`,
      details: cmp.diff,
      strategyType: 'invariant',
    }
  }
}
