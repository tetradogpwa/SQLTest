/**
 * Unit tests for ErrorTranslator.
 *
 * Verifies the Spanish pedagogical translations of the common SQLite
 * error patterns, plus the Levenshtein-based "did-you-mean" suggestion
 * for typos in column / table names.
 */

import { describe, it, expect, beforeEach } from 'vitest'

import { ErrorTranslator, type SQLiteForErrors } from '../../src/workers/error-translator'
import { TIMEOUT_CONFIG } from '../../src/workers/timeout-controller'

describe('ErrorTranslator', () => {
  let translator: ErrorTranslator

  // No real SQLite — the translator only uses errmsg() as a fallback.
  const fakeSqlite: SQLiteForErrors = {
    errmsg: () => '',
  }

  beforeEach(() => {
    translator = new ErrorTranslator(fakeSqlite)
  })

  it('translates "no such column: usrname" and suggests "username"', () => {
    translator.setSchema(['users'], ['username', 'email', 'created_at'])
    const e = translator.translate(
      Object.assign(new Error('no such column: usrname'), { code: 1 }),
      /* db */ 1,
      'SELECT usrname FROM users',
    )
    expect(e.code).toBe('SQLITE_ERROR')
    expect(e.column).toBe('usrname')
    expect(e.translatedMessage).toContain('No existe la columna')
    expect(e.translatedMessage).toContain('username')
    expect(e.hints?.length ?? 0).toBeGreaterThan(0)
  })

  it('translates "no such column: foo" without suggestions when no known columns', () => {
    const e = translator.translate(
      Object.assign(new Error('no such column: foo'), { code: 1 }),
      1,
      'SELECT foo FROM bar',
    )
    expect(e.column).toBe('foo')
    expect(e.translatedMessage).toContain('No existe la columna')
    expect(e.translatedMessage).toContain('Comprueba el nombre')
    expect(e.translatedMessage).not.toContain('quisiste decir')
  })

  it('translates "no such table: usr" and suggests "user"', () => {
    translator.setSchema(['user', 'product', 'order'], ['id'])
    const e = translator.translate(
      Object.assign(new Error('no such table: usr'), { code: 1 }),
      1,
      'SELECT * FROM usr',
    )
    expect(e.table).toBe('usr')
    expect(e.translatedMessage).toContain('No existe la tabla')
    expect(e.translatedMessage).toContain('user')
  })

  it('translates "no such table: total" without suggestions when unknown', () => {
    translator.setSchema(['users'], [])
    const e = translator.translate(
      Object.assign(new Error('no such table: total'), { code: 1 }),
      1,
      'SELECT * FROM total',
    )
    expect(e.table).toBe('total')
    expect(e.translatedMessage).toBe('No existe la tabla `total`.')
  })

  it('translates "syntax error" and extracts the offending token', () => {
    const e = translator.translate(
      Object.assign(new Error('near "FROOM": syntax error'), { code: 1 }),
      1,
      'SELECT * FROOM users',
    )
    expect(e.translatedMessage).toContain('error de sintaxis')
    expect(e.translatedMessage).toContain('FROOM')
    expect(e.offendingToken).toBe('FROOM')
  })

  it('translates "database is locked"', () => {
    const e = translator.translate(
      Object.assign(new Error('database is locked'), { code: 6 }),
      1,
      'SELECT 1',
    )
    expect(e.code).toBe('SQLITE_LOCKED')
    expect(e.translatedMessage).toContain('siendo usada por otra operación')
  })

  it('translates SQLITE_INTERRUPT (rc=9) as a cancellation', () => {
    const e = translator.translate(
      Object.assign(new Error('interrupted'), { code: 9 }),
      1,
      'SELECT 1',
    )
    expect(e.code).toBe('SQLITE_INTERRUPT')
    expect(e.translatedMessage).toContain('cancelada')
  })

  it('translates SQLITE_BUSY (rc=5) as a transient error', () => {
    const e = translator.translate(
      Object.assign(new Error('database is busy'), { code: 5 }),
      1,
      'SELECT 1',
    )
    expect(e.code).toBe('SQLITE_BUSY')
    expect(e.translatedMessage).toContain('ocupada')
  })

  it('translates UNIQUE constraint failure with column hint', () => {
    const e = translator.translate(
      Object.assign(new Error('UNIQUE constraint failed: users.email'), { code: 19 }),
      1,
      'INSERT INTO users (email) VALUES ("dup@x.com")',
    )
    expect(e.code).toBe('SQLITE_CONSTRAINT')
    expect(e.translatedMessage).toContain('UNIQUE')
    expect(e.translatedMessage).toContain('email')
  })

  it('translates NOT NULL constraint failure', () => {
    const e = translator.translate(
      Object.assign(new Error('NOT NULL constraint failed: users.name'), { code: 19 }),
      1,
      'INSERT INTO users (name) VALUES (NULL)',
    )
    expect(e.translatedMessage).toContain('NULL')
    expect(e.column).toBe('name')
  })

  it('falls back to the original message for unknown patterns', () => {
    const e = translator.translate(
      Object.assign(new Error('some weird error'), { code: 999 }),
      1,
      'SELECT 1',
    )
    expect(e.code).toMatch(/^SQLITE_0x/)
    expect(e.translatedMessage).toContain('some weird error')
  })

  it('handles a SerializedError input as idempotent', () => {
    const alreadyTranslated = {
      code: 'SQLITE_ERROR',
      message: 'original',
      translatedMessage: 'ya traducido',
    }
    const e = translator.translate(alreadyTranslated, 1, 'SELECT 1')
    expect(e).toBe(alreadyTranslated)
  })

  it('prefers the live sqlite errmsg() over the thrown error message', () => {
    const withLiveErrmsg = new ErrorTranslator({
      errmsg: () => 'no such table: xyz',
    })
    withLiveErrmsg.setSchema(['xyzz'], [])
    const e = withLiveErrmsg.translate(
      Object.assign(new Error('placeholder'), { code: 1 }),
      1,
      'SELECT * FROM xyz',
    )
    expect(e.translatedMessage).toContain('No existe la tabla')
    // The translator picks the closest known table.
    expect(e.translatedMessage).toContain('xyzz')
  })
})

describe('TimeoutController — smkoke', () => {
  // We already test the registration flow in the dedicated test file;
  // here we sanity-check that TIMEOUT_CONFIG is sensible.
  it('exposes vmSteps=1000 (POC-2 verdict)', () => {
    expect(TIMEOUT_CONFIG.vmSteps).toBe(1000)
  })
  it('exposes a default 5 second cap', () => {
    expect(TIMEOUT_CONFIG.defaultMs).toBe(5_000)
  })
})
