/**
 * Test harness for the storage managers.
 *
 * The snapshot / schema / import-export managers depend on a real
 * wa-sqlite runtime (so the `VACUUM INTO` round-trip can actually
 * happen). This helper loads the same wa-sqlite bundle as POC-1 /
 * POC-4 — `wa-sqlite.mjs` with the `MemoryVFS` example — and exposes
 * a `MemoryVfsLike` instance so the `MemoryVfsIO` can read / write
 * bytes directly.
 *
 * The harness is deliberately minimal: it returns the `sqlite3`
 * high-level API + the `MemoryVFS` instance, and tears itself down
 * at the end of the test.
 */

// @ts-expect-error — wa-sqlite's dist bundle ships no .d.ts
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
// @ts-expect-error — no upstream types
import { Factory as SQLiteFactory } from 'wa-sqlite/src/sqlite-api.js'
// @ts-expect-error — same
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { MemoryVfsLike } from '../../src/workers/vfs-io'

/** Minimal interface the storage tests rely on. */
export interface TestSqlite {
  libversion: () => string
  open_v2: (filename: string, flags?: number, vfsName?: string) => Promise<number>
  close: (db: number) => Promise<number> | number
  exec: (db: number, sql: string) => Promise<number>
  execWithParams: (
    db: number,
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: unknown[][]; columns: string[] }>
  changes: (db: number) => number
  last_insert_rowid: (db: number) => number
  errmsg: (db: number) => string
  vfs_register: (vfs: { name: string }, makeDefault?: boolean) => number
}

export interface Harness {
  sqlite3: TestSqlite
  vfs: MemoryVfsLike
  /** WASM module — kept around for the very last test that needs `_malloc`. */
  Module: { _malloc: (n: number) => number; _free: (p: number) => void; HEAPU8: Uint8Array }
  /** Open a database with a fresh handle; the caller is responsible for closing. */
  open(filename: string): Promise<number>
  /** Close a previously opened handle. Safe to call on stale handles. */
  close(db: number): Promise<void>
  /** Wipe every file from the MemoryVFS — call between tests for isolation. */
  reset(): void
  /** Total memory footprint of the VFS (sum of all file sizes). */
  totalBytes(): number
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const WASM_PATH = resolve(__dirname, '..', '..', 'node_modules', 'wa-sqlite', 'dist', 'wa-sqlite.wasm')

let cached: Harness | null = null

export async function loadHarness(): Promise<Harness> {
  if (cached) return cached

  const wasmBytes = await readFile(WASM_PATH)
  // Emscripten factory
  const Module = (await SQLiteESMFactory({
    locateFile: (file: string) => resolve(WASM_PATH, '..', file),
    wasmBinary: wasmBytes,
  })) as unknown as {
    ready: Promise<unknown>
    ccall: (name: string, ret: string, args: string[], params: unknown[]) => unknown
    _malloc: (n: number) => number
    _free: (p: number) => void
    HEAPU8: Uint8Array
  }
  await Module.ready

  // High-level API
  const sqlite3 = SQLiteFactory(Module as unknown as Parameters<typeof SQLiteFactory>[0]) as unknown as TestSqlite

  // Register the in-memory VFS as the default. We keep a reference to
  // the instance so the test can poke at its `mapNameToFile`.
  const vfs = new MemoryVFS() as unknown as MemoryVfsLike
  sqlite3.vfs_register(vfs, /* makeDefault */ true)

  const openDbs = new Set<number>()

  cached = {
    sqlite3,
    vfs,
    Module: {
      _malloc: Module._malloc.bind(Module),
      _free: Module._free.bind(Module),
      HEAPU8: Module.HEAPU8,
    },
    async open(filename: string): Promise<number> {
      const db = await sqlite3.open_v2(filename, undefined, vfs.name)
      openDbs.add(db)
      return db
    },
    async close(db: number): Promise<void> {
      if (!openDbs.has(db)) return
      openDbs.delete(db)
      try {
        await sqlite3.close(db)
      } catch {
        // ignore
      }
    },
    reset(): void {
      // Clear every file from the VFS — both open + closed files.
      // We don't call xDelete because the open file map is not
      // exposed; we just drop the metadata map.
      vfs.mapNameToFile.clear()
    },
    totalBytes(): number {
      let total = 0
      for (const f of vfs.mapNameToFile.values()) total += f.size
      return total
    },
  }
  return cached
}

/**
 * Tiny helper: write a fresh DB, run a SQL setup script, return the
 * handle. Equivalent to `loadHarness().open(...) + exec(setup)`.
 */
export async function makeDb(
  harness: Harness,
  filename: string,
  setupSql: string,
): Promise<number> {
  const db = await harness.open(filename)
  if (setupSql.trim().length > 0) {
    await harness.sqlite3.exec(db, setupSql)
  }
  return db
}
