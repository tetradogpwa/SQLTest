/**
 * `rowCount` strategy (RESEARCH §10.1).
 *
 * Cuenta las filas de la tabla indicada en la DB del usuario y compara
 * con `expected` aplicando `tolerance` (±, default 0).
 *
 * Pensado para UPDATE/DELETE/INSERT donde lo que importa es cuántas
 * filas quedaron afectadas, no el resultado directo de la query.
 */

import type {
  RowCountValidation,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from '../types'

export class RowCountStrategy implements ValidationStrategy {
  readonly type = 'rowCount' as const

  async apply(
    ctx: ValidationContext,
    validation: RowCountValidation,
  ): Promise<ValidationResult> {
    // Re-introspeccionamos para tener datos frescos tras DDL.
    let schema = ctx.userSchema
    try {
      schema = await ctx.api.schema(ctx.dbId)
    } catch {
      // cache fallback
    }
    // Validar que la tabla existe.
    const exists = schema.tables.some(
      (t) => t.name.toLowerCase() === validation.table.toLowerCase(),
    )
    if (!exists) {
      return {
        passed: false,
        message: `la tabla "${validation.table}" no existe.`,
        suggestions: [`crea la tabla antes de contar filas.`],
        strategyType: 'rowCount',
      }
    }

    const sql = `SELECT COUNT(*) AS n FROM ${quoteIdent(validation.table)}`
    let result
    try {
      result = await ctx.api.exec(ctx.dbId, sql, { timeoutMs: 5000 })
    } catch (e) {
      return {
        passed: false,
        message: 'no se pudo contar las filas.',
        details: (e as Error).message,
        strategyType: 'rowCount',
      }
    }
    if (!result.ok || !result.rows || result.rows.length === 0) {
      return {
        passed: false,
        message: 'no se pudo contar las filas.',
        details: result.error?.message ?? 'sin filas devueltas',
        strategyType: 'rowCount',
      }
    }
    const got = Number(result.rows[0]![0])
    if (!Number.isFinite(got)) {
      return {
        passed: false,
        message: 'el conteo devolvió un valor no numérico.',
        details: String(result.rows[0]![0]),
        strategyType: 'rowCount',
      }
    }
    const tolerance = validation.tolerance ?? 0
    const diff = Math.abs(got - validation.expected)
    if (diff <= tolerance) {
      return {
        passed: true,
        message: `conteo correcto: ${got} fila${got === 1 ? '' : 's'} en "${validation.table}".`,
        strategyType: 'rowCount',
      }
    }
    return {
      passed: false,
      message: `conteo incorrecto: esperaba ${validation.expected} (±${tolerance}) en "${validation.table}", obtuve ${got}.`,
      suggestions: [
        'verifica que tu INSERT/UPDATE/DELETE haya afectado a las filas correctas.',
      ],
      strategyType: 'rowCount',
    }
  }
}

function quoteIdent(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return `"${name.replace(/"/g, '""')}"`
  }
  return `"${name.replace(/"/g, '""')}"`
}
