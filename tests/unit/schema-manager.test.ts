/**
 * SchemaManager tests — verify that `introspect(dbId)` returns a
 * faithful representation of the live database, and that the TTL
 * cache + `invalidate()` work as documented.
 *
 * The test backend is a real wa-sqlite instance with a `MemoryVFS`.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

import { SchemaManager } from '../../src/workers/schema-manager'
import { DatabaseManager } from '../../src/workers/database-manager'
import { loadHarness, makeDb, type Harness } from '../helpers/wa-sqlite-harness'

const DB_ID = 1
const DB_FILENAME = 'test.db'

describe('SchemaManager — introspection', () => {
  let harness: Harness
  let dbs: DatabaseManager
  let schema: SchemaManager
  let now: () => number
  let nowValue: number

  beforeAll(async () => {
    harness = await loadHarness()
  }, 60_000)

  beforeEach(() => {
    harness.reset()
    nowValue = 1_000_000
    now = () => nowValue
    dbs = new DatabaseManager(harness.sqlite3)
    dbs.configure({ vfsName: harness.vfs.name, capability: 'memory' })
    schema = new SchemaManager({
      dbs,
      sqlite3: harness.sqlite3,
      config: { ttlMs: 5_000, now },
    })
  })

  it('introspects a single table with column types, PK and defaults', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE users (
         id INTEGER PRIMARY KEY,
         name TEXT NOT NULL,
         email TEXT UNIQUE,
         age INTEGER DEFAULT 0
       );`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')

    const result = await schema.introspect(DB_ID)
    expect(result.tables).toHaveLength(1)
    const t = result.tables[0]!
    expect(t.name).toBe('users')
    expect(t.primaryKey).toEqual(['id'])
    expect(t.rowCountEstimate).toBe(0)
    expect(t.createSql).toMatch(/CREATE TABLE users/)
    expect(t.columns).toHaveLength(4)
    const id = t.columns.find((c) => c.name === 'id')!
    expect(id.type).toBe('INTEGER')
    expect(id.primaryKeyPosition).toBe(1)
    expect(id.nullable).toBe(false)
    const name = t.columns.find((c) => c.name === 'name')!
    expect(name.nullable).toBe(false)
    const email = t.columns.find((c) => c.name === 'email')!
    expect(email.nullable).toBe(true)
    const age = t.columns.find((c) => c.name === 'age')!
    expect(age.defaultValue).toBe('0')

    // UNIQUE on email — parsed out of the CREATE statement.
    expect(t.uniqueConstraints).toEqual([['email']])

    await harness.close(db)
  }, 30_000)

  it('extracts UNIQUE and CHECK constraints from a complex CREATE TABLE', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE products (
         id INTEGER PRIMARY KEY,
         sku TEXT,
         price INTEGER,
         quantity INTEGER,
         UNIQUE(sku),
         CONSTRAINT price_positive CHECK (price > 0),
         CHECK (quantity >= 0)
       );`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')

    const result = await schema.introspect(DB_ID)
    const t = result.tables[0]!
    expect(t.uniqueConstraints).toEqual([['sku']])
    expect(t.checkConstraints).toEqual(['price > 0', 'quantity >= 0'])

    await harness.close(db)
  }, 30_000)

  it('returns the row count from sqlite_stat1 when present, COUNT(*) otherwise', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER);
       INSERT INTO t(x) VALUES (1),(2),(3),(4),(5);
       ANALYZE;`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')

    const result = await schema.introspect(DB_ID)
    expect(result.tables).toHaveLength(1)
    expect(result.tables[0]!.rowCountEstimate).toBe(5)

    await harness.close(db)
  }, 30_000)

  it('introspects foreign keys (including on_update / on_delete actions)', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);
       CREATE TABLE books (
         id INTEGER PRIMARY KEY,
         author_id INTEGER REFERENCES authors(id) ON DELETE CASCADE ON UPDATE SET NULL
       );`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')

    const result = await schema.introspect(DB_ID)
    const books = result.tables.find((t) => t.name === 'books')!
    expect(books.foreignKeys).toEqual([
      {
        from: 'author_id',
        table: 'authors',
        to: 'id',
        onUpdate: 'SET NULL',
        onDelete: 'CASCADE',
      },
    ])

    await harness.close(db)
  }, 30_000)

  it('introspects views, indexes, and triggers', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER, y INTEGER);
       CREATE VIEW v_t AS SELECT x FROM t;
       CREATE INDEX idx_x ON t(x);
       CREATE UNIQUE INDEX idx_y ON t(y);
       CREATE TRIGGER trg_t AFTER INSERT ON t BEGIN SELECT 1; END;`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')

    const result = await schema.introspect(DB_ID)
    expect(result.views.map((v) => v.name)).toEqual(['v_t'])
    expect(result.indexes.map((i) => i.name).sort()).toEqual(['idx_x', 'idx_y'])
    const idxX = result.indexes.find((i) => i.name === 'idx_x')!
    expect(idxX.table).toBe('t')
    expect(idxX.columns).toEqual(['x'])
    expect(idxX.unique).toBe(false)
    const idxY = result.indexes.find((i) => i.name === 'idx_y')!
    expect(idxY.unique).toBe(true)
    expect(result.triggers).toHaveLength(1)
    expect(result.triggers[0]!.name).toBe('trg_t')
    expect(result.triggers[0]!.table).toBe('t')

    await harness.close(db)
  }, 30_000)

  it('skips internal sqlite_* objects (sqlite_sequence, etc.)', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER PRIMARY KEY AUTOINCREMENT, y INTEGER);
       INSERT INTO t(y) VALUES (1);`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')

    // sqlite_sequence is auto-created by AUTOINCREMENT.
    const result = await schema.introspect(DB_ID)
    expect(result.tables.map((t) => t.name)).toEqual(['t'])
    expect(result.views).toEqual([])
    expect(result.indexes).toEqual([])
    expect(result.triggers).toEqual([])

    await harness.close(db)
  }, 30_000)

  it('caches the result and reuses it on subsequent calls within the TTL', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER);`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')

    const first = await schema.introspect(DB_ID)
    // Drop the table out-of-band (without invalidating the cache).
    await harness.sqlite3.exec(db, `DROP TABLE t;`)
    // Within the TTL, the cached result is returned unchanged.
    const second = await schema.introspect(DB_ID)
    expect(second).toEqual(first)
    expect(second.tables).toHaveLength(1)

    // After the TTL, the cache is refreshed and the new state is reported.
    nowValue += 6_000
    const third = await schema.introspect(DB_ID)
    expect(third.tables).toHaveLength(0)

    await harness.close(db)
  }, 30_000)

  it('invalidate() drops the cache entry and forces a fresh walk', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER);`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')

    await schema.introspect(DB_ID)
    await harness.sqlite3.exec(db, `CREATE TABLE u(x INTEGER);`)
    // Cached version: only `t`.
    expect((await schema.introspect(DB_ID)).tables.map((t) => t.name)).toEqual(['t'])
    // After invalidate, the new table is visible.
    schema.invalidate(DB_ID)
    expect((await schema.introspect(DB_ID)).tables.map((t) => t.name).sort()).toEqual(['t', 'u'])

    await harness.close(db)
  }, 30_000)
})
