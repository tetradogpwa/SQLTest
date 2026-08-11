/**
 * DBAPI — public façade exposed to the Main Thread via Comlink.
 *
 * Mirrors the API documented in RESEARCH.md §9.3. The class is a thin
 * orchestrator on top of the manager classes:
 *
 *   - DatabaseManager      — open/close VFS-backed databases
 *   - QueryExecutor        — run SQL with timeout + error translation
 *   - SnapshotManager      — VACUUM INTO based snapshots (POC-1)
 *   - SchemaManager        — introspection via sqlite_master
 *   - ImportExportManager  — import / export `.db` blobs
 *
 * This task (worker-exec-path) wires the first three. The last three
 * are owned by the parallel `worker-storage-path` task; until that
 * task lands, the corresponding methods throw a clear "not implemented"
 * error so the contract is observable. The TypeScript surface is
 * complete so the storage task can fill the bodies without breaking
 * the public API.
 */

import { DatabaseManager, VfsNotRegisteredError } from './database-manager'
import { QueryExecutor, type SQLiteForExec } from './query-executor'
import { TimeoutController } from './timeout-controller'
import { ErrorTranslator } from './error-translator'
import { analyze } from './statement-analyzer'
import { toSerializedError } from './serialization-helper'
import type {
  DatabaseMode,
  DatabaseSchema,
  ExecOptions,
  ImportResult,
  InitResult,
  OpenDatabaseResult,
  QueryResult,
  SnapshotMetadata,
  SnapshotReason,
  UserDatabaseInfo,
} from './types'

/* ──────────────────────────────────────────────────────────────────── *
 *  Sub-manager interfaces (implemented by worker-storage-path)         *
 * ──────────────────────────────────────────────────────────────────── */

export interface SnapshotManagerLike {
  capture(dbId: number, label: string, reason?: SnapshotReason): Promise<SnapshotMetadata>
  restore(dbId: number, snapId: string): Promise<void>
  list(dbId: number): Promise<SnapshotMetadata[]>
  delete(dbId: number, snapId: string): Promise<void>
}

export interface SchemaManagerLike {
  introspect(dbId: number): Promise<DatabaseSchema>
  /**
   * Drop the cache entry for `dbId`. Called by the DBAPI whenever a
   * DDL statement (CREATE / DROP / ALTER) is executed so the next
   * `introspect()` returns fresh data. Optional — the DBAPI tolerates
   * implementations that do not need it.
   */
  invalidate?(dbId: number): void
}

export interface ImportExportManagerLike {
  import(bytes: Uint8Array, targetName: string): Promise<ImportResult>
  export(dbId: number): Promise<Uint8Array>
  listUserDatabases(): Promise<UserDatabaseInfo[]>
  deleteUserDatabase(dbId: number): Promise<void>
}

/** Subset of the wa-sqlite API the DBAPI itself needs. */
export interface SQLiteForDbapi extends SQLiteForExec {
  libversion: () => string
  open_v2: (filename: string, flags?: number, vfsName?: string) => Promise<number>
  close: (db: number) => Promise<number> | number
  errmsg: (db: number) => string
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Optional dependency injection (used by the worker entry point)      *
 * ──────────────────────────────────────────────────────────────────── */

export interface DbapiDeps {
  dbs: DatabaseManager
  executor: QueryExecutor
  timeouts: TimeoutController
  translator: ErrorTranslator
  sqlite3: SQLiteForDbapi
  snapshots?: SnapshotManagerLike
  schema?: SchemaManagerLike
  io?: ImportExportManagerLike
}

/* ──────────────────────────────────────────────────────────────────── *
 *  DBAPI                                                                *
 * ──────────────────────────────────────────────────────────────────── */

export class DBAPI {
  private readonly dbs: DatabaseManager
  private readonly executor: QueryExecutor
  private readonly translator: ErrorTranslator
  private readonly sqlite3: SQLiteForDbapi
  private readonly snapshots: SnapshotManagerLike
  private readonly schemaMgr: SchemaManagerLike
  private readonly io: ImportExportManagerLike

  /** Cached libversion (cheap, but avoids the cwrap call per request). */
  private cachedVersion: string | null = null

  constructor(deps: DbapiDeps) {
    this.dbs = deps.dbs
    this.executor = deps.executor
    this.translator = deps.translator
    this.sqlite3 = deps.sqlite3
    this.snapshots = deps.snapshots ?? new NotImplementedSnapshots()
    this.schemaMgr = deps.schema ?? new NotImplementedSchema()
    this.io = deps.io ?? new NotImplementedIO()
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  Lifecycle                                                       *
   * ──────────────────────────────────────────────────────────────── */

  /**
   * Initialise the worker. The actual wa-sqlite boot and VFS
   * registration happens in `sqlite.worker.ts` before the DBAPI is
   * constructed; this method just reports the version + capability
   * and warms the translator's caches.
   */
  async init(): Promise<InitResult> {
    if (!this.cachedVersion) {
      try {
        this.cachedVersion = this.sqlite3.libversion()
      } catch {
        this.cachedVersion = 'unknown'
      }
    }
    return {
      capability: this.dbs.getCapability(),
      sqliteVersion: this.cachedVersion,
      vfsName: safe(() => this.dbs.getVfsName(), 'memory'),
    }
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  Database lifecycle                                              *
   * ──────────────────────────────────────────────────────────────── */

  async open(dbId: number, filename: string, mode: DatabaseMode = 'readwrite'): Promise<OpenDatabaseResult> {
    return this.dbs.open(dbId, filename, mode)
  }

  async close(dbId: number): Promise<void> {
    return this.dbs.close(dbId)
  }

  /** Close every open DB. Called by the Worker during shutdown. */
  async closeAll(): Promise<void> {
    return this.dbs.closeAll()
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  Execution                                                       *
   * ──────────────────────────────────────────────────────────────── */

  async exec(dbId: number, sql: string, options?: ExecOptions): Promise<QueryResult> {
    let result: QueryResult
    try {
      result = await this.executor.exec(dbId, sql, options)
    } catch (e) {
      // DatabaseNotFoundError and unexpected programming errors are
      // converted into a QueryResult so the Main Thread always gets a
      // structured response.
      const se = toSerializedError(e)
      return {
        ok: false,
        error: se,
        executionMs: 0,
        statementKind: analyze(sql)[0]?.kind ?? 'other',
      }
    }
    // Schema invalidation hook (storage task): when the executed SQL
    // touched DDL, drop the per-dbId cache so the next introspect()
    // returns a fresh walk. Failures here are non-fatal — the cache
    // will simply live until the TTL expires.
    if (result.ok && this.schemaMgr.invalidate && touchesDdl(result)) {
      try {
        this.schemaMgr.invalidate(dbId)
      } catch {
        // ignore — best-effort
      }
    }
    return result
  }

  /**
   * Best-effort cancel for the running query on `dbId`. The actual
   * interruption happens when the progress handler next ticks, so
   * there is no way to truly cancel from outside the worker.
   */
  async cancel(dbId: number): Promise<void> {
    this.executor.cancel(dbId)
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  Schema (storage task)                                           *
   * ──────────────────────────────────────────────────────────────── */

  async schema(dbId: number): Promise<DatabaseSchema> {
    const result = await this.schemaMgr.introspect(dbId)
    // Keep the translator's "did-you-mean" dictionary in sync.
    this.translator.setSchema(
      result.tables.map((t) => t.name),
      result.tables.flatMap((t) => t.columns.map((c) => c.name)),
    )
    return result
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  Snapshots (storage task)                                        *
   * ──────────────────────────────────────────────────────────────── */

  async snapshot(dbId: number, label: string, reason?: SnapshotReason): Promise<SnapshotMetadata> {
    return this.snapshots.capture(dbId, label, reason)
  }

  async restore(dbId: number, snapId: string): Promise<void> {
    return this.snapshots.restore(dbId, snapId)
  }

  async listSnapshots(dbId: number): Promise<SnapshotMetadata[]> {
    return this.snapshots.list(dbId)
  }

  async deleteSnapshot(dbId: number, snapId: string): Promise<void> {
    return this.snapshots.delete(dbId, snapId)
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  Import / export (storage task)                                  *
   * ──────────────────────────────────────────────────────────────── */

  async import(bytes: Uint8Array, targetName: string): Promise<ImportResult> {
    return this.io.import(bytes, targetName)
  }

  async export(dbId: number): Promise<Uint8Array> {
    return this.io.export(dbId)
  }

  async listUserDatabases(): Promise<UserDatabaseInfo[]> {
    return this.io.listUserDatabases()
  }

  async deleteUserDatabase(dbId: number): Promise<void> {
    return this.io.deleteUserDatabase(dbId)
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Not-implemented placeholders for the storage task                   *
 * ──────────────────────────────────────────────────────────────────── */

class NotImplementedSnapshots implements SnapshotManagerLike {
  private boom(): never {
    throw new Error(
      'SnapshotManager not wired — this is owned by the worker-storage-path task.',
    )
  }
  capture(): Promise<SnapshotMetadata> { return this.boom() }
  restore(): Promise<void> { return this.boom() }
  list(): Promise<SnapshotMetadata[]> { return this.boom() }
  delete(): Promise<void> { return this.boom() }
}

class NotImplementedSchema implements SchemaManagerLike {
  private boom(): never {
    throw new Error(
      'SchemaManager not wired — this is owned by the worker-storage-path task.',
    )
  }
  introspect(): Promise<DatabaseSchema> { return this.boom() }
}

class NotImplementedIO implements ImportExportManagerLike {
  private boom(): never {
    throw new Error(
      'ImportExportManager not wired — this is owned by the worker-storage-path task.',
    )
  }
  import(): Promise<ImportResult> { return this.boom() }
  export(): Promise<Uint8Array> { return this.boom() }
  listUserDatabases(): Promise<UserDatabaseInfo[]> { return this.boom() }
  deleteUserDatabase(): Promise<void> { return this.boom() }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers                                                              *
 * ──────────────────────────────────────────────────────────────────── */

/** True when any of the executed statements mutates the schema. */
function touchesDdl(result: QueryResult): boolean {
  const statements = result.statements ?? []
  for (const s of statements) {
    if (s.kind === 'create' || s.kind === 'drop' || s.kind === 'alter') return true
  }
  return false
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof VfsNotRegisteredError) return fallback
    throw e
  }
}
