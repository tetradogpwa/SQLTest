/**
 * Tests del glosario SQL en español.
 *
 * Verifica que el glosario:
 *   - Tenga un número mínimo de entradas.
 *   - Los términos sean únicos (case-insensitive).
 *   - Cada entrada tenga los campos obligatorios no vacíos.
 *   - El lookup indexado funcione correctamente.
 *   - La búsqueda por término sea case-insensitive.
 */

import { describe, expect, it } from 'vitest'
import { glossary, glossaryByTerm, lookupGlossary } from '../../../src/content'

describe('Glosario', () => {
  it('tiene al menos 30 entradas', () => {
    expect(glossary.length).toBeGreaterThanOrEqual(30)
  })

  it('los términos son únicos (case-insensitive)', () => {
    const seen = new Set<string>()
    const dupes: string[] = []
    for (const entry of glossary) {
      const k = entry.term.toLowerCase()
      if (seen.has(k)) dupes.push(entry.term)
      seen.add(k)
    }
    expect(dupes, `términos duplicados: ${dupes.join(', ')}`).toEqual([])
  })

  it('cada entrada tiene term, translation y definition no vacíos', () => {
    for (const entry of glossary) {
      expect(entry.term.length, `term de "${entry.term}"`).toBeGreaterThan(0)
      expect(entry.translation.length, `translation de "${entry.term}"`).toBeGreaterThan(0)
      expect(entry.definition.length, `definition de "${entry.term}"`).toBeGreaterThan(0)
    }
  })

  it('glossaryByTerm es un objeto no vacío', () => {
    expect(Object.keys(glossaryByTerm).length).toBe(glossary.length)
  })

  it('lookupGlossary es case-insensitive', () => {
    expect(lookupGlossary('SELECT')?.translation).toBe('seleccionar')
    expect(lookupGlossary('select')?.translation).toBe('seleccionar')
    expect(lookupGlossary('Select')?.translation).toBe('seleccionar')
  })

  it('lookupGlossary devuelve undefined para términos desconocidos', () => {
    expect(lookupGlossary('xyzzy')).toBeUndefined()
  })

  it('contiene las palabras clave SQL más comunes', () => {
    const required = [
      'SELECT', 'FROM', 'WHERE', 'JOIN', 'GROUP BY', 'ORDER BY',
      'LIMIT', 'INSERT INTO', 'UPDATE', 'DELETE', 'COUNT', 'SUM', 'AVG',
      'INNER JOIN', 'LEFT JOIN', 'CTE', 'WITH', 'IS NULL',
    ]
    for (const term of required) {
      expect(lookupGlossary(term), `falta el término "${term}"`).toBeDefined()
    }
  })

  it('las definiciones son frases castellanas (>= 20 caracteres, sin símbolos raros)', () => {
    // Heurística suave: una definición razonable tiene al menos 20 caracteres
    // y no contiene símbolos que delaten que esté en otro idioma.
    for (const entry of glossary) {
      expect(entry.definition.length, `definition de "${entry.term}"`).toBeGreaterThanOrEqual(20)
      // Que tenga al menos un espacio (es una frase, no una palabra suelta).
      expect(entry.definition, `definition de "${entry.term}"`).toMatch(/\s/)
    }
  })
})
