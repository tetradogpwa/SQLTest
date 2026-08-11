/**
 * `usesKeyword` strategy (RESEARCH §10.1, §10.5).
 *
 * Verifica que el SQL del usuario usa ciertas keywords SQL. Es una
 * **restricción pedagógica opcional** (no siempre activa). Se usa cuando
 * el objetivo didáctico de la lección requiere imponer una técnica
 * (p. ej. "usa WHERE" en una lección sobre filtrado).
 *
 * Tokenización case-insensitive con word-boundary para evitar matches
 * espurios (p. ej. "OR" dentro de "ORDER").
 */

import type {
  KeywordUsageValidation,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from '../types'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsKeyword(sql: string, keyword: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i')
  return pattern.test(sql)
}

export class KeywordUsageStrategy implements ValidationStrategy {
  readonly type = 'usesKeyword' as const

  async apply(
    ctx: ValidationContext,
    validation: KeywordUsageValidation,
  ): Promise<ValidationResult> {
    const all = validation.all !== false // default true
    const found: string[] = []
    const missing: string[] = []

    for (const kw of validation.keywords) {
      if (containsKeyword(ctx.userSql, kw)) {
        found.push(kw)
      } else {
        missing.push(kw)
      }
    }

    if (all) {
      // Todas deben estar presentes.
      if (missing.length === 0) {
        return {
          passed: true,
          message: `tu consulta usa ${found.length === 1 ? 'la keyword' : 'todas las keywords'} requerida${found.length === 1 ? '' : 's'}: ${found.join(', ')}.`,
          strategyType: 'usesKeyword',
        }
      }
      return {
        passed: false,
        message: `tu consulta debe usar ${missing.length === 1 ? 'la keyword' : 'todas las keywords'}: ${missing.join(', ')}.`,
        suggestions: missing.map(
          (kw) => `añade la keyword ${kw} a tu consulta (en mayúsculas o minúsculas).`,
        ),
        strategyType: 'usesKeyword',
      }
    }
    // Basta con UNA.
    if (found.length > 0) {
      return {
        passed: true,
        message: `tu consulta usa al menos una de las keywords: ${found.join(', ')}.`,
        strategyType: 'usesKeyword',
      }
    }
    return {
      passed: false,
      message: `tu consulta debe usar al menos una de: ${validation.keywords.join(', ')}.`,
      suggestions: validation.keywords.map(
        (kw) => `considera usar ${kw} para resolver el ejercicio.`,
      ),
      strategyType: 'usesKeyword',
    }
  }
}
