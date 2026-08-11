/**
 * POC-2: progress_handler + interrupt con queries largas.
 *
 * Objetivo (RESEARCH.md §7.1, §7.2): verificar que el mecanismo de timeout
 * real funciona en `wa-sqlite` — no se puede matar una query con
 * `setTimeout()` desde fuera, hay que usar `sqlite3_progress_handler`
 * que se invoca cada N opcodes de la VM y devuelve 1 para cancelar.
 *
 * Pasos:
 *  1. Crear DB con 1 millón de filas generadas programáticamente.
 *  2. Registrar `sqlite3.progress_handler(db, 1000, fn, null)` con un
 *     callback que devuelve 1 cuando han pasado >100ms desde el inicio.
 *  3. Lanzar `SELECT COUNT(*) FROM big WHERE label LIKE '%foo%'`.
 *  4. Medir tiempo: debe interrumpirse antes de los 500ms.
 *  5. Verificar que `sqlite3_exec` retorna `SQLITE_INTERRUPT` (código 9).
 *  6. Control: lanzar la misma query SIN progress_handler — debe tardar
 *     >1s, confirmando que el handler está activamente interrumpiendo.
 *
 * Nota sobre `sqlite3_interrupt`:
 *   El símbolo `sqlite3_interrupt` NO está exportado en la build WASM de
 *   wa-sqlite 1.0.0 (ver POC-1). El `progress_handler` por sí solo SÍ
 *   puede interrumpir la query devolviendo 1, que es la ruta que usamos.
 *
 * Veredicto: VIABLE / NECESITA_AJUSTE_VMSTEPS.
 *
 * Modo de uso:
 *   - Standalone:  `node --experimental-strip-types pocs/engine/poc-2-interrupt.ts`
 *   - Vía run-all: `node --experimental-strip-types pocs/engine/run-all.ts`
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// @ts-expect-error — sin tipos para el bundle ESM del dist.
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
// @ts-expect-error
import { Factory as SQLiteFactory } from 'wa-sqlite/src/sqlite-api.js'
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js'
import * as SQLite from 'wa-sqlite/src/sqlite-constants.js'

import { pocHeader, finalizePoc, type PocResult } from './_harness.ts'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const WASM_PATH = resolve(__dirname, '../../node_modules/wa-sqlite/dist/wa-sqlite.wasm')

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
}

interface SQLiteError extends Error {
  code: number
}

interface SQLiteAPI {
  libversion: () => string
  open_v2: (filename: string, flags?: number, vfsName?: string) => Promise<number>
  close: (db: number) => number
  /** Throws SQLiteError on non-zero rc. The error has a `code` property. */
  exec: (db: number, sql: string) => Promise<number>
  execWithParams: (db: number, sql: string, params?: unknown[]) => Promise<{ rows: unknown[][]; columns: string[] }>
  progress_handler: (db: number, nOps: number, fn: ((u: unknown) => number) | null, userData: unknown) => void
  vfs_register: (vfs: { name: string }, makeDefault?: boolean) => number
}

/**
 * Run `sqlite3.exec` and return its rc, but if it throws a `SQLiteError`
 * (which happens on non-zero rc — including SQLITE_INTERRUPT) return the
 * error's `.code` instead. The original error is also attached as `.err`.
 */
async function execRc(sqlite3: SQLiteAPI, db: number, sql: string): Promise<{ rc: number; err?: SQLiteError }> {
  try {
    const rc = await sqlite3.exec(db, sql)
    return { rc }
  } catch (e) {
    const err = e as SQLiteError
    if (typeof err.code === 'number') return { rc: err.code, err }
    throw e
  }
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

/* ------------------------------------------------------------------ *
 *  Build a 1M-row table in a memory DB.                                *
 * ------------------------------------------------------------------ */

async function buildBigTable(sqlite3: SQLiteAPI, db: number, rows: number): Promise<number> {
  const t0 = Date.now()
  const rc1 = await sqlite3.exec(db, 'CREATE TABLE big(x INTEGER, label TEXT);')
  if (rc1 !== 0) return rc1
  // Build via INSERT ... SELECT from a recursive CTE. For 1M rows this is
  // 1 statement that takes a couple of seconds.
  const rc2 = await sqlite3.exec(
    db,
    `INSERT INTO big(x, label)
     WITH RECURSIVE n(i) AS (
       SELECT 1
       UNION ALL
       SELECT i+1 FROM n WHERE i < ${rows}
     )
     SELECT i, CASE (i % 7)
       WHEN 0 THEN 'foo'
       WHEN 1 THEN 'foobar'
       WHEN 2 THEN 'baz'
       WHEN 3 THEN 'qux'
       WHEN 4 THEN 'foo-baz'
       WHEN 5 THEN 'bar'
       ELSE 'plain'
     END FROM n;`,
  )
  if (rc2 !== 0) return rc2
  return Date.now() - t0
}

/* ------------------------------------------------------------------ *
 *  Runner                                                             *
 * ------------------------------------------------------------------ */

export interface Poc2Options {
  /** Target ms for the progress handler to abort (default 100). */
  handlerTimeoutMs?: number
  /** vmSteps for the progress handler (default 1000). */
  vmSteps?: number
  /** Rows in `big` table (default 1_000_000). */
  rowCount?: number
  /** Minimum duration the control (no-handler) query must take to confirm
   *  that the handler is what's interrupting (default 1000ms). */
  controlMinMs?: number
}

export async function runPoc2(opts: Poc2Options = {}): Promise<PocResult> {
  const {
    handlerTimeoutMs = 100,
    vmSteps = 1000,
    rowCount = 1_000_000,
    controlMinMs = 1000,
  } = opts

  const header = pocHeader({
    id: 'POC-2',
    title: 'progress_handler + interrupt con queries largas',
  })
  const findings: Array<{ check: string; result: string; detail?: string }> = []

  const { Module, sqlite3 } = await loadWaSqlite()
  const vfs = new MemoryVFS()
  sqlite3.vfs_register(vfs, /* makeDefault */ true)

  const db = await sqlite3.open_v2('timeout.db', undefined, vfs.name)

  // Build the big table once
  const buildMs = await buildBigTable(sqlite3, db, rowCount)
  const countResult = await sqlite3.execWithParams(db, 'SELECT COUNT(*) AS n FROM big;')
  const actualRows = Number(countResult.rows[0]?.[0] ?? 0)
  findings.push({
    check: `build table with ${rowCount.toLocaleString()} rows`,
    result: actualRows === rowCount ? 'OK' : 'WARN',
    detail: `build=${buildMs}ms, actual rows=${actualRows} (expected ${rowCount})`,
  })

  // We pick a query that:
  //   1. Cross-joins `big` against itself to multiply the work.
  //   2. Forces a 100 × 1M = 100M row cross-join, which is reliably slow
  //      (~2-3s) on a modern machine without progress handler.
  //   3. Doesn't depend on string matching, so it's robust to encoding.
  // The `a.x <= 100` predicate filters the outer table to a tiny
  // fraction, but the inner cross-join still touches 100M rows.
  const SQL_COSTOSA = `
    SELECT COUNT(*) AS n
    FROM big AS a
    CROSS JOIN big AS b
    WHERE a.x <= 100
  ;`

  // 1) Query CON progress_handler activo
  let handlerCalls = 0
  let cancelled = false
  const t0 = Date.now()
  sqlite3.progress_handler(db, vmSteps, () => {
    handlerCalls++
    const elapsed = Date.now() - t0
    if (elapsed > handlerTimeoutMs) {
      cancelled = true
      return 1 // no-zero cancela la query
    }
    return 0
  }, null)

  const withHandler = await execRc(sqlite3, db, SQL_COSTOSA)
  const rcWithHandler = withHandler.rc
  const tWithHandler = Date.now() - t0
  sqlite3.progress_handler(db, 0, null, null) // clear

  findings.push({
    check: `query con progress_handler (vmSteps=${vmSteps}, target=${handlerTimeoutMs}ms)`,
    result: rcWithHandler === SQLite.SQLITE_INTERRUPT ? 'OK' : 'FAIL',
    detail: `rc=${rcWithHandler} (SQLITE_INTERRUPT=${SQLite.SQLITE_INTERRUPT}), elapsed=${tWithHandler}ms, handlerCalls=${handlerCalls}, cancelled=${cancelled}`,
  })
  findings.push({
    check: `tiempo query con handler < 500ms`,
    result: tWithHandler < 500 ? 'OK' : 'FAIL',
    detail: `${tWithHandler}ms`,
  })

  // 2) Control: query SIN progress_handler (debe tardar >controlMinMs)
  // Make sure no handler is set
  sqlite3.progress_handler(db, 0, null, null)
  const tCtrl0 = Date.now()
  const control = await execRc(sqlite3, db, SQL_COSTOSA)
  const rcCtrl = control.rc
  const tCtrl = Date.now() - tCtrl0
  findings.push({
    check: `query SIN handler (control) > ${controlMinMs}ms`,
    result: tCtrl > controlMinMs ? 'OK' : 'WARN',
    detail: `rc=${rcCtrl}, elapsed=${tCtrl}ms`,
  })

  sqlite3.close(db)

  // 3) Bonus: `sqlite3_interrupt` no está exportado
  let interruptAvailable = true
  try {
    const fn = Module.cwrap('sqlite3_interrupt', 'number', ['number'])
    if (fn) {
      // Try invoking to confirm it's a real function
      const db2 = await sqlite3.open_v2('interrupt-probe.db', undefined, vfs.name)
      try {
        fn(db2)
      } catch {
        interruptAvailable = false
      }
      sqlite3.close(db2)
    } else {
      interruptAvailable = false
    }
  } catch {
    interruptAvailable = false
  }
  findings.push({
    check: 'sqlite3_interrupt via cwrap',
    result: interruptAvailable ? 'OK' : 'NOT_AVAILABLE',
    detail: interruptAvailable
      ? 'disponible (no usado en esta POC; progress_handler es suficiente)'
      : 'NO exportado en wa-sqlite 1.0.0 — el progreso del handler basta para interrumpir',
  })

  // 4) Veredicto
  const withHandlerOk =
    rcWithHandler === SQLite.SQLITE_INTERRUPT && tWithHandler < 500 && handlerCalls > 0
  const controlOk = tCtrl > controlMinMs
  const verdict: PocResult['verdict'] =
    withHandlerOk && controlOk
      ? 'VIABLE'
      : withHandlerOk && !controlOk
        ? 'NECESITA_AJUSTE_VMSTEPS'
        : 'REQUIERE_CAMBIO_API'

  return finalizePoc({
    ...header,
    findings,
    verdict,
    notes: [
      `vmSteps=${vmSteps}: el handler se invoca ${handlerCalls} veces durante la query interrumpida.`,
      `La query con handler retorna rc=${rcWithHandler} (SQLITE_INTERRUPT=${SQLite.SQLITE_INTERRUPT}) en ${tWithHandler}ms; la misma query sin handler tarda ${tCtrl}ms — el delta confirma que el handler es quien interrumpe.`,
      interruptAvailable
        ? `sqlite3_interrupt SÍ está exportado, pero no lo necesitamos: progress_handler con return 1 es suficiente y más determinista.`
        : `sqlite3_interrupt NO está exportado. En la app, el único consumidor de "cancelar" es el progress_handler dentro del propio Worker — no hay otros threads que necesiten llamar interrupt desde fuera.`,
      `Configuración recomendada para la app: vmSteps=1000 con target de 100-200ms; ajustar vmSteps si la query consume muy poca VM por iteración.`,
    ].join('\n'),
    raw: {
      params: { handlerTimeoutMs, vmSteps, rowCount, controlMinMs },
      withHandler: { rc: rcWithHandler, elapsedMs: tWithHandler, handlerCalls, cancelled },
      control: { rc: rcCtrl, elapsedMs: tCtrl },
      interruptAvailable,
      constants: { SQLITE_OK: SQLite.SQLITE_OK, SQLITE_INTERRUPT: SQLite.SQLITE_INTERRUPT },
    },
  })
}

// --- standalone entry ---
if (import.meta.url === `file://${process.argv[1]}`) {
  runPoc2()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error('POC-2 failed:', e)
      process.exit(1)
    })
}
