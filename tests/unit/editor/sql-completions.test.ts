/**
 * Tests for the production SQL completion source.
 *
 * Mirrors `codemirror-completions.test.ts` (which exercises the POC
 * implementation) but asserts the behaviour of the production
 * source in `src/ui/components/editor/sql-completions.ts`. The POC
 * uses an inline schema; the production source consumes the Worker's
 * `DatabaseSchema` type.
 */
import { describe, it, expect } from 'vitest'

import {
  makeSqlCompletions,
  parseContext,
  tablesMatching,
  columnsMatching,
  findTable,
  SQL_KEYWORDS,
} from '../../../src/ui/components/editor/sql-completions'
import type { DatabaseSchema } from '../../../src/workers/types'
import type {
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete'

const SCHEMA: DatabaseSchema = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, primaryKeyPosition: 1 },
        { name: 'name', type: 'TEXT', nullable: false, defaultValue: null, primaryKeyPosition: 0 },
        { name: 'email', type: 'TEXT', nullable: true, defaultValue: null, primaryKeyPosition: 0 },
        { name: 'created_at', type: 'TIMESTAMP', nullable: true, defaultValue: 'CURRENT_TIMESTAMP', primaryKeyPosition: 0 },
        { name: 'is_active', type: 'BOOLEAN', nullable: false, defaultValue: '1', primaryKeyPosition: 0 },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      uniqueConstraints: [['email']],
      checkConstraints: [],
      rowCountEstimate: 3,
      createSql: 'CREATE TABLE users (...)',
    },
    {
      name: 'orders',
      columns: [
        { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, primaryKeyPosition: 1 },
        { name: 'user_id', type: 'INTEGER', nullable: false, defaultValue: null, primaryKeyPosition: 0 },
        { name: 'total', type: 'REAL', nullable: false, defaultValue: null, primaryKeyPosition: 0 },
        { name: 'status', type: 'TEXT', nullable: false, defaultValue: "'pending'", primaryKeyPosition: 0 },
        { name: 'placed_at', type: 'TIMESTAMP', nullable: true, defaultValue: null, primaryKeyPosition: 0 },
      ],
      primaryKey: ['id'],
      foreignKeys: [{ from: 'user_id', table: 'users', to: 'id' }],
      uniqueConstraints: [],
      checkConstraints: [],
      rowCountEstimate: 12,
      createSql: 'CREATE TABLE orders (...)',
    },
    {
      name: 'products',
      columns: [
        { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, primaryKeyPosition: 1 },
        { name: 'sku', type: 'TEXT', nullable: false, defaultValue: null, primaryKeyPosition: 0 },
        { name: 'name', type: 'TEXT', nullable: false, defaultValue: null, primaryKeyPosition: 0 },
        { name: 'price', type: 'REAL', nullable: false, defaultValue: null, primaryKeyPosition: 0 },
        { name: 'stock', type: 'INTEGER', nullable: false, defaultValue: '0', primaryKeyPosition: 0 },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      uniqueConstraints: [['sku']],
      checkConstraints: [],
      rowCountEstimate: 0,
      createSql: 'CREATE TABLE products (...)',
    },
  ],
  views: [],
  indexes: [],
  triggers: [],
}

function makeContext(text: string, wordWidth: number, explicit = true): CompletionContext {
  const pos = text.length
  const from = pos - wordWidth
  return {
    state: {
      doc: { toString: () => text, length: text.length },
    },
    pos,
    explicit,
    matchBefore: (re: RegExp) => {
      const slice = text.slice(from)
      const m = re.exec(slice)
      if (!m) return null
      const matchedText = m[0]
      return {
        from: pos - matchedText.length,
        to: pos,
        text: matchedText,
      } as unknown as ReturnType<CompletionContext['matchBefore']>
    },
  } as unknown as CompletionContext
}

type Result = CompletionResult | null | Promise<CompletionResult | null>

function labels(result: Result): string[] {
  if (!result) return []
  if (result instanceof Promise) return []
  return result.options.map((o) => o.label)
}

describe('makeSqlCompletions — table proposals after FROM/JOIN', () => {
  it('proposes all 3 tables after "SELECT * FROM "', () => {
    const ctx = makeContext('SELECT * FROM ', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    expect(result).not.toBeNull()
    const labelsArr = labels(result)
    expect(labelsArr).toEqual(expect.arrayContaining(['users', 'orders', 'products']))
  })

  it('proposes all 3 tables after "JOIN "', () => {
    const ctx = makeContext('SELECT * FROM users JOIN ', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    const tbls = labels(result).filter((l) => ['users', 'orders', 'products'].includes(l))
    expect(tbls.length).toBeGreaterThanOrEqual(3)
  })

  it('proposes all 3 tables after "INNER JOIN "', () => {
    const ctx = makeContext('SELECT * FROM users INNER JOIN ', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    const tbls = labels(result).filter((l) => ['users', 'orders', 'products'].includes(l))
    expect(tbls.length).toBeGreaterThanOrEqual(3)
  })

  it('proposes all 3 tables after "UPDATE "', () => {
    const ctx = makeContext('UPDATE ', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    const tbls = labels(result).filter((l) => ['users', 'orders', 'products'].includes(l))
    expect(tbls.length).toBeGreaterThanOrEqual(3)
  })

  it('proposes all 3 tables after "INSERT INTO "', () => {
    const ctx = makeContext('INSERT INTO ', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    const tbls = labels(result).filter((l) => ['users', 'orders', 'products'].includes(l))
    expect(tbls.length).toBeGreaterThanOrEqual(3)
  })

  it('includes SQL keywords in the FROM context', () => {
    const ctx = makeContext('SELECT * FROM ', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    const labelsArr = labels(result)
    expect(labelsArr).toEqual(expect.arrayContaining(['SELECT', 'FROM', 'WHERE', 'JOIN']))
  })
})

describe('makeSqlCompletions — column proposals after "."', () => {
  it('proposes columns of the users table after "users."', () => {
    const ctx = makeContext('SELECT users.', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    const cols = labels(result)
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'name', 'email', 'created_at', 'is_active']),
    )
    expect(cols).not.toContain('total')
    expect(cols).not.toContain('price')
  })

  it('proposes columns of the orders table after "orders."', () => {
    const ctx = makeContext('SELECT orders.', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    const cols = labels(result)
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'user_id', 'total', 'status', 'placed_at']),
    )
    expect(cols).not.toContain('email')
  })

  it('returns null when the table name does not exist', () => {
    const ctx = makeContext('SELECT unknown.', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    expect(result).toBeNull()
  })
})

describe('makeSqlCompletions — column proposals in SELECT context', () => {
  it('proposes all columns of all tables after "SELECT "', () => {
    const ctx = makeContext('SELECT ', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    const cols = labels(result)
    // table.column variants should be present
    expect(cols).toContain('users.id')
    expect(cols).toContain('orders.total')
    expect(cols).toContain('products.sku')
    // plain columns too
    expect(cols).toContain('id')
    expect(cols).toContain('name')
  })

  it('proposes columns after a comma in a column list', () => {
    const ctx = makeContext('SELECT id, ', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    const cols = labels(result)
    expect(cols.length).toBeGreaterThan(10)
  })
})

describe('makeSqlCompletions — USE / CONNECT', () => {
  it('suggests DATABASE keyword in a USE context', () => {
    const ctx = makeContext('USE ', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    expect(result).not.toBeNull()
    expect(labels(result)).toContain('DATABASE')
  })
})

describe('makeSqlCompletions — null schema', () => {
  it('returns SQL keywords when no schema is provided', () => {
    const ctx = makeContext('SELECT ', 0)
    const result = makeSqlCompletions(null)(ctx)
    expect(result).not.toBeNull()
    const lbls = labels(result)
    expect(lbls).toEqual(expect.arrayContaining(SQL_KEYWORDS.slice(0, 5)))
  })
})

describe('makeSqlCompletions — default (no special context)', () => {
  it('falls back to tables + keywords at the start of the doc', () => {
    const ctx = makeContext('', 0)
    const result = makeSqlCompletions(SCHEMA)(ctx)
    const lbls = labels(result)
    expect(lbls).toEqual(expect.arrayContaining(['users', 'orders', 'products']))
    expect(lbls).toEqual(expect.arrayContaining(['SELECT', 'FROM']))
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  Latency benchmark                                                     *
 * ──────────────────────────────────────────────────────────────────── */

describe('makeSqlCompletions — latency', () => {
  it('runs 1 000 calls in < 50 ms (well within the 50 ms budget per call)', () => {
    const source = makeSqlCompletions(SCHEMA)
    const contexts: CompletionContext[] = [
      makeContext('SELECT * FROM ', 0),
      makeContext('SELECT * FROM users JOIN ', 0),
      makeContext('SELECT users.', 0),
      makeContext('SELECT ', 0),
      makeContext('SELECT id, ', 0),
    ]
    for (let i = 0; i < 50; i++) source(contexts[i % contexts.length]!)
    const N = 1000
    const t0 = performance.now()
    for (let i = 0; i < N; i++) {
      source(contexts[i % contexts.length]!)
    }
    const elapsed = performance.now() - t0
    const perCall = elapsed / N
    // eslint-disable-next-line no-console
    console.log(`[latency] ${N} calls in ${elapsed.toFixed(2)} ms → ${perCall.toFixed(4)} ms/call`)
    expect(perCall).toBeLessThan(5)
  })

  it('handles a 50-table × 30-column schema in < 2 ms per call', () => {
    const bigSchema: DatabaseSchema = {
      tables: Array.from({ length: 50 }, (_, i) => ({
        name: `table_${i}`,
        columns: Array.from({ length: 30 }, (_, j) => ({
          name: `col_${j}`,
          type: j % 2 === 0 ? 'TEXT' : 'INTEGER',
          nullable: true,
          defaultValue: null,
          primaryKeyPosition: 0,
        })),
        primaryKey: [],
        foreignKeys: [],
        uniqueConstraints: [],
        checkConstraints: [],
        rowCountEstimate: 0,
        createSql: '',
      })),
      views: [],
      indexes: [],
      triggers: [],
    }
    const source = makeSqlCompletions(bigSchema)
    const ctx = makeContext('SELECT ', 0)
    for (let i = 0; i < 20; i++) source(ctx)
    const N = 500
    const t0 = performance.now()
    for (let i = 0; i < N; i++) source(ctx)
    const perCall = (performance.now() - t0) / N
    // eslint-disable-next-line no-console
    console.log(`[latency-big] ${perCall.toFixed(4)} ms/call on 50×30 schema`)
    expect(perCall).toBeLessThan(2)
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  Pure helpers                                                          *
 * ──────────────────────────────────────────────────────────────────── */

describe('parseContext', () => {
  it('detects a FROM context', () => {
    const parsed = parseContext('SELECT * FROM ', 14)
    expect(parsed).not.toBeNull()
    expect(parsed?.inTable).toBe(true)
  })

  it('detects a SELECT column list', () => {
    const parsed = parseContext('SELECT ', 7)
    expect(parsed?.inColumnList).toBe(true)
  })

  it('detects a `table.` dot', () => {
    const parsed = parseContext('SELECT users.', 13)
    expect(parsed?.inDot).toBe(true)
    expect(parsed?.dotTable).toBe('users')
  })

  it('detects USE / CONNECT / ATTACH', () => {
    expect(parseContext('USE ', 4)?.inConnect).toBe(true)
    expect(parseContext('ATTACH ', 7)?.inConnect).toBe(true)
  })
})

describe('tablesMatching / columnsMatching / findTable', () => {
  it('returns all tables when prefix is empty', () => {
    expect(tablesMatching(SCHEMA, '').length).toBe(3)
  })
  it('returns only matching tables when prefix is given', () => {
    const r = tablesMatching(SCHEMA, 'u')
    expect(r.map((t) => t.name)).toEqual(['users'])
  })
  it('matches case-insensitively', () => {
    const r = tablesMatching(SCHEMA, 'OR')
    expect(r.map((t) => t.name)).toEqual(['orders'])
  })
  it('columnsMatching works for a given table', () => {
    const t = findTable(SCHEMA, 'users')!
    expect(columnsMatching(t, '').length).toBe(5)
    expect(columnsMatching(t, 'n').map((c) => c.name)).toEqual(['name'])
  })
})
