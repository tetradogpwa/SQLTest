/**
 * SnapshotManager — captures, lists, restores and prunes per-database
 * snapshots. The implementation is the "PLAN_B_VACUUM_INTO" strategy
 * confirmed by POC-1:
 *
 *   - `sqlite3_serialize` / `sqlite3_deserialize` are NOT exported in
 *     wa-sqlite 1.0.0 (POC-1 verdict), so the canonical path is
 *     `VACUUM INTO '<temp-path>'` followed by reading the bytes through
 *     a VFS-aware IO implementation.
 *   - Round-trip is verified: capture → restore yields the same data
 *     (covered by `tests/unit/snapshot-manager.test.ts`).
 *
 * Layout on the VFS:
 *
 *   `.snapshots/<dbId>/<snapId>.db`
 *
 * The in-memory `SnapshotMetadata` array is rebuilt lazily on first
 * access for a `dbId` by scanning the VFS, so the metadata survives
 * worker restarts as long as the VFS is persistent.
 *
 * Policies (configurable via `SnapshotPolicy`):
 *
 *   - `maxPerDatabase` (default 5)  — keep at most N snapshots per DB
 *   - `maxGlobalBytes`  (default 50 MB) — hard cap across all DBs
 *   - `autoPrune`       (default true) — apply both policies on capture
 *
 * The "oldest first" eviction order is by `createdAt` (LRU).
 */

import { DatabaseManager } from './database-manager'
import {
  STORAGE_ROOTS,
  joinPath,
  type VfsIO,
  type VfsFileNotFoundError,
} from './vfs-io'
import type { SnapshotMetadata, SnapshotReason } from './types'
import { snapshotPath as snapshotRelativePath, SNAPSHOTS_ROOT } from './serialization-helper'

/* ──────────────────────────────────────────────────────────────────── *
 *  Public configuration                                                 *
 * ──────────────────────────────────────────────────────────────────── */

export interface SnapshotPolicy {
  /** Max snapshots per database before LRU eviction. */
  maxPerDatabase: number
  /** Max total bytes across all snapshots before global eviction. */
  maxGlobalBytes: number
  /** Apply the policies automatically on every `capture()`. */
  autoPrune: boolean
}

export const DEFAULT_SNAPSHOT_POLICY: SnapshotPolicy = {
  maxPerDatabase: 5,
  maxGlobalBytes: 50 * 1024 * 1024,
  autoPrune: true,
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Subset of the wa-sqlite API used here                                *
 * ──────────────────────────────────────────────────────────────────── */

export interface SQLiteForSnapshot {
  exec: (db: number, sql: string) => Promise<number>
  errmsg: (db: number) => string
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Errors                                                               *
 * ──────────────────────────────────────────────────────────────────── */

export class SnapshotNotFoundError extends Error {
  constructor(dbId: number, snapId: string) {
    super(`Snapshot ${snapId} not found for database ${dbId}`)
    this.name = 'SnapshotNotFoundError'
  }
}

export class SnapshotIoError extends Error {
  constructor(filename: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`Snapshot IO error on ${filename}: ${msg}`)
    this.name = 'SnapshotIoError'
    if (cause instanceof Error) this.cause = cause
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Manager                                                              *
 * ──────────────────────────────────────────────────────────────────── */

interface InternalMetadata {
  id: string
  dbId: number
  label: string
  sizeBytes: number
  createdAt: number
  reason: SnapshotReason
  /** Absolute path inside the VFS — for fast delete + read. */
  path: string
}

export class SnapshotManager {
  private readonly dbs: DatabaseManager
  private readonly sqlite3: SQLiteForSnapshot
  private readonly io: VfsIO
  private readonly policy: SnapshotPolicy
  private readonly now: () => number
  private readonly randomId: () => string

  /** In-memory metadata cache, indexed by `dbId`. */
  private readonly cache = new Map<number, InternalMetadata[]>()
  /** `dbId`s whose cache has already been primed from the VFS. */
  private readonly primed = new Set<number>()

  constructor(deps: {
    dbs: DatabaseManager
    sqlite3: SQLiteForSnapshot
    io: VfsIO
    policy?: Partial<SnapshotPolicy>
    now?: () => number
    randomId?: () => string
  }) {
    this.dbs = deps.dbs
    this.sqlite3 = deps.sqlite3
    this.io = deps.io
    this.policy = { ...DEFAULT_SNAPSHOT_POLICY, ...(deps.policy ?? {}) }
    this.now = deps.now ?? (() => Date.now())
    this.randomId =
      deps.randomId ??
      (() => Math.random().toString(36).slice(2, 10) + Date.now().toString(36))
  }

  /* ------------------------------------------------------------------ *
   *  Public API                                                        *
   * ------------------------------------------------------------------ */

  /**
   * Capture a snapshot of `dbId` using `VACUUM INTO`. Returns the new
   * snapshot's metadata. Applies the LRU + global-size policies after
   * a successful capture.
   */
  async capture(dbId: number, label: string, reason: SnapshotReason = 'manual'): Promise<SnapshotMetadata> {
    this.ensureDbOpen(dbId)
    await this.prime(dbId)

    const { db, filename } = this.dbs.get(dbId)
    const snapId = `snap-${this.now()}-${this.randomId()}`
    const tempPath = joinPath(STORAGE_ROOTS.snapshots, String(dbId), `tmp-${snapId}.db`)
    const finalPath = joinPath(STORAGE_ROOTS.snapshots, String(dbId), `${snapId}.db`)

    // 1. VACUUM INTO temp file inside the VFS.
    const rc = await this.sqlite3.exec(db, quoteVacuumInto(tempPath))
    if (rc !== 0) {
      const msg = safeErrmsg(this.sqlite3, db)
      throw new SnapshotIoError(tempPath, new Error(`VACUUM INTO rc=${rc}${msg ? ` (${msg})` : ''}`))
    }

    // 2. Read bytes from temp, write to final path.
    let bytes: Uint8Array
    try {
      bytes = await this.io.read(tempPath)
    } catch (e) {
      if (isVfsMissing(e)) throw new SnapshotIoError(tempPath, e)
      throw e
    }
    try {
      await this.io.write(finalPath, bytes)
    } catch (e) {
      // Best-effort cleanup of the temp file before surfacing the error.
      await this.io.delete(tempPath).catch(() => undefined)
      throw new SnapshotIoError(finalPath, e)
    }
    // 3. Best-effort delete the temp file (vacuum-into creates a full
    //    copy, so the temp is no longer needed).
    await this.io.delete(tempPath).catch(() => undefined)

    const meta: InternalMetadata = {
      id: snapId,
      dbId,
      label,
      sizeBytes: bytes.byteLength,
      createdAt: this.now(),
      reason,
      path: finalPath,
    }

    // 4. Update the in-memory cache.
    const list = this.cache.get(dbId) ?? []
    list.push(meta)
    this.cache.set(dbId, list)

    // 5. Apply LRU + global policies if enabled.
    if (this.policy.autoPrune) {
      await this.prune(dbId)
    }

    // Reference the original filename in the in-memory entry to make
    // debugging easier (not exposed publicly — only the `sizeBytes` and
    // the basic fields are part of the SnapshotMetadata contract).
    void filename

    return toPublic(meta)
  }

  /**
   * Restore a previously captured snapshot onto the live database.
   *
   * The restore is at file level: we close the live connection, write
   * the snapshot bytes to the original file location, then reopen. The
   * current contents of the live DB are overwritten in place; any
   * pre-restore snapshot MUST be taken by the caller (the typical
   * pattern is `capture(dbId, 'auto: pre-restore', 'pre-restore')`
   * right before invoking `restore`).
   */
  async restore(dbId: number, snapId: string): Promise<void> {
    this.ensureDbOpen(dbId)
    await this.prime(dbId)

    const meta = this.findMeta(dbId, snapId)
    const { filename, mode } = this.dbs.get(dbId)

    // 1. Read the snapshot bytes (VFS-level — independent of any open
    //    SQLite connection).
    const bytes = await this.io.read(meta.path).catch((e) => {
      throw new SnapshotIoError(meta.path, e)
    })

    // 2. Close the live DB so SQLite releases the file lock.
    await this.dbs.close(dbId)

    // 3. Overwrite the live file with the snapshot bytes.
    try {
      await this.io.write(filename, bytes)
    } catch (e) {
      // Best-effort reopen with whatever the file looked like before.
      // If even the reopen fails, the caller will see the DatabaseNotFoundError
      // on the next operation; we surface the write error first.
      await this.dbs.open(dbId, filename, mode).catch(() => undefined)
      throw new SnapshotIoError(filename, e)
    }

    // 4. Reopen the database.
    await this.dbs.open(dbId, filename, mode)
  }

  /** Return the snapshots for `dbId`, sorted by `createdAt` ascending. */
  async list(dbId: number): Promise<SnapshotMetadata[]> {
    this.ensureDbOpen(dbId)
    await this.prime(dbId)
    const list = this.cache.get(dbId) ?? []
    return [...list]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(toPublic)
  }

  /** Delete a single snapshot. No-op when the snapshot does not exist. */
  async delete(dbId: number, snapId: string): Promise<void> {
    await this.prime(dbId)
    const list = this.cache.get(dbId) ?? []
    const idx = list.findIndex((m) => m.id === snapId)
    if (idx === -1) return
    const meta = list[idx]!
    try {
      await this.io.delete(meta.path)
    } finally {
      list.splice(idx, 1)
      if (list.length === 0) this.cache.delete(dbId)
      else this.cache.set(dbId, list)
    }
  }

  /**
   * Apply the LRU + global policies. Public so the main thread can
   * trigger a manual prune (e.g. after deleting a user DB).
   */
  async prune(dbId?: number): Promise<{ evicted: SnapshotMetadata[]; bytesReclaimed: number }> {
    const evicted: SnapshotMetadata[] = []
    let bytesReclaimed = 0

    // 1. Per-database LRU.
    if (dbId !== undefined) {
      await this.prime(dbId)
      const list = this.cache.get(dbId) ?? []
      if (list.length > this.policy.maxPerDatabase) {
        const sorted = [...list].sort((a, b) => a.createdAt - b.createdAt)
        const overflow = sorted.slice(0, list.length - this.policy.maxPerDatabase)
        for (const m of overflow) {
          await this.io.delete(m.path).catch(() => undefined)
          bytesReclaimed += m.sizeBytes
          evicted.push(toPublic(m))
        }
        const survivors = sorted.slice(sorted.length - this.policy.maxPerDatabase)
        this.cache.set(dbId, survivors)
      }
    }

    // 2. Global byte cap.
    const all = this.flatten()
    let total = all.reduce((acc, m) => acc + m.sizeBytes, 0)
    if (total > this.policy.maxGlobalBytes) {
      const sorted = [...all].sort((a, b) => a.createdAt - b.createdAt)
      for (const m of sorted) {
        if (total <= this.policy.maxGlobalBytes) break
        await this.io.delete(m.path).catch(() => undefined)
        total -= m.sizeBytes
        bytesReclaimed += m.sizeBytes
        evicted.push(toPublic(m))
        const list = this.cache.get(m.dbId) ?? []
        const idx = list.findIndex((x) => x.id === m.id)
        if (idx !== -1) {
          list.splice(idx, 1)
          if (list.length === 0) this.cache.delete(m.dbId)
          else this.cache.set(m.dbId, list)
        }
      }
    }

    return { evicted, bytesReclaimed }
  }

  /** Diagnostics: total bytes across all snapshots. */
  totalBytes(): number {
    return this.flatten().reduce((acc, m) => acc + m.sizeBytes, 0)
  }

  /* ------------------------------------------------------------------ *
   *  Internals                                                         *
   * ------------------------------------------------------------------ */

  private ensureDbOpen(dbId: number): void {
    // Throws DatabaseNotFoundError when the dbId is not open.
    this.dbs.get(dbId)
  }

  private findMeta(dbId: number, snapId: string): InternalMetadata {
    const list = this.cache.get(dbId) ?? []
    const meta = list.find((m) => m.id === snapId)
    if (!meta) throw new SnapshotNotFoundError(dbId, snapId)
    return meta
  }

  private flatten(): InternalMetadata[] {
    const out: InternalMetadata[] = []
    for (const list of this.cache.values()) out.push(...list)
    return out
  }

  /**
   * Lazily scan the VFS for existing snapshots of `dbId` and populate
   * the in-memory cache. Idempotent: subsequent calls for the same
   * `dbId` are a no-op.
   *
   * The scan enumerates files under `.snapshots/<dbId>/` and reconstructs
   * `SnapshotMetadata` from the filename + VFS-level size. Snapshots
   * captured by a previous Worker session surface here unchanged.
   */
  private async prime(dbId: number): Promise<void> {
    if (this.primed.has(dbId)) return
    this.primed.add(dbId)
    const dir = joinPath(STORAGE_ROOTS.snapshots, String(dbId))
    let files: string[]
    try {
      files = await this.io.list(dir)
    } catch {
      // Empty / missing directory — fine, no snapshots yet.
      this.cache.set(dbId, [])
      return
    }
    const out: InternalMetadata[] = []
    for (const file of files) {
      // Skip temp files from concurrent captures.
      if (/\/tmp-/.test(file)) continue
      const base = file.split('/').pop() ?? file
      if (!base.endsWith('.db')) continue
      const id = base.replace(/\.db$/, '')
      // Defensive: skip already-known IDs (e.g. when prime is called
      // twice in a row for the same dbId).
      if (out.some((m) => m.id === id)) continue
      const size = await this.io.size(file).catch(() => 0)
      out.push({
        id,
        dbId,
        label: id,
        sizeBytes: size,
        // The filename is `snap-<timestamp>-<rand>`; parse the timestamp
        // when possible so the LRU order is correct across Worker
        // restarts. Falls back to "now" if the format is unknown.
        createdAt: parseSnapIdTimestamp(id) ?? this.now(),
        reason: 'auto',
        path: file,
      })
    }
    out.sort((a, b) => a.createdAt - b.createdAt)
    this.cache.set(dbId, out)
  }

  /** Used by the ImportExportManager to remove all snapshots for a DB. */
  async removeAllForDb(dbId: number): Promise<void> {
    await this.prime(dbId)
    const list = this.cache.get(dbId) ?? []
    for (const m of list) {
      await this.io.delete(m.path).catch(() => undefined)
    }
    this.cache.delete(dbId)
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers                                                              *
 * ──────────────────────────────────────────────────────────────────── */

function toPublic(m: InternalMetadata): SnapshotMetadata {
  return {
    id: m.id,
    dbId: m.dbId,
    label: m.label,
    sizeBytes: m.sizeBytes,
    createdAt: m.createdAt,
    reason: m.reason,
  }
}

function quoteVacuumInto(path: string): string {
  // Escape single quotes by doubling them — the path is wrapped in
  // single quotes so the statement is valid even when the path itself
  // contains quotes.
  const escaped = path.replace(/'/g, "''")
  return `VACUUM INTO '${escaped}';`
}

function safeErrmsg(sqlite3: SQLiteForSnapshot, db: number): string {
  try {
    return sqlite3.errmsg(db)
  } catch {
    return ''
  }
}

function isVfsMissing(e: unknown): boolean {
  if (e && typeof e === 'object' && 'name' in e) {
    return (e as { name?: string }).name === 'VfsFileNotFoundError'
  }
  return false
}

const SNAP_ID_PREFIX = 'snap-'

/** `snap-<timestamp>-<rand>` → timestamp, or null if the format is unknown. */
function parseSnapIdTimestamp(id: string): number | null {
  if (!id.startsWith(SNAP_ID_PREFIX)) return null
  const rest = id.slice(SNAP_ID_PREFIX.length)
  const dash = rest.indexOf('-')
  if (dash === -1) return null
  const ts = Number(rest.slice(0, dash))
  if (!Number.isFinite(ts) || ts <= 0) return null
  return ts
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Re-exports for tests / external callers                              *
 * ──────────────────────────────────────────────────────────────────── */

export { snapshotRelativePath, SNAPSHOTS_ROOT }
export type { InternalMetadata as _InternalMetadata }
export type { VfsFileNotFoundError }
