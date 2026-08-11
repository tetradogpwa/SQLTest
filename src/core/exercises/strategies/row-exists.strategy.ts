/**
 * `rowExists` strategy (RESEARCH §10.1).
 *
 * Verifica que al menos `minMatches` filas cumplen `where` en `table`.
 * `minMatches` default = 1.
 *
 * Implementación: `SELECT COUNT(*) FROM <table> WHERE <where>`. La
 * cláusula `where` se concatena tal cual; el caller es responsable de
 * no incluir la palabra `WHERE` y de no inyectar SQL malicioso (las
 * `where` viven en el JSON del ejercicio, no en input del usuario).
 */

import type {
  RowExistsValidation,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from '../types'

export class RowExistsStrategy implements ValidationStrategy {
  readonly type = 'rowExists' as const

  async apply(
    ctx: ValidationContext,
    validation: RowExistsValidation,
  ): Promise<ValidationResult> {
    // Re-introspeccionamos para tener datos frescos.
    let schema = ctx.userSchema
    try {
      schema = await ctx.api.schema(ctx.dbId)
    } catch {
      // cache fallback
    }
    const exists = schema.tables.some(
      (t) => t.name.toLowerCase() === validation.table.toLowerCase(),
    )
    if (!exists) {
      return {
        passed: false,
        message: `la tabla "${validation.table}" no existe.`,
        strategyType: 'rowExists',
      }
    }

    const minMatches = validation.minMatches ?? 1
    const sql = `SELECT COUNT(*) AS n FROM "${validation.table.replace(/"/g, '""')}" WHERE ${validation.where}`
    let result
    try {
      result = await ctx.api.exec(ctx.dbId, sql, { timeoutMs: 5000 })
    } catch (e) {
      return {
        passed: false,
        message: 'no se pudo verificar la existencia de filas.',
        details: (e as Error).message,
        strategyType: 'rowExists',
      }
    }
    if (!result.ok || !result.rows || result.rows.length === 0) {
      return {
        passed: false,
        message: 'no se pudo contar las filas.',
        details: result.error?.message ?? 'sin filas devueltas',
        strategyType: 'rowExists',
      }
    }
    const got = Number(result.rows[0]![0])
    if (got >= minMatches) {
      return {
        passed: true,
        message: `encontradas ${got} fila${got === 1 ? '' : 's'} que cumple${got === 1 ? '' : 'n'} la condición (mínimo ${minMatches}).`,
        strategyType: 'rowExists',
      }
    }
    return {
      passed: false,
      message: `se necesitan al menos ${minMatches} fila${minMatches === 1 ? '' : 's'} que cumpla${minMatches === 1 ? '' : 'n'} la condición, hay ${got}.`,
      suggestions: [
        'revisa el WHERE: ¿la condición es la correcta?',
        'comprueba que los datos insertados/actualizados cumplen el predicado.',
      ],
      strategyType: 'rowExists',
    }
  }
}
