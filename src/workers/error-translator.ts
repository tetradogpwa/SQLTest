/**
 * Translate SQLite errors into pedagogically useful Spanish messages.
 *
 * The Worker's QueryExecutor catches `SQLiteError` thrown by `wa-sqlite`
 * and feeds it to `ErrorTranslator.translate` along with the offending
 * SQL string and the database handle. The translator:
 *
 *   1. Classifies the error by SQLite result code (e.g. SQLITE_BUSY,
 *      SQLITE_INTERRUPT, SQLITE_ERROR). The error message is the raw
 *      English text returned by `sqlite3_errmsg`.
 *   2. Detects common pedagogical patterns (`no such column: X`,
 *      `no such table: T`, `syntax error`, `database is locked`) and
 *      rewrites them in Spanish with did-you-mean suggestions when
 *      possible.
 *   3. Falls back to the SQLite message unchanged for anything we
 *      don't have a hand-tuned translation for.
 *
 * The translator is intentionally *stateless* and *synchronous*. It is
 * also independent of `wa-sqlite`'s internal types so it can be unit
 * tested without spinning up a real database.
 */

import * as SQLite from 'wa-sqlite/src/sqlite-constants.js'

import type { SerializedError } from './types'

/** Minimal API needed by the translator. */
export interface SQLiteForErrors {
  /**
   * Return the current error message for `db`. wa-sqlite does not expose
   * this on its high-level object, so the executor passes the
   * `Module.ccall('sqlite3_errmsg', …)` wrapper through.
   */
  errmsg(db: number): string
}

interface SQLiteErrorLike {
  message: string
  code?: number
  name?: string
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Result-code → name table                                             *
 * ──────────────────────────────────────────────────────────────────── */

/** Reverse mapping for the well-known primary result codes. */
const RC_NAMES: Record<number, string> = {
  [SQLite.SQLITE_OK]: 'SQLITE_OK',
  [SQLite.SQLITE_ERROR]: 'SQLITE_ERROR',
  [SQLite.SQLITE_INTERNAL]: 'SQLITE_INTERNAL',
  [SQLite.SQLITE_PERM]: 'SQLITE_PERM',
  [SQLite.SQLITE_ABORT]: 'SQLITE_ABORT',
  [SQLite.SQLITE_BUSY]: 'SQLITE_BUSY',
  [SQLite.SQLITE_LOCKED]: 'SQLITE_LOCKED',
  [SQLite.SQLITE_NOMEM]: 'SQLITE_NOMEM',
  [SQLite.SQLITE_READONLY]: 'SQLITE_READONLY',
  [SQLite.SQLITE_INTERRUPT]: 'SQLITE_INTERRUPT',
  [SQLite.SQLITE_IOERR]: 'SQLITE_IOERR',
  [SQLite.SQLITE_CORRUPT]: 'SQLITE_CORRUPT',
  [SQLite.SQLITE_NOTFOUND]: 'SQLITE_NOTFOUND',
  [SQLite.SQLITE_FULL]: 'SQLITE_FULL',
  [SQLite.SQLITE_CANTOPEN]: 'SQLITE_CANTOPEN',
  [SQLite.SQLITE_PROTOCOL]: 'SQLITE_PROTOCOL',
  [SQLite.SQLITE_SCHEMA]: 'SQLITE_SCHEMA',
  [SQLite.SQLITE_TOOBIG]: 'SQLITE_TOOBIG',
  [SQLite.SQLITE_CONSTRAINT]: 'SQLITE_CONSTRAINT',
  [SQLite.SQLITE_MISMATCH]: 'SQLITE_MISMATCH',
  [SQLite.SQLITE_MISUSE]: 'SQLITE_MISUSE',
  [SQLite.SQLITE_NOLFS]: 'SQLITE_NOLFS',
  [SQLite.SQLITE_AUTH]: 'SQLITE_AUTH',
  [SQLite.SQLITE_FORMAT]: 'SQLITE_FORMAT',
  [SQLite.SQLITE_RANGE]: 'SQLITE_RANGE',
  [SQLite.SQLITE_NOTADB]: 'SQLITE_NOTADB',
}

function codeName(rc: number | undefined): string {
  if (rc === undefined) return 'SQLITE_UNKNOWN'
  return RC_NAMES[rc] ?? `SQLITE_0x${rc.toString(16).toUpperCase()}`
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Levenshtein distance                                                 *
 * ──────────────────────────────────────────────────────────────────── */

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const dp: number[] = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) dp[j] = j
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + cost)
      prev = tmp
    }
  }
  return dp[b.length]!
}

function suggest(needle: string, haystack: string[], maxDistance = 2): string | undefined {
  const lower = needle.toLowerCase()
  let best: { name: string; d: number } | undefined
  for (const candidate of haystack) {
    const d = levenshtein(lower, candidate.toLowerCase())
    if (d <= maxDistance && (!best || d < best.d)) {
      best = { name: candidate, d }
    }
  }
  return best?.name
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Translator                                                           *
 * ──────────────────────────────────────────────────────────────────── */

export class ErrorTranslator {
  /**
   * Known table / column names for did-you-mean suggestions. The
   * executor pushes the live schema here whenever it runs a query so
   * the suggestions are accurate.
   */
  private knownTables: Set<string> = new Set<string>()
  private knownColumns: Set<string> = new Set<string>()

  private readonly sqlite3: SQLiteForErrors | undefined

  constructor(sqlite3?: SQLiteForErrors) {
    this.sqlite3 = sqlite3
  }

  /** Replace the suggestion dictionary. Called after `schema()` changes. */
  setSchema(tables: string[], columns: string[]): void {
    this.knownTables = new Set(tables)
    this.knownColumns = new Set(columns)
  }

  /** Convenience: register just one table. */
  addTable(name: string): void {
    this.knownTables.add(name)
  }

  addColumn(name: string): void {
    this.knownColumns.add(name)
  }

  /**
   * Translate an error into a `SerializedError`. If `error` is already a
   * `SerializedError` (e.g. a previous translate call), it is returned
   * unchanged.
   */
  translate(error: unknown, db: number, sql: string): SerializedError {
    if (isSerializedError(error)) return error

    // Pull the rich message from SQLite if the original error is
    // message-only (e.g. an error from `wa-sqlite.exec`).
    const sqliteMessage = this.readErrmsg(db) ?? ''
    const errLike = normaliseError(error)
    const message = (sqliteMessage || errLike.message || 'SQLite error').trim()
    const code = errLike.code
    const codeStr = codeName(code)

    const base: SerializedError = {
      code: codeStr,
      message,
      translatedMessage: '',
      rc: code,
    }

    // Fast-path: well-known codes/messages.
    const translated = this.translateMessage(message, code, base, sql)
    base.translatedMessage = translated.text
    if (translated.hints) base.hints = translated.hints
    if (translated.table) base.table = translated.table
    if (translated.column) base.column = translated.column
    if (translated.offendingToken) base.offendingToken = translated.offendingToken

    return base
  }

  /* ------------------------------------------------------------------ *
   *  Internal                                                          *
   * ------------------------------------------------------------------ */

  private readErrmsg(db: number): string | undefined {
    if (!this.sqlite3) return undefined
    try {
      return this.sqlite3.errmsg(db)
    } catch {
      return undefined
    }
  }

  private translateMessage(
    message: string,
    rc: number | undefined,
    base: SerializedError,
    sql: string,
  ): { text: string; hints?: string[]; table?: string; column?: string; offendingToken?: string } {
    const lower = message.toLowerCase()
    const hints: string[] = []

    // `no such column: X`
    const colMatch = message.match(/no such column:\s*([A-Za-z_][A-Za-z0-9_]*)/i)
    if (colMatch) {
      const name = colMatch[1]!
      base.column = name
      const suggestion = suggest(name, Array.from(this.knownColumns))
      const text = suggestion
        ? `No existe la columna \`${name}\`. ¿Quizá quisiste decir \`${suggestion}\`?`
        : `No existe la columna \`${name}\`. Comprueba el nombre.`
      hints.push('Revisa el nombre de la columna y que la tabla sea la correcta.')
      return { text, hints, column: name }
    }

    // `no such table: X`
    const tabMatch = message.match(/no such table:\s*([A-Za-z_][A-Za-z0-9_]*)/i)
    if (tabMatch) {
      const name = tabMatch[1]!
      base.table = name
      const suggestion = suggest(name, Array.from(this.knownTables))
      const text = suggestion
        ? `No existe la tabla \`${name}\`. ¿Quizá quisiste decir \`${suggestion}\`?`
        : `No existe la tabla \`${name}\`.`
      hints.push('Comprueba la lista de tablas en el panel de esquema.')
      return { text, hints, table: name }
    }

    // `no such index`, `no such view`, `no such trigger`
    const objMatch = message.match(/no such (index|view|trigger):\s*([A-Za-z_][A-Za-z0-9_]*)/i)
    if (objMatch) {
      const kind = objMatch[1]!.toLowerCase()
      const name = objMatch[2]!
      const text = `No existe ${kind === 'index' ? 'el índice' : kind === 'view' ? 'la vista' : 'el trigger'} \`${name}\`.`
      return { text, hints: [`Comprueba el nombre del ${kind}.`] }
    }

    // `syntax error` — try to extract the offending token.
    if (lower.includes('syntax error')) {
      // SQLite usually appends `near "TOKEN": line N`. Token may be quoted.
      const near = message.match(/near\s+"([^"]+)"/i)
        ?? message.match(/near\s+'([^']+)'/i)
        ?? message.match(/near\s+([A-Za-z0-9_]+)/i)
      const token = near?.[1] ?? ''
      const tokenInfo = token ? ` cerca de "${token}"` : ''
      return {
        text: `La consulta tiene un error de sintaxis${tokenInfo}.`,
        hints: [
          'Revisa comas, paréntesis y palabras reservadas.',
          'Consulta la documentación de SQL si es la primera vez que usas esta cláusula.',
        ],
        offendingToken: token || undefined,
      }
    }

    // `database is locked` (SQLITE_LOCKED)
    if (lower.includes('database is locked')) {
      return {
        text: 'La base de datos está siendo usada por otra operación. Espera unos segundos y vuelve a intentarlo.',
        hints: ['Cierra otras pestañas que estén editando la misma base de datos.'],
      }
    }

    // `UNIQUE constraint failed: X.Y`
    if (lower.includes('unique constraint failed')) {
      const m = message.match(/unique constraint failed:\s*([^\s.]+)\.([A-Za-z0-9_]+)/i)
      const table = m?.[1]
      const column = m?.[2]
      const text = column
        ? `Ya existe una fila con ese valor en \`${table}.${column}\` (restricción UNIQUE).`
        : 'La fila viola una restricción UNIQUE.'
      hints.push('Usa INSERT OR REPLACE si quieres sobrescribir, o UPDATE para modificar la fila existente.')
      return { text, hints, table, column }
    }

    // `NOT NULL constraint failed: X.Y`
    if (lower.includes('not null constraint failed')) {
      const m = message.match(/not null constraint failed:\s*([^\s.]+)\.([A-Za-z0-9_]+)/i)
      const column = m?.[2]
      const table = m?.[1]
      const text = column
        ? `La columna \`${column}\` no admite valores NULL.`
        : 'Alguna columna obligatoria no admite NULL.'
      return {
        text,
        hints: ['Proporciona un valor para la(s) columna(s) obligatoria(s).'],
        column,
        table,
      }
    }

    // `FOREIGN KEY constraint failed`
    if (lower.includes('foreign key constraint failed')) {
      return {
        text: 'La operación viola una restricción de clave externa (FOREIGN KEY).',
        hints: [
          'Comprueba que los valores referenciados existan en la tabla padre.',
          'No puedes eliminar filas que otras filas todavía referencian.',
        ],
      }
    }

    // `CHECK constraint failed: X`
    if (lower.includes('check constraint failed')) {
      return {
        text: 'La fila viola una restricción CHECK definida en la tabla.',
        hints: ['Revisa la condición CHECK del esquema.'],
      }
    }

    // Generic by result code.
    if (rc === SQLite.SQLITE_INTERRUPT) {
      return {
        text: 'La consulta fue cancelada (timeout o cancelación manual).',
        hints: ['Si la query tardaba demasiado, intenta añadir LIMIT o índices.'],
      }
    }
    if (rc === SQLite.SQLITE_BUSY) {
      return {
        text: 'La base de datos está ocupada. Reintenta en unos instantes.',
        hints: ['Otra operación está modificando la base de datos.'],
      }
    }
    if (rc === SQLite.SQLITE_FULL) {
      return {
        text: 'No queda espacio en OPFS para escribir más datos.',
        hints: ['Borra alguna base de datos que ya no necesites.'],
      }
    }
    if (rc === SQLite.SQLITE_READONLY) {
      return {
        text: 'La base de datos está abierta en modo solo lectura.',
        hints: ['Vuelve a abrir la base de datos en modo lectura-escritura.'],
      }
    }
    if (rc === SQLite.SQLITE_CANTOPEN) {
      return {
        text: 'No se pudo abrir la base de datos. Comprueba los permisos del navegador.',
        hints: ['Si acabas de importar el archivo, puede que esté corrupto.'],
      }
    }
    if (rc === SQLite.SQLITE_NOTADB) {
      return {
        text: 'El archivo no es una base de datos SQLite válida.',
        hints: ['Comprueba que has subido un archivo .db correcto.'],
      }
    }
    if (rc === SQLite.SQLITE_CORRUPT) {
      return {
        text: 'La base de datos está corrupta. Intenta restaurar un snapshot reciente.',
        hints: ['Si persiste, reimporta la base de datos desde un backup.'],
      }
    }
    if (rc === SQLite.SQLITE_RANGE) {
      return {
        text: 'Un parámetro está fuera de rango.',
        hints: ['Revisa los índices de las columnas (recordatorio: empiezan en 1).'],
      }
    }
    if (rc === SQLite.SQLITE_MISUSE) {
      return {
        text: 'La API de SQLite se ha usado de forma incorrecta.',
        hints: ['Este error normalmente indica un bug; repórtalo si persiste.'],
      }
    }

    // Default — keep the original message but mark it as a SQLite error.
    const tag = codeName(rc)
    void sql
    void hints
    return { text: `[${tag}] ${message}` }
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers                                                              *
 * ──────────────────────────────────────────────────────────────────── */

function isSerializedError(e: unknown): e is SerializedError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'translatedMessage' in e &&
    'code' in e
  )
}

function normaliseError(error: unknown): SQLiteErrorLike {
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: unknown; code?: unknown; name?: unknown }
    return {
      message: typeof e.message === 'string' ? e.message : '',
      code: typeof e.code === 'number' ? e.code : undefined,
      name: typeof e.name === 'string' ? e.name : undefined,
    }
  }
  return { message: String(error) }
}
