/**
 * Tests for `modalLogic` — exhaustive coverage of every decision
 * the modals make about user input.
 */
import { describe, expect, it } from 'vitest'

import {
  type CreateSubmit,
  type DatabaseSubmit,
  type DeleteSubmit,
  type ImportSubmit,
  type RenameSubmit,
  deriveImportDisplayName,
  shouldAutoFillDisplayName,
  validateSubmit,
} from '../../../src/core/services/modalLogic'

function makeFile(name: string, size: number = 1024): File {
  return new File([new Uint8Array(size)], name, { type: 'application/octet-stream' })
}

/* ------------------------------------------------------------------ *
 *  deriveImportDisplayName                                               *
 * ------------------------------------------------------------------ */

describe('deriveImportDisplayName', () => {
  it('uses the override when it is non-empty', () => {
    expect(
      deriveImportDisplayName({ file: makeFile('foo.db'), override: 'bar' }),
    ).toBe('bar')
  })

  it('uses the override when it has surrounding whitespace (the override is preserved verbatim)', () => {
    // The dialog renders the override verbatim — trimming is a
    // separate step that happens in the worker. We do not pre-trim
    // here.
    expect(
      deriveImportDisplayName({ file: makeFile('foo.db'), override: '  bar  ' }),
    ).toBe('  bar  ')
  })

  it('falls back to the file name when the override is empty', () => {
    expect(
      deriveImportDisplayName({ file: makeFile('foo.db'), override: '' }),
    ).toBe('foo')
  })

  it('falls back to the file name when the override is whitespace only', () => {
    expect(
      deriveImportDisplayName({ file: makeFile('foo.db'), override: '   ' }),
    ).toBe('foo')
  })

  it('strips a .sqlite3 extension from the file name', () => {
    expect(
      deriveImportDisplayName({ file: makeFile('foo.sqlite3'), override: '' }),
    ).toBe('foo')
  })

  it('strips a .db extension from the file name', () => {
    expect(
      deriveImportDisplayName({ file: makeFile('library.db'), override: '' }),
    ).toBe('library')
  })

  it('does not strip a non-SQLite extension (treats the last dot as part of the name)', () => {
    // The service only strips the SQLite extensions; everything
    // else passes through (after sanitisation). The dialog uses
    // the result as the *display* name — the worker re-validates
    // it on submit.
    expect(
      deriveImportDisplayName({ file: makeFile('my.backup.db'), override: '' }),
    ).toBe('my.backup')
  })

  it('is deterministic (same input → same output)', () => {
    const input = { file: makeFile('foo.db'), override: '' }
    expect(deriveImportDisplayName(input)).toBe(deriveImportDisplayName(input))
  })
})

/* ------------------------------------------------------------------ *
 *  shouldAutoFillDisplayName                                            *
 * ------------------------------------------------------------------ */

describe('shouldAutoFillDisplayName', () => {
  it('returns true for an empty string', () => {
    expect(shouldAutoFillDisplayName('')).toBe(true)
  })

  it('returns true for a whitespace-only string', () => {
    expect(shouldAutoFillDisplayName('   ')).toBe(true)
  })

  it('returns true for a string with only tabs / newlines', () => {
    expect(shouldAutoFillDisplayName('\t\n  \t')).toBe(true)
  })

  it('returns false for a non-empty string', () => {
    expect(shouldAutoFillDisplayName('x')).toBe(false)
  })

  it('returns false for a string with a single non-whitespace char surrounded by spaces', () => {
    expect(shouldAutoFillDisplayName('  x  ')).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 *  validateSubmit                                                       *
 * ------------------------------------------------------------------ */

describe('validateSubmit (create)', () => {
  const okCreate: CreateSubmit = { kind: 'create', name: 'valid-name' }

  it('accepts a valid name', () => {
    const r = validateSubmit(okCreate)
    expect(r).toEqual({ ok: true, payload: okCreate })
  })

  it('accepts a name with surrounding whitespace (the dialog does not pre-trim)', () => {
    const payload: CreateSubmit = { kind: 'create', name: '  trimmed  ' }
    expect(validateSubmit(payload)).toEqual({ ok: true, payload })
  })

  it('rejects an empty name', () => {
    const r = validateSubmit({ kind: 'create', name: '' })
    expect(r).toEqual({
      ok: false,
      key: 'databases.createDialog.error.invalidName',
    })
  })

  it('rejects a whitespace-only name', () => {
    expect(validateSubmit({ kind: 'create', name: '   \t  ' })).toEqual({
      ok: false,
      key: 'databases.createDialog.error.invalidName',
    })
  })

  it('rejects a too-long name (65 chars)', () => {
    expect(validateSubmit({ kind: 'create', name: 'a'.repeat(65) })).toEqual({
      ok: false,
      key: 'databases.createDialog.error.invalidName',
    })
  })

  it('rejects a name with path separators', () => {
    expect(validateSubmit({ kind: 'create', name: 'a/b' })).toEqual({
      ok: false,
      key: 'databases.createDialog.error.invalidName',
    })
  })
})

describe('validateSubmit (rename)', () => {
  it('accepts a valid new name', () => {
    const payload: RenameSubmit = { kind: 'rename', id: 'db-1', newName: 'new' }
    expect(validateSubmit(payload)).toEqual({ ok: true, payload })
  })

  it('rejects the same invalid cases as create (shared rule)', () => {
    const cases: Array<{ newName: string }> = [
      { newName: '' },
      { newName: '   ' },
      { newName: 'a'.repeat(65) },
      { newName: '../etc/passwd' },
      { newName: 'shell;rm' },
    ]
    for (const { newName } of cases) {
      const r = validateSubmit({ kind: 'rename', id: 'db-1', newName })
      expect(r, `should reject "${newName}"`).toEqual({
        ok: false,
        key: 'databases.createDialog.error.invalidName',
      })
    }
  })

  it('does not reject the same name as the current one (no-op rename)', () => {
    // Renaming to the same name is a no-op semantically; the
    // validator only checks the *value*, not "is it different
    // from the current one". The hook layer is responsible for
    // short-circuiting no-op renames if it cares.
    const payload: RenameSubmit = { kind: 'rename', id: 'db-1', newName: 'same' }
    expect(validateSubmit(payload)).toEqual({ ok: true, payload })
  })
})

describe('validateSubmit (import)', () => {
  it('always returns ok (the import flow validates the file separately)', () => {
    const payload: ImportSubmit = { kind: 'import', file: makeFile('foo.db'), displayName: 'foo' }
    expect(validateSubmit(payload)).toEqual({ ok: true, payload })
  })

  it('also returns ok when the display name is empty (sanitisation happens at the worker)', () => {
    const payload: ImportSubmit = { kind: 'import', file: makeFile('foo.db'), displayName: '' }
    expect(validateSubmit(payload)).toEqual({ ok: true, payload })
  })
})

describe('validateSubmit (delete)', () => {
  it('always returns ok (the confirm dialog is the only gate)', () => {
    const payload: DeleteSubmit = { kind: 'delete', id: 'db-99' }
    expect(validateSubmit(payload)).toEqual({ ok: true, payload })
  })
})

describe('validateSubmit (exhaustiveness)', () => {
  it('throws when given a payload outside the union (defensive runtime check)', () => {
    // We cannot construct a value of type `never` from the public
    // surface, so this is a type-level test that uses a cast to
    // force the call. The runtime is unreachable for any
    // well-typed input; the `default` arm throws so a future bug
    // (someone casts around the type system) is loud.
    const fake = { kind: 'unknown' } as unknown as DatabaseSubmit
    expect(() => validateSubmit(fake)).toThrow(/Unknown DatabaseSubmit kind/)
  })
})
