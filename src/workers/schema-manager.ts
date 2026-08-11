/**
 * SchemaManager — introspects the live database and returns a structured
 * view of its schema (tables, columns, foreign keys, views, indexes,
 * triggers). The result feeds:
 *
 *   - the autocomplete in the SQL editor (column / table names)
 *   - the Schema Browser UI in the playground
 *   - the ErrorTranslator "did you mean" suggestions (table + column list)
 *
 * The introspection walks `sqlite_master` once, then runs a `PRAGMA`
 * per table to gather column / foreign-key metadata. The walk uses the
 * `execWithParams` API to keep things consistent with the rest of the
 * worker (no separate prepared-statement lifecycle).
 *
 * Caching: the result for a `dbId` is cached in memory for `ttlMs`
 * (default 5 minutes). The DBAPI calls `invalidate(dbId)` whenever it
 * runs a DDL statement (CREATE/DROP/ALTER/RENAME) so the next
 * `introspect()` returns fresh data. `invalidate(dbId)` is also exposed
 * publicly so test code can force a re-introspection.
 */

import { DatabaseManager } from './database-manager'
import type {
  ColumnInfo,
  DatabaseSchema,
  ForeignKeyInfo,
  IndexInfo,
  TableInfo,
  TriggerInfo,
  ViewInfo,
} from './types'

/* ──────────────────────────────────────────────────────────────────── *
 *  Subset of the wa-sqlite API used here                                *
 * ──────────────────────────────────────────────────────────────────── */

export interface SQLiteForSchema {
  execWithParams: (
    db: number,
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: unknown[][]; columns: string[] }>
  exec: (db: number, sql: string) => Promise<number>
  errmsg: (db: number) => string
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Cache                                                                *
 * ──────────────────────────────────────────────────────────────────── */

interface CachedSchema {
  schema: DatabaseSchema
  fetchedAt: number
}

export interface SchemaCacheConfig {
  /** Time-to-live for the in-memory cache (ms). Default 5 minutes. */
  ttlMs: number
  /** Monotonic clock — defaults to `Date.now`. Injectable for tests. */
  now?: () => number
}

export const DEFAULT_SCHEMA_CACHE: SchemaCacheConfig = {
  ttlMs: 5 * 60 * 1000,
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Errors                                                               *
 * ──────────────────────────────────────────────────────────────────── */

export class SchemaIntrospectionError extends Error {
  constructor(cause: unknown, context: string) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`Schema introspection failed (${context}): ${msg}`)
    this.name = 'SchemaIntrospectionError'
    if (cause instanceof Error) this.cause = cause
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Manager                                                              *
 * ──────────────────────────────────────────────────────────────────── */

export class SchemaManager {
  private readonly dbs: DatabaseManager
  private readonly sqlite3: SQLiteForSchema
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly cache = new Map<number, CachedSchema>()

  constructor(deps: {
    dbs: DatabaseManager
    sqlite3: SQLiteForSchema
    config?: Partial<SchemaCacheConfig>
  }) {
    this.dbs = deps.dbs
    this.sqlite3 = deps.sqlite3
    const cfg: SchemaCacheConfig = { ...DEFAULT_SCHEMA_CACHE, ...(deps.config ?? {}) }
    this.ttlMs = cfg.ttlMs
    this.now = cfg.now ?? (() => Date.now())
  }

  /* ------------------------------------------------------------------ *
   *  Public API                                                        *
   * ------------------------------------------------------------------ */

  /**
   * Return the schema for `dbId`. Uses the cache when the entry is
   * still within the TTL window; otherwise performs a fresh walk.
   */
  async introspect(dbId: number): Promise<DatabaseSchema> {
    this.dbs.get(dbId) // throws DatabaseNotFoundError if unknown
    const cached = this.cache.get(dbId)
    if (cached && this.now() - cached.fetchedAt < this.ttlMs) {
      return cached.schema
    }
    const fresh = await this.walk(dbId)
    this.cache.set(dbId, { schema: fresh, fetchedAt: this.now() })
    return fresh
  }

  /**
   * Drop the cache entry for `dbId`. The DBAPI calls this whenever a
   * DDL statement runs so the next introspection reflects the change.
   */
  invalidate(dbId: number): void {
    this.cache.delete(dbId)
  }

  /** Drop every cache entry (e.g. when the Worker is shut down). */
  invalidateAll(): void {
    this.cache.clear()
  }

  /** Diagnostics. */
  cacheSize(): number {
    return this.cache.size
  }

  /* ------------------------------------------------------------------ *
   *  Internals — schema walk                                            *
   * ------------------------------------------------------------------ */

  private async walk(dbId: number): Promise<DatabaseSchema> {
    const { db } = this.dbs.get(dbId)
    try {
      // The high-level `execWithParams` API is not safe to call
      // concurrently on the same connection — each invocation walks an
      // async iterator of prepared statements, and parallel calls
      // interleave their statement handles. We serialise the walk.
      const tables = await this.listObjects(db, 'table')
      const views = await this.listObjects(db, 'view')
      const indexes = await this.listObjects(db, 'index')
      const triggers = await this.listObjects(db, 'trigger')

      const enrichedTables: TableInfo[] = []
      for (const t of tables) {
        const table = await this.introspectTable(db, t.name, t.sql)
        enrichedTables.push(table)
      }

      const enrichedIndexes: IndexInfo[] = indexes
        .filter((i) => !i.name.startsWith('sqlite_'))
        .map((i) => parseIndex(i.name, i.sql))

      const enrichedTriggers: TriggerInfo[] = triggers
        .filter((t) => !t.name.startsWith('sqlite_'))
        .map((t) => parseTrigger(t.name, t.sql))

      return {
        tables: enrichedTables,
        views: views
          .filter((v) => !v.name.startsWith('sqlite_'))
          .map((v): ViewInfo => ({ name: v.name, createSql: v.sql })),
        indexes: enrichedIndexes,
        triggers: enrichedTriggers,
      }
    } catch (e) {
      throw new SchemaIntrospectionError(e, 'sqlite_master walk')
    }
  }

  /**
   * Return `(name, sql)` rows from `sqlite_master` for the given object
   * type. The query is hand-written (no string interpolation) to avoid
   * the need for parameter binding on `type`.
   */
  private async listObjects(
    db: number,
    type: 'table' | 'view' | 'index' | 'trigger',
  ): Promise<Array<{ name: string; sql: string }>> {
    // `type` is from a closed enum, not user input — safe to interpolate.
    const result = await this.sqlite3.execWithParams(
      db,
      `SELECT name, sql FROM sqlite_master WHERE type = '${type}' AND name NOT LIKE 'sqlite_%' ORDER BY name;`,
    )
    return result.rows.map((row) => ({
      name: String(row[0] ?? ''),
      sql: row[1] == null ? '' : String(row[1]),
    }))
  }

  private async introspectTable(
    db: number,
    name: string,
    createSql: string,
  ): Promise<TableInfo> {
    // Serialised (see comment in `walk`): execWithParams is not safe to
    // call concurrently on the same connection.
    const columns = await this.tableColumns(db, name)
    const foreignKeys = await this.tableForeignKeys(db, name)
    const rowCountEstimate = await this.tableRowCount(db, name)
    const primaryKey = columns.filter((c) => c.primaryKeyPosition > 0).map((c) => c.name)
    const uniqueConstraints = parseUniqueConstraints(createSql)
    const checkConstraints = parseCheckConstraints(createSql)
    return {
      name,
      columns,
      primaryKey,
      foreignKeys,
      uniqueConstraints,
      checkConstraints,
      rowCountEstimate,
      createSql,
    }
  }

  private async tableColumns(db: number, name: string): Promise<ColumnInfo[]> {
    // PRAGMA does not accept parameters; `name` is a trusted string from
    // `sqlite_master`, not user input.
    const escaped = name.replace(/'/g, "''")
    const result = await this.sqlite3.execWithParams(
      db,
      `PRAGMA table_info('${escaped}');`,
    )
    return result.rows.map((row) => {
      const primaryKeyPosition = Number(row[5] ?? 0)
      // SQLite makes PRIMARY KEY columns implicitly NOT NULL. The
      // PRAGMA reports `notnull=0` for them, but the runtime contract
      // is "no NULL allowed" — propagate that into our public type.
      const notNullFlag = Number(row[3] ?? 0)
      return {
        name: String(row[1] ?? ''),
        type: String(row[2] ?? ''),
        nullable: notNullFlag === 0 && primaryKeyPosition === 0,
        defaultValue: row[4] == null ? null : String(row[4]),
        primaryKeyPosition,
      }
    })
  }

  private async tableForeignKeys(db: number, name: string): Promise<ForeignKeyInfo[]> {
    const escaped = name.replace(/'/g, "''")
    const result = await this.sqlite3.execWithParams(
      db,
      `PRAGMA foreign_key_list('${escaped}');`,
    )
    // The PRAGMA returns one row per (from, to) pair; we group by the
    // numeric `id` to keep the structure flat (the public type does not
    // preserve the multi-column ordering of the original FK).
    const byId = new Map<number, { froms: string[]; to: string; table: string; onUpdate?: string; onDelete?: string }>()
    for (const row of result.rows) {
      const id = Number(row[0] ?? 0)
      const seq = Number(row[1] ?? 0)
      const table = String(row[2] ?? '')
      const from = String(row[3] ?? '')
      const to = String(row[4] ?? '')
      const onUpdate = row[5] == null ? undefined : String(row[5])
      const onDelete = row[6] == null ? undefined : String(row[6])
      const existing = byId.get(id)
      if (existing) {
        // The list is already in `seq` order — append to the end.
        existing.froms.push(from)
      } else {
        byId.set(id, {
          froms: [from],
          to,
          table,
          onUpdate: onUpdate && onUpdate !== 'NO ACTION' ? onUpdate : undefined,
          onDelete: onDelete && onDelete !== 'NO ACTION' ? onDelete : undefined,
        })
      }
      // Avoid "unused" warning — `seq` is part of the result rows by
      // contract; we just don't need it (insertion order is enough).
      void seq
    }
    const fks: ForeignKeyInfo[] = []
    for (const v of byId.values()) {
      // Flatten multi-column FKs by emitting one entry per `froms` item.
      // This is a pragmatic choice — the alternative (an array of froms)
      // would not fit the existing `ForeignKeyInfo` shape and is not
      // needed for the autocomplete / schema-browser use case.
      for (const from of v.froms) {
        fks.push({
          from,
          table: v.table,
          to: v.to,
          onUpdate: v.onUpdate,
          onDelete: v.onDelete,
        })
      }
    }
    return fks
  }

  private async tableRowCount(db: number, name: string): Promise<number> {
    // Prefer `sqlite_stat1` when present (it has row-count estimates
    // maintained by `ANALYZE`). Fall back to `COUNT(*)` otherwise.
    const escaped = name.replace(/'/g, "''")
    try {
      const stat = await this.sqlite3.execWithParams(
        db,
        `SELECT stat FROM sqlite_stat1 WHERE tbl = '${escaped}' LIMIT 1;`,
      )
      if (stat.rows.length > 0) {
        const parsed = parseStat1(stat.rows[0]?.[0])
        if (parsed !== null) return parsed
      }
    } catch {
      // sqlite_stat1 doesn't exist (no ANALYZE run yet) — fall through.
    }
    try {
      const count = await this.sqlite3.execWithParams(
        db,
        `SELECT COUNT(*) FROM "${escaped}";`,
      )
      const v = count.rows[0]?.[0]
      return typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : 0
    } catch {
      return 0
    }
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Parsers                                                              *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * `sqlite_stat1.stat` is a space-separated list of integers whose first
 * entry is the row count (when the stat is `nrow …`). The format is
 * described in the SQLite source (`statInit`). We only care about the
 * first token — anything else would be unsafe to assume.
 */
function parseStat1(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const first = value.trim().split(/\s+/)[0]
  if (!first) return null
  const n = Number(first)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

/**
 * Parse `CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON table (cols...)`.
 * Returns `{ name, table, unique, columns, createSql }`. When the
 * statement cannot be parsed (e.g. partial indexes with `WHERE`) we
 * return a best-effort shape with `columns: []`.
 */
function parseIndex(name: string, sql: string): IndexInfo {
  const upper = sql.toUpperCase()
  const unique = /\bUNIQUE\b/.test(upper)
  // Match the column list between the first `(` and the matching `)`.
  const openIdx = sql.indexOf('(')
  const closeIdx = sql.lastIndexOf(')')
  let columns: string[] = []
  let table = ''
  if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
    const colsPart = sql.slice(openIdx + 1, closeIdx)
    // Skip expressions like `name COLLATE NOCASE` — keep the first token.
    columns = colsPart
      .split(',')
      .map((c) => c.trim().split(/\s+/)[0] ?? '')
      .filter((c) => c.length > 0)
  }
  // Match `ON <table>` between the index name and the column list.
  const onMatch = upper.indexOf(' ON ')
  if (onMatch !== -1) {
    const after = sql.slice(onMatch + 4, openIdx === -1 ? sql.length : openIdx)
    const tokens = after.trim().split(/\s+/)
    if (tokens.length > 0 && tokens[0]) {
      // Strip quoting (backticks / double quotes) that the user may
      // have used in the original statement.
      table = tokens[0].replace(/^[`"]+|[`"]+$/g, '')
    }
  }
  return { name, table, unique, columns, createSql: sql }
}

/**
 * Parse `CREATE TRIGGER name (AFTER|BEFORE) [OF col] ON table ...`.
 * The table name is between the `ON ` marker and the next whitespace
 * (which is the start of `BEGIN` / `FOR EACH ROW` / etc.).
 */
function parseTrigger(name: string, sql: string): TriggerInfo {
  const upper = sql.toUpperCase()
  const onMatch = upper.indexOf(' ON ')
  let table = ''
  if (onMatch !== -1) {
    const after = sql.slice(onMatch + 4)
    const tokens = after.trim().split(/\s+/)
    if (tokens.length > 0 && tokens[0]) {
      table = tokens[0].replace(/^[`"]+|[`"]+$/g, '')
    }
  }
  return { name, table, createSql: sql }
}

/**
 * Extract `UNIQUE` clauses from a `CREATE TABLE` statement. Handles
 * both flavours:
 *
 *   - Table-level: `UNIQUE (col, col, ...)` /
 *                 `CONSTRAINT name UNIQUE (col, ...)`
 *   - Column-level: `colname TYPE UNIQUE` (no parentheses)
 *
 * The result is a list of column-name arrays — one entry per
 * constraint, in the order they appear in the source.
 */
function parseUniqueConstraints(createSql: string): string[][] {
  const out: string[][] = []
  // 1. Table-level: match `UNIQUE (col, col, ...)`.
  const tableLevel = /\bUNIQUE\s*\(([^)]*)\)/gi
  let match: RegExpExecArray | null
  while ((match = tableLevel.exec(createSql)) !== null) {
    const cols = (match[1] ?? '')
      .split(',')
      .map((c) => c.trim().split(/\s+/)[0] ?? '')
      .filter((c) => c.length > 0)
    if (cols.length > 0) out.push(cols)
  }
  // 2. Column-level: find column names whose declaration ends with
  //    `UNIQUE` (followed by `,` or whitespace+`)` or `,`/end-of-line).
  //    We work on the column-list portion (between the first `(` and
  //    the last `)`) so `UNIQUE` table-constraints are not re-matched.
  const openIdx = createSql.indexOf('(')
  const closeIdx = createSql.lastIndexOf(')')
  if (openIdx !== -1 && closeIdx > openIdx) {
    const body = createSql.slice(openIdx + 1, closeIdx)
    const colRe = /^\s*("?)([A-Za-z_][A-Za-z0-9_]*)\1\s+[^,]*?\bUNIQUE\b/gm
    let m: RegExpExecArray | null
    while ((m = colRe.exec(body)) !== null) {
      const name = m[2]
      if (name) out.push([name])
    }
  }
  return out
}

/** Extract `CHECK (<expr>)` clauses — best-effort, expressions as-is. */
function parseCheckConstraints(createSql: string): string[] {
  const out: string[] = []
  const re = /\bCHECK\s*\(([^)]*)\)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(createSql)) !== null) {
    const expr = (match[1] ?? '').trim()
    if (expr.length > 0) out.push(expr)
  }
  return out
}
