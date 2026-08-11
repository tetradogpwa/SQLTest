/**
 * `tableExists` strategy (RESEARCH §10.1).
 *
 * Verifica que la tabla nombrada existe en la DB del usuario. Útil para
 * ejercicios `CREATE TABLE` donde lo importante es que la tabla se haya
 * creado, no las columnas concretas (eso lo cubre `schema`).
 */

import type {
  TableExistsValidation,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from '../types'

export class TableExistsStrategy implements ValidationStrategy {
  readonly type = 'tableExists' as const

  async apply(
    _ctx: ValidationContext,
    validation: TableExistsValidation,
  ): Promise<ValidationResult> {
    // Re-introspeccionamos para tener datos frescos (por si el schema
    // cacheado está stale tras un CREATE).
    let schema = _ctx.userSchema
    try {
      schema = await _ctx.api.schema(_ctx.dbId)
    } catch {
      // Si falla, caemos al cache; mejor false negative que false positive.
    }
    const target = validation.table.toLowerCase()
    const exists = schema.tables.some((t) => t.name.toLowerCase() === target)
    if (exists) {
      return {
        passed: true,
        message: `la tabla "${validation.table}" existe.`,
        strategyType: 'tableExists',
      }
    }
    return {
      passed: false,
      message: `la tabla "${validation.table}" no existe.`,
      suggestions: [
        `crea la tabla con CREATE TABLE ${validation.table} (...)`,
        'revisa el nombre — quizás escribiste una variante.',
      ],
      strategyType: 'tableExists',
    }
  }
}
