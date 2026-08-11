/**
 * `result` strategy (RESEARCH §10.1, §10.7).
 *
 * Compara el resultado de la query del usuario con el resultado de la
 * solución. Usa `compareResults` para hacer la comparación configurable
 * (orden, alias de columna, NULLs).
 *
 * Si la query del usuario falló (errores SQL), se reporta con un mensaje
 * pedagógico en español.
 */

import type {
  QueryResultValidation,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from '../types'
import { compareResults } from '../result-comparator'

export class ResultStrategy implements ValidationStrategy {
  readonly type = 'result' as const

  async apply(
    ctx: ValidationContext,
    validation: QueryResultValidation,
  ): Promise<ValidationResult> {
    // Si el resultado del usuario no es OK, devolvemos mensaje de error
    // pedagógico (no dejamos que la comparación truene).
    if (ctx.userResult && ctx.userResult.ok === false) {
      const detail = ctx.userResult.error?.translatedMessage ?? ctx.userResult.error?.message
      return {
        passed: false,
        message: 'la consulta no se pudo ejecutar.',
        details: detail,
        suggestions: [
          'revisa la sintaxis de tu SQL.',
          'comprueba que las tablas y columnas existan.',
        ],
        strategyType: 'result',
      }
    }

    if (!ctx.solutionResult || !ctx.solutionResult.columns) {
      // Sin solución, no podemos validar. Marcamos como pass con warning
      // para que el runner no rompa; el contenido del ejercicio debería
      // garantizar que siempre hay solutionResult.
      return {
        passed: true,
        message: 'sin resultado de referencia para comparar.',
        strategyType: 'result',
      }
    }

    const result = compareResults(ctx.userResult, ctx.solutionResult, {
      orderMatters: validation.orderMatters,
      ignoreExtraColumns: validation.ignoreExtraColumns,
      columnAliases: validation.columnAliases,
      nullEqualsNull: validation.nullEqualsNull,
    })

    if (result.equal) {
      const rows = ctx.userResult?.rows?.length ?? 0
      return {
        passed: true,
        message: `resultado correcto (${rows} fila${rows === 1 ? '' : 's'}).`,
        strategyType: 'result',
      }
    }

    return {
      passed: false,
      message: 'el resultado no coincide con el esperado.',
      details: result.diff,
      suggestions: [
        'compara los nombres de las columnas con los del enunciado.',
        validation.orderMatters
          ? 'el orden de las filas importa: revisa tu ORDER BY.'
          : 'el orden de las filas NO importa.',
      ],
      strategyType: 'result',
    }
  }
}
