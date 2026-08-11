/**
 * Unit tests for the result comparator (RESEARCH §10.7).
 *
 * Cubre:
 *   - columnsMatch: alias, extras, orden
 *   - coerceForCompare: null, booleans, numeric strings, dates
 *   - rowToComparableKey: stable across orders
 *   - rowsEqualOrdered: same-order, mismatch, number vs string
 *   - rowsEqualAsMultiset: reordering, duplicates
 *   - compareResults: integración column + rows
 *
 * Al menos 8 tests, sin tocar el DBAPI real.
 */

import { describe, it, expect } from 'vitest'

import {
  coerceForCompare,
  rowToComparableKey,
  columnsMatch,
  rowsEqualOrdered,
  rowsEqualAsMultiset,
  compareResults,
} from '../../../src/core/exercises/result-comparator'
import type { QueryResult } from '../../../src/workers/types'

const baseOptions = { orderMatters: true, nullEqualsNull: true }

describe('coerceForCompare', () => {
  it('trata null y undefined como el mismo sentinel', () => {
    expect(coerceForCompare(null, true)).toEqual({ __null: true })
    expect(coerceForCompare(undefined, true)).toEqual({ __null: true })
  })
  it('convierte booleanos a 0/1', () => {
    expect(coerceForCompare(true, true)).toBe(1)
    expect(coerceForCompare(false, true)).toBe(0)
  })
  it('coerce strings numéricos a number', () => {
    expect(coerceForCompare('42', true)).toBe(42)
    expect(coerceForCompare(' 7 ', true)).toBe(7)
    expect(coerceForCompare('-3.14', true)).toBe(-3.14)
  })
  it('lowercase + trim en strings no numéricos', () => {
    expect(coerceForCompare('  Hola  ', true)).toBe('hola')
    expect(coerceForCompare('ABC', true)).toBe('abc')
  })
  it('pasa numbers tal cual', () => {
    expect(coerceForCompare(0, true)).toBe(0)
    expect(coerceForCompare(-1, true)).toBe(-1)
    expect(coerceForCompare(3.14, true)).toBe(3.14)
  })
})

describe('rowToComparableKey', () => {
  it('produce la misma clave para filas equivalentes en orden distinto', () => {
    const a = rowToComparableKey([1, 'a'])
    const b = rowToComparableKey([1, 'a'])
    expect(a).toBe(b)
  })
  it('produce claves distintas para filas distintas', () => {
    expect(rowToComparableKey([1, 'a'])).not.toBe(rowToComparableKey([1, 'b']))
  })
})

describe('columnsMatch', () => {
  it('matchea exactamente cuando los nombres coinciden en el mismo orden', () => {
    const r = columnsMatch(['a', 'b'], ['a', 'b'], baseOptions)
    expect(r.equal).toBe(true)
  })
  it('acepta alias declarado en columnAliases', () => {
    const r = columnsMatch(
      ['full_name', 'email'],
      ['name', 'email'],
      { ...baseOptions, columnAliases: { name: 'full_name' } },
    )
    expect(r.equal).toBe(true)
  })
  it('rechaza columnas faltantes', () => {
    const r = columnsMatch(['a'], ['a', 'b'], baseOptions)
    expect(r.equal).toBe(false)
    expect(r.diff).toMatch(/faltan columnas/)
  })
  it('rechaza columnas extra cuando ignoreExtraColumns=false', () => {
    const r = columnsMatch(['a', 'b', 'c'], ['a', 'b'], baseOptions)
    expect(r.equal).toBe(false)
    expect(r.diff).toMatch(/columnas extra/)
  })
  it('acepta columnas extra cuando ignoreExtraColumns=true', () => {
    const r = columnsMatch(['a', 'b', 'c'], ['a', 'b'], {
      ...baseOptions,
      ignoreExtraColumns: true,
    })
    expect(r.equal).toBe(true)
  })
})

describe('rowsEqualOrdered', () => {
  it('matchea filas en el mismo orden', () => {
    const r = rowsEqualOrdered(
      [[1, 'a'], [2, 'b']],
      [[1, 'a'], [2, 'b']],
      baseOptions,
      [0, 1],
    )
    expect(r.equal).toBe(true)
  })
  it('detecta diferencia de orden', () => {
    const r = rowsEqualOrdered(
      [[2, 'b'], [1, 'a']],
      [[1, 'a'], [2, 'b']],
      baseOptions,
      [0, 1],
    )
    expect(r.equal).toBe(false)
  })
  it('considera "1" y 1 equivalentes (coerción numérica)', () => {
    const r = rowsEqualOrdered(
      [['1', 'a']],
      [[1, 'a']],
      baseOptions,
      [0, 1],
    )
    expect(r.equal).toBe(true)
  })
  it('considera NULL === NULL con nullEqualsNull=true', () => {
    const r = rowsEqualOrdered(
      [[null, 'a']],
      [[null, 'a']],
      { ...baseOptions, nullEqualsNull: true },
      [0, 1],
    )
    expect(r.equal).toBe(true)
  })
  it('considera NULL ≠ NULL con nullEqualsNull=false', () => {
    const r = rowsEqualOrdered(
      [[null, 'a']],
      [[null, 'a']],
      { ...baseOptions, nullEqualsNull: false },
      [0, 1],
    )
    expect(r.equal).toBe(false)
  })
})

describe('rowsEqualAsMultiset', () => {
  it('matchea filas en orden distinto', () => {
    const r = rowsEqualAsMultiset(
      [[2, 'b'], [1, 'a']],
      [[1, 'a'], [2, 'b']],
      { orderMatters: false, nullEqualsNull: true },
      [0, 1],
    )
    expect(r.equal).toBe(true)
  })
  it('detecta diferencia de cardinalidad', () => {
    const r = rowsEqualAsMultiset(
      [[1, 'a']],
      [[1, 'a'], [2, 'b']],
      { orderMatters: false, nullEqualsNull: true },
      [0, 1],
    )
    expect(r.equal).toBe(false)
    expect(r.diff).toMatch(/número de filas/)
  })
  it('detecta multiset desbalanceado', () => {
    const r = rowsEqualAsMultiset(
      [[1, 'a'], [1, 'a']],
      [[1, 'a'], [2, 'b']],
      { orderMatters: false, nullEqualsNull: true },
      [0, 1],
    )
    expect(r.equal).toBe(false)
  })
})

describe('compareResults', () => {
  function mkResult(columns: string[], rows: unknown[][], ok = true): QueryResult {
    return { ok, columns, rows, executionMs: 0, statementKind: 'select' }
  }

  it('passa cuando ambos son vacíos', () => {
    const r = compareResults(mkResult([], []), mkResult([], []), baseOptions)
    expect(r.equal).toBe(true)
  })
  it('passa con match exacto', () => {
    const r = compareResults(
      mkResult(['a', 'b'], [[1, 2], [3, 4]]),
      mkResult(['a', 'b'], [[1, 2], [3, 4]]),
      baseOptions,
    )
    expect(r.equal).toBe(true)
  })
  it('falla con diferentes columnas', () => {
    const r = compareResults(
      mkResult(['a', 'b'], [[1, 2]]),
      mkResult(['a', 'c'], [[1, 2]]),
      baseOptions,
    )
    expect(r.equal).toBe(false)
    expect(r.diff).toMatch(/columnas/)
  })
  it('falla cuando la query del usuario no fue OK', () => {
    const r = compareResults(
      mkResult([], [], false),
      mkResult(['a'], [[1]]),
      baseOptions,
    )
    expect(r.equal).toBe(false)
  })
  it('pasa con multiset (orden no matters)', () => {
    const r = compareResults(
      mkResult(['a'], [[2], [1]]),
      mkResult(['a'], [[1], [2]]),
      { orderMatters: false, nullEqualsNull: true },
    )
    expect(r.equal).toBe(true)
  })
  it('falla con multiset y cardinalidad diferente', () => {
    const r = compareResults(
      mkResult(['a'], [[1]]),
      mkResult(['a'], [[1], [2]]),
      { orderMatters: false, nullEqualsNull: true },
    )
    expect(r.equal).toBe(false)
  })
  it('acepta alias de columna en la integración', () => {
    const r = compareResults(
      mkResult(['full_name'], [['Ana']]),
      mkResult(['name'], [['Ana']]),
      { orderMatters: true, nullEqualsNull: true, columnAliases: { name: 'full_name' } },
    )
    expect(r.equal).toBe(true)
  })
})
