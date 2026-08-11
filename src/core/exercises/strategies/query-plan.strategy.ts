/**
 * `queryPlan` strategy (RESEARCH §10.1, §24).
 *
 * Ejecuta `EXPLAIN QUERY PLAN <userSql>` y verifica que el plan contiene
 * los nodos esperados y NO contiene los prohibidos.
 *
 * Pensado para cursos avanzados donde se quiere forzar al alumno a
 * usar índices (SEARCH + USING INDEX) en lugar de full table scans.
 *
 * `EXPLAIN QUERY PLAN` devuelve filas con 4 columnas: id, parent, notused, detail.
 * La columna `detail` (índice 3) contiene la descripción textual del nodo
 * (ej. "SEARCH users USING INDEX ...").
 */

import type {
  QueryPlanValidation,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from '../types'

function rowToText(row: unknown[]): string {
  return row.map((c) => (c === null || c === undefined ? '' : String(c))).join(' ')
}

export class QueryPlanStrategy implements ValidationStrategy {
  readonly type = 'queryPlan' as const

  async apply(
    ctx: ValidationContext,
    validation: QueryPlanValidation,
  ): Promise<ValidationResult> {
    const expected = validation.expectedNodes ?? []
    const notExpected = validation.notExpectedNodes ?? []
    if (expected.length === 0 && notExpected.length === 0) {
      return {
        passed: false,
        message: 'la validación de plan de query no tiene nodos definidos.',
        strategyType: 'queryPlan',
      }
    }

    let result
    try {
      result = await ctx.api.exec(ctx.dbId, `EXPLAIN QUERY PLAN ${ctx.userSql}`, {
        timeoutMs: 5000,
      })
    } catch (e) {
      return {
        passed: false,
        message: 'no se pudo analizar el plan de la consulta.',
        details: (e as Error).message,
        strategyType: 'queryPlan',
      }
    }
    if (!result.ok) {
      return {
        passed: false,
        message: 'EXPLAIN QUERY PLAN falló.',
        details: result.error?.message,
        strategyType: 'queryPlan',
      }
    }

    const allText = (result.rows ?? []).map(rowToText).join('\n').toUpperCase()

    const missing: string[] = []
    for (const node of expected) {
      if (!allText.includes(node.toUpperCase())) missing.push(node)
    }
    const forbidden: string[] = []
    for (const node of notExpected) {
      if (allText.includes(node.toUpperCase())) forbidden.push(node)
    }

    if (missing.length === 0 && forbidden.length === 0) {
      return {
        passed: true,
        message: 'el plan de la consulta es adecuado.',
        strategyType: 'queryPlan',
      }
    }
    const details: string[] = []
    if (missing.length > 0) details.push(`faltan nodos: ${missing.join(', ')}`)
    if (forbidden.length > 0) details.push(`aparecen nodos prohibidos: ${forbidden.join(', ')}`)
    return {
      passed: false,
      message: 'el plan de la consulta no es el esperado.',
      details: details.join(' · '),
      suggestions: [
        'considera crear un índice sobre las columnas usadas en WHERE/JOIN.',
        'evita funciones sobre columnas indexadas en el WHERE.',
      ],
      strategyType: 'queryPlan',
    }
  }
}
