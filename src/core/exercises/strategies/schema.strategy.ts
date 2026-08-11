/**
 * `schema` strategy (RESEARCH §10.1).
 *
 * Compara el esquema actual de la DB del usuario contra el esquema
 * esperado (columnas, PK, FKs). Es lo que se usa para ejercicios
 * `CREATE TABLE`, `ALTER TABLE`, etc.
 *
 * Reglas:
 *   - Compara conjunto de columnas por nombre (no orden).
 *   - Tipos: case-insensitive, normalizando espacios y paréntesis
 *     (`VARCHAR(255)` ≈ `varchar(255)` ≈ `VARCHAR( 255 )`).
 *   - `nullable` se compara estrictamente.
 *   - PK y FKs: si se declaran en `expected`, se exige match exacto.
 */

import type {
  ExpectedColumn,
  ExpectedForeignKey,
  SchemaValidation,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from '../types'
import type { ColumnInfo, TableInfo } from '../../../workers/types'

function normalizeType(t: string): string {
  return t.replace(/\s+/g, '').toLowerCase()
}

function columnMatches(actual: ColumnInfo, expected: ExpectedColumn): boolean {
  if (actual.name.toLowerCase() !== expected.name.toLowerCase()) return false
  if (normalizeType(actual.type) !== normalizeType(expected.type)) return false
  if (actual.nullable !== expected.nullable) return false
  if (expected.primaryKeyPosition !== undefined) {
    if (actual.primaryKeyPosition !== expected.primaryKeyPosition) return false
  }
  if (expected.defaultValue !== undefined) {
    const exp = (expected.defaultValue ?? '').toLowerCase().trim()
    const act = (actual.defaultValue ?? '').toLowerCase().trim()
    if (exp !== act) return false
  }
  return true
}

function pkMatches(table: TableInfo, expected: string[] | undefined): boolean {
  if (expected === undefined) return true
  if (table.primaryKey.length !== expected.length) return false
  for (let i = 0; i < expected.length; i++) {
    if (table.primaryKey[i]?.toLowerCase() !== expected[i]?.toLowerCase()) return false
  }
  return true
}

function fkMatches(table: TableInfo, expected: ExpectedForeignKey[] | undefined): boolean {
  if (expected === undefined) return true
  if (table.foreignKeys.length !== expected.length) return false
  // Comparamos por conjunto (no orden).
  const actualNorm = table.foreignKeys
    .map((fk: { from: string; table: string; to: string; onUpdate?: string; onDelete?: string }) => ({
      from: fk.from.toLowerCase(),
      table: fk.table.toLowerCase(),
      to: fk.to.toLowerCase(),
    }))
    .sort((a: { from: string; table: string; to: string }, b: { from: string; table: string; to: string }) =>
      a.from.localeCompare(b.from) || a.table.localeCompare(b.table) || a.to.localeCompare(b.to),
    )
  const expectedNorm = expected
    .map((fk: ExpectedForeignKey) => ({
      from: fk.from.toLowerCase(),
      table: fk.table.toLowerCase(),
      to: fk.to.toLowerCase(),
    }))
    .sort((a: { from: string; table: string; to: string }, b: { from: string; table: string; to: string }) =>
      a.from.localeCompare(b.from) || a.table.localeCompare(b.table) || a.to.localeCompare(b.to),
    )
  for (let i = 0; i < actualNorm.length; i++) {
    const a = actualNorm[i]!
    const e = expectedNorm[i]!
    if (a.from !== e.from || a.table !== e.table || a.to !== e.to) return false
  }
  return true
}

export class SchemaStrategy implements ValidationStrategy {
  readonly type = 'schema' as const

  async apply(
    ctx: ValidationContext,
    validation: SchemaValidation,
  ): Promise<ValidationResult> {
    // Re-introspeccionamos el esquema del usuario para tener datos frescos.
    let schema = ctx.userSchema
    try {
      schema = await ctx.api.schema(ctx.dbId)
    } catch (e) {
      return {
        passed: false,
        message: 'no se pudo leer el esquema de la base de datos.',
        details: (e as Error).message,
        strategyType: 'schema',
      }
    }

    const targetName = validation.table.toLowerCase()
    const table = schema.tables.find((t) => t.name.toLowerCase() === targetName)
    if (!table) {
      return {
        passed: false,
        message: `la tabla "${validation.table}" no existe.`,
        suggestions: [
          `crea la tabla con CREATE TABLE ${validation.table} (...)`,
          'revisa el nombre — SQLite distingue mayúsculas en identificadores quoted.',
        ],
        strategyType: 'schema',
      }
    }

    // Columnas — comparamos por conjunto.
    const actualCols = new Set(table.columns.map((c) => c.name.toLowerCase()))
    const expectedCols = new Set(validation.expectedColumns.map((c) => c.name.toLowerCase()))
    const missing: string[] = []
    for (const e of expectedCols) {
      if (!actualCols.has(e)) missing.push(e)
    }
    const extras: string[] = []
    for (const a of actualCols) {
      if (!expectedCols.has(a)) extras.push(a)
    }

    if (missing.length > 0) {
      return {
        passed: false,
        message: `faltan columnas en "${validation.table}".`,
        details: `faltan: ${missing.join(', ')}`,
        suggestions: [`añade las columnas: ${missing.join(', ')}`],
        strategyType: 'schema',
      }
    }
    if (extras.length > 0) {
      return {
        passed: false,
        message: `hay columnas extra en "${validation.table}".`,
        details: `sobran: ${extras.join(', ')}`,
        suggestions: [`elimina las columnas: ${extras.join(', ')}`],
        strategyType: 'schema',
      }
    }

    // Validar tipos / nullable / default por columna.
    const mismatches: string[] = []
    for (const expected of validation.expectedColumns) {
      const actual = table.columns.find(
        (c) => c.name.toLowerCase() === expected.name.toLowerCase(),
      )
      if (!actual) continue
      if (!columnMatches(actual, expected)) {
        mismatches.push(
          `${expected.name}: esperaba ${expected.type}${expected.nullable ? '' : ' NOT NULL'}` +
            (expected.defaultValue !== undefined ? ` DEFAULT ${expected.defaultValue}` : '') +
            `, obtuve ${actual.type}${actual.nullable ? '' : ' NOT NULL'}` +
            (actual.defaultValue ? ` DEFAULT ${actual.defaultValue}` : ''),
        )
      }
    }
    if (mismatches.length > 0) {
      return {
        passed: false,
        message: 'el tipo o las restricciones de algunas columnas no coinciden.',
        details: mismatches.join(' · '),
        strategyType: 'schema',
      }
    }

    if (!pkMatches(table, validation.expectedPrimaryKey)) {
      return {
        passed: false,
        message: 'la clave primaria no coincide con la esperada.',
        details: `esperaba PRIMARY KEY (${(validation.expectedPrimaryKey ?? []).join(', ')}), obtuve (${table.primaryKey.join(', ')})`,
        strategyType: 'schema',
      }
    }
    if (!fkMatches(table, validation.expectedForeignKeys)) {
      return {
        passed: false,
        message: 'las claves foráneas no coinciden con las esperadas.',
        strategyType: 'schema',
      }
    }

    return {
      passed: true,
      message: `la tabla "${validation.table}" tiene el esquema correcto (${validation.expectedColumns.length} columnas).`,
      strategyType: 'schema',
    }
  }
}
