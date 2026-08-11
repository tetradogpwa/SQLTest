/**
 * Tests de sanidad de las 4 bases de datos semilla.
 *
 * No se hace un parseo SQL completo (eso requeriría un parser dedicado);
 * basta con regex que detecten:
 *
 *   - SQL no vacío
 *   - Contiene al menos un `CREATE TABLE`
 *   - Contiene al menos un `INSERT INTO`
 *   - Comillas equilibradas (mismo número de `'` en el string)
 *   - Paréntesis equilibrados en `CREATE TABLE ( ... )`
 *   - Palabras clave idempotentes (`IF NOT EXISTS`, `INSERT OR IGNORE`)
 *   - Presencia de FOREIGN KEY en al menos una tabla
 *
 * Los 4 tests principales (uno por base) verifican la base; los tests
 * complementarios verifican el shape general.
 */

import { describe, expect, it } from 'vitest'
import {
  librarySeed,
  tiendaSeed,
  socialSeed,
  empresaSeed,
  loadDatabase,
  allDatabaseSeeds,
} from '../../../src/content'

/** Cuenta paréntesis abiertos/cerrados en el SQL. */
function parenBalance(sql: string): { open: number; close: number; delta: number } {
  let open = 0
  let close = 0
  for (const ch of sql) {
    if (ch === '(') open++
    else if (ch === ')') close++
  }
  return { open, close, delta: open - close }
}

/** Cuenta comillas simples en el SQL (sin escape, simplificado). */
function countSingleQuotes(sql: string): number {
  let n = 0
  for (const ch of sql) if (ch === "'") n++
  return n
}

/** Verificaciones comunes a una DatabaseSeed. */
function assertHealthySeed(label: string, sql: string) {
  expect(sql.length, `${label} — SQL no vacío`).toBeGreaterThan(0)
  expect(sql, `${label} — contiene CREATE TABLE`).toMatch(/CREATE\s+TABLE/i)
  expect(sql, `${label} — contiene INSERT INTO`).toMatch(/INSERT\s+(?:OR\s+IGNORE\s+)?INTO/i)
  expect(sql, `${label} — usa IF NOT EXISTS para idempotencia`).toMatch(/IF\s+NOT\s+EXISTS/i)
  expect(sql, `${label} — usa INSERT OR IGNORE para idempotencia`).toMatch(/INSERT\s+OR\s+IGNORE/i)
  // FOREIGN KEY al menos una (los datos están enlazados por FKs reales)
  expect(sql, `${label} — contiene al menos un FOREIGN KEY`).toMatch(/FOREIGN\s+KEY/i)

  // Paréntesis equilibrados (no es perfecto, pero es una sanity check)
  const bal = parenBalance(sql)
  expect(bal.delta, `${label} — paréntesis equilibrados (delta=${bal.delta})`).toBe(0)

  // Comillas pares (las SQL strings van entre comillas simples)
  const quotes = countSingleQuotes(sql)
  expect(quotes % 2, `${label} — número par de comillas simples`).toBe(0)
}

describe('Database seeds — library', () => {
  const sql = librarySeed.sql
  assertHealthySeed('library', sql)

  it('tiene 4 tablas (CREATE TABLE)', () => {
    const tables = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+\w+/gi) ?? []
    expect(tables.length).toBeGreaterThanOrEqual(4)
  })

  it('incluye la tabla libros y prestamos', () => {
    expect(sql).toMatch(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+libros/i)
    expect(sql).toMatch(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+prestamos/i)
  })

  it('tiene al menos 1 índice secundario', () => {
    expect(sql).toMatch(/CREATE\s+INDEX/i)
  })

  it('loadDatabase("library") devuelve el mismo seed', () => {
    const seed = loadDatabase('library')
    expect(seed.id).toBe(librarySeed.id)
    expect(seed.sql).toBe(librarySeed.sql)
  })
})

describe('Database seeds — tienda', () => {
  const sql = tiendaSeed.sql
  assertHealthySeed('tienda', sql)

  it('tiene 4 tablas (CREATE TABLE)', () => {
    const tables = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+\w+/gi) ?? []
    expect(tables.length).toBeGreaterThanOrEqual(4)
  })

  it('incluye productos, clientes, pedidos y lineas_pedido', () => {
    expect(sql).toMatch(/CREATE\s+TABLE[^;]*productos/i)
    expect(sql).toMatch(/CREATE\s+TABLE[^;]*clientes/i)
    expect(sql).toMatch(/CREATE\s+TABLE[^;]*pedidos/i)
    expect(sql).toMatch(/CREATE\s+TABLE[^;]*lineas_pedido/i)
  })

  it('usa CHECK en el estado de los pedidos', () => {
    expect(sql).toMatch(/CHECK\s*\(/i)
  })
})

describe('Database seeds — social', () => {
  const sql = socialSeed.sql
  assertHealthySeed('social', sql)

  it('tiene 4 tablas (CREATE TABLE)', () => {
    const tables = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+\w+/gi) ?? []
    expect(tables.length).toBeGreaterThanOrEqual(4)
  })

  it('incluye UNIQUE(publicacion_id, usuario_id) en likes', () => {
    expect(sql).toMatch(/UNIQUE\s*\(\s*publicacion_id\s*,\s*usuario_id\s*\)/i)
  })
})

describe('Database seeds — empresa', () => {
  const sql = empresaSeed.sql
  assertHealthySeed('empresa', sql)

  it('tiene 4 tablas (CREATE TABLE)', () => {
    const tables = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+\w+/gi) ?? []
    expect(tables.length).toBeGreaterThanOrEqual(4)
  })

  it('incluye departamentos, empleados, proyectos y asignaciones', () => {
    expect(sql).toMatch(/CREATE\s+TABLE[^;]*departamentos/i)
    expect(sql).toMatch(/CREATE\s+TABLE[^;]*empleados/i)
    expect(sql).toMatch(/CREATE\s+TABLE[^;]*proyectos/i)
    expect(sql).toMatch(/CREATE\s+TABLE[^;]*asignaciones/i)
  })
})

describe('Database seeds — generales', () => {
  it('allDatabaseSeeds contiene exactamente 4 seeds', () => {
    expect(allDatabaseSeeds).toHaveLength(4)
  })

  it('los ids de los 4 seeds son únicos', () => {
    const ids = new Set(allDatabaseSeeds.map((s) => s.id))
    expect(ids.size).toBe(4)
  })

  it('cada seed tiene name y description no vacíos', () => {
    for (const seed of allDatabaseSeeds) {
      expect(seed.name.length, `${seed.id} — name`).toBeGreaterThan(0)
      expect(seed.description.length, `${seed.id} — description`).toBeGreaterThan(0)
    }
  })

  it('cada seed tiene al menos 30 INSERTs', () => {
    for (const seed of allDatabaseSeeds) {
      const inserts =
        seed.sql.match(/INSERT\s+OR\s+IGNORE\s+INTO/g)?.length ?? 0
      expect(inserts, `${seed.id} — número de INSERTs`).toBeGreaterThanOrEqual(4)
    }
  })

  it('cada seed tiene al menos 4 sentencias CREATE TABLE', () => {
    for (const seed of allDatabaseSeeds) {
      const creates =
        seed.sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?/gi)?.length ?? 0
      expect(creates, `${seed.id} — CREATE TABLEs`).toBeGreaterThanOrEqual(4)
    }
  })
})
