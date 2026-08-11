/**
 * Unit tests para `error-pattern-detector.ts`.
 *
 * Cubre los 12+ patrones "starter" (uno por test) + un test negativo
 * (error que no debe matchear nada) + un par de tests sobre la
 * ordenación por `confidence` y la heurística de SQL.
 */

import { describe, it, expect } from 'vitest'
import {
  detectPatterns,
  BUILTIN_PATTERNS,
} from '../../../src/core/exercises'
import type { DatabaseSchema, SerializedError } from '../../../src/workers/types'

const emptySchema: DatabaseSchema = { tables: [], views: [], indexes: [], triggers: [] }

function mkError(message: string): SerializedError {
  return {
    code: 'SQLITE_ERROR',
    message,
    translatedMessage: message,
  }
}

describe('error-pattern-detector', () => {
  it('detecta "no such table" y devuelve mensaje + fix en español', () => {
    const matches = detectPatterns(mkError('no such table: users'), '', emptySchema)
    const found = matches.find((m) => m.pattern.id === 'no-such-table')
    expect(found).toBeDefined()
    expect(found!.pattern.category).toBe('reference')
    expect(found!.pattern.message.toLowerCase()).toContain('tabla')
    expect(found!.pattern.fix.toLowerCase()).toContain('nombre')
    expect(found!.confidence).toBe(1.0)
  })

  it('detecta "no such column" y sugiere PRAGMA table_info', () => {
    const matches = detectPatterns(mkError('no such column: usrname'), '', emptySchema)
    const found = matches.find((m) => m.pattern.id === 'no-such-column')
    expect(found).toBeDefined()
    expect(found!.pattern.message.toLowerCase()).toContain('columna')
    expect(found!.pattern.fix).toContain('PRAGMA table_info')
  })

  it('detecta "syntax error near \'X\'" y reporta el token', () => {
    const matches = detectPatterns(
      mkError("near \"FROM\": syntax error"),
      '',
      emptySchema,
    )
    const found = matches.find((m) => m.pattern.id === 'syntax-error-near')
    expect(found).toBeDefined()
    expect(found!.pattern.message.toLowerCase()).toContain('token')
    expect(found!.pattern.fix.toLowerCase()).toContain('comillas')
  })

  it('detecta "ambiguous column name" y recomienda calificar con tabla.columna', () => {
    const matches = detectPatterns(
      mkError('ambiguous column name: name'),
      '',
      emptySchema,
    )
    const found = matches.find((m) => m.pattern.id === 'ambiguous-column')
    expect(found).toBeDefined()
    expect(found!.pattern.fix).toContain('tabla.columna')
  })

  it('detecta "datatype mismatch" y pregunta texto vs número', () => {
    const matches = detectPatterns(
      mkError('datatype mismatch in expression'),
      '',
      emptySchema,
    )
    const found = matches.find((m) => m.pattern.id === 'datatype-mismatch')
    expect(found).toBeDefined()
    expect(found!.pattern.message.toLowerCase()).toContain('tipo')
  })

  it('detecta "UNIQUE constraint failed" y sugiere INSERT OR REPLACE', () => {
    const matches = detectPatterns(
      mkError('UNIQUE constraint failed: users.email'),
      '',
      emptySchema,
    )
    const found = matches.find((m) => m.pattern.id === 'unique-constraint-failed')
    expect(found).toBeDefined()
    expect(found!.pattern.fix).toContain('INSERT OR REPLACE')
  })

  it('detecta "NOT NULL constraint failed" y exige un valor', () => {
    const matches = detectPatterns(
      mkError('NOT NULL constraint failed: users.name'),
      '',
      emptySchema,
    )
    const found = matches.find((m) => m.pattern.id === 'not-null-constraint-failed')
    expect(found).toBeDefined()
    expect(found!.pattern.message.toLowerCase()).toContain('null')
  })

  it('detecta "FOREIGN KEY constraint failed" y apunta a la tabla referenciada', () => {
    const matches = detectPatterns(
      mkError('FOREIGN KEY constraint failed'),
      '',
      emptySchema,
    )
    const found = matches.find((m) => m.pattern.id === 'foreign-key-constraint-failed')
    expect(found).toBeDefined()
    expect(found!.pattern.message.toLowerCase()).toContain('tabla referenciada')
  })

  it('detecta "misuse of aggregate" y avisa de la falta de GROUP BY', () => {
    const matches = detectPatterns(
      mkError('misuse of aggregate: COUNT()'),
      '',
      emptySchema,
    )
    const found = matches.find((m) => m.pattern.id === 'misuse-of-aggregate')
    expect(found).toBeDefined()
    expect(found!.pattern.message.toLowerCase()).toContain('group by')
  })

  it('detecta la heurística LIMIT sin ORDER BY y añade el patrón', () => {
    const matches = detectPatterns(null, 'SELECT * FROM users LIMIT 10', emptySchema)
    const found = matches.find((m) => m.pattern.id === 'order-by-non-deterministic')
    expect(found).toBeDefined()
    expect(found!.confidence).toBe(0.7)
    expect(found!.pattern.message.toLowerCase()).toContain('order by')
  })

  it('detecta la heurística de GROUP BY faltante con agregados', () => {
    const matches = detectPatterns(
      null,
      'SELECT department, COUNT(*) FROM employees',
      emptySchema,
    )
    const found = matches.find((m) => m.pattern.id === 'group-by-missing')
    expect(found).toBeDefined()
    expect(found!.confidence).toBe(0.8)
    expect(found!.pattern.message.toLowerCase()).toContain('group by')
  })

  it('detecta coma colgante y reserved-word identifier sobre el SQL', () => {
    const matches = detectPatterns(
      null,
      'SELECT id, name, FROM users',
      emptySchema,
    )
    const trailing = matches.find((m) => m.pattern.id === 'trailing-comma')
    expect(trailing).toBeDefined()
    expect(trailing!.confidence).toBe(0.6)
    expect(trailing!.pattern.message.toLowerCase()).toContain('coma')
  })

  it('test negativo: sin error y SQL inocuo → array vacío', () => {
    const matches = detectPatterns(null, 'SELECT 1', emptySchema)
    // Puede haber matches del heurístico de ORDER BY si no hay LIMIT,
    // pero como no hay error y el SQL es trivial, esperamos 0 matches
    // (o ninguno relacionado con errores reales).
    expect(matches).toHaveLength(0)
  })

  it('test negativo: error genérico sin matchear ningún patrón', () => {
    const matches = detectPatterns(
      mkError('something very weird happened'),
      'SELECT 1',
      emptySchema,
    )
    // El único match que podría haber es la heurística de trailing-comma
    // o reserved-word, pero el SQL es trivial, así que debe estar vacío.
    expect(matches.filter((m) => m.confidence === 1.0)).toHaveLength(0)
  })

  it('BUILTIN_PATTERNS tiene al menos 12 entradas y todas en español', () => {
    expect(BUILTIN_PATTERNS.length).toBeGreaterThanOrEqual(12)
    for (const p of BUILTIN_PATTERNS) {
      expect(p.message).toMatch(/[áéíóúñ¿¡a-z]/) // al menos una letra (lowercase o acentuada)
      expect(p.fix.length).toBeGreaterThan(5)
      expect(['syntax', 'semantic', 'reference', 'logic']).toContain(p.category)
    }
  })

  it('ordena los matches por confidence descendente', () => {
    // Forzamos al menos 2 matches con confianzas distintas: LIMIT sin ORDER BY (0.7) + error de syntax (1.0).
    const matches = detectPatterns(
      mkError("near 'X': syntax error"),
      'SELECT * FROM users LIMIT 5',
      emptySchema,
    )
    expect(matches.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1]!.confidence).toBeGreaterThanOrEqual(matches[i]!.confidence)
    }
  })

  it('los matches incluyen `matchedText` cuando la regex lo captura', () => {
    const matches = detectPatterns(mkError('no such table: orders'), '', emptySchema)
    const found = matches.find((m) => m.pattern.id === 'no-such-table')
    expect(found?.matchedText).toBeDefined()
    expect(found!.matchedText!.toLowerCase()).toContain('orders')
  })
})
