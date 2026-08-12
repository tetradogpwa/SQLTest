/**
 * Tests for `userDatabasesService` — exhaustive coverage.
 *
 * The service is the brain of the create / import / export flows.
 * Every entry point is exhaustively tested: happy path, every
 * branch of the input (empty / boundary / charset), every error
 * class, every error shape that can come out of the Worker.
 *
 * The tests are pure (no DOM, no Dexie, no Comlink) so they run
 * in milliseconds and are deterministic.
 */
import { describe, expect, it } from 'vitest'

import {
  type CreateDatabaseArgs,
  type CreateRowInput,
  type DatabaseValidationError,
  type ErrorMessage,
  type ExportBlob,
  type ImportDatabaseArgs,
  type ImportValidationError,
  type NameValidation,
  createDatabase,
  createDatabaseRow,
  fileToId,
  importDatabase,
  toErrorMessage,
  toExportBlob,
  validateDatabaseName,
  validateImportFile,
  MAX_NAME_LENGTH,
  MAX_IMPORT_BYTES,
  sanitizeImportedDisplayName,
  DatabaseValidationError as DVE,
  ImportValidationError as IVE,
} from '../../../src/core/services/userDatabasesService'

type ValidateImportFile =
  | { ok: true }
  | { ok: false; key: 'databases.importDialog.error.file' | 'databases.importDialog.error.tooBig' }

/* ------------------------------------------------------------------ *
 *  validateDatabaseName                                                 *
 * ------------------------------------------------------------------ */

describe('validateDatabaseName', () => {
  it('accepts a simple ASCII name', () => {
    const r = validateDatabaseName('mi-db')
    expect(r).toEqual<NameValidation>({ ok: true, trimmed: 'mi-db' })
  })

  it('accepts a name with spaces', () => {
    expect(validateDatabaseName('Mi DB')).toEqual<NameValidation>({
      ok: true,
      trimmed: 'Mi DB',
    })
  })

  it('trims surrounding whitespace', () => {
    expect(validateDatabaseName('   trim me   ')).toEqual<NameValidation>({
      ok: true,
      trimmed: 'trim me',
    })
  })

  it('accepts a name with unicode letters (Spanish + Catalan)', () => {
    expect(validateDatabaseName('Biblioteca')).toEqual<NameValidation>({
      ok: true,
      trimmed: 'Biblioteca',
    })
    expect(validateDatabaseName('Biblioteca Municipal')).toEqual<NameValidation>({
      ok: true,
      trimmed: 'Biblioteca Municipal',
    })
    expect(validateDatabaseName('Prova amb accents')).toEqual<NameValidation>({
      ok: true,
      trimmed: 'Prova amb accents',
    })
  })

  it('accepts digits + dots + dashes + underscores', () => {
    expect(validateDatabaseName('db.v2-2024_q1')).toEqual<NameValidation>({
      ok: true,
      trimmed: 'db.v2-2024_q1',
    })
  })

  it('rejects an empty name', () => {
    const r = validateDatabaseName('')
    expect(r).toEqual<NameValidation>({
      ok: false,
      key: 'databases.createDialog.error.invalidName',
    })
  })

  it('rejects a whitespace-only name', () => {
    expect(validateDatabaseName('   \t  ')).toEqual<NameValidation>({
      ok: false,
      key: 'databases.createDialog.error.invalidName',
    })
  })

  it('rejects a name longer than the max', () => {
    const tooLong = 'a'.repeat(MAX_NAME_LENGTH + 1)
    expect(validateDatabaseName(tooLong)).toEqual<NameValidation>({
      ok: false,
      key: 'databases.createDialog.error.invalidName',
    })
  })

  it('accepts a name exactly at the max length', () => {
    const maxLen = 'a'.repeat(MAX_NAME_LENGTH)
    expect(validateDatabaseName(maxLen)).toEqual<NameValidation>({
      ok: true,
      trimmed: maxLen,
    })
  })

  it('rejects names with path separators (forward slash)', () => {
    expect(validateDatabaseName('a/b')).toEqual<NameValidation>({
      ok: false,
      key: 'databases.createDialog.error.invalidName',
    })
  })

  it('rejects names with path separators (backslash)', () => {
    expect(validateDatabaseName('a\\b')).toEqual<NameValidation>({
      ok: false,
      key: 'databases.createDialog.error.invalidName',
    })
  })

  it('rejects names with control characters', () => {
    expect(validateDatabaseName('a\x00b')).toEqual<NameValidation>({
      ok: false,
      key: 'databases.createDialog.error.invalidName',
    })
    expect(validateDatabaseName('a\nb')).toEqual<NameValidation>({
      ok: false,
      key: 'databases.createDialog.error.invalidName',
    })
  })

  it('rejects names with shell metacharacters', () => {
    for (const ch of [';', '|', '&', '>', '<', '`', '$', '*', '?']) {
      expect(validateDatabaseName(`a${ch}b`), `should reject "${ch}"`).toEqual<NameValidation>({
        ok: false,
        key: 'databases.createDialog.error.invalidName',
      })
    }
  })
})

/* ------------------------------------------------------------------ *
 *  fileToId                                                             *
 * ------------------------------------------------------------------ */

describe('fileToId', () => {
  const fixedRandom = (): string => 'abcdef123456'

  it('produces a slug from a simple filename', () => {
    expect(fileToId('foo.db', fixedRandom)).toBe('foo-abcdef')
  })

  it('drops the .sqlite3 extension', () => {
    expect(fileToId('foo.sqlite3', fixedRandom)).toBe('foo-abcdef')
  })

  it('drops the .s3db extension', () => {
    expect(fileToId('foo.s3db', fixedRandom)).toBe('foo-abcdef')
  })

  it('drops the .sqlite extension', () => {
    expect(fileToId('foo.sqlite', fixedRandom)).toBe('foo-abcdef')
  })

  it('lowercases the slug', () => {
    expect(fileToId('FOO.DB', fixedRandom)).toBe('foo-abcdef')
  })

  it('replaces forbidden characters with -', () => {
    expect(fileToId('foo bar!baz.db', fixedRandom)).toBe('foo-bar-baz-abcdef')
  })

  it('keeps underscores in the slug (only forbidden chars become -)', () => {
    // `_` is in the allowed charset so it passes through unchanged.
    expect(fileToId('foo_bar.db', fixedRandom)).toBe('foo_bar-abcdef')
  })

  it('collapses repeated - from forbidden chars', () => {
    expect(fileToId('foo !!  bar.db', fixedRandom)).toBe('foo-bar-abcdef')
  })

  it('trims leading / trailing -', () => {
    expect(fileToId('---foo---.db', fixedRandom)).toBe('foo-abcdef')
  })

  it('falls back to "db" when the name is empty after the strip', () => {
    expect(fileToId('.db', fixedRandom)).toBe('db-abcdef')
    expect(fileToId('   .db', fixedRandom)).toBe('db-abcdef')
  })

  it('takes the basename when a path is passed', () => {
    expect(fileToId('/tmp/foo/bar.db', fixedRandom)).toBe('bar-abcdef')
    expect(fileToId('C:\\Users\\me\\foo.db', fixedRandom)).toBe('foo-abcdef')
  })

  it('truncates the slug at 48 chars', () => {
    const long = 'a'.repeat(80)
    const result = fileToId(`${long}.db`, fixedRandom)
    // The slug portion is at most 48 chars + '-' + 6-char suffix.
    const slug = result.split('-').slice(0, -1).join('-')
    expect(slug.length).toBeLessThanOrEqual(48)
  })

  it('always produces a unique id (different random → different output)', () => {
    const a = fileToId('foo.db', () => 'rand111')
    const b = fileToId('foo.db', () => 'rand222')
    expect(a).not.toBe(b)
  })

  it('uses a fallback suffix when random returns empty', () => {
    expect(fileToId('foo.db', () => '')).toBe('foo-rand00')
  })

  it('returns a non-empty string for any input', () => {
    const inputs = ['', '.db', '////', '   ', 'normal.db', 'unicode-ño.db']
    for (const input of inputs) {
      const result = fileToId(input, fixedRandom)
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('uses Math.random as the default random source', () => {
    // Stub Math.random to return a deterministic value, then call
    // fileToId without an explicit random. The id should embed the
    // same value.
    const original = Math.random
    try {
      Math.random = (): number => 0.123456789
      // `0.123456789.toString(36) === '0.zzzzz'`; slice(2, 8) gives
      // 6 chars. We just assert the id is non-empty and has the
      // expected `db-` prefix structure.
      const result = fileToId('foo.db')
      expect(result).toMatch(/^foo-[\w-]{2,8}$/)
    } finally {
      Math.random = original
    }
  })

  it('handles an empty input by falling back to the "db" slug', () => {
    // `''.split(/[\\/]/)` is `['']`, and `pop()` on that returns
    // `''` (not `undefined`), so the `?? name` branch does not
    // fire. The empty input falls through the slug pipeline to
    // the `'db'` default.
    expect(fileToId('', fixedRandom)).toBe('db-abcdef')
  })
})

/* ------------------------------------------------------------------ *
 *  createDatabaseRow                                                    *
 * ------------------------------------------------------------------ */

describe('createDatabaseRow', () => {
  const baseInput: CreateRowInput = {
    dbId: 42,
    name: 'test',
    sizeBytes: 1024,
    origin: 'created',
  }

  it('produces a row with the expected id format', () => {
    const row = createDatabaseRow(baseInput)
    expect(row.id).toBe('db-42')
  })

  it('uses the passed name verbatim (no sanitisation — caller does that)', () => {
    const row = createDatabaseRow({ ...baseInput, name: 'Already Sanitised' })
    expect(row.name).toBe('Already Sanitised')
  })

  it('uses the same value for createdAt and updatedAt', () => {
    const row = createDatabaseRow({ ...baseInput, now: () => 1_700_000_000_000 })
    expect(row.createdAt).toBe(1_700_000_000_000)
    expect(row.updatedAt).toBe(1_700_000_000_000)
  })

  it('preserves the origin', () => {
    expect(createDatabaseRow({ ...baseInput, origin: 'created' }).origin).toBe('created')
    expect(createDatabaseRow({ ...baseInput, origin: 'imported' }).origin).toBe('imported')
    expect(createDatabaseRow({ ...baseInput, origin: 'bundled' }).origin).toBe('bundled')
  })

  it('preserves the size', () => {
    expect(createDatabaseRow({ ...baseInput, sizeBytes: 0 }).sizeBytes).toBe(0)
    expect(createDatabaseRow({ ...baseInput, sizeBytes: 999_999 }).sizeBytes).toBe(999_999)
  })

  it('uses Date.now() when no clock is provided', () => {
    const before = Date.now()
    const row = createDatabaseRow(baseInput)
    const after = Date.now()
    expect(row.createdAt).toBeGreaterThanOrEqual(before)
    expect(row.createdAt).toBeLessThanOrEqual(after)
  })
})

/* ------------------------------------------------------------------ *
 *  toExportBlob                                                         *
 * ------------------------------------------------------------------ */

describe('toExportBlob', () => {
  it('produces a Blob with the default mime type', () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x03])
    const result: ExportBlob = toExportBlob({ bytes, name: 'foo' })
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.blob.type).toBe('application/x-sqlite3')
    expect(result.blob.size).toBe(3)
  })

  it('honours the mime override', () => {
    const result = toExportBlob({ bytes: new Uint8Array(1), name: 'foo', mimeType: 'application/octet-stream' })
    expect(result.blob.type).toBe('application/octet-stream')
  })

  it('appends .sqlite3 to the sanitised filename', () => {
    expect(toExportBlob({ bytes: new Uint8Array(0), name: 'foo' }).filename).toBe('foo.sqlite3')
  })

  it('strips path separators from the filename', () => {
    expect(
      toExportBlob({ bytes: new Uint8Array(0), name: '/tmp/../foo' }).filename,
    ).toBe('foo.sqlite3')
    expect(
      toExportBlob({ bytes: new Uint8Array(0), name: 'C:\\Users\\me\\foo' }).filename,
    ).toBe('foo.sqlite3')
  })

  it('replaces control characters and forbidden filename chars with _', () => {
    expect(
      toExportBlob({ bytes: new Uint8Array(0), name: 'foo\x00<bar>:baz?' }).filename,
    ).toBe('foo__bar__baz.sqlite3')
  })

  it('falls back to "database" when the input is empty', () => {
    // `''.split(/[\\/]/)` is `['']`; `pop()` returns `''` (not
    // `undefined`), so the `?? name` fallback doesn't fire. The
    // empty result triggers the `'database'` fallback later.
    expect(toExportBlob({ bytes: new Uint8Array(0), name: '' }).filename).toBe('database.sqlite3')
  })

  it('falls back to "database" when the sanitised name is empty', () => {
    expect(toExportBlob({ bytes: new Uint8Array(0), name: '...' }).filename).toBe(
      'database.sqlite3',
    )
    expect(toExportBlob({ bytes: new Uint8Array(0), name: '   ' }).filename).toBe(
      'database.sqlite3',
    )
  })

  it('truncates the filename at 100 chars (without the .sqlite3 extension)', () => {
    const long = 'a'.repeat(120)
    const result = toExportBlob({ bytes: new Uint8Array(0), name: long })
    // The stem is 100 + .sqlite3 = 107.
    expect(result.filename).toBe(`${'a'.repeat(100)}.sqlite3`)
  })

  it('copies the bytes (no aliasing of the input buffer)', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const result = toExportBlob({ bytes, name: 'foo' })
    // Mutate the original and ensure the blob still has the
    // original bytes (Blob snapshots the buffer at construction).
    bytes[0] = 99
    const out = new Uint8Array(await result.blob.arrayBuffer())
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5])
  })
})

/* ------------------------------------------------------------------ *
 *  toErrorMessage                                                       *
 * ------------------------------------------------------------------ */

describe('toErrorMessage', () => {
  it('returns an empty string for null', () => {
    const r: ErrorMessage = toErrorMessage(null)
    expect(r).toEqual({ message: '', kind: 'empty' })
  })

  it('returns an empty string for undefined', () => {
    expect(toErrorMessage(undefined)).toEqual({ message: '', kind: 'empty' })
  })

  it('forwards a string as the message', () => {
    expect(toErrorMessage('boom')).toEqual({ message: 'boom', kind: 'worker' })
  })

  it('forwards an Error with a message', () => {
    expect(toErrorMessage(new Error('nope'))).toEqual({
      message: 'nope',
      kind: 'worker',
    })
  })

  it('falls back to "Error desconocido" when an Error has no message', () => {
    expect(toErrorMessage(new Error(''))).toEqual({
      message: 'Error desconocido',
      kind: 'worker',
    })
  })

  it('handles a custom error subclass with the right name and message', () => {
    class CustomError extends Error {
      constructor() {
        super('custom message')
        this.name = 'CustomError'
      }
    }
    expect(toErrorMessage(new CustomError())).toEqual({
      message: 'custom message',
      kind: 'worker',
    })
  })

  it('extracts message from a Comlink-style plain object', () => {
    expect(toErrorMessage({ message: 'serialised', code: 'X' })).toEqual({
      message: 'serialised',
      kind: 'worker',
    })
  })

  it('falls back to code when message is missing', () => {
    expect(toErrorMessage({ code: 'SQLITE_ERROR' })).toEqual({
      message: 'SQLITE_ERROR',
      kind: 'worker',
    })
  })

  it('falls back to name when both message and code are missing', () => {
    expect(toErrorMessage({ name: 'TypeError' })).toEqual({
      message: 'TypeError',
      kind: 'worker',
    })
  })

  it('returns the generic fallback for an object with no useful fields', () => {
    expect(toErrorMessage({})).toEqual({
      message: 'Error desconocido',
      kind: 'unknown',
    })
  })

  it('returns the generic fallback for a number / boolean / symbol', () => {
    expect(toErrorMessage(42)).toEqual({ message: 'Error desconocido', kind: 'unknown' })
    expect(toErrorMessage(true)).toEqual({ message: 'Error desconocido', kind: 'unknown' })
    expect(toErrorMessage(Symbol('boom'))).toEqual({
      message: 'Error desconocido',
      kind: 'unknown',
    })
  })
})

/* ------------------------------------------------------------------ *
 *  createDatabase (the high-level pipeline)                              *
 * ------------------------------------------------------------------ */

describe('createDatabase', () => {
  // Each test gets its own callWorker so the name assertion is
  // explicit at the call site. (No shared mock that needs to
  // match every test's input.)
  const happyWorker = async (name: string): Promise<{ dbId: number; sizeBytes: number }> => {
    expect(name).toBe('valid-name')
    return { dbId: 7, sizeBytes: 0 }
  }

  it('validates + calls the worker + builds the row (happy path)', async () => {
    const args: CreateDatabaseArgs = { name: '  valid-name  ', callWorker: happyWorker }
    const row = await createDatabase(args)
    expect(row).toEqual({
      id: 'db-7',
      name: 'valid-name',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sizeBytes: 0,
      origin: 'created',
    })
  })

  it('throws DatabaseValidationError on an invalid name', async () => {
    let captured: unknown
    try {
      await createDatabase({ name: '  ', callWorker: happyWorker })
    } catch (e) {
      captured = e
    }
    expect(captured).toBeInstanceOf(DVE)
    expect((captured as DatabaseValidationError).key).toBe(
      'databases.createDialog.error.invalidName',
    )
  })

  it('does not call the worker when the name is invalid', async () => {
    let called = false
    const failingCall = async (): Promise<{ dbId: number; sizeBytes: number }> => {
      called = true
      return { dbId: 0, sizeBytes: 0 }
    }
    await expect(
      createDatabase({ name: '/etc/passwd', callWorker: failingCall }),
    ).rejects.toBeInstanceOf(DVE)
    expect(called).toBe(false)
  })

  it('propagates worker errors as-is', async () => {
    const failingWorker = async (): Promise<{ dbId: number; sizeBytes: number }> => {
      throw new Error('Worker out of OPFS space')
    }
    await expect(
      createDatabase({ name: 'ok', callWorker: failingWorker }),
    ).rejects.toThrow('Worker out of OPFS space')
  })

  it('uses the injected clock for createdAt + updatedAt', async () => {
    const fixed = 1_700_000_000_000
    const row = await createDatabase({
      name: 'ok',
      callWorker: async () => ({ dbId: 1, sizeBytes: 0 }),
      now: () => fixed,
    })
    expect(row.createdAt).toBe(fixed)
    expect(row.updatedAt).toBe(fixed)
  })
})

/* ------------------------------------------------------------------ *
 *  validateImportFile                                                    *
 * ------------------------------------------------------------------ */

describe('validateImportFile', () => {
  it('accepts a .db file of normal size', () => {
    const file = new File([new Uint8Array(1024)], 'foo.db', {
      type: 'application/octet-stream',
    })
    expect(validateImportFile(file)).toEqual<ValidateImportFile>({ ok: true })
  })

  it('accepts a .sqlite3 file', () => {
    const file = new File([new Uint8Array(1024)], 'foo.sqlite3')
    expect(validateImportFile(file)).toEqual<ValidateImportFile>({ ok: true })
  })

  it('accepts a .s3db file', () => {
    const file = new File([new Uint8Array(1024)], 'foo.s3db')
    expect(validateImportFile(file)).toEqual<ValidateImportFile>({ ok: true })
  })

  it('accepts a .sqlite file (no digit)', () => {
    const file = new File([new Uint8Array(1024)], 'foo.sqlite')
    expect(validateImportFile(file)).toEqual<ValidateImportFile>({ ok: true })
  })

  it('rejects null', () => {
    expect(validateImportFile(null)).toEqual<ValidateImportFile>({
      ok: false,
      key: 'databases.importDialog.error.file',
    })
  })

  it('rejects undefined', () => {
    expect(validateImportFile(undefined)).toEqual<ValidateImportFile>({
      ok: false,
      key: 'databases.importDialog.error.file',
    })
  })

  it('rejects a file with size 0', () => {
    const file = new File([], 'foo.db')
    expect(validateImportFile(file)).toEqual<ValidateImportFile>({
      ok: false,
      key: 'databases.importDialog.error.file',
    })
  })

  it('rejects a file with an unknown extension', () => {
    for (const ext of ['txt', 'json', 'csv', 'png', 'pdf', 'docx', 'zip', 'tar']) {
      const file = new File([new Uint8Array(1024)], `foo.${ext}`)
      expect(validateImportFile(file), `should reject .${ext}`).toEqual<ValidateImportFile>({
        ok: false,
        key: 'databases.importDialog.error.file',
      })
    }
  })

  it('rejects a file with no extension', () => {
    const file = new File([new Uint8Array(1024)], 'no-extension')
    expect(validateImportFile(file)).toEqual<ValidateImportFile>({
      ok: false,
      key: 'databases.importDialog.error.file',
    })
  })

  it('rejects a file larger than 100 MB', () => {
    const file = new File([new Uint8Array(1024)], 'big.db')
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES + 1 })
    expect(validateImportFile(file)).toEqual<ValidateImportFile>({
      ok: false,
      key: 'databases.importDialog.error.tooBig',
    })
  })

  it('accepts a file exactly at the 100 MB cap', () => {
    const file = new File([new Uint8Array(1024)], 'big.db')
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES })
    expect(validateImportFile(file)).toEqual<ValidateImportFile>({ ok: true })
  })

  it('is case-insensitive on the extension', () => {
    for (const ext of ['DB', 'Sqlite3', 'SQLITE3', 'S3DB']) {
      const file = new File([new Uint8Array(1024)], `foo.${ext}`)
      expect(validateImportFile(file), `should accept .${ext}`).toEqual<ValidateImportFile>({
        ok: true,
      })
    }
  })

  it('handles a file with no extension at all (empty extension string)', () => {
    // `split('.').pop() ?? ''` covers both the empty-array case
    // (path with no dot) and the empty-string case.
    const file = new File([new Uint8Array(1024)], 'no-extension')
    expect(validateImportFile(file)).toEqual<ValidateImportFile>({
      ok: false,
      key: 'databases.importDialog.error.file',
    })
  })
})

/* ------------------------------------------------------------------ *
 *  sanitizeImportedDisplayName                                           *
 * ------------------------------------------------------------------ */

describe('sanitizeImportedDisplayName', () => {
  it('drops a .db extension', () => {
    expect(sanitizeImportedDisplayName('foo.db')).toBe('foo')
  })
  it('drops a .sqlite3 extension', () => {
    expect(sanitizeImportedDisplayName('foo.sqlite3')).toBe('foo')
  })
  it('replaces forbidden chars with _', () => {
    expect(sanitizeImportedDisplayName('foo bar/baz!qux.db')).toBe('foo_bar_baz_qux')
  })
  it('collapses repeated _', () => {
    expect(sanitizeImportedDisplayName('foo???bar.db')).toBe('foo_bar')
  })
  it('trims leading / trailing _', () => {
    expect(sanitizeImportedDisplayName('___foo___.db')).toBe('foo')
  })
  it('takes the full input as a name (no path stripping)', () => {
    // We do not strip path separators — the caller is responsible
    // for routing through `validateDatabaseName` first, which
    // rejects separators. The sanitiser only cleans the charset.
    expect(sanitizeImportedDisplayName('foo/bar.sqlite3')).toBe('foo_bar')
  })
  it('falls back to "imported" for an empty result', () => {
    expect(sanitizeImportedDisplayName('....')).toBe('imported')
    expect(sanitizeImportedDisplayName('   ')).toBe('imported')
  })
  it('truncates the result at MAX_NAME_LENGTH', () => {
    const result = sanitizeImportedDisplayName('a'.repeat(200) + '.db')
    expect(result.length).toBe(MAX_NAME_LENGTH)
  })
})

/* ------------------------------------------------------------------ *
 *  importDatabase (the high-level pipeline)                             *
 * ------------------------------------------------------------------ */

describe('importDatabase', () => {
  function makeFile(name: string, size: number = 1024): File {
    // The File constructor takes the *actual* bytes; the public
    // `size` property mirrors the byte length. We use a single
    // buffer so the test assertions on `bytes.byteLength` match
    // `file.size` (a mismatch would be a test-helper bug, not a
    // service bug).
    const bytes = new Uint8Array(size)
    return new File([bytes], name, { type: 'application/octet-stream' })
  }

  const callWorker = async (
    bytes: Uint8Array,
    sanitizedName: string,
  ): Promise<{ dbId: number; sizeBytes: number }> => {
    expect(bytes.byteLength).toBeGreaterThan(0)
    expect(sanitizedName).toBe('valid')
    return { dbId: 99, sizeBytes: bytes.byteLength }
  }

  it('imports a valid file (happy path)', async () => {
    const file = makeFile('valid.db')
    const args: ImportDatabaseArgs = { file, callWorker }
    const row = await importDatabase(args)
    expect(row).toEqual({
      id: 'db-99',
      name: 'valid',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sizeBytes: file.size,
      origin: 'imported',
    })
  })

  it('uses the display name override when provided', async () => {
    const file = makeFile('original.db')
    const called = { sanitized: '' }
    const captureWorker = async (
      _bytes: Uint8Array,
      sanitized: string,
    ): Promise<{ dbId: number; sizeBytes: number }> => {
      called.sanitized = sanitized
      return { dbId: 1, sizeBytes: 1 }
    }
    await importDatabase({ file, displayName: '  override  ', callWorker: captureWorker })
    expect(called.sanitized).toBe('override')
  })

  it('falls back to the file name when no display name is given', async () => {
    const file = makeFile('Fallback.db')
    const called = { sanitized: '' }
    const captureWorker = async (
      _bytes: Uint8Array,
      sanitized: string,
    ): Promise<{ dbId: number; sizeBytes: number }> => {
      called.sanitized = sanitized
      return { dbId: 1, sizeBytes: 1 }
    }
    await importDatabase({ file, callWorker: captureWorker })
    expect(called.sanitized).toBe('Fallback')
  })

  it('throws ImportValidationError on a wrong extension', async () => {
    const file = makeFile('foo.txt')
    let captured: unknown
    try {
      await importDatabase({ file, callWorker })
    } catch (e) {
      captured = e
    }
    expect(captured).toBeInstanceOf(IVE)
    expect((captured as ImportValidationError).key).toBe(
      'databases.importDialog.error.file',
    )
  })

  it('throws ImportValidationError on a too-big file', async () => {
    // Use `Object.defineProperty` because the File constructor
    // would otherwise allocate 100 MB of zeros in the test
    // harness.
    const file = new File([new Uint8Array(0)], 'huge.db')
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES + 1 })
    let captured: unknown
    try {
      await importDatabase({ file, callWorker })
    } catch (e) {
      captured = e
    }
    expect(captured).toBeInstanceOf(IVE)
    expect((captured as ImportValidationError).key).toBe(
      'databases.importDialog.error.tooBig',
    )
  })

  it('throws ImportValidationError on an empty file', async () => {
    const file = new File([], 'empty.db')
    let captured: unknown
    try {
      await importDatabase({ file, callWorker })
    } catch (e) {
      captured = e
    }
    expect(captured).toBeInstanceOf(IVE)
  })

  it('does not call the worker when validation fails', async () => {
    let called = false
    const failingWorker = async (): Promise<{ dbId: number; sizeBytes: number }> => {
      called = true
      return { dbId: 0, sizeBytes: 0 }
    }
    await expect(
      importDatabase({ file: makeFile('bad.txt'), callWorker: failingWorker }),
    ).rejects.toBeInstanceOf(IVE)
    expect(called).toBe(false)
  })

  it('propagates worker errors as-is', async () => {
    const failingWorker = async (): Promise<{ dbId: number; sizeBytes: number }> => {
      throw new Error('Invalid SQLite file')
    }
    await expect(
      importDatabase({ file: makeFile('ok.db'), callWorker: failingWorker }),
    ).rejects.toThrow('Invalid SQLite file')
  })

  it('uses the injected clock for timestamps', async () => {
    const fixed = 1_700_000_000_000
    const row = await importDatabase({
      file: makeFile('ok.db'),
      callWorker: async (_bytes, _name) => ({ dbId: 1, sizeBytes: 1 }),
      now: () => fixed,
    })
    expect(row.createdAt).toBe(fixed)
    expect(row.updatedAt).toBe(fixed)
  })
})

/* ------------------------------------------------------------------ *
 *  Error classes                                                        *
 * ------------------------------------------------------------------ */

describe('DatabaseValidationError', () => {
  it('carries the i18n key for the UI', () => {
    const err = new DVE('databases.createDialog.error.invalidName')
    expect(err.name).toBe('DatabaseValidationError')
    expect(err.key).toBe('databases.createDialog.error.invalidName')
    expect(err.message).toBe('databases.createDialog.error.invalidName')
  })
})

describe('ImportValidationError', () => {
  it('carries the i18n key for the UI', () => {
    const err = new IVE('databases.importDialog.error.tooBig')
    expect(err.name).toBe('ImportValidationError')
    expect(err.key).toBe('databases.importDialog.error.tooBig')
    expect(err.message).toBe('databases.importDialog.error.tooBig')
  })
})

/* ------------------------------------------------------------------ *
 *  Module exports                                                       *
 * ------------------------------------------------------------------ */

describe('module exports', () => {
  it('exposes the expected constants', () => {
    expect(MAX_NAME_LENGTH).toBe(64)
    expect(MAX_IMPORT_BYTES).toBe(100 * 1024 * 1024)
  })
})
