/**
 * Unit tests for the StatementAnalyzer (RESEARCH §6.2-§6.4).
 *
 * The classifier is pure (no SQLite calls) so we test it without
 * spinning up a real database. The cases cover the spec's required
 * scenarios plus a few extra edge cases.
 */

import { describe, it, expect } from 'vitest'

import { analyze, analyzeOne, splitStatements, ratioToImpact } from '../../src/workers/statement-analyzer'

describe('splitStatements', () => {
  it('returns a single statement when there is no semicolon', () => {
    expect(splitStatements('SELECT 1')).toEqual(['SELECT 1'])
  })

  it('splits on semicolons and trims whitespace', () => {
    const sql = 'SELECT 1; SELECT 2;\n  SELECT 3   '
    expect(splitStatements(sql)).toEqual(['SELECT 1', 'SELECT 2', 'SELECT 3'])
  })

  it('does not split inside a string literal', () => {
    const sql = `INSERT INTO t (name) VALUES ('one; two'); SELECT 1`
    const parts = splitStatements(sql)
    expect(parts).toHaveLength(2)
    expect(parts[0]).toBe(`INSERT INTO t (name) VALUES ('one; two')`)
    expect(parts[1]).toBe('SELECT 1')
  })

  it('does not split inside line comments', () => {
    const sql = '-- a; b\nSELECT 1; SELECT 2'
    expect(splitStatements(sql)).toEqual(['-- a; b\nSELECT 1', 'SELECT 2'])
  })

  it('does not split inside block comments', () => {
    const sql = '/* a; b */ SELECT 1; SELECT 2'
    expect(splitStatements(sql)).toEqual(['/* a; b */ SELECT 1', 'SELECT 2'])
  })

  it('does not split inside BEGIN…END blocks (triggers)', () => {
    const sql = `CREATE TRIGGER t AFTER INSERT ON x BEGIN
      UPDATE y SET z = 1 WHERE id = NEW.id;
    END;
    SELECT 1`
    const parts = splitStatements(sql)
    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatch(/^CREATE TRIGGER/)
    expect(parts[1]).toBe('SELECT 1')
  })
})

describe('analyzeOne — RESEARCH §6.3 classification rules', () => {
  it('classifies SELECT as safe', () => {
    const a = analyzeOne('SELECT * FROM users')
    expect(a.kind).toBe('select')
    expect(a.risk).toBe('safe')
    expect(a.requiresCheckpoint).toBe(false)
    expect(a.objects).toContain('users')
  })

  it('classifies INSERT INTO as safe by default', () => {
    const a = analyzeOne(`INSERT INTO users (name) VALUES ('alice')`)
    expect(a.kind).toBe('insert')
    expect(a.risk).toBe('safe')
    expect(a.requiresCheckpoint).toBe(false)
  })

  it('classifies UPDATE without WHERE as destructive + checkpoint', () => {
    const a = analyzeOne('UPDATE users SET active = 1')
    expect(a.kind).toBe('update')
    expect(a.risk).toBe('destructive')
    expect(a.requiresCheckpoint).toBe(true)
    expect(a.warnings.length).toBeGreaterThan(0)
  })

  it('classifies UPDATE with WHERE as safe (caution if mass update estimated)', () => {
    const a = analyzeOne('UPDATE users SET active = 1 WHERE id = 5')
    expect(a.kind).toBe('update')
    expect(a.risk).toBe('safe')
    expect(a.requiresCheckpoint).toBe(false)
  })

  it('classifies DELETE without WHERE as destructive + checkpoint', () => {
    const a = analyzeOne('DELETE FROM users')
    expect(a.kind).toBe('delete')
    expect(a.risk).toBe('destructive')
    expect(a.requiresCheckpoint).toBe(true)
  })

  it('classifies DELETE with WHERE as safe', () => {
    const a = analyzeOne('DELETE FROM users WHERE id = 5')
    expect(a.kind).toBe('delete')
    expect(a.risk).toBe('safe')
    expect(a.requiresCheckpoint).toBe(false)
  })

  it('classifies DROP TABLE / VIEW / INDEX as destructive', () => {
    expect(analyzeOne('DROP TABLE users').risk).toBe('destructive')
    expect(analyzeOne('DROP VIEW v').risk).toBe('destructive')
    expect(analyzeOne('DROP INDEX idx_users_name').risk).toBe('destructive')
    expect(analyzeOne('DROP TABLE users').requiresCheckpoint).toBe(true)
  })

  it('classifies ALTER TABLE ... DROP COLUMN as destructive', () => {
    const a = analyzeOne('ALTER TABLE users DROP COLUMN email')
    expect(a.kind).toBe('alter')
    expect(a.risk).toBe('destructive')
    expect(a.requiresCheckpoint).toBe(true)
  })

  it('classifies CREATE TABLE as safe (non-destructive)', () => {
    const a = analyzeOne('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
    expect(a.kind).toBe('create')
    expect(a.risk).toBe('safe')
    expect(a.requiresCheckpoint).toBe(false)
  })

  it('classifies BEGIN / COMMIT / ROLLBACK as transaction', () => {
    expect(analyzeOne('BEGIN').kind).toBe('transaction')
    expect(analyzeOne('BEGIN TRANSACTION').kind).toBe('transaction')
    expect(analyzeOne('COMMIT').kind).toBe('transaction')
    expect(analyzeOne('ROLLBACK').kind).toBe('transaction')
  })

  it('classifies PRAGMA as pragma', () => {
    expect(analyzeOne('PRAGMA table_info(users)').kind).toBe('pragma')
  })

  it('classifies EXPLAIN as explain', () => {
    expect(analyzeOne('EXPLAIN QUERY PLAN SELECT * FROM t').kind).toBe('explain')
  })

  it('classifies REPLACE INTO as caution + checkpoint', () => {
    const a = analyzeOne('REPLACE INTO users (id, name) VALUES (1, "alice")')
    expect(a.kind).toBe('replace')
    expect(a.risk).toBe('caution')
    expect(a.requiresCheckpoint).toBe(true)
  })

  it('classifies VACUUM as vacuum', () => {
    expect(analyzeOne('VACUUM').kind).toBe('vacuum')
    expect(analyzeOne(`VACUUM INTO 'snap.db'`).kind).toBe('vacuum')
  })
})

describe('analyze — multi-statement', () => {
  it('returns one AnalyzedStatement per SQL statement', () => {
    const sql = 'SELECT 1; SELECT 2; SELECT 3'
    const a = analyze(sql)
    expect(a).toHaveLength(3)
    a.forEach((s) => expect(s.kind).toBe('select'))
  })

  it('mixes kinds correctly across statements', () => {
    const sql = `SELECT 1; UPDATE t SET x = 1; DROP TABLE t;`
    const a = analyze(sql)
    expect(a.map((s) => s.kind)).toEqual(['select', 'update', 'drop'])
    expect(a[2]!.risk).toBe('destructive')
  })

  it('returns an empty array for empty SQL', () => {
    expect(analyze('')).toEqual([])
    expect(analyze('   \n  ')).toEqual([])
  })
})

describe('ratioToImpact', () => {
  it('maps 0..0.1 to small', () => {
    expect(ratioToImpact(0)).toBe('small')
    expect(ratioToImpact(0.09)).toBe('small')
  })
  it('maps 0.1..0.5 to medium', () => {
    expect(ratioToImpact(0.1)).toBe('medium')
    expect(ratioToImpact(0.49)).toBe('medium')
  })
  it('maps >= 0.5 to large', () => {
    expect(ratioToImpact(0.5)).toBe('large')
    expect(ratioToImpact(1)).toBe('large')
  })
  it('returns medium for undefined', () => {
    expect(ratioToImpact(undefined)).toBe('medium')
  })
})
