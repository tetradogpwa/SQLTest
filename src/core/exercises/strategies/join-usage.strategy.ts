/**
 * `usesJoin` strategy (RESEARCH §10.1, §10.5).
 *
 * Verifica que la query del usuario usa un número adecuado de cláusulas
 * JOIN. Opcionalmente filtra por tipo (INNER / LEFT / RIGHT / FULL / CROSS).
 *
 * Detección: regex que matchea `JOIN` precedido opcionalmente por el tipo.
 * Para contar solo un tipo concreto, se filtra por la keyword previa.
 */

import type {
  JoinUsageValidation,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from '../types'

/** Resultado de la detección de JOINs. */
interface JoinHit {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS' | 'IMPLICIT'
  /** Texto del match (para debugging). */
  text: string
}

// Matchea "INNER|LEFT|RIGHT|FULL|CROSS JOIN" (con OUTER opcional) o "JOIN" suelto.
// Cada alternativa incluye su propio espacio antes de JOIN para que
// "LEFT JOIN" (sin OUTER) matchee correctamente.
const JOIN_REGEX = /\b(?:INNER\s+)?JOIN\b|\bLEFT\s+(?:OUTER\s+)?JOIN\b|\bRIGHT\s+(?:OUTER\s+)?JOIN\b|\bFULL\s+(?:OUTER\s+)?JOIN\b|\bCROSS\s+JOIN\b/gi

function findJoins(sql: string): JoinHit[] {
  const hits: JoinHit[] = []
  for (const m of sql.matchAll(JOIN_REGEX)) {
    const text = m[0].toUpperCase().replace(/\s+/g, ' ').trim()
    if (text === 'JOIN') {
      hits.push({ type: 'IMPLICIT', text })
    } else if (text.startsWith('INNER')) {
      hits.push({ type: 'INNER', text })
    } else if (text.startsWith('LEFT')) {
      hits.push({ type: 'LEFT', text })
    } else if (text.startsWith('RIGHT')) {
      hits.push({ type: 'RIGHT', text })
    } else if (text.startsWith('FULL')) {
      hits.push({ type: 'FULL', text })
    } else if (text.startsWith('CROSS')) {
      hits.push({ type: 'CROSS', text })
    }
  }
  return hits
}

export class JoinUsageStrategy implements ValidationStrategy {
  readonly type = 'usesJoin' as const

  async apply(
    ctx: ValidationContext,
    validation: JoinUsageValidation,
  ): Promise<ValidationResult> {
    const allJoins = findJoins(ctx.userSql)
    const filter = validation.joinTypes
    const count =
      filter && filter.length > 0
        ? allJoins.filter((h) => (filter as ReadonlyArray<string>).includes(h.type)).length
        : allJoins.length

    const minJoins = validation.minJoins
    const maxJoins = validation.maxJoins
    const typeLabel =
      filter && filter.length > 0 ? ` (tipo ${filter.join(' / ')})` : ''

    if (count < minJoins) {
      const detail = `encontré ${count} JOIN${count === 1 ? '' : 's'}${typeLabel}, esperaba al menos ${minJoins}`
      return {
        passed: false,
        message: 'la consulta no usa suficientes JOINs.',
        details: detail,
        suggestions: [
          `añade ${minJoins - count} cláusula${minJoins - count === 1 ? '' : 's'} JOIN adicional.`,
        ],
        strategyType: 'usesJoin',
      }
    }
    if (maxJoins !== undefined && count > maxJoins) {
      return {
        passed: false,
        message: 'la consulta usa demasiados JOINs.',
        details: `encontré ${count} JOINs, esperaba como máximo ${maxJoins}`,
        suggestions: [`reduce las cláusulas JOIN a ${maxJoins} como máximo.`],
        strategyType: 'usesJoin',
      }
    }
    return {
      passed: true,
      message: `la consulta usa ${count} JOIN${count === 1 ? '' : 's'}${typeLabel} (correcto).`,
      strategyType: 'usesJoin',
    }
  }
}
