/**
 * Minimal ambient declarations for `wa-sqlite` subpath imports.
 *
 * `wa-sqlite` 1.0.0 ships no `.d.ts` for the internal files we use
 * (`sqlite-constants.js`). This shim keeps `tsc --strict` happy without
 * pulling in the package's own d.ts (which lives in `src/types/` and
 * describes a different shape).
 */

declare module 'wa-sqlite/src/sqlite-constants.js' {
  // Primary result codes — the only ones the Worker actually reads.
  export const SQLITE_OK: 0
  export const SQLITE_ERROR: 1
  export const SQLITE_INTERNAL: 2
  export const SQLITE_PERM: 3
  export const SQLITE_ABORT: 4
  export const SQLITE_BUSY: 5
  export const SQLITE_LOCKED: 6
  export const SQLITE_NOMEM: 7
  export const SQLITE_READONLY: 8
  export const SQLITE_INTERRUPT: 9
  export const SQLITE_IOERR: 10
  export const SQLITE_CORRUPT: 11
  export const SQLITE_NOTFOUND: 12
  export const SQLITE_FULL: 13
  export const SQLITE_CANTOPEN: 14
  export const SQLITE_PROTOCOL: 15
  export const SQLITE_SCHEMA: 17
  export const SQLITE_TOOBIG: 18
  export const SQLITE_CONSTRAINT: 19
  export const SQLITE_MISMATCH: 20
  export const SQLITE_MISUSE: 21
  export const SQLITE_NOLFS: 22
  export const SQLITE_AUTH: 23
  export const SQLITE_FORMAT: 24
  export const SQLITE_RANGE: 25
  export const SQLITE_NOTADB: 26

  // Open flags.
  export const SQLITE_OPEN_READONLY: number
  export const SQLITE_OPEN_READWRITE: number
  export const SQLITE_OPEN_CREATE: number
  export const SQLITE_OPEN_URI: number
  export const SQLITE_OPEN_MEMORY: number
  export const SQLITE_OPEN_MAIN_DB: number
  export const SQLITE_OPEN_MAIN_JOURNAL: number
  export const SQLITE_OPEN_WAL: number

  // Locking levels.
  export const SQLITE_LOCK_NONE: number
  export const SQLITE_LOCK_SHARED: number
  export const SQLITE_LOCK_RESERVED: number
  export const SQLITE_LOCK_PENDING: number
  export const SQLITE_LOCK_EXCLUSIVE: number
}
