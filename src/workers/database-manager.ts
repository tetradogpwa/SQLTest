/**
 * DatabaseManager — owns the live `dbId → handle` map.
 *
 * Responsibilities (RESEARCH §9.2):
 *   - Open / close databases on the registered VFS.
 *   - Map Main-Thread identifiers (`dbId`) to wa-sqlite handles.
 *   - Translate a textual `mode` (`read` / `write` / `readwrite`) into
 *     the corresponding `SQLITE_OPEN_*` flags.
 *   - Expose a synchronous `get(dbId)` for the other managers — throws
 *     when the handle is unknown so the failure mode is loud.
 *
 * The Manager depends on a thin `SQLiteForDatabase` interface so it can
 * be tested without a real WASM module. The production wiring in
 * `sqlite.worker.ts` passes the real wa-sqlite object.
 */

import * as SQLite from 'wa-sqlite/src/sqlite-constants.js'

import type { DatabaseMode, OpenDatabaseResult, StorageCapability } from './types'

/** Minimal API required to open / close a database. */
export interface SQLiteForDatabase {
  open_v2: (filename: string, flags?: number, vfsName?: string) => Promise<number>
  close: (db: number) => Promise<number> | number
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Internal record                                                      *
 * ──────────────────────────────────────────────────────────────────── */

interface OpenRecord {
  filename: string
  db: number
  sizeBytes: number
  mode: DatabaseMode
  openedAt: number
  /** True when the connection is in WAL mode (affects snapshot policy). */
  isWal: boolean
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Public errors                                                        *
 * ──────────────────────────────────────────────────────────────────── */

export class DatabaseNotFoundError extends Error {
  constructor(dbId: number) {
    super(`Database ${dbId} is not open`)
    this.name = 'DatabaseNotFoundError'
  }
}

export class VfsNotRegisteredError extends Error {
  constructor() {
    super('No VFS is registered. Call `init()` before opening databases.')
    this.name = 'VfsNotRegisteredError'
  }
}

export class DatabaseAlreadyOpenError extends Error {
  constructor(dbId: number) {
    super(`Database ${dbId} is already open`)
    this.name = 'DatabaseAlreadyOpenError'
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Mode → flags mapping                                                 *
 * ──────────────────────────────────────────────────────────────────── */

function modeToFlags(mode: DatabaseMode, filename: string): number {
  // We always allow URI for OPFS-style paths (`opfs:/…`) and enable
  // CREATE for the default readwrite mode so the user can just call
  // `open(dbId, "user/foo.db")` without pre-creating the file.
  switch (mode) {
    case 'read':
      return SQLite.SQLITE_OPEN_READONLY | SQLite.SQLITE_OPEN_URI
    case 'write':
      // SQLite has no "write-only" mode; the closest is readwrite. We
      // map it to readwrite for compatibility with the spec.
      return (
        SQLite.SQLITE_OPEN_READWRITE |
        SQLite.SQLITE_OPEN_CREATE |
        SQLite.SQLITE_OPEN_URI
      )
    case 'readwrite':
    default:
      if (filename === ':memory:') {
        return SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_MEMORY
      }
      return (
        SQLite.SQLITE_OPEN_READWRITE |
        SQLite.SQLITE_OPEN_CREATE |
        SQLite.SQLITE_OPEN_URI
      )
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Manager                                                              *
 * ──────────────────────────────────────────────────────────────────── */

export interface DatabaseManagerInit {
  /** Resolved VFS name (e.g. `opfs-sync`, `memory`). */
  vfsName: string
  /** Detected storage capability — recorded for the init result. */
  capability: StorageCapability
}

export class DatabaseManager {
  private readonly sqlite3: SQLiteForDatabase
  private readonly openMap = new Map<number, OpenRecord>()
  private vfsName: string | null = null
  private capability: StorageCapability = 'memory'

  /** Optional size estimator — the executor / IO manager inject it. */
  private sizeEstimator: (filename: string) => Promise<number> = async () => 0

  constructor(sqlite3: SQLiteForDatabase) {
    this.sqlite3 = sqlite3
  }

  /* ------------------------------------------------------------------ *
   *  Configuration                                                     *
   * ------------------------------------------------------------------ */

  /** Record the VFS selected during `init()`. Required before any open. */
  configure(init: DatabaseManagerInit): void {
    this.vfsName = init.vfsName
    this.capability = init.capability
  }

  /** Inject a function that returns the file size for a given filename. */
  setSizeEstimator(fn: (filename: string) => Promise<number>): void {
    this.sizeEstimator = fn
  }

  /* ------------------------------------------------------------------ *
   *  Open / close                                                      *
   * ------------------------------------------------------------------ */

  /**
   * Open (or create) a database.
   *
   * @throws VfsNotRegisteredError when called before `configure()`.
   * @throws DatabaseAlreadyOpenError when `dbId` is already in use.
   */
  async open(dbId: number, filename: string, mode: DatabaseMode = 'readwrite'): Promise<OpenDatabaseResult> {
    if (this.vfsName === null) throw new VfsNotRegisteredError()
    if (this.openMap.has(dbId)) throw new DatabaseAlreadyOpenError(dbId)

    const flags = modeToFlags(mode, filename)
    const db = await this.sqlite3.open_v2(filename, flags, this.vfsName)
    if (typeof db !== 'number' || Number.isNaN(db)) {
      throw new Error(`sqlite3.open_v2 returned invalid handle (${String(db)}) for ${filename}`)
    }

    const sizeBytes = await this.estimateSize(filename)

    this.openMap.set(dbId, {
      filename,
      db,
      sizeBytes,
      mode,
      openedAt: Date.now(),
      isWal: false,
    })
    return { filename, sizeBytes }
  }

  async close(dbId: number): Promise<void> {
    const record = this.openMap.get(dbId)
    if (!record) return // idempotent — closing an unknown handle is a no-op
    try {
      await this.sqlite3.close(record.db)
    } finally {
      this.openMap.delete(dbId)
    }
  }

  /** Close every open connection. Used during Worker shutdown. */
  async closeAll(): Promise<void> {
    const ids = Array.from(this.openMap.keys())
    for (const id of ids) await this.close(id)
  }

  /* ------------------------------------------------------------------ *
   *  Introspection                                                     *
   * ------------------------------------------------------------------ */

  get(dbId: number): { db: number; filename: string; sizeBytes: number; mode: DatabaseMode } {
    const record = this.openMap.get(dbId)
    if (!record) throw new DatabaseNotFoundError(dbId)
    return {
      db: record.db,
      filename: record.filename,
      sizeBytes: record.sizeBytes,
      mode: record.mode,
    }
  }

  has(dbId: number): boolean {
    return this.openMap.has(dbId)
  }

  /** All open databases — used by the Worker recreator for state transfer. */
  list(): Array<{ dbId: number; filename: string; sizeBytes: number; mode: DatabaseMode }> {
    return Array.from(this.openMap.entries()).map(([dbId, r]) => ({
      dbId,
      filename: r.filename,
      sizeBytes: r.sizeBytes,
      mode: r.mode,
    }))
  }

  /** Update the cached size after a write. */
  async refreshSize(dbId: number): Promise<number> {
    const record = this.openMap.get(dbId)
    if (!record) throw new DatabaseNotFoundError(dbId)
    const sizeBytes = await this.estimateSize(record.filename)
    record.sizeBytes = sizeBytes
    return sizeBytes
  }

  getVfsName(): string {
    if (this.vfsName === null) throw new VfsNotRegisteredError()
    return this.vfsName
  }

  getCapability(): StorageCapability {
    return this.capability
  }

  /* ------------------------------------------------------------------ *
   *  Internal                                                          *
   * ------------------------------------------------------------------ */

  private async estimateSize(filename: string): Promise<number> {
    if (filename === ':memory:') return 0
    try {
      return await this.sizeEstimator(filename)
    } catch {
      return 0
    }
  }
}
