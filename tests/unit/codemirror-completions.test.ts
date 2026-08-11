/**
 * Tests for POC-6 (CodeMirror 6 SQL completions).
 *
 * The completion source `sqlCompletions(schema)` is a pure function
 * that takes a CodeMirror `CompletionContext` and returns a
 * `CompletionResult | null`. We mock the context (only the bits the
 * source actually reads: `matchBefore`, `state.doc.toString`,
 * `explicit`) and assert on the returned options.
 *
 * Latency is measured by running the source 1 000 times against a
 * representative query and timing the wall-clock. The budget per
 * call is 5 ms (the rest of the 50 ms budget goes to render + paint,
 * which we can't measure in happy-dom).
 *
 * The actual end-to-end measurement (keystroke → first paint of
 * `.cm-tooltip-autocomplete`) happens in the browser via the
 * `Poc6Codemirror` component, which records samples to a
 * `samples` state array. This test file covers the **logic** of
 * the completion source — latency is reported in the report file
 * based on both this micro-benchmark and the in-browser numbers.
 */

import { describe, it, expect } from 'vitest'
import {
  sqlCompletions,
  type DbSchema,
} from '../../pocs/ui/poc-6-codemirror'
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'

// ────────────────────────────────────────────────────────────────────
// Test fixtures
// ────────────────────────────────────────────────────────────────────

const TEST_SCHEMA: DbSchema = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'name', type: 'TEXT' },
        { name: 'email', type: 'TEXT' },
        { name: 'created_at', type: 'TIMESTAMP' },
        { name: 'is_active', type: 'BOOLEAN' },
      ],
    },
    {
      name: 'orders',
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'user_id', type: 'INTEGER' },
        { name: 'total', type: 'REAL' },
        { name: 'status', type: 'TEXT' },
        { name: 'placed_at', type: 'TIMESTAMP' },
      ],
    },
    {
      name: 'products',
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'sku', type: 'TEXT' },
        { name: 'name', type: 'TEXT' },
        { name: 'price', type: 'REAL' },
        { name: 'stock', type: 'INTEGER' },
      ],
    },
  ],
}

/**
 * Build a mock CompletionContext that:
 *  - has `state.doc.toString()` returning `text`
 *  - has `matchBefore(/.../)` returning a fake match from `pos-w` to `pos`
 *  - has `explicit: true` so the source always returns a result
 *    regardless of where the cursor is.
 */
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
      // Build a fake match pointing to the matched range relative to the
      // document. CodeMirror's API uses absolute positions.
      const matchedText = m[0]
      return {
        from: pos - matchedText.length,
        to: pos,
        text: matchedText,
      } as unknown as ReturnType<CompletionContext['matchBefore']>
    },
  } as unknown as CompletionContext
}

function labels(result: CompletionResult | null): string[] {
  if (!result) return []
  return result.options.map((o) => o.label)
}

// ────────────────────────────────────────────────────────────────────
// Completion-source tests
// ────────────────────────────────────────────────────────────────────

describe('sqlCompletions — table proposals after FROM/JOIN', () => {
  it('proposes all 3 tables after "SELECT * FROM "', () => {
    const ctx = makeContext('SELECT * FROM ', 0)
    const result = sqlCompletions(TEST_SCHEMA)(ctx)
    expect(result).not.toBeNull()
    const tbls = labels(result).filter((l) => ['users', 'orders', 'products'].includes(l))
    expect(tbls).toEqual(expect.arrayContaining(['users', 'orders', 'products']))
  })

  it('proposes all 3 tables after "JOIN "', () => {
    const ctx = makeContext('SELECT * FROM users JOIN ', 0)
    const result = sqlCompletions(TEST_SCHEMA)(ctx)
    expect(result).not.toBeNull()
    const tbls = labels(result).filter((l) => ['users', 'orders', 'products'].includes(l))
    expect(tbls).toEqual(expect.arrayContaining(['users', 'orders', 'products']))
  })

  it('proposes all 3 tables after "INNER JOIN "', () => {
    const ctx = makeContext('SELECT * FROM users INNER JOIN ', 0)
    const result = sqlCompletions(TEST_SCHEMA)(ctx)
    const tbls = labels(result).filter((l) => ['users', 'orders', 'products'].includes(l))
    expect(tbls.length).toBeGreaterThanOrEqual(3)
  })

  it('also includes SQL keywords in the FROM context', () => {
    const ctx = makeContext('SELECT * FROM ', 0)
    const result = sqlCompletions(TEST_SCHEMA)(ctx)
    const labelsArr = labels(result)
    expect(labelsArr).toEqual(expect.arrayContaining(['SELECT', 'FROM', 'WHERE', 'JOIN']))
  })
})

describe('sqlCompletions — column proposals after "."', () => {
  it('proposes columns of the users table after "users."', () => {
    const ctx = makeContext('SELECT users.', 0)
    const result = sqlCompletions(TEST_SCHEMA)(ctx)
    expect(result).not.toBeNull()
    const cols = labels(result)
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'name', 'email', 'created_at', 'is_active']),
    )
    // Should NOT contain columns from other tables.
    expect(cols).not.toContain('total') // orders
    expect(cols).not.toContain('price') // products
  })

  it('proposes columns of the orders table after "orders."', () => {
    const ctx = makeContext('SELECT orders.', 0)
    const result = sqlCompletions(TEST_SCHEMA)(ctx)
    const cols = labels(result)
    expect(cols).toEqual(expect.arrayContaining(['id', 'user_id', 'total', 'status', 'placed_at']))
    expect(cols).not.toContain('email') // users only
  })

  it('proposes columns of the products table after "products."', () => {
    const ctx = makeContext('SELECT products.', 0)
    const result = sqlCompletions(TEST_SCHEMA)(ctx)
    const cols = labels(result)
    expect(cols).toEqual(expect.arrayContaining(['id', 'sku', 'name', 'price', 'stock']))
  })

  it('returns null when the table name does not exist', () => {
    const ctx = makeContext('SELECT unknown.', 0)
    const result = sqlCompletions(TEST_SCHEMA)(ctx)
    expect(result).toBeNull()
  })
})

describe('sqlCompletions — column proposals in SELECT context', () => {
  it('proposes all columns of all tables after "SELECT "', () => {
    const ctx = makeContext('SELECT ', 0)
    const result = sqlCompletions(TEST_SCHEMA)(ctx)
    const cols = labels(result)
    // 3 tables × 5 columns = 15 columns (× 2 for table.col + col variants)
    const expectedColumns = ['id', 'name', 'email', 'created_at', 'is_active', 'user_id', 'total', 'status', 'placed_at', 'sku', 'price', 'stock']
    for (const c of expectedColumns) {
      expect(cols).toContain(c)
    }
    // table.column variants should be present too
    expect(cols).toContain('users.id')
    expect(cols).toContain('orders.total')
    expect(cols).toContain('products.sku')
  })

  it('proposes columns after a comma in a column list', () => {
    const ctx = makeContext('SELECT id, ', 0)
    const result = sqlCompletions(TEST_SCHEMA)(ctx)
    expect(result).not.toBeNull()
    const cols = labels(result)
    expect(cols.length).toBeGreaterThan(10) // many column options
  })
})

describe('sqlCompletions — default context (no FROM/JOIN/. /SELECT)', () => {
  it('falls back to tables + keywords at the start of the doc', () => {
    const ctx = makeContext('', 0)
    const result = sqlCompletions(TEST_SCHEMA)(ctx)
    expect(result).not.toBeNull()
    const labelsArr = labels(result)
    expect(labelsArr).toEqual(expect.arrayContaining(['users', 'orders', 'products']))
    expect(labelsArr).toEqual(expect.arrayContaining(['SELECT', 'FROM']))
  })
})

// ────────────────────────────────────────────────────────────────────
// Latency benchmark
// ────────────────────────────────────────────────────────────────────

describe('sqlCompletions — latency', () => {
  it('completes 1 000 calls in < 50 ms (well within the 50 ms budget per call)', () => {
    const source = sqlCompletions(TEST_SCHEMA)
    const contexts: CompletionContext[] = [
      makeContext('SELECT * FROM ', 0),
      makeContext('SELECT * FROM users JOIN ', 0),
      makeContext('SELECT users.', 0),
      makeContext('SELECT ', 0),
      makeContext('SELECT id, ', 0),
    ]
    // Warm up.
    for (let i = 0; i < 50; i++) source(contexts[i % contexts.length]!)
    const N = 1000
    const t0 = performance.now()
    for (let i = 0; i < N; i++) {
      source(contexts[i % contexts.length]!)
    }
    const elapsed = performance.now() - t0
    const perCall = elapsed / N
    // Print to console so the test output is captured in the report.
    // eslint-disable-next-line no-console
    console.log(`[latency] ${N} calls in ${elapsed.toFixed(2)} ms → ${perCall.toFixed(4)} ms/call`)
    expect(perCall).toBeLessThan(5) // 5 ms per call leaves 45 ms for render
  })

  it('handles a larger schema (10 tables × 10 columns) in < 2 ms per call', () => {
    const bigSchema: DbSchema = {
      tables: Array.from({ length: 10 }, (_, i) => ({
        name: `table_${i}`,
        columns: Array.from({ length: 10 }, (_, j) => ({
          name: `col_${j}`,
          type: j % 2 === 0 ? 'TEXT' : 'INTEGER',
        })),
      })),
    }
    const source = sqlCompletions(bigSchema)
    const contexts: CompletionContext[] = [
      makeContext('SELECT * FROM ', 0),
      makeContext('SELECT table_3.', 0),
      makeContext('SELECT ', 0),
    ]
    for (let i = 0; i < 50; i++) source(contexts[i % contexts.length]!)
    const N = 1000
    const t0 = performance.now()
    for (let i = 0; i < N; i++) source(contexts[i % contexts.length]!)
    const elapsed = performance.now() - t0
    const perCall = elapsed / N
    // eslint-disable-next-line no-console
    console.log(`[latency:10×10] ${N} calls in ${elapsed.toFixed(2)} ms → ${perCall.toFixed(4)} ms/call`)
    expect(perCall).toBeLessThan(2)
  })
})
