/**
 * Tests for `QueryExecutor` — exhaustive coverage of the
 * orchestration logic that runs SQL through wa-sqlite.
 *
 * The executor depends on three collaborators (`DatabaseManager`,
 * `TimeoutController`, `ErrorTranslator`) and the wa-sqlite
 * binding surface (`exec`, `execWithParams`, `changes`,
 * `last_insert_rowid`). All four are mocked; the tests exercise the
 * decision logic only (analyse, multi-statement guard, singleOnly
 * guard, row collection, truncation, error path, cancel).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  QueryExecutor,
  type SQLiteForExec,
} from '../../../src/workers/query-executor'
import { DatabaseManager, DatabaseNotFoundError } from '../../../src/workers/database-manager'
import { TimeoutController } from '../../../src/workers/timeout-controller'
import { ErrorTranslator } from '../../../src/workers/error-translator'

/* ------------------------------------------------------------------ *
 *  Test helpers                                                         *
 * ------------------------------------------------------------------ */

function makeFakeTimeout(): InstanceType<typeof TimeoutController> {
  // We mock the controller's methods to avoid touching the
  // real wa-sqlite binding.
  return {
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    isCancelled: vi.fn(() => false),
    getDefaultTimeoutMs: vi.fn(() => 5_000),
  } as unknown as InstanceType<typeof TimeoutController>
}

function makeFakeTranslator(): InstanceType<typeof ErrorTranslator> {
  return {
    translate: vi.fn((e: unknown) => ({
      code: 'TRANSLATED',
      message: e instanceof Error ? e.message : String(e),
      translatedMessage: 'translated',
    })),
  } as unknown as InstanceType<typeof ErrorTranslator>
}

function makeFakeDbs(overrides: Partial<DatabaseManager> = {}): DatabaseManager {
  return {
    get: vi.fn((dbId: number) => {
      if (dbId === 999) throw new DatabaseNotFoundError(dbId)
      return { db: dbId, filename: 'test.db', sizeBytes: 0, mode: 'readwrite', openedAt: 0 }
    }),
    ...overrides,
  } as unknown as DatabaseManager
}

function makeFakeSqlite(overrides: Partial<SQLiteForExec> = {}): SQLiteForExec {
  return {
    exec: vi.fn(async () => 0),
    execWithParams: vi.fn(async () => ({ rows: [], columns: [] })),
    changes: vi.fn(() => 0),
    last_insert_rowid: vi.fn(() => 0),
    ...overrides,
  } as unknown as SQLiteForExec
}

function makeExecutor(overrides: {
  sqlite?: SQLiteForExec
  dbs?: DatabaseManager
  timeouts?: InstanceType<typeof TimeoutController>
  translator?: InstanceType<typeof ErrorTranslator>
} = {}): {
  executor: QueryExecutor
  sqlite: SQLiteForExec
  dbs: DatabaseManager
  timeouts: InstanceType<typeof TimeoutController>
  translator: InstanceType<typeof ErrorTranslator>
} {
  const sqlite = overrides.sqlite ?? makeFakeSqlite()
  const dbs = overrides.dbs ?? makeFakeDbs()
  const timeouts = overrides.timeouts ?? makeFakeTimeout()
  const translator = overrides.translator ?? makeFakeTranslator()
  const executor = new QueryExecutor(dbs, timeouts, translator, sqlite)
  return { executor, sqlite, dbs, timeouts, translator }
}

/* ------------------------------------------------------------------ *
 *  Empty SQL                                                            *
 * ------------------------------------------------------------------ */

describe('QueryExecutor.exec — empty SQL', () => {
  it('returns an EMPTY_SQL error when the trimmed SQL is empty', async () => {
    const { executor } = makeExecutor()
    const r = await executor.exec(1, '   ')
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('EMPTY_SQL')
    expect(r.executionMs).toBe(0)
    expect(r.statementKind).toBe('other')
  })
})

/* ------------------------------------------------------------------ *
 *  Multi-statement guard                                                 *
 * ------------------------------------------------------------------ */

describe('QueryExecutor.exec — multi-statement guard', () => {
  it('rejects multi-statement SQL when singleOnly is set', async () => {
    const { executor, sqlite } = makeExecutor()
    const r = await executor.exec(1, 'SELECT 1; SELECT 2;', { singleOnly: true })
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('MULTI_STATEMENT')
    expect(r.statementKind).toBe('select')
    expect(sqlite.execWithParams).not.toHaveBeenCalled()
    expect(sqlite.exec).not.toHaveBeenCalled()
  })

  it('accepts multi-statement SQL when singleOnly is NOT set', async () => {
    const { executor, sqlite } = makeExecutor()
    const r = await executor.exec(1, 'SELECT 1; SELECT 2;')
    expect(r.ok).toBe(true)
    expect(sqlite.execWithParams).toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ *
 *  Unknown dbId                                                          *
 * ------------------------------------------------------------------ */

describe('QueryExecutor.exec — unknown dbId', () => {
  it('throws DatabaseNotFoundError when the dbId is unknown', async () => {
    const { executor } = makeExecutor()
    await expect(executor.exec(999, 'SELECT 1')).rejects.toBeInstanceOf(
      DatabaseNotFoundError,
    )
  })
})

/* ------------------------------------------------------------------ *
 *  Row collection (SELECT)                                               *
 * ------------------------------------------------------------------ */

describe('QueryExecutor.exec — SELECT (collects rows)', () => {
  it('returns the columns and rows from execWithParams', async () => {
    const { executor, sqlite } = makeExecutor({
      sqlite: makeFakeSqlite({
        execWithParams: vi.fn(async () => ({
          rows: [
            [1, 'Ada'],
            [2, 'Bob'],
          ],
          columns: ['id', 'name'],
        })),
      }),
    })
    const r = await executor.exec(1, 'SELECT id, name FROM users')
    expect(r.ok).toBe(true)
    expect(r.columns).toEqual(['id', 'name'])
    expect(r.rows).toEqual([
      [1, 'Ada'],
      [2, 'Bob'],
    ])
    expect(r.statementKind).toBe('select')
    expect(r.executionMs).toBeGreaterThanOrEqual(0)
    expect(sqlite.execWithParams).toHaveBeenCalledTimes(1)
    expect(sqlite.exec).not.toHaveBeenCalled()
  })

  it('does NOT call execWithParams when collectRows=false (uses exec instead)', async () => {
    const { executor, sqlite } = makeExecutor({
      sqlite: makeFakeSqlite({
        exec: vi.fn(async () => 0),
      }),
    })
    const r = await executor.exec(1, 'SELECT 1', { collectRows: false })
    expect(r.ok).toBe(true)
    expect(r.rows).toBeUndefined()
    expect(sqlite.exec).toHaveBeenCalled()
    expect(sqlite.execWithParams).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ *
 *  Row truncation                                                       *
 * ------------------------------------------------------------------ */

describe('QueryExecutor.exec — row truncation', () => {
  it('truncates the result set at RESULT_LIMITS.maxRows (10_000) and sets `truncated: true`', async () => {
    // Build a result with more rows than the limit. The executor
    // slices to maxRows and sets `truncated: true`.
    const limit = 10_000 // from RESULT_LIMITS.maxRows in serialization-helper
    const rows = Array.from({ length: limit + 5 }, (_, i) => [i])
    const { executor } = makeExecutor({
      sqlite: makeFakeSqlite({
        execWithParams: vi.fn(async () => ({
          rows,
          columns: ['x'],
        })),
      }),
    })
    const r = await executor.exec(1, 'SELECT * FROM huge')
    expect(r.ok).toBe(true)
    expect(r.truncated).toBe(true)
    expect(r.rows?.length).toBe(limit)
    expect(r.rows?.[0]).toEqual([0])
    expect(r.rows?.[limit - 1]).toEqual([limit - 1])
  })
})

/* ------------------------------------------------------------------ *
 *  Non-row-returning statements (INSERT / UPDATE / DELETE / DDL)         *
 * ------------------------------------------------------------------ */

describe('QueryExecutor.exec — DML/DDL (uses exec)', () => {
  it('uses exec for INSERT and reports rowsAffected + lastInsertRowid', async () => {
    const { executor, sqlite } = makeExecutor({
      sqlite: makeFakeSqlite({
        exec: vi.fn(async () => 0),
        changes: vi.fn(() => 1),
        last_insert_rowid: vi.fn(() => 42),
      }),
    })
    const r = await executor.exec(1, 'INSERT INTO users VALUES (1, "Ada")')
    expect(r.ok).toBe(true)
    expect(r.statementKind).toBe('insert')
    expect(r.rowsAffected).toBe(1)
    expect(r.lastInsertRowid).toBe(42)
    // INSERT is not row-returning; with collectRows=true (default)
    // lastRows stays as `[]` and the result has `rows: []`.
    expect(r.rows).toEqual([])
    expect(sqlite.exec).toHaveBeenCalled()
    expect(sqlite.execWithParams).not.toHaveBeenCalled()
  })

  it('throws a SQLite error when exec returns a non-zero rc', async () => {
    const { executor, translator } = makeExecutor({
      sqlite: makeFakeSqlite({
        exec: vi.fn(async () => 19), // SQLITE_CONSTRAINT
      }),
    })
    const r = await executor.exec(1, 'INSERT INTO users VALUES (1)')
    expect(r.ok).toBe(false)
    expect(translator.translate).toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ *
 *  Error path                                                            *
 * ------------------------------------------------------------------ */

describe('QueryExecutor.exec — error path', () => {
  it('translates a thrown error and returns a failure result', async () => {
    const { executor, translator } = makeExecutor({
      sqlite: makeFakeSqlite({
        execWithParams: vi.fn(async () => {
          throw new Error('no such table')
        }),
      }),
    })
    const r = await executor.exec(1, 'SELECT * FROM foo')
    expect(r.ok).toBe(false)
    expect(translator.translate).toHaveBeenCalled()
    expect(r.error?.code).toBe('TRANSLATED')
  })

  it('stops the timeout controller on the error path', async () => {
    const { executor, timeouts } = makeExecutor({
      sqlite: makeFakeSqlite({
        execWithParams: vi.fn(async () => {
          throw new Error('boom')
        }),
      }),
    })
    await executor.exec(1, 'SELECT 1')
    expect(timeouts.stop).toHaveBeenCalled()
  })

  it('refreshes the db handle after an error (the dbs.get call on the error path)', async () => {
    const getMock = vi.fn((dbId: number) => ({ db: dbId, filename: 'test.db', sizeBytes: 0, mode: 'readwrite' as const, openedAt: 0 }))
    const { executor } = makeExecutor({
      dbs: { get: getMock } as unknown as DatabaseManager,
      sqlite: makeFakeSqlite({
        execWithParams: vi.fn(async () => {
          throw new Error('boom')
        }),
      }),
    })
    await executor.exec(1, 'SELECT 1')
    // The first call is for the initial open, the second is the
    // refresh after the error.
    expect(getMock).toHaveBeenCalledTimes(2)
  })
})

/* ------------------------------------------------------------------ *
 *  Cancel                                                                *
 * ------------------------------------------------------------------ */

describe('QueryExecutor.cancel', () => {
  it('cancels the in-flight timeout for the given dbId', () => {
    const { executor, timeouts } = makeExecutor()
    executor.cancel(7)
    expect(timeouts.cancel).toHaveBeenCalledWith(7)
  })

  it('throws when cancelling an unknown dbId', () => {
    const { executor } = makeExecutor({
      dbs: {
        get: vi.fn((dbId: number) => {
          throw new DatabaseNotFoundError(dbId)
        }),
      } as unknown as DatabaseManager,
    })
    expect(() => executor.cancel(999)).toThrow(DatabaseNotFoundError)
  })
})
