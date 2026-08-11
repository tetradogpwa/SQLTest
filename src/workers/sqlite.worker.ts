/// <reference lib="webworker" />

/**
 * Dedicated SQLite worker entry point.
 *
 * The worker boots wa-sqlite, registers a persistent VFS (OPFS when
 * available, IndexedDB as fallback, in-memory last resort) and exposes
 * the {@link DBAPI} façade to the Main Thread via Comlink.
 *
 * Boot sequence:
 *   1. Locate the `wa-sqlite.wasm` URL (Vite-injected at build time).
 *   2. Initialise the Emscripten module via `SQLiteESMFactory`.
 *   3. Wrap with the high-level API via `wa-sqlite/src/sqlite-api.js`.
 *   4. Try to register `AccessHandlePoolVFS` (sync OPFS) →
 *      `OriginPrivateFileSystemVFS` (async OPFS) →
 *      `IDBBatchAtomicVFS` (IndexedDB) → `MemoryVFS` (last resort).
 *   5. Construct the manager classes and `DBAPI`; expose via Comlink.
 *
 * NOTE on `OPFSCoopSyncVFS` (RESEARCH §1.1):
 *   The research names `OPFSCoopSyncVFS` as the VFS of choice. The
 *   symbol does NOT exist in `wa-sqlite@1.0.0`; the canonical sync
 *   OPFS implementation is `AccessHandlePoolVFS`. The async equivalent
 *   is `OriginPrivateFileSystemVFS`. We wire the production code to
 *   both so the runtime picks the best one available. The choice is
 *   reflected in the `capability` field of `InitResult`.
 *
 * Timeouts: enforced via `sqlite3_progress_handler` with
 * `vmSteps = 1000` (POC-2 verdict). `sqlite3_interrupt` is NOT
 * available in wa-sqlite 1.0.0 (POC-1/POC-2).
 *
 * Snapshots: VACUUM INTO (POC-1 verdict). No `sqlite3_serialize` here.
 */

import * as Comlink from 'comlink'

// wa-sqlite's main entry is the high-level API; the WASM bundle is
// reached via `dist/wa-sqlite.mjs`. The "OPFSCoopSyncVFS" name from
// the spec doesn't exist in wa-sqlite 1.0.0 — the closest equivalent
// is `AccessHandlePoolVFS` (see scripts/sync-wa-sqlite.mjs).
// @ts-expect-error — wa-sqlite doesn't ship .d.ts for the dist bundle
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
// @ts-expect-error — no upstream types for these internal files
import { Factory as SQLiteFactory } from 'wa-sqlite/src/sqlite-api.js'
// @ts-expect-error — same
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js'
// @ts-expect-error
import { OriginPrivateFileSystemVFS } from 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js'
// @ts-expect-error
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js'
// @ts-expect-error
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js'

import { DatabaseManager, type SQLiteForDatabase } from './database-manager'
import { QueryExecutor, type SQLiteForExec } from './query-executor'
import { TimeoutController, type SQLiteForTimeout } from './timeout-controller'
import { ErrorTranslator, type SQLiteForErrors } from './error-translator'
import { DBAPI, type SQLiteForDbapi } from './dbapi'
import { SnapshotManager } from './snapshot-manager'
import { SchemaManager } from './schema-manager'
import { ImportExportManager } from './import-export-manager'
import {
  createVfsIO,
  type MemoryVfsLike,
  type VfsIO,
} from './vfs-io'
import type { InitResult, StorageCapability } from './types'

/* ──────────────────────────────────────────────────────────────────── *
 *  Vite asset URL                                                       *
 * ──────────────────────────────────────────────────────────────────── */

declare const self: DedicatedWorkerGlobalScope

// The `?url` suffix makes Vite resolve the import to a public URL.
// In dev, Vite serves the file from `node_modules/wa-sqlite/dist/`
// with the correct `application/wasm` MIME type. In production, Vite
// copies it under `dist/assets/wa-sqlite-<hash>.wasm` and the
// `injectManifest` glob pattern (`*.wasm`) precaches it.
//
// We must NOT compute this URL from `import.meta.url` here: in the dev
// worker that resolves relative to `src/workers/sqlite.worker.ts`,
// yielding a 404 → HTML response → the magic bytes 3c 21 64 6f
// (`<!do…`) instead of 00 61 73 6d (the WASM magic).
// `sync-wa-sqlite.mjs` still copies `public/wa-sqlite.wasm` so the
// precache `includeAssets` list keeps working for any code that
// references the public URL directly.
import waSqliteWasmUrl from 'wa-sqlite/dist/wa-sqlite.wasm?url'
const WASM_URL: string = waSqliteWasmUrl

/* ──────────────────────────────────────────────────────────────────── *
 *  Boot                                                                 *
 * ──────────────────────────────────────────────────────────────────── */

interface BootResult {
  sqlite3: SQLiteForDbapi
  vfsName: string
  capability: StorageCapability
  version: string
  /**
   * Reference to the live VFS instance — only populated for the
   * `MemoryVFS` path (needed by `MemoryVfsIO` to read/write files).
   * For the OPFS / IDB VFSs the instance is held by the wa-sqlite
   * runtime and the IO layer uses `navigator.storage` / `indexedDB`
   * directly, so the reference is `null`.
   */
  vfsInstance: MemoryVfsLike | null
}

/**
 * Try to register the given VFS class. Returns the registered VFS name
 * and instance (the class's own `.name` property + the live object) on
 * success, `null` on failure. The instance is needed for the
 * `MemoryVfsIO` reader — for the OPFS / IDB VFSs the instance is
 * captured but not used.
 */
async function tryRegisterVFS(
  sqlite3: { vfs_register: (vfs: { name: string }, makeDefault?: boolean) => number },
  Ctor: new () => { name: string },
  makeDefault: boolean,
): Promise<{ name: string; instance: { name: string } } | null> {
  try {
    const vfs = new Ctor()
    const rc = sqlite3.vfs_register(vfs, makeDefault)
    if (rc !== 0) return null
    return { name: vfs.name, instance: vfs }
  } catch {
    return null
  }
}

/** Boot wa-sqlite and pick the best VFS we can register. */
async function bootWaSqlite(): Promise<BootResult> {
  // 1. Initialise the Emscripten module.
  const Module = (await SQLiteESMFactory({
    locateFile: (file: string) => {
      // Point at the Vite-served WASM, falling back to the relative path.
      if (file.endsWith('.wasm')) return WASM_URL
      return file
    },
  })) as {
    ready: Promise<unknown>
    ccall: (name: string, ret: string, args: string[], params: unknown[]) => unknown
  }
  await Module.ready

  // 2. Wrap with the high-level API.
  const sqlite3Raw = SQLiteFactory(Module as unknown as Parameters<typeof SQLiteFactory>[0])
  const sqlite3 = sqlite3Raw as unknown as SQLiteForDbapi & {
    vfs_register: (vfs: { name: string }, makeDefault?: boolean) => number
  }

  // 3. Register the best VFS we can.
  //    Order: sync OPFS → async OPFS → IndexedDB → in-memory.
  let vfsName: string | null = null
  let vfsInstance: { name: string } | null = null
  let capability: StorageCapability = 'memory'

  if (vfsName === null) {
    const r = await tryRegisterVFS(sqlite3, AccessHandlePoolVFS, true)
    if (r) {
      vfsName = r.name
      vfsInstance = r.instance
      capability = 'opfs-sync'
    }
  }
  if (vfsName === null) {
    const r = await tryRegisterVFS(sqlite3, OriginPrivateFileSystemVFS, true)
    if (r) {
      vfsName = r.name
      vfsInstance = r.instance
      capability = 'opfs-async'
    }
  }
  if (vfsName === null) {
    const r = await tryRegisterVFS(sqlite3, IDBBatchAtomicVFS, true)
    if (r) {
      vfsName = r.name
      vfsInstance = r.instance
      capability = 'idb'
    }
  }
  if (vfsName === null) {
    const r = await tryRegisterVFS(sqlite3, MemoryVFS, true)
    if (r) {
      vfsName = r.name
      vfsInstance = r.instance
      capability = 'memory'
    }
  }

  if (vfsName === null || vfsInstance === null) {
    throw new Error('Failed to register any VFS — wa-sqlite is unusable.')
  }

  // 4. Read the SQLite library version (used in `init`).
  const version = safe(() => sqlite3.libversion(), 'unknown')

  return { sqlite3, vfsName, capability, version, vfsInstance: vfsInstance as MemoryVfsLike }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  DBAPI construction                                                   *
 * ──────────────────────────────────────────────────────────────────── */

function buildDbapi(boot: BootResult): DBAPI {
  // Cast the high-level API to the narrower interface each manager needs.
  // The production wa-sqlite object satisfies all of them.
  const sqlite3 = boot.sqlite3
  const dbAdapter = sqlite3 as unknown as SQLiteForDatabase
  const execAdapter = sqlite3 as unknown as SQLiteForExec
  const timeoutAdapter = sqlite3 as unknown as SQLiteForTimeout
  const errorAdapter = sqlite3 as unknown as SQLiteForErrors

  const dbs = new DatabaseManager(dbAdapter)
  dbs.configure({ vfsName: boot.vfsName, capability: boot.capability })
  dbs.setSizeEstimator(async (filename) => {
    // Best-effort: the OPFS / IDB VFSs don't expose file size directly
    // through the high-level API; the storage manager layer knows the
    // exact VFS and provides a real size via the VfsIO interface.
    const vfsIoResult = createVfsIO(boot.vfsName, boot.capability, boot.vfsInstance ?? undefined)
    try {
      return await vfsIoResult.io.size(filename)
    } catch {
      return 0
    }
  })

  const translator = new ErrorTranslator(errorAdapter)
  const timeouts = new TimeoutController(timeoutAdapter)
  const executor = new QueryExecutor(dbs, timeouts, translator, execAdapter)

  // Storage managers (worker-storage-path task).
  // The VFS-aware IO layer is selected based on the active VFS name.
  // For `opfs-sync` / `opfs-async` we use `navigator.storage.getDirectory()`;
  // for `idb` we degrade gracefully (the IO throws on byte access); for
  // `memory` (the dev / test fallback) we read the VFS's internal map
  // directly through `MemoryVfsIO`.
  const vfsIo: VfsIO = createVfsIO(boot.vfsName, boot.capability, boot.vfsInstance ?? undefined).io

  // The storage managers need a sqlite3 adapter that exposes `exec`,
  // `errmsg` and (for the schema manager) `execWithParams`. The
  // production wa-sqlite object satisfies all of them. We use the
  // full `SQLiteForDbapi` adapter (which extends `SQLiteForExec` and
  // includes `errmsg`).
  const storageAdapter = sqlite3

  const snapshots = new SnapshotManager({
    dbs,
    sqlite3: storageAdapter,
    io: vfsIo,
  })
  const schemaMgr = new SchemaManager({
    dbs,
    sqlite3: storageAdapter,
  })
  const io = new ImportExportManager({
    dbs,
    snapshots,
    schema: schemaMgr,
    sqlite3: storageAdapter,
    io: vfsIo,
  })

  return new DBAPI({
    dbs,
    executor,
    timeouts,
    translator,
    sqlite3,
    snapshots,
    schema: schemaMgr,
    io,
  })
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Worker entry point                                                   *
 * ──────────────────────────────────────────────────────────────────── */

let dbapi: DBAPI | null = null
let lastBoot: BootResult | null = null

async function handleInit(): Promise<InitResult> {
  if (!dbapi) {
    lastBoot = await bootWaSqlite()
    dbapi = buildDbapi(lastBoot)
  }
  return dbapi.init()
}

// Comlink exposes the public API. The `init` call returns a richer
// object (with capability + version) than the rest of the API.
const api = {
  init: () => handleInit(),
  open: (dbId: number, filename: string, mode?: 'read' | 'write' | 'readwrite') => {
    ensureReady()
    return dbapi!.open(dbId, filename, mode)
  },
  close: (dbId: number) => {
    ensureReady()
    return dbapi!.close(dbId)
  },
  closeAll: () => {
    ensureReady()
    return dbapi!.closeAll()
  },
  exec: (dbId: number, sql: string, options?: Parameters<DBAPI['exec']>[2]) => {
    ensureReady()
    return dbapi!.exec(dbId, sql, options)
  },
  cancel: (dbId: number) => {
    ensureReady()
    return dbapi!.cancel(dbId)
  },
  schema: (dbId: number) => {
    ensureReady()
    return dbapi!.schema(dbId)
  },
  snapshot: (dbId: number, label: string, reason?: Parameters<DBAPI['snapshot']>[2]) => {
    ensureReady()
    return dbapi!.snapshot(dbId, label, reason)
  },
  restore: (dbId: number, snapId: string) => {
    ensureReady()
    return dbapi!.restore(dbId, snapId)
  },
  listSnapshots: (dbId: number) => {
    ensureReady()
    return dbapi!.listSnapshots(dbId)
  },
  deleteSnapshot: (dbId: number, snapId: string) => {
    ensureReady()
    return dbapi!.deleteSnapshot(dbId, snapId)
  },
  import: (bytes: Uint8Array, targetName: string) => {
    ensureReady()
    return dbapi!.import(bytes, targetName)
  },
  export: (dbId: number) => {
    ensureReady()
    return dbapi!.export(dbId)
  },
  listUserDatabases: () => {
    ensureReady()
    return dbapi!.listUserDatabases()
  },
  deleteUserDatabase: (dbId: number) => {
    ensureReady()
    return dbapi!.deleteUserDatabase(dbId)
  },
  createUserDatabase: (name: string) => {
    ensureReady()
    return dbapi!.createUserDatabase(name)
  },
}

function ensureReady(): void {
  if (!dbapi) {
    throw new Error('DBAPI not initialised. Call `init()` first.')
  }
}

Comlink.expose(api)

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers                                                              *
 * ──────────────────────────────────────────────────────────────────── */

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

// Help TypeScript understand this is a module.
export {}
