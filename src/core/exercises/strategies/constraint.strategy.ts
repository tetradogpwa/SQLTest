/**
 * `constraint` strategy (RESEARCH §10.1).
 *
 * Verifica que una columna tenga un cierto tipo de constraint. Soporta:
 *
 *   - `NOT NULL`     → la columna existe y no es nullable.
 *   - `UNIQUE`       → la columna aparece en una unique constraint.
 *   - `PRIMARY KEY`  → la columna es parte de la PK.
 *   - `DEFAULT`      → la columna tiene un default value (opcionalmente
 *                      que coincida con `expected`).
 *   - `CHECK`        → se busca la expresión de check en
 *                      `table.checkConstraints` y se compara con `expected`
 *                      tras normalizar (lowercase, sin espacios redundantes).
 */

import type {
  ConstraintValidation,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from '../types'

function normalizeCheckExpression(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*,\s*/g, ',')
    .trim()
}

export class ConstraintStrategy implements ValidationStrategy {
  readonly type = 'constraint' as const

  async apply(
    ctx: ValidationContext,
    validation: ConstraintValidation,
  ): Promise<ValidationResult> {
    const targetTable = validation.table.toLowerCase()
    const targetCol = validation.column.toLowerCase()

    // Re-introspeccionamos el schema para datos frescos.
    let schema = ctx.userSchema
    try {
      schema = await ctx.api.schema(ctx.dbId)
    } catch {
      // cache fallback
    }
    const table = schema.tables.find((t) => t.name.toLowerCase() === targetTable)
    if (!table) {
      return {
        passed: false,
        message: `la tabla "${validation.table}" no existe.`,
        strategyType: 'constraint',
      }
    }
    const column = table.columns.find((c) => c.name.toLowerCase() === targetCol)
    if (!column) {
      return {
        passed: false,
        message: `la columna "${validation.column}" no existe en "${validation.table}".`,
        strategyType: 'constraint',
      }
    }

    switch (validation.constraint) {
      case 'NOT NULL': {
        if (column.nullable) {
          return {
            passed: false,
            message: `la columna "${validation.column}" no tiene NOT NULL.`,
            suggestions: ['declara la columna con NOT NULL.'],
            strategyType: 'constraint',
          }
        }
        return {
          passed: true,
          message: `"${validation.column}" tiene NOT NULL.`,
          strategyType: 'constraint',
        }
      }
      case 'PRIMARY KEY': {
        if (!table.primaryKey.map((c) => c.toLowerCase()).includes(targetCol)) {
          return {
            passed: false,
            message: `"${validation.column}" no es parte de la PRIMARY KEY.`,
            strategyType: 'constraint',
          }
        }
        return {
          passed: true,
          message: `"${validation.column}" es parte de la PRIMARY KEY.`,
          strategyType: 'constraint',
        }
      }
      case 'UNIQUE': {
        const isUnique = table.uniqueConstraints.some(
          (cols) => cols.length === 1 && cols[0]?.toLowerCase() === targetCol,
        )
        if (!isUnique) {
          return {
            passed: false,
            message: `"${validation.column}" no tiene constraint UNIQUE.`,
            suggestions: ['añade UNIQUE a la columna.'],
            strategyType: 'constraint',
          }
        }
        return {
          passed: true,
          message: `"${validation.column}" tiene UNIQUE.`,
          strategyType: 'constraint',
        }
      }
      case 'DEFAULT': {
        if (column.defaultValue === null || column.defaultValue === undefined) {
          return {
            passed: false,
            message: `"${validation.column}" no tiene DEFAULT.`,
            strategyType: 'constraint',
          }
        }
        if (validation.expected !== undefined) {
          const got = column.defaultValue.toLowerCase().trim()
          const exp = (validation.expected ?? '').toLowerCase().trim()
          if (got !== exp) {
            return {
              passed: false,
              message: `el DEFAULT de "${validation.column}" no coincide.`,
              details: `esperaba ${exp}, obtuve ${got}`,
              strategyType: 'constraint',
            }
          }
        }
        return {
          passed: true,
          message: `"${validation.column}" tiene DEFAULT ${column.defaultValue}.`,
          strategyType: 'constraint',
        }
      }
      case 'CHECK': {
        if (!validation.expected) {
          return {
            passed: false,
            message: 'falta la expresión CHECK esperada.',
            strategyType: 'constraint',
          }
        }
        const expectedNorm = normalizeCheckExpression(validation.expected)
        const found = table.checkConstraints.some(
          (c) => normalizeCheckExpression(c) === expectedNorm,
        )
        if (!found) {
          return {
            passed: false,
            message: `no se encontró la expresión CHECK esperada en "${validation.table}".`,
            details: `esperaba: ${validation.expected}`,
            strategyType: 'constraint',
          }
        }
        return {
          passed: true,
          message: `la expresión CHECK coincide en "${validation.table}".`,
          strategyType: 'constraint',
        }
      }
      default: {
        return {
          passed: false,
          message: `tipo de constraint desconocido: ${String(validation.constraint)}`,
          strategyType: 'constraint',
        }
      }
    }
  }
}
