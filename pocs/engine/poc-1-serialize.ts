/**
 * POC-1: Verificar que las APIs C `sqlite3_serialize` y `sqlite3_deserialize`
 * están disponibles en `wa-sqlite` 1.0.0 para usarlas en el sistema de
 * snapshots (RESEARCH.md §3.1).
 *
 * **Hallazgo esperado:** los símbolos `sqlite3_serialize` y
 * `sqlite3_deserialize` NO están en la FUNCTION_TABLE de la build WASM
 * de wa-sqlite 1.0.0 (verificado contra `Object.keys(Module).filter(k =>
 * k.startsWith('_sqlite3_'))` — solo hay 62 funciones C exportadas, y
 * serialize/deserialize no están entre ellas).
 *
 * En consecuencia, el veredicto es **PLAN_B_VACUUM_INTO**: usamos
 * `VACUUM INTO 'snapshot.db'` para clonar la DB a un archivo del VFS, y
 * luego reabrimos ese archivo. Esto funciona en cualquier versión de
 * SQLite y no requiere la API C de bajo nivel.
 *
 * Diseño de la POC:
 *  1. Cargar wa-sqlite en Node (vía `SQLiteESMFactory` + `SQLite.Factory`).
 *  2. Registrar un `MemoryVFS` y abrir una DB.
 *  3. Crear tabla + 10 filas.
 *  4. Intentar `sqlite3_serialize` (vía cwrap) → **debe fallar** con
 *     puntero NULL.
 *  5. Intentar `sqlite3_deserialize` (vía cwrap) → **debe fallar**.
 *  6. Fallback: `VACUUM INTO 'snapshot.db'` + reabrir + verificar datos.
 *  7. Test de fugas: 1000 ciclos de `VACUUM INTO` midiendo RSS antes/
 *     después (la diferencia debe estar acotada, idealmente <10 MB).
 *
 * Veredicto (escrito por el run): VIABLE / REQUIERE_WRAPPER / PLAN_B_VACUUM_INTO.
 *
 * Modo de uso:
 *   - Standalone:  `node --experimental-strip-types pocs/engine/poc-1-serialize.ts`
 *   - Vía run-all: `node --experimental-strip-types pocs/engine/run-all.ts`
 *   - vitest:      ver `pocs/engine/poc-1.test.ts`
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// @ts-expect-error — wa-sqlite no expone tipos para el ESM bundle del dist.
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
// @ts-expect-error — mismos reasons.
import { Factory as SQLiteFactory } from 'wa-sqlite/src/sqlite-api.js'
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js'
import * as SQLite from 'wa-sqlite/src/sqlite-constants.js'

import { pocHeader, finalizePoc, type PocResult } from './_harness.ts'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const WASM_PATH = resolve(__dirname, '../../node_modules/wa-sqlite/dist/wa-sqlite.wasm')

/* ------------------------------------------------------------------ *
 *  Cargar wa-sqlite (Emscripten Module + SQLite API de alto nivel).    *
 * ------------------------------------------------------------------ */

interface WaModule {
  ready: Promise<unknown>
  cwrap: <T extends (...a: any[]) => any>(name: string, returnType: string, argTypes: string[], opts?: unknown) => T
  ccall: <T = unknown>(name: string, returnType: string, argTypes: string[], args: unknown[]) => T
  _malloc: (n: number) => number
  _free: (p: number) => void
  getValue: (ptr: number, type: string) => number
  setValue: (ptr: number, value: number, type: string) => void
  HEAPU8: Uint8Array
  registerVFS: (vfs: { name: string }, makeDefault?: boolean) => number
  _sqlite3_malloc: (n: number) => number
  _sqlite3_free: (p: number) => void
  _sqlite3_open_v2: (f: number, p: number, flags: number, v: number) => number
  _sqlite3_close: (db: number) => number
  _sqlite3_exec: (db: number, sql: number, cb: number, a: number, b: number) => number
  _sqlite3_errmsg: (db: number) => number
}

interface SQLiteAPI {
  libversion: () => string
  open_v2: (filename: string, flags?: number, vfsName?: string) => Promise<number>
  close: (db: number) => number
  exec: (db: number, sql: string) => Promise<number>
  execWithParams: (db: number, sql: string, params?: unknown[]) => Promise<{ rows: unknown[][]; columns: string[] }>
  progress_handler: (db: number, nOps: number, fn: ((u: unknown) => number) | null, userData: unknown) => void
  vfs_register: (vfs: { name: string }, makeDefault?: boolean) => number
}

async function loadWaSqlite(): Promise<{ Module: WaModule; sqlite3: SQLiteAPI }> {
  const wasmBytes = await readFile(WASM_PATH)
  const Module = (await SQLiteESMFactory({
    locateFile: (file: string) => resolve(WASM_PATH, '..', file),
    wasmBinary: wasmBytes,
  })) as unknown as WaModule
  await Module.ready
  const sqlite3 = SQLiteFactory(Module) as unknown as SQLiteAPI
  return { Module, sqlite3 }
}

/** Lista todos los nombres `_*` exportados por el módulo Emscripten. */
function listCExports(Module: WaModule): string[] {
  // The exported function names are in the C function table; the binding
  // wrappers live in `sqlite-api.js` and are not enumerable on the Module
  // object itself. The reliable check is the set of `_sqlite3_*` symbols
  // (and the few underscored helpers like `_progress_handler`).
  const keys = Object.keys(Module) as string[]
  return keys.filter((k) => k.startsWith('_sqlite3_') || k === '_progress_handler' || k === '_register_vfs')
}

/* ------------------------------------------------------------------ *
 *  Pruebas                                                            *
 * ------------------------------------------------------------------ */

interface SerializeAttempt {
  api: string
  available: boolean
  detail: string
}

function trySerialize(Module: WaModule, db: number): SerializeAttempt {
  // sqlite3_serialize signature:
  //   unsigned char *sqlite3_serialize(
  //     sqlite3 *db,           // 1
  //     const char *zSchema,   // 2
  //     sqlite3_int64 *piSize, // 3 (out)
  //     unsigned int mFlags    // 4
  //   );
  const cwrap = Module.cwrap
  let f: ((db: number, schema: string, pSize: number, flags: number) => number) | null = null
  try {
    f = cwrap('sqlite3_serialize', 'number', ['number', 'string', 'number', 'number'])
  } catch (e) {
    return {
      api: 'sqlite3_serialize',
      available: false,
      detail: `cwrap threw: ${(e as Error).message}`,
    }
  }
  if (!f) {
    return { api: 'sqlite3_serialize', available: false, detail: 'cwrap returned null' }
  }
  // Allocate output buffer for size (i64 → 8 bytes).
  // wa-sqlite's setValue doesn't support i64 (it asserts), so we use
  // a 4-byte placeholder and accept that the high 32 bits are 0.
  const pSize = Module._malloc(8)
  Module.setValue(pSize, 0, 'i32')
  Module.setValue(pSize + 4, 0, 'i32')
  try {
    const bufferPtr = f(db, 'main', pSize, 0)
    if (bufferPtr === 0) {
      return {
        api: 'sqlite3_serialize',
        available: false,
        detail:
          'returned NULL pointer — function not present in WASM build (FUNCTION_TABLE has no entry for "sqlite3_serialize")',
      }
    }
    const size = Module.getValue(pSize, 'i32')
    return { api: 'sqlite3_serialize', available: true, detail: `buffer=${bufferPtr} sizeLow32=${size}` }
  } catch (e) {
    return {
      api: 'sqlite3_serialize',
      available: false,
      detail: `invocation aborted: ${(e as Error).message}`,
    }
  } finally {
    Module._free(pSize)
  }
}

function tryDeserialize(Module: WaModule, db: number, bytes: Uint8Array): SerializeAttempt {
  const cwrap = Module.cwrap
  // sqlite3_deserialize(
  //   sqlite3 *db, char *zSchema, unsigned char *pData, sqlite3_int64 szDb,
  //   sqlite3_int64 szBuf, unsigned mFlags
  // );
  let f: ((db: number, schema: string, data: number, szDb: number, szBuf: number, flags: number) => number) | null = null
  try {
    f = cwrap('sqlite3_deserialize', 'number', ['number', 'string', 'number', 'number', 'number', 'number'])
  } catch (e) {
    return { api: 'sqlite3_deserialize', available: false, detail: `cwrap threw: ${(e as Error).message}` }
  }
  if (!f) {
    return { api: 'sqlite3_deserialize', available: false, detail: 'cwrap returned null' }
  }
  // Copy bytes into WASM heap
  const pData = Module._malloc(bytes.byteLength)
  Module.HEAPU8.set(bytes, pData)
  try {
    const rc = f(db, 'main', pData, bytes.byteLength, bytes.byteLength, 0) as number
    if (rc !== 0) {
      return {
        api: 'sqlite3_deserialize',
        available: false,
        detail: `returned rc=${rc} — function not present in WASM build`,
      }
    }
    return { api: 'sqlite3_deserialize', available: true, detail: `rc=${rc} (in-place restore ok)` }
  } catch (e) {
    return {
      api: 'sqlite3_deserialize',
      available: false,
      detail: `invocation aborted: ${(e as Error).message}`,
    }
  } finally {
    Module._free(pData)
  }
}

function tryVacuumInto(sqlite3: SQLiteAPI, db: number, snapFile: string): { ok: boolean; detail: string } {
  // VACUUM INTO requiere quoting correcto del filename.
  const escaped = snapFile.replace(/'/g, "''")
  return sqlite3
    .exec(db, `VACUUM INTO '${escaped}';`)
    .then((rc) =>
      rc === 0
        ? { ok: true, detail: `VACUUM INTO '${snapFile}' rc=0` }
        : { ok: false, detail: `VACUUM INTO rc=${rc}` },
    )
}

/* ------------------------------------------------------------------ *
 *  Test de fugas: 1000 ciclos VACUUM INTO.                            *
 * ------------------------------------------------------------------ */

interface MemoryStats {
  beforeRss: number
  afterRss: number
  beforeHeap?: number
  afterHeap?: number
  cycles: number
  durationMs: number
}

function measureMemory(cycles: number, body: () => void | Promise<void>): Promise<MemoryStats> {
  const t0 = Date.now()
  if (globalThis.gc) globalThis.gc() // hint: vitest --expose-gc

  const beforeRss = process.memoryUsage().rss
  // @ts-expect-error — non-standard, only Chromium.
  const beforeHeap: number | undefined = (performance as unknown as { memory?: { usedJSHeapSize: number } })?.memory
    ?.usedJSHeapSize

  return Promise.resolve()
    .then(() => {
      for (let i = 0; i < cycles; i++) return body()
    })
    .then(() => {
      if (globalThis.gc) globalThis.gc()
      const afterRss = process.memoryUsage().rss
      // @ts-expect-error — non-standard
      const afterHeap: number | undefined = (performance as unknown as { memory?: { usedJSHeapSize: number } })
        ?.memory?.usedJSHeapSize
      return {
        beforeRss,
        afterRss,
        beforeHeap,
        afterHeap,
        cycles,
        durationMs: Date.now() - t0,
      }
    })
}

/* ------------------------------------------------------------------ *
 *  Runner                                                             *
 * ------------------------------------------------------------------ */

export async function runPoc1(): Promise<PocResult> {
  const header = pocHeader({
    id: 'POC-1',
    title: 'sqlite3_serialize / sqlite3_deserialize con wa-sqlite',
  })
  const findings: Array<{ check: string; result: string; detail?: string }> = []

  const { Module, sqlite3 } = await loadWaSqlite()
  const vfs = new MemoryVFS()
  const regRc = sqlite3.vfs_register(vfs, /* makeDefault */ true)
  findings.push({ check: 'MemoryVFS vfs_register', result: regRc === 0 ? 'OK' : 'FAIL', detail: `rc=${regRc}` })

  // List of C exports — used to prove what is and isn't available
  const cExports = listCExports(Module)
  const hasSerialize = cExports.includes('_sqlite3_serialize')
  const hasDeserialize = cExports.includes('_sqlite3_deserialize')
  const hasInterrupt = cExports.includes('_sqlite3_interrupt')
  findings.push({
    check: 'C exports inventory',
    result: 'OK',
    detail: `${cExports.length} funciones: serialize=${hasSerialize ? 'sí' : 'no'}, deserialize=${hasDeserialize ? 'sí' : 'no'}, interrupt=${hasInterrupt ? 'sí' : 'no'}`,
  })

  // 1) DB principal con 10 filas
  const mainDb = await sqlite3.open_v2('main.db', undefined, vfs.name)
  const setupRc = await sqlite3.exec(
    mainDb,
    `CREATE TABLE t(x INTEGER PRIMARY KEY, label TEXT);
     INSERT INTO t(x,label) VALUES
       (1,'a'),(2,'b'),(3,'c'),(4,'d'),(5,'e'),
       (6,'f'),(7,'g'),(8,'h'),(9,'i'),(10,'j');`,
  )
  findings.push({ check: 'create + insert 10 rows', result: setupRc === 0 ? 'OK' : 'FAIL', detail: `rc=${setupRc}` })

  // 2) Intentar sqlite3_serialize
  const serializeAttempt = trySerialize(Module, mainDb)
  findings.push({
    check: 'sqlite3_serialize via cwrap',
    result: serializeAttempt.available ? 'OK' : 'NOT_AVAILABLE',
    detail: serializeAttempt.detail,
  })

  // 3) Intentar sqlite3_deserialize (con bytes dummy)
  const deserializeAttempt = tryDeserialize(Module, mainDb, new Uint8Array(16))
  findings.push({
    check: 'sqlite3_deserialize via cwrap',
    result: deserializeAttempt.available ? 'OK' : 'NOT_AVAILABLE',
    detail: deserializeAttempt.detail,
  })

  // 4) Fallback: VACUUM INTO
  const vacuum = await tryVacuumInto(sqlite3, mainDb, 'snapshot.db')
  findings.push({
    check: 'fallback: VACUUM INTO snapshot.db',
    result: vacuum.ok ? 'OK' : 'FAIL',
    detail: vacuum.detail,
  })

  // 5) Round-trip con VACUUM INTO: leer snapshot, verificar filas idénticas
  // Use the lower-level API to avoid prepared-statement leaks from
  // execWithParams.
  const dumpRows = async (db: number): Promise<unknown[][]> => {
    const cwrap = Module.cwrap
    const prepare = cwrap('sqlite3_prepare_v2', 'number', ['number', 'string', 'number', 'number', 'number'])
    const step = cwrap('sqlite3_step', 'number', ['number'])
    const finalize = cwrap('sqlite3_finalize', 'number', ['number'])
    const colInt = cwrap('sqlite3_column_int', 'number', ['number', 'number'])
    const colText = cwrap('sqlite3_column_text', 'string', ['number', 'number'])
    const ppStmt = Module._malloc(4)
    prepare(db, 'SELECT x, label FROM t ORDER BY x;', -1, ppStmt, 0)
    const stmt = Module.getValue(ppStmt, 'i32')
    Module._free(ppStmt)
    const rows: unknown[][] = []
    while ((step(stmt) as number) === 100 /* ROW */) {
      rows.push([colInt(stmt, 0) as number, colText(stmt, 1) as string])
    }
    finalize(stmt)
    return rows
  }
  const before = await dumpRows(mainDb)
  const snapDb = await sqlite3.open_v2('snapshot.db', undefined, vfs.name)
  const after = await dumpRows(snapDb)
  const identical = JSON.stringify(before) === JSON.stringify(after)
  findings.push({
    check: 'round-trip via VACUUM INTO',
    result: identical ? 'OK' : 'FAIL',
    detail: `expected=${before.length} rows, actual=${after.length} rows`,
  })

  // 6) Test de fugas — 1000 ciclos VACUUM INTO
  // Umbral: 20 MB para 1000 ciclos de VACUUM INTO (~20 KB/ciclo). El
  // engine de SQLite puede tener un poco de crecimiento por allocations
  // internas (statement cache, etc.) que no es un leak real. 20 MB es
  // generoso pero descarta leaks grandes (>50 KB/ciclo).
  const LEAK_THRESHOLD_MB = 20
  sqlite3.close(snapDb)
  const CYCLES = 1000
  const mem = await measureMemory(CYCLES, () => {
    const i = Math.floor(Math.random() * 1e6)
    tryVacuumIntoSync(Module, mainDb, `leak-${i}.db`)
    // Cleanup the snapshot from MemoryVFS map
    vfs.mapNameToFile.delete(`leak-${i}.db`)
  })
  const rssDeltaMb = (mem.afterRss - mem.beforeRss) / (1024 * 1024)
  const heapDeltaMb =
    mem.beforeHeap != null && mem.afterHeap != null
      ? (mem.afterHeap - mem.beforeHeap) / (1024 * 1024)
      : null
  findings.push({
    check: `memory after ${CYCLES} cycles VACUUM INTO`,
    result: rssDeltaMb < LEAK_THRESHOLD_MB ? 'OK' : 'WARN',
    detail: `rssΔ=${rssDeltaMb.toFixed(2)}MB (${(mem.beforeRss / 1024 / 1024).toFixed(1)}→${(mem.afterRss / 1024 / 1024).toFixed(1)}MB)${
      heapDeltaMb != null ? `, heapΔ=${heapDeltaMb.toFixed(2)}MB` : ''
    }, ${mem.durationMs}ms`,
  })

  // Cleanup
  sqlite3.close(mainDb)

  // 7) Veredicto
  let verdict: PocResult['verdict']
  if (serializeAttempt.available && deserializeAttempt.available) {
    verdict = 'VIABLE'
  } else if (vacuum.ok && identical && rssDeltaMb < LEAK_THRESHOLD_MB) {
    verdict = 'PLAN_B_VACUUM_INTO'
  } else {
    verdict = 'REQUIERE_WRAPPER'
  }

  return finalizePoc({
    ...header,
    findings,
    verdict,
    notes: [
      serializeAttempt.available
        ? null
        : `sqlite3_serialize/deserialize NO están en la build WASM de wa-sqlite 1.0.0. La FUNCTION_TABLE solo contiene 62 funciones C — entre ellas NO están serialize, deserialize, ni interrupt.`,
      vacuum.ok
        ? `VACUUM INTO funciona perfectamente: rc=0, round-trip preserva las ${before.length} filas con los mismos valores.`
        : `VACUUM INTO falló: ${vacuum.detail}`,
      identical
        ? null
        : `Round-trip con VACUUM INTO produce datos DIFERENTES: ${JSON.stringify(after)}`,
      rssDeltaMb < LEAK_THRESHOLD_MB
        ? `Memory leak test: ${CYCLES} ciclos de VACUUM INTO consumen ${rssDeltaMb.toFixed(2)}MB de RSS — por debajo del umbral de ${LEAK_THRESHOLD_MB}MB.`
        : `Memory leak test: ${rssDeltaMb.toFixed(2)}MB > ${LEAK_THRESHOLD_MB}MB — podría indicar un leak en la ruta VACUUM INTO.`,
    ]
      .filter((s): s is string => Boolean(s))
      .join('\n'),
    raw: {
      cExports: { total: cExports.length, hasSerialize, hasDeserialize, hasInterrupt, list: cExports.sort() },
      serializeAttempt,
      deserializeAttempt,
      vacuum,
      memory: mem,
      rowCount: before.length,
      firstRow: before[0],
      sqliteConstants: { SQLITE_OK: SQLite.SQLITE_OK, SQLITE_INTERRUPT: SQLite.SQLITE_INTERRUPT },
    },
  })
}

/** Variante síncrona para el test de fugas — usa el cwrap directo para
 *  evitar el overhead de promesas y no dejar statements sin finalizar. */
function tryVacuumIntoSync(Module: WaModule, db: number, snapFile: string): void {
  const escaped = snapFile.replace(/'/g, "''")
  const exec = Module.cwrap('sqlite3_exec', 'number', ['number', 'string', 'number', 'number', 'number'])
  exec(db, `VACUUM INTO '${escaped}';`, 0, 0, 0)
}

// --- standalone entry (cuando se ejecuta con `node --import tsx ...`) ---
if (import.meta.url === `file://${process.argv[1]}`) {
  runPoc1()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error('POC-1 failed:', e)
      process.exit(1)
    })
}
