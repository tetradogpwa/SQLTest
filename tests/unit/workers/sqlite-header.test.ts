/**
 * Tests for the import-side validation in the worker.
 *
 * The `import` flow rejects files that are not valid SQLite databases
 * with a specific `InvalidSqliteFileError` — we never reach wa-sqlite
 * with garbage bytes. These tests cover the header check + the
 * error type so the UI can show a clear message instead of
 * "sqlite3_open_v2".
 */
import { describe, expect, it } from 'vitest'

import {
  isValidSqliteFile,
  InvalidSqliteFileError,
} from '../../../src/workers/import-export-manager'

describe('isValidSqliteFile', () => {
  it('accepts a minimal valid SQLite header', () => {
    // `SQLite format 3\0` + 16-byte page size of 4096.
    const header = new Uint8Array([
      0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61,
      0x74, 0x20, 0x33, 0x00, 0x10, 0x00, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10,
    ])
    expect(isValidSqliteFile(header)).toBe(true)
  })

  it('accepts a full-size valid SQLite file (header + bytes)', () => {
    // Any 4 KB file starting with the magic header is valid as far
    // as the header check is concerned (wa-sqlite is the one that
    // does the full page check).
    const bytes = new Uint8Array(4096)
    const magic = 'SQLite format 3'
    for (let i = 0; i < magic.length; i += 1) {
      bytes[i] = magic.charCodeAt(i)
    }
    bytes[15] = 0
    expect(isValidSqliteFile(bytes)).toBe(true)
  })

  it('rejects an empty buffer', () => {
    expect(isValidSqliteFile(new Uint8Array(0))).toBe(false)
  })

  it('rejects a file shorter than 16 bytes', () => {
    expect(isValidSqliteFile(new Uint8Array([0x53, 0x51, 0x4c]))).toBe(false)
  })

  it('rejects a text file with the wrong magic', () => {
    const text = new TextEncoder().encode('Hello, world! This is not SQLite.')
    expect(isValidSqliteFile(text)).toBe(false)
  })

  it('rejects a JSON file', () => {
    const json = new TextEncoder().encode('{"name": "test", "value": 42}')
    expect(isValidSqliteFile(json)).toBe(false)
  })

  it('rejects a SQLite header that is one byte off', () => {
    const wrong = new TextEncoder().encode('SQLite format 4\x00extra')
    expect(isValidSqliteFile(wrong)).toBe(false)
  })

  it('is case-sensitive on the magic string', () => {
    const lower = new TextEncoder().encode('sqlite format 3\x00extra')
    expect(isValidSqliteFile(lower)).toBe(false)
  })
})

describe('InvalidSqliteFileError', () => {
  it('carries the filename + size for the UI', () => {
    const err = new InvalidSqliteFileError('user/d.db', 1234)
    expect(err.name).toBe('InvalidSqliteFileError')
    expect(err.filename).toBe('user/d.db')
    expect(err.sizeBytes).toBe(1234)
    expect(err.message).toMatch(/not a valid SQLite database/i)
  })
})
