/**
 * VFS-agnostic file IO used by the storage managers.
 *
 * The snapshot / import / export managers need to read & write arbitrary
 * bytes to "the same place" that wa-sqlite writes to via its VFS. There is
 * no portable way to ask the VFS for raw bytes — `sqlite3_serialize` is
 * not exported in wa-sqlite 1.0.0 (POC-1 verdict), and the VFS interface
 * does not expose file contents to JavaScript directly.
 *
 * The strategy is therefore:
 *
 *  1. Issue `VACUUM INTO '<temp-path>'` against the SQLite connection —
 *     this delegates the actual byte-writing to the VFS (whatever that
 *     is: OPFS, IndexedDB, in-memory). The file lives in the same VFS
 *     the manager already uses for the user database.
 *  2. Read the bytes back through a VFS-aware IO implementation:
 *       - `opfs-sync` / `opfs-async`  → `navigator.storage.getDirectory()`
 *       - `idb`                       → IndexedDB
 *       - `memory`                    → the in-memory map exposed by
 *                                       `MemoryVFS` (test-only)
 *  3. (optional) delete the temp file through the same IO.
 *
 * The `VfsIO` interface is the single chokepoint the rest of the storage
 * code depends on. The production wiring in `sqlite.worker.ts` picks the
 * right implementation based on the active VFS name; the unit tests
 * inject a `MemoryVfsIO` that is built on top of the very same
 * `MemoryVFS` instance that the test registered.
 *
 * The interface is intentionally tiny: read, write, delete, exists, size,
 * list. No transactional / atomic semantics — the storage managers
 * handle their own atomicity (write to temp + rename, etc.) when needed.
 */
import { SNAPSHOTS_ROOT, USER_DB_ROOT, EXERCISE_DB_ROOT } from './serialization-helper'
import type { StorageCapability } from './types'

/* ──────────────────────────────────────────────────────────────────── *
 *  Interface                                                            *
 * ──────────────────────────────────────────────────────────────────── */

export interface VfsIO {
  /** Read the full file as bytes. Throws when the file is missing. */
  read(filename: string): Promise<Uint8Array>

  /** Write the bytes to the file. Creates parent directories as needed. */
  write(filename: string, bytes: Uint8Array): Promise<void>

  /** Delete the file. No-op when the file does not exist. */
  delete(filename: string): Promise<void>

  /** True when the file exists. */
  exists(filename: string): Promise<boolean>

  /** Size in bytes; `0` when the file does not exist. */
  size(filename: string): Promise<number>

  /**
   * List every file whose path starts with `prefix` (a directory).
   * Returns the relative paths (not absolute). Returned in no particular
   * order — callers sort when they need determinism.
   */
  list(prefix: string): Promise<string[]>
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Errors                                                               *
 * ──────────────────────────────────────────────────────────────────── */

export class VfsFileNotFoundError extends Error {
  constructor(filename: string) {
    super(`VFS file not found: ${filename}`)
    this.name = 'VfsFileNotFoundError'
  }
}

export class VfsUnsupportedError extends Error {
  constructor(vfsName: string) {
    super(`VfsIO does not support VFS "${vfsName}"`)
    this.name = 'VfsUnsupportedError'
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Path normalisation                                                   *
 * ──────────────────────────────────────────────────────────────────── */

/** Strip the optional `opfs:/` URI prefix that wa-sqlite accepts in paths. */
export function stripVfsUri(filename: string): string {
  return filename.replace(/^opfs:\/+/, '')
}

/** Split a relative path into its directory parts and basename. */
export function splitPath(filename: string): { dir: string; base: string } {
  const cleaned = stripVfsUri(filename).replace(/^\/+/, '').replace(/\/+$/, '')
  if (cleaned === '') return { dir: '', base: '' }
  const idx = cleaned.lastIndexOf('/')
  if (idx === -1) return { dir: '', base: cleaned }
  return { dir: cleaned.slice(0, idx), base: cleaned.slice(idx + 1) }
}

/** Join parts with forward slashes (the convention all VFSs use). */
export function joinPath(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/^\/+/, '').replace(/\/+$/, ''))
    .filter((p) => p.length > 0)
    .join('/')
}

/* ──────────────────────────────────────────────────────────────────── *
 *  MemoryVfsIO — test-only implementation backed by a MemoryVFS        *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Shape of the relevant public state of `MemoryVFS`. We import the
 * `MemoryVFS` class structurally (the `wa-sqlite` package ships no
 * `.d.ts` for the examples), so we describe the parts we touch.
 */
export interface MemoryVfsLike {
  name: string
  mapNameToFile: Map<string, { name: string; flags: number; size: number; data: ArrayBuffer }>
}

/**
 * Reads / writes through the in-memory map of a `MemoryVFS`. Suitable
 * for unit tests and as a last-resort production fallback when no other
 * VFS is available (the storage task surfaces an explicit warning).
 */
export class MemoryVfsIO implements VfsIO {
  private readonly vfs: MemoryVfsLike

  constructor(vfs: MemoryVfsLike) {
    this.vfs = vfs
  }

  async read(filename: string): Promise<Uint8Array> {
    const file = this.vfs.mapNameToFile.get(stripVfsUri(filename))
    if (!file) throw new VfsFileNotFoundError(filename)
    // `data` is the (possibly oversized) ArrayBuffer; `size` is the
    // logical file size. Slice both ways to avoid exposing the padding.
    const out = new Uint8Array(file.size)
    out.set(new Uint8Array(file.data, 0, file.size))
    return out
  }

  async write(filename: string, bytes: Uint8Array): Promise<void> {
    const name = stripVfsUri(filename)
    // Re-use the existing entry if any — same as MemoryVFS.xOpen would.
    const buf = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buf).set(bytes)
    this.vfs.mapNameToFile.set(name, { name, flags: 0, size: bytes.byteLength, data: buf })
  }

  async delete(filename: string): Promise<void> {
    this.vfs.mapNameToFile.delete(stripVfsUri(filename))
  }

  async exists(filename: string): Promise<boolean> {
    return this.vfs.mapNameToFile.has(stripVfsUri(filename))
  }

  async size(filename: string): Promise<number> {
    return this.vfs.mapNameToFile.get(stripVfsUri(filename))?.size ?? 0
  }

  async list(prefix: string): Promise<string[]> {
    const wanted = stripVfsUri(prefix).replace(/^\/+/, '').replace(/\/+$/, '')
    const out: string[] = []
    for (const name of this.vfs.mapNameToFile.keys()) {
      if (wanted === '' || name === wanted || name.startsWith(wanted + '/')) {
        out.push(name)
      }
    }
    return out
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  OpfsVfsIO — production implementation against OPFS                   *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Read / write access to OPFS through the standard `navigator.storage`
 * API. wa-sqlite's `AccessHandlePoolVFS` (sync, requires COOP+COEP) and
 * `OriginPrivateFileSystemVFS` (async, no COOP+COEP) both ultimately
 * land files in OPFS, so the same reader works for either of them.
 *
 * Path semantics: wa-sqlite accepts `opfs:/...` URI paths and bare
 * relative paths alike. We strip the `opfs:/` prefix and walk the OPFS
 * directory tree. Slashes in the path are translated 1:1.
 */
export class OpfsVfsIO implements VfsIO {
  /** Cached root directory handle — fetched once per `OpfsVfsIO`. */
  private readonly rootPromise: Promise<FileSystemDirectoryHandle>

  constructor() {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
      throw new VfsUnsupportedError('opfs')
    }
    this.rootPromise = navigator.storage.getDirectory()
  }

  async read(filename: string): Promise<Uint8Array> {
    const fileHandle = await this.getFileHandle(filename, /* create */ false)
    const file = await fileHandle.getFile()
    const buf = await file.arrayBuffer()
    return new Uint8Array(buf)
  }

  async write(filename: string, bytes: Uint8Array): Promise<void> {
    const { dir, base } = splitPath(filename)
    const dirHandle = await this.getDirHandle(dir, /* create */ true)
    const fileHandle = await dirHandle.getFileHandle(base, { create: true })
    // `createWritable()` returns a `FileSystemWritableFileStream` — we
    // write the entire buffer in one go and close.
    const writable = await fileHandle.createWritable()
    try {
      // Pass through an ArrayBuffer view to avoid Blob/typed-array quirks.
      // The DOM lib types the writable as accepting a strict
      // `ArrayBufferView<ArrayBuffer>` (not `ArrayBufferView<ArrayBufferLike>`
      // — i.e. SharedArrayBuffer is excluded). We copy into a fresh
      // Uint8Array to satisfy the lib type.
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      await writable.write(copy)
    } finally {
      await writable.close()
    }
  }

  async delete(filename: string): Promise<void> {
    const { dir, base } = splitPath(filename)
    try {
      const dirHandle = await this.getDirHandle(dir, /* create */ false)
      await dirHandle.removeEntry(base, { recursive: false })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return
      throw e
    }
  }

  async exists(filename: string): Promise<boolean> {
    try {
      await this.getFileHandle(filename, /* create */ false)
      return true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return false
      throw e
    }
  }

  async size(filename: string): Promise<number> {
    try {
      const fileHandle = await this.getFileHandle(filename, /* create */ false)
      const file = await fileHandle.getFile()
      return file.size
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return 0
      throw e
    }
  }

  async list(prefix: string): Promise<string[]> {
    // Walk the directory tree under `prefix`, collecting every file.
    const base = stripVfsUri(prefix).replace(/^\/+/, '').replace(/\/+$/, '')
    const root = await this.getDirHandle(base, /* create */ false).catch(() => null)
    if (!root) return []
    const out: string[] = []
    await walkDir(root, base, out)
    return out
  }

  /* ------------------------------------------------------------------ *
   *  Helpers                                                          *
   * ------------------------------------------------------------------ */

  private async getDirHandle(path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    let dir = await this.rootPromise
    if (path === '') return dir
    for (const segment of path.split('/').filter((s) => s.length > 0)) {
      dir = await dir.getDirectoryHandle(segment, { create })
    }
    return dir
  }

  private async getFileHandle(path: string, create: boolean): Promise<FileSystemFileHandle> {
    const { dir, base } = splitPath(path)
    const dirHandle = await this.getDirHandle(dir, create)
    return dirHandle.getFileHandle(base, { create })
  }
}

async function walkDir(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: string[],
): Promise<void> {
  // `values()` on a directory handle is async — collect synchronously via
  // the for-await-of API.
  for await (const [name, handle] of dir.entries()) {
    const full = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'file') {
      out.push(full)
    } else {
      await walkDir(handle, full, out)
    }
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  IdbVfsIO — production fallback against IndexedDB                    *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Reads / writes through the IndexedDB database that wa-sqlite's
 * `IDBBatchAtomicVFS` uses. The exact DB name & object store layout is
 * private to that VFS, so the simplest portable approach is:
 *
 *  - We do not attempt to read raw bytes back through IndexedDB in this
 *    implementation. The storage managers use `IDB` VFS only as a
 *    fallback; in practice the OPFS path is taken first.
 *  - The class is still importable so the production wiring can pick it
 *    when no OPFS is available — it exposes a `read`/`write` that throws
 *    a clear `VfsUnsupportedError` for the byte path while `exists` /
 *    `size` / `list` fall back to nothing (always 0 / empty).
 *
 * The "raw bytes via IDB" path is left for a future task; for the scope
 * of this iteration, OPFS is the canonical production VFS and IDB is a
 * capability-reporter fallback (the user sees a warning and can still
 * execute SQL — they just cannot take snapshots / export databases
 * across reloads without OPFS).
 */
export class IdbVfsIO implements VfsIO {
  async read(_filename: string): Promise<Uint8Array> {
    throw new VfsUnsupportedError('idb (byte access is not supported — use OPFS when available)')
  }

  async write(_filename: string, _bytes: Uint8Array): Promise<void> {
    throw new VfsUnsupportedError('idb (byte access is not supported — use OPFS when available)')
  }

  async delete(_filename: string): Promise<void> {
    throw new VfsUnsupportedError('idb (byte access is not supported — use OPFS when available)')
  }

  async exists(_filename: string): Promise<boolean> {
    return false
  }

  async size(_filename: string): Promise<number> {
    return 0
  }

  async list(_prefix: string): Promise<string[]> {
    return []
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Factory                                                              *
 * ──────────────────────────────────────────────────────────────────── */

export interface VfsIOFactoryResult {
  io: VfsIO
  /** The IO class that ended up wired — useful for diagnostics. */
  kind: 'opfs' | 'idb' | 'memory' | 'none'
  /** True when byte read/write is available; false for IDB / none. */
  supportsBytes: boolean
}

/**
 * Pick the right IO implementation for the active VFS.
 *
 * The VFS name comes from `DatabaseManager.getVfsName()`. The mapping:
 *
 *  - `opfs-sync`, `opfs-async`              → `OpfsVfsIO` (production)
 *  - `idb`                                  → `IdbVfsIO`  (best-effort)
 *  - `memory` (+ optional `vfsInstance`)    → `MemoryVfsIO`
 *  - anything else                          → `IdbVfsIO` (placeholder)
 */
export function createVfsIO(
  vfsName: string,
  capability: StorageCapability,
  memoryVfs?: MemoryVfsLike,
): VfsIOFactoryResult {
  if (vfsName === 'memory' && memoryVfs) {
    return { io: new MemoryVfsIO(memoryVfs), kind: 'memory', supportsBytes: true }
  }
  if (vfsName === 'memory') {
    // Memory VFS without an instance — we can still create a no-op IO.
    return { io: new IdbVfsIO(), kind: 'none', supportsBytes: false }
  }
  if (vfsName === 'opfs-sync' || vfsName === 'opfs-async' || capability === 'opfs-sync' || capability === 'opfs-async') {
    try {
      return { io: new OpfsVfsIO(), kind: 'opfs', supportsBytes: true }
    } catch {
      return { io: new IdbVfsIO(), kind: 'idb', supportsBytes: false }
    }
  }
  if (vfsName === 'idb' || capability === 'idb') {
    return { io: new IdbVfsIO(), kind: 'idb', supportsBytes: false }
  }
  return { io: new IdbVfsIO(), kind: 'none', supportsBytes: false }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Path helpers re-exported (the storage managers use the same roots)   *
 * ──────────────────────────────────────────────────────────────────── */

export const STORAGE_ROOTS = {
  snapshots: SNAPSHOTS_ROOT,
  user: USER_DB_ROOT,
  exercises: EXERCISE_DB_ROOT,
  /** Temp directory for the duration of a single capture / export call. */
  tmp: '.tmp',
  /** Trash directory — files moved here before being purged, lets us
   *  surface a "recycle bin" UX in a future iteration. */
  trash: '.trash',
} as const
