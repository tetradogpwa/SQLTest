/**
 * ImportExportManager — moves whole-database blobs in and out of the
 * VFS. The implementation reuses the same `VACUUM INTO` strategy as
 * the snapshot manager (POC-1 verdict: `sqlite3_serialize` is not
 * available in wa-sqlite 1.0.0).
 *
 *   - `import(bytes, targetName)`  writes the bytes to `user/<name>.db`
 *     in the VFS, then opens the file as a live SQLite connection and
 *     returns the assigned `dbId`.
 *   - `export(dbId)`               issues `VACUUM INTO '<temp>.db'`
 *     against the live connection, reads the temp bytes back through
 *     the VFS-aware IO layer, and returns them.
 *   - `listUserDatabases()`        enumerates `user/*.db` files.
 *   - `deleteUserDatabase(dbId)`   closes the connection, removes the
 *     file, and clears any associated snapshots.
 *
 * Round-trip semantics:
 *
 *   The exported bytes are the literal contents of a `VACUUM INTO`
 *   file, which is a complete, valid SQLite database. Re-importing the
 *   bytes produces a database with the same schema, data, indexes,
 *   triggers and views (binary-identical modulo the VFS filename, which
 *   is rewritten on import). This is verified by
 *   `tests/unit/import-export.test.ts`.
 */

import { DatabaseManager, DatabaseAlreadyOpenError, DatabaseNotFoundError } from './database-manager'
import { SnapshotManager } from './snapshot-manager'
import { SchemaManager } from './schema-manager'
import {
  STORAGE_ROOTS,
  joinPath,
  type VfsIO,
  VfsUnsupportedError,
} from './vfs-io'
import type { ImportResult, UserDatabaseInfo } from './types'

/* ──────────────────────────────────────────────────────────────────── *
 *  Subset of the wa-sqlite API used here                                *
 * ──────────────────────────────────────────────────────────────────── */

export interface SQLiteForIO {
  exec: (db: number, sql: string) => Promise<number>
  errmsg: (db: number) => string
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Errors                                                               *
 * ──────────────────────────────────────────────────────────────────── */

export class ImportError extends Error {
  constructor(filename: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`Failed to import database to ${filename}: ${msg}`)
    this.name = 'ImportError'
    if (cause instanceof Error) this.cause = cause
  }
}

export class ExportError extends Error {
  constructor(dbId: number, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`Failed to export database ${dbId}: ${msg}`)
    this.name = 'ExportError'
    if (cause instanceof Error) this.cause = cause
  }
}

export class UserDatabaseNotFoundError extends Error {
  constructor(dbId: number) {
    super(`User database ${dbId} not found`)
    this.name = 'UserDatabaseNotFoundError'
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Manager                                                              *
 * ──────────────────────────────────────────────────────────────────── */

export interface ImportExportManagerOptions {
  /** Where the user's databases live, relative to the VFS root. */
  userRoot?: string
  /** Lower bound for the auto-assigned dbId. */
  dbIdBase?: number
  /** Monotonic clock — defaults to `Date.now`. Injectable for tests. */
  now?: () => number
  /** Random suffix generator — injectable for deterministic tests. */
  randomId?: () => string
}

const DEFAULT_OPTIONS: Required<Omit<ImportExportManagerOptions, 'userRoot' | 'dbIdBase'>> = {
  now: () => Date.now(),
  randomId: () => Math.random().toString(36).slice(2, 10),
}

const DEFAULT_USER_ROOT = STORAGE_ROOTS.user
const DEFAULT_DB_ID_BASE = 1_000_000

export class ImportExportManager {
  private readonly dbs: DatabaseManager
  private readonly snapshots: SnapshotManager | null
  private readonly schema: SchemaManager | null
  private readonly sqlite3: SQLiteForIO
  private readonly io: VfsIO
  private readonly userRoot: string
  private readonly dbIdBase: number
  private readonly now: () => number
  private readonly randomId: () => string

  /**
   * `dbId → filename` for databases the manager itself opened. Used by
   * `listUserDatabases()` / `deleteUserDatabase(dbId)` to look up the
   * underlying file when only the `dbId` is available.
   */
  private readonly owned = new Map<number, { filename: string; name: string; createdAt: number }>()

  /** Monotonic counter for `dbId` allocation. */
  private nextDbId: number

  constructor(deps: {
    dbs: DatabaseManager
    snapshots?: SnapshotManager | null
    schema?: SchemaManager | null
    sqlite3: SQLiteForIO
    io: VfsIO
    options?: ImportExportManagerOptions
  }) {
    this.dbs = deps.dbs
    this.snapshots = deps.snapshots ?? null
    this.schema = deps.schema ?? null
    this.sqlite3 = deps.sqlite3
    this.io = deps.io
    this.userRoot = deps.options?.userRoot ?? DEFAULT_USER_ROOT
    this.dbIdBase = deps.options?.dbIdBase ?? DEFAULT_DB_ID_BASE
    this.now = deps.options?.now ?? DEFAULT_OPTIONS.now
    this.randomId = deps.options?.randomId ?? DEFAULT_OPTIONS.randomId
    this.nextDbId = this.dbIdBase
  }

  /* ------------------------------------------------------------------ *
   *  Public API                                                        *
   * ------------------------------------------------------------------ */

  /**
   * Import a `.db` blob. The file is written to `user/<targetName>.db`
   * (a unique suffix is appended if the name is already in use) and
   * opened as a live SQLite connection.
   *
   * @throws VfsUnsupportedError when the underlying VFS does not
   *         support byte access (e.g. the IDB VFS).
   */
  async import(bytes: Uint8Array, targetName: string): Promise<ImportResult> {
    const sanitized = sanitizeName(targetName)
    const finalFilename = await this.findFreeFilename(sanitized)
    // The "display name" is derived from the actual filename so that
    // collisions get unique entries in `listUserDatabases()` (e.g.
    // `dup`, `dup-1`, `dup-2`).
    const finalName = filenameToName(finalFilename)

    // 1. Write the bytes to the VFS.
    try {
      await this.io.write(finalFilename, bytes)
    } catch (e) {
      if (e instanceof VfsUnsupportedError) throw e
      throw new ImportError(finalFilename, e)
    }

    // 2. Allocate a dbId and open.
    const dbId = this.allocateDbId()
    try {
      await this.dbs.open(dbId, finalFilename, 'readwrite')
    } catch (e) {
      // Roll back the file we just wrote.
      await this.io.delete(finalFilename).catch(() => undefined)
      throw new ImportError(finalFilename, e)
    }

    // 3. Track the file → name mapping for `listUserDatabases`.
    this.owned.set(dbId, {
      filename: finalFilename,
      name: finalName,
      createdAt: this.now(),
    })
    // Invalidate any cached schema for the new dbId (it might have
    // been used before).
    this.schema?.invalidate(dbId)

    return { dbId, sizeBytes: bytes.byteLength }
  }

  /**
   * Export a database as raw `.db` bytes. Issues `VACUUM INTO` to a
   * temp file inside the VFS, reads the bytes, and cleans up.
   *
   * @throws DatabaseNotFoundError when `dbId` is unknown.
   * @throws ExportError when VACUUM INTO fails or the VFS does not
   *         support byte access.
   */
  async export(dbId: number): Promise<Uint8Array> {
    if (!this.dbs.has(dbId)) throw new DatabaseNotFoundError(dbId)
    const { db } = this.dbs.get(dbId)
    const tempPath = joinPath(STORAGE_ROOTS.tmp, `export-${dbId}-${this.now()}-${this.randomId()}.db`)

    // 1. VACUUM INTO temp.
    const rc = await this.sqlite3.exec(db, quoteVacuumInto(tempPath))
    if (rc !== 0) {
      const msg = safeErrmsg(this.sqlite3, db)
      throw new ExportError(dbId, new Error(`VACUUM INTO rc=${rc}${msg ? ` (${msg})` : ''}`))
    }

    // 2. Read the bytes.
    let bytes: Uint8Array
    try {
      bytes = await this.io.read(tempPath)
    } catch (e) {
      // Cleanup the temp before rethrowing.
      await this.io.delete(tempPath).catch(() => undefined)
      throw new ExportError(dbId, e)
    }

    // 3. Best-effort cleanup.
    await this.io.delete(tempPath).catch(() => undefined)
    return bytes
  }

  /**
   * List the user databases (files under `user/`). The list is sorted
   * by name for stable output.
   */
  async listUserDatabases(): Promise<UserDatabaseInfo[]> {
    const files = await this.io.list(this.userRoot).catch(() => [])
    const out: UserDatabaseInfo[] = []
    for (const file of files) {
      if (!file.endsWith('.db')) continue
      // Only report files this manager owns. Untracked `.db` files
      // (e.g. created directly via `DBAPI.open`) are ignored — the
      // owner of those is the caller.
      const owned = Array.from(this.owned.entries()).find(([, v]) => v.filename === file)
      if (!owned) continue
      const [dbId, meta] = owned
      const sizeBytes = await this.io.size(file).catch(() => 0)
      out.push({
        dbId,
        name: meta.name,
        filename: file,
        sizeBytes,
        createdAt: meta.createdAt,
        updatedAt: meta.createdAt,
        origin: 'imported',
      })
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }

  /**
   * Delete a user database — the file is removed and any associated
   * snapshots are dropped. The `dbId` is invalidated; reopening the
   * same name will assign a new `dbId`.
   *
   * @throws UserDatabaseNotFoundError when `dbId` was not opened by
   *         this manager.
   */
  async deleteUserDatabase(dbId: number): Promise<void> {
    const meta = this.owned.get(dbId)
    if (!meta) throw new UserDatabaseNotFoundError(dbId)
    // Close the live connection (no-op if already closed).
    await this.dbs.close(dbId).catch(() => undefined)
    // Drop any associated snapshots before removing the file.
    if (this.snapshots) {
      await this.snapshots.removeAllForDb(dbId).catch(() => undefined)
    }
    // Remove the file.
    await this.io.delete(meta.filename).catch(() => undefined)
    // Forget the mapping.
    this.owned.delete(dbId)
    // Drop any cached schema.
    this.schema?.invalidate(dbId)
  }

  /**
   * Open an existing user database (e.g. on app start when restoring
   * the user's DB list). Allocates a fresh `dbId` and registers the
   * file with the manager so subsequent `listUserDatabases` reports it.
   *
   * `origin: 'imported' | 'created' | 'bundled'` controls the
   * provenance field returned in `UserDatabaseInfo`.
   */
  async openExisting(
    filename: string,
    name: string,
    origin: 'imported' | 'created' | 'bundled' = 'imported',
  ): Promise<{ dbId: number; sizeBytes: number }> {
    const dbId = this.allocateDbId()
    await this.dbs.open(dbId, filename, 'readwrite')
    const sizeBytes = await this.io.size(filename).catch(() => 0)
    this.owned.set(dbId, { filename, name: sanitizeName(name), createdAt: this.now() })
    // Pre-populate the size in DatabaseManager for diagnostics.
    await this.dbs.refreshSize(dbId).catch(() => undefined)
    void origin
    return { dbId, sizeBytes }
  }

  /* ------------------------------------------------------------------ *
   *  Internals                                                         *
   * ------------------------------------------------------------------ */

  private allocateDbId(): number {
    // Find a free slot starting from `nextDbId`. We avoid colliding
    // with dbIds the DatabaseManager already knows about (it does not
    // expose its map, but every `open` raises DatabaseAlreadyOpenError
    // on collision — we catch that and bump).
    let candidate = this.nextDbId
    while (this.dbs.has(candidate) || this.owned.has(candidate)) {
      candidate += 1
    }
    this.nextDbId = candidate + 1
    return candidate
  }

  private async findFreeFilename(sanitized: string): Promise<string> {
    const base = joinPath(this.userRoot, `${sanitized}.db`)
    if (!(await this.io.exists(base).catch(() => false))) return base
    // Append a random suffix until a free name is found. We try a few
    // iterations before falling back to a counter.
    for (let i = 0; i < 8; i += 1) {
      const candidate = joinPath(this.userRoot, `${sanitized}-${this.randomId()}.db`)
      if (!(await this.io.exists(candidate).catch(() => false))) return candidate
    }
    // Last-resort: monotonic counter.
    for (let i = 1; i < 10_000; i += 1) {
      const candidate = joinPath(this.userRoot, `${sanitized}-${i}.db`)
      if (!(await this.io.exists(candidate).catch(() => false))) return candidate
    }
    throw new ImportError(
      joinPath(this.userRoot, `${sanitized}.db`),
      new Error('Could not find a free filename after 10000 attempts'),
    )
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers                                                              *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Strip path separators and any characters that would confuse the
 * VFS. The result is safe to interpolate into a relative path inside
 * the VFS. We keep the file extension (`.<name>.db`) out of this
 * function — caller adds the `.db` suffix.
 */
function sanitizeName(name: string): string {
  // Trim, drop directory parts, replace any non-[A-Za-z0-9._-] with `_`.
  const trimmed = name.trim()
  const base = trimmed.split(/[\\/]/).pop() ?? trimmed
  const replaced = base.replace(/[^A-Za-z0-9._-]+/g, '_')
  const collapsed = replaced.replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  return collapsed.length > 0 ? collapsed.slice(0, 64) : 'db'
}

/** Inverse of `joinPath(userRoot, '<name>.db')` — strip the dir + suffix. */
function filenameToName(filename: string): string {
  const base = filename.split('/').pop() ?? filename
  return base.replace(/\.db$/, '')
}

function quoteVacuumInto(path: string): string {
  const escaped = path.replace(/'/g, "''")
  return `VACUUM INTO '${escaped}';`
}

function safeErrmsg(sqlite3: SQLiteForIO, db: number): string {
  try {
    return sqlite3.errmsg(db)
  } catch {
    return ''
  }
}

// `DatabaseAlreadyOpenError` is re-exported for symmetry with the
// other error classes; the manager surfaces it on collision during
// `allocateDbId`.
export { DatabaseAlreadyOpenError }
