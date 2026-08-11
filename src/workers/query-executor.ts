/**
 * QueryExecutor — runs SQL against a live connection.
 *
 * Responsibilities (RESEARCH §6 + §7 + §9):
 *   1. Run the StatementAnalyzer on the incoming SQL so callers can
 *      react to `risk` and `requiresCheckpoint` before / after execution.
 *   2. Optionally reject multi-statement SQL when `options.singleOnly`
 *      is set (useful for the Exercise Runner).
 *   3. Install a TimeoutController progress handler that aborts the
 *      query if it runs longer than `options.timeoutMs`.
 *   4. Run the SQL through `wa-sqlite.exec` / `execWithParams` and
 *      collect columns, rows, `rowsAffected` and `lastInsertRowid`.
 *   5. Translate thrown errors via ErrorTranslator and return a
 *      fully-populated `QueryResult`.
 *   6. Truncate the result set at `RESULT_LIMITS.maxRows` with
 *      `truncated: true` so the Main Thread can show a notice.
 *
 * The executor is a thin orchestrator on top of wa-sqlite — it does
 * not implement snapshot logic (that's the snapshot manager's job)
 * and does not manage schema introspection (schema manager's job).
 */

import { DatabaseManager } from './database-manager'
import { TimeoutController } from './timeout-controller'
import { ErrorTranslator } from './error-translator'
import { analyze } from './statement-analyzer'
import { RESULT_LIMITS } from './serialization-helper'
import type {
  AnalyzedStatement,
  ExecOptions,
  QueryResult,
  StatementKind,
} from './types'

/** Subset of the wa-sqlite API the executor actually uses. */
export interface SQLiteForExec {
  exec: (db: number, sql: string) => Promise<number>
  execWithParams: (
    db: number,
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: unknown[][]; columns: string[] }>
  changes: (db: number) => number
  last_insert_rowid: (db: number) => number
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Executor                                                             *
 * ──────────────────────────────────────────────────────────────────── */

export class QueryExecutor {
  private readonly dbs: DatabaseManager
  private readonly timeouts: TimeoutController
  private readonly translator: ErrorTranslator
  private readonly sqlite3: SQLiteForExec

  constructor(
    dbs: DatabaseManager,
    timeouts: TimeoutController,
    translator: ErrorTranslator,
    sqlite3: SQLiteForExec,
  ) {
    this.dbs = dbs
    this.timeouts = timeouts
    this.translator = translator
    this.sqlite3 = sqlite3
  }

  /**
   * Execute `sql` against the database identified by `dbId`.
   *
   * The function never throws on query errors — they are caught and
   * returned in `result.error`. The only exceptions that propagate are
   * `DatabaseNotFoundError` (when the dbId is unknown) and unexpected
   * programming errors.
   */
  async exec(dbId: number, sql: string, options: ExecOptions = {}): Promise<QueryResult> {
    const startedAt = Date.now()
    const trimmed = sql.trim()
    const collectRows = options.collectRows !== false

    // 1. Analyse the SQL.
    const statements = analyze(trimmed)
    if (statements.length === 0) {
      return {
        ok: false,
        error: {
          code: 'EMPTY_SQL',
          message: 'Empty SQL string',
          translatedMessage: 'La consulta está vacía. Escribe una sentencia SQL.',
        },
        executionMs: 0,
        statementKind: 'other',
      }
    }
    if (options.singleOnly && statements.length > 1) {
      return {
        ok: false,
        error: {
          code: 'MULTI_STATEMENT',
          message: 'Multi-statement SQL is not allowed here',
          translatedMessage:
            'Esta vista solo acepta una sentencia a la vez. Separa las consultas con varios "Ejecutar".',
        },
        executionMs: 0,
        statementKind: statements[0]!.kind,
        statements,
      }
    }

    let { db } = this.dbs.get(dbId) // throws if unknown
    const timeoutMs = options.timeoutMs ?? this.timeouts.getDefaultTimeoutMs()

    // Aggregate data.
    let lastColumns: string[] = []
    let lastRows: unknown[][] = []
    let rowsAffected = 0
    let lastInsertRowid = 0
    let truncated = false

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]!
      try {
        this.timeouts.start(db, timeoutMs)
        // For SELECT / EXPLAIN / PRAGMA, execWithParams returns rows.
        // For DML/DDL, wa-sqlite's `exec` also returns SQLITE_OK; we
        // collect rows only when the caller asked for them.
        if (collectRows && rowsReturning(stmt)) {
          const out = await this.sqlite3.execWithParams(
            db,
            trimmed.split(';')[i] ?? trimmed,
            options.params,
          )
          if (out.rows.length > RESULT_LIMITS.maxRows) {
            truncated = true
            lastRows = out.rows.slice(0, RESULT_LIMITS.maxRows)
          } else {
            lastRows = out.rows
          }
          if (out.columns.length > 0) lastColumns = out.columns
        } else {
          const rc = await this.sqlite3.exec(db, trimmed.split(';')[i] ?? trimmed)
          if (rc !== 0) {
            throw makeSqliteErrorFromRc(rc, db, this.sqlite3)
          }
        }
        this.timeouts.stop(db)

        rowsAffected += this.sqlite3.changes(db)
        lastInsertRowid = this.sqlite3.last_insert_rowid(db)
      } catch (e) {
        this.timeouts.stop(db)
        // Refresh the db handle in case sqlite3.changes invalidates it.
        try {
          ;({ db } = this.dbs.get(dbId))
        } catch {
          // db was closed underneath us — keep going with the stale handle.
        }
        return {
          ok: false,
          error: this.translator.translate(e, db, trimmed),
          executionMs: Date.now() - startedAt,
          statementKind: stmt.kind,
          statements,
        }
      }
    }

    const executionMs = Date.now() - startedAt
    return {
      ok: true,
      columns: lastColumns.length > 0 ? lastColumns : undefined,
      rows: collectRows ? lastRows : undefined,
      rowsAffected,
      lastInsertRowid,
      truncated,
      executionMs,
      statementKind: statements[0]!.kind,
      statements,
    }
  }

  /** Cancel the in-flight query (best-effort). */
  cancel(dbId: number): void {
    const { db } = this.dbs.get(dbId)
    this.timeouts.cancel(db)
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers                                                              *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Statements that *can* return rows. We use the analyser to decide so
 * the contract stays declarative — adding a new StatementKind only
 * requires extending this switch.
 */
function rowsReturning(stmt: AnalyzedStatement): boolean {
  switch (stmt.kind) {
    case 'select':
    case 'explain':
    case 'pragma':
    case 'analyze':
    case 'reindex':
      return true
    default:
      return false
  }
}

/**
 * Build a fake `SQLiteError` for the rare case where `sqlite3.exec`
 * returns a non-zero rc without throwing (in practice wa-sqlite throws,
 * but the binding contract documents the rc path).
 */
function makeSqliteErrorFromRc(
  rc: number,
  _db: number,
  _sqlite3: SQLiteForExec,
): Error & { code: number } {
  const e = new Error(`SQLite error (rc=${rc})`) as Error & { code: number }
  e.name = 'SQLiteError'
  e.code = rc
  return e
}

/** Exposed for tests that need the same default as the executor. */
export function defaultStatementKind(stmts: AnalyzedStatement[]): StatementKind {
  return stmts[0]?.kind ?? 'other'
}
