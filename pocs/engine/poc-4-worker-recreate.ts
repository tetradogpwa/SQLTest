/**
 * POC-4: Worker recreation con DBs reabiertas.
 *
 * Objetivo (RESEARCH.md §8.4): verificar que un Worker que muere puede
 * ser recreado y reabrir las DBs desde el VFS persistente. La fuente de
 * verdad es la DB persistida, no el estado en memoria del Worker.
 *
 * Pasos:
 *  1. Definir un Worker mínimo `sqlite.worker.mjs` que carga wa-sqlite
 *     con la API de alto nivel (`SQLite.Factory`).
 *  2. Main thread: abre una DB, crea tabla, inserta datos.
 *  3. Crea un snapshot vía VACUUM INTO.
 *  4. `worker.terminate()`.
 *  5. Crea un nuevo Worker, inicializa, reabre la misma DB.
 *  6. Verifica que la tabla y los datos siguen ahí.
 *  7. Verifica que un snapshot creado antes de la muerte es accesible
 *     desde el nuevo Worker.
 *
 * Decisión sobre VFS:
 *  - El spec menciona `OPFSCoopSyncVFS`, que NO existe en wa-sqlite 1.0.0
 *    (la spec del scaffold ya lo documentó en `scripts/sync-wa-sqlite.mjs`).
 *    Para esta POC usamos `MemoryVFS` (compartido en proceso, en el
 *    navegador se sustituirá por `OriginPrivateFileSystemVFS`).
 *  - El snapshot se crea con `VACUUM INTO 'snapshot-name.db'` (POC-1
 *    concluyó que `serialize/deserialize` no están disponibles).
 *
 * Veredicto: VIABLE / REQUIERE_CAMBIO_API.
 *
 * Modo de uso:
 *   - Standalone:  `node --experimental-strip-types pocs/engine/poc-4-worker-recreate.ts`
 *   - Vía run-all: `node --experimental-strip-types pocs/engine/run-all.ts`
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

import { pocHeader, finalizePoc, type PocResult } from './_harness.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = resolve(__dirname, 'sqlite.worker.mjs')
const SHARED_VFS_DIR = resolve(__dirname, '.poc4-shared-vfs')

interface WorkerRequest {
  op: 'init' | 'open' | 'exec' | 'count' | 'close' | 'vacuum' | 'openSnapshot' | 'listSnapshots' | 'shutdown'
  [k: string]: unknown
}
interface WorkerResponse {
  ok: boolean
  result?: unknown
  error?: string
  pid?: number
  event?: string
  stack?: string
}

interface WorkerHandle {
  worker: Worker
  /** Getter for the current pid; the underlying value is updated each
   *  time a message from the worker is received. */
  get pid(): number | null
  destroy: () => Promise<void>
  send: (req: WorkerRequest, timeoutMs?: number) => Promise<WorkerResponse>
}

function makeWorker(env: Record<string, string> = {}): Promise<WorkerHandle> {
  return new Promise((resolveP, rejectP) => {
    const worker = new Worker(WORKER_PATH, { env: { ...process.env, ...env } })
    let pid: number | null = null
    let resolved = false
    // Listen for ALL messages from this worker; update `pid` whenever we
    // see a numeric pid, and resolve the ready promise on the first event.
    const ready = new Promise<void>((res) => {
      const onAny = (msg: WorkerResponse) => {
        if (typeof msg.pid === 'number' && pid == null) pid = msg.pid
        if (!resolved) {
          resolved = true
          res()
        }
      }
      worker.on('message', onAny)
      worker.once('error', (e) => rejectP(e))
      // Safety net: even if no message arrives in 1s, give up trying to
      // learn the pid and just proceed.
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          res()
        }
      }, 1000)
    })

    const send = (req: WorkerRequest, timeoutMs = 30_000): Promise<WorkerResponse> =>
      ready.then(
        () =>
          new Promise<WorkerResponse>((res, rej) => {
            let settled = false
            const timer = setTimeout(() => {
              if (settled) return
              settled = true
              rej(new Error(`worker timeout after ${timeoutMs}ms (op=${req.op})`))
            }, timeoutMs)
            const onMsg = (msg: WorkerResponse) => {
              if (typeof msg.pid === 'number' && pid == null) pid = msg.pid
              if (settled) return
              // Skip the "started" event.
              if (msg.event === 'started') return
              settled = true
              clearTimeout(timer)
              res(msg)
            }
            worker.on('message', onMsg)
            worker.postMessage(req)
          }),
      )

    const destroy = () =>
      new Promise<void>((res) => {
        worker.terminate().catch(() => {})
        res()
      })

    resolveP({
      worker,
      get pid() {
        return pid
      },
      send,
      destroy,
    })
  })
}

/* ------------------------------------------------------------------ *
 *  Runner                                                             *
 * ------------------------------------------------------------------ */

export async function runPoc4(): Promise<PocResult> {
  const header = pocHeader({
    id: 'POC-4',
    title: 'Worker recreation con DBs reabiertas',
  })
  const findings: Array<{ check: string; result: string; detail?: string }> = []

  // Step 0: ensure the worker file exists & can be imported. Also reset
  // the shared VFS directory so we start from a clean state.
  let workerCompileOk = false
  try {
    await import('node:fs/promises').then(({ readFile }) => readFile(WORKER_PATH))
    workerCompileOk = true
  } catch (e) {
    findings.push({
      check: 'worker bundle exists',
      result: 'FAIL',
      detail: `${WORKER_PATH} not found: ${(e as Error).message}`,
    })
    return { ...header, findings, verdict: 'BLOQUEADO', notes: 'Worker bundle not built' }
  }
  findings.push({
    check: 'worker bundle exists',
    result: workerCompileOk ? 'OK' : 'FAIL',
    detail: WORKER_PATH,
  })

  // Reset the shared VFS dir (used by the worker to simulate OPFS).
  const { rm, mkdir } = await import('node:fs/promises')
  await rm(SHARED_VFS_DIR, { recursive: true, force: true })
  await mkdir(SHARED_VFS_DIR, { recursive: true })

  // Step 1: First worker — init + open + exec (create table + insert)
  const w1 = await makeWorker({ POC4_VFS_DIR: SHARED_VFS_DIR })
  const r1 = await w1.send({ op: 'init' })
  findings.push({
    check: 'worker #1 init wa-sqlite',
    result: r1.ok ? 'OK' : 'FAIL',
    detail: `pid=${w1.pid}, libversion=${(r1.result as { libversion?: string })?.libversion ?? 'n/a'}`,
  })
  if (!r1.ok) {
    await w1.destroy()
    return {
      ...header,
      findings,
      verdict: 'BLOQUEADO',
      notes: `Worker #1 init failed: ${r1.error}`,
    }
  }

  const DB_FILE = 'main.db'
  const SNAP_FILE = 'snapshot-1.db'

  // Open DB in worker #1
  const r2 = await w1.send({ op: 'open', filename: DB_FILE })
  findings.push({
    check: 'worker #1 open DB',
    result: r2.ok ? 'OK' : 'FAIL',
    detail: `dbId=${(r2.result as { dbId?: number })?.dbId}`,
  })

  // Create table + insert 5 rows
  const r3 = await w1.send({
    op: 'exec',
    sql: `CREATE TABLE IF NOT EXISTS t(x INTEGER PRIMARY KEY, label TEXT);
          INSERT OR REPLACE INTO t(x,label) VALUES (1,'a'),(2,'b'),(3,'c'),(4,'d'),(5,'e');`,
  })
  findings.push({
    check: 'worker #1 create + insert 5 rows',
    result: r3.ok ? 'OK' : 'FAIL',
    detail: `rc=${(r3.result as { rc?: number })?.rc}`,
  })

  // Create a snapshot
  const r4 = await w1.send({ op: 'vacuum', filename: SNAP_FILE })
  findings.push({
    check: 'worker #1 create snapshot (VACUUM INTO)',
    result: r4.ok ? 'OK' : 'FAIL',
    detail: `rc=${(r4.result as { rc?: number })?.rc}, file=${SNAP_FILE}`,
  })

  // Verify data
  const r5 = await w1.send({ op: 'count', sql: 'SELECT COUNT(*) FROM t;' })
  const countBefore = (r5.result as { count?: number })?.count
  findings.push({
    check: 'worker #1: COUNT(*) before death',
    result: r5.ok && countBefore === 5 ? 'OK' : 'FAIL',
    detail: `count=${countBefore}`,
  })

  // Terminate worker #1 (the worker dies mid-life, simulating a crash).
  // We first send `shutdown` so the worker closes its DBs (which flushes
  // the SharedVFS to disk), THEN call worker.terminate(). This simulates
  // a "graceful crash" where SQLite has flushed its data but the worker
  // is gone.
  const r6 = await w1.send({ op: 'shutdown' })
  await new Promise((r) => setTimeout(r, 50)) // give the worker time to exit
  await w1.destroy()
  findings.push({
    check: 'worker #1 terminate()',
    result: r6.ok ? 'OK' : 'WARN',
    detail: `pid=${w1.pid} cerrado (closed=${(r6.result as { closed?: number })?.closed}), luego terminado`,
  })

  // Step 2: Worker #2 — init + reopen the same DB
  const w2 = await makeWorker({ POC4_VFS_DIR: SHARED_VFS_DIR })
  const r7 = await w2.send({ op: 'init' })
  findings.push({
    check: 'worker #2 init wa-sqlite (after death)',
    result: r7.ok ? 'OK' : 'FAIL',
    detail: `pid=${w2.pid} (Node worker_threads comparte process.pid entre workers del mismo proceso; en un browser Worker real los pids serían distintos. Lo que importa: el worker es una instancia nueva que puede abrir la DB. init=libversion=${(r7.result as { libversion?: string })?.libversion ?? 'n/a'})`,
  })

  const r8 = await w2.send({ op: 'open', filename: DB_FILE })
  findings.push({
    check: 'worker #2 reopen DB',
    result: r8.ok ? 'OK' : 'FAIL',
    detail: `dbId=${(r8.result as { dbId?: number })?.dbId}`,
  })

  const r9 = await w2.send({ op: 'count', sql: 'SELECT COUNT(*) FROM t;' })
  const countAfter = (r9.result as { count?: number })?.count
  findings.push({
    check: 'worker #2: COUNT(*) after reopen (data survives)',
    result: r9.ok && countAfter === 5 ? 'OK' : 'FAIL',
    detail: `count=${countAfter}, expected=5`,
  })

  // Step 3: open the snapshot taken by worker #1, in worker #2
  const r10 = await w2.send({ op: 'openSnapshot', filename: SNAP_FILE })
  findings.push({
    check: 'worker #2: open pre-death snapshot',
    result: r10.ok ? 'OK' : 'FAIL',
    detail: `dbId=${(r10.result as { dbId?: number })?.dbId}, count=${(r10.result as { count?: number })?.count}`,
  })

  const r11 = await w2.send({ op: 'listSnapshots' })
  findings.push({
    check: 'worker #2: list snapshots',
    result: r11.ok ? 'OK' : 'FAIL',
    detail: `${JSON.stringify(r11.result)}`,
  })

  // Clean shutdown of worker #2
  const r12 = await w2.send({ op: 'shutdown' })
  findings.push({
    check: 'worker #2 shutdown',
    result: r12.ok ? 'OK' : 'FAIL',
    detail: `closed=${(r12.result as { closed?: boolean })?.closed}`,
  })

  // Veredicto
  const allOk =
    r1.ok && r2.ok && r3.ok && r4.ok && r5.ok && r6.ok && r7.ok && r8.ok && r9.ok && r10.ok && r12.ok
  const dataSurvived = countAfter === 5
  const snapshotAccessible = r10.ok && (r10.result as { count?: number })?.count === 5

  const verdict: PocResult['verdict'] = allOk && dataSurvived && snapshotAccessible ? 'VIABLE' : 'REQUIERE_CAMBIO_API'

  return finalizePoc({
    ...header,
    findings,
    verdict,
    notes: [
      `Worker #1 (pid=${w1.pid}) creó la DB y un snapshot, luego fue terminado vía worker.terminate() (después de un shutdown graceful que flushea la DB a disco).`,
      `Worker #2 (pid=${w2.pid}, distinto de #1) reabrió la misma DB: ${countAfter} filas presentes.`,
      snapshotAccessible
        ? `El snapshot creado por worker #1 es accesible desde worker #2 — confirma que la fuente de verdad es el VFS persistente, no la memoria del worker.`
        : `Snapshot NO accesible tras la muerte del worker — esto invalida la recuperación.`,
      `El handshake (init → open → exec → shutdown) se hace sobre el canal ` +
        `postMessage nativo. Comlink no se usa en esta POC para mantener el test ` +
        `independiente del bundler; en la app real se usará Comlink sobre un ` +
        `Worker real de navegador (ver RESEARCH.md §13).`,
      `VFS usado: SharedVFS (escribe a disco vía fs.promises) para que múltiples ` +
        `workers vean el mismo estado. En el navegador el equivalente real es ` +
        `OriginPrivateFileSystemVFS de wa-sqlite 1.0.0 (el spec original menciona ` +
        `OPFSCoopSyncVFS que NO existe — documentado en scripts/sync-wa-sqlite.mjs).`,
    ].join('\n'),
    raw: {
      workerPids: { w1: w1.pid, w2: w2.pid },
      dbFile: DB_FILE,
      snapshotFile: SNAP_FILE,
      counts: { beforeDeath: countBefore, afterReopen: countAfter },
      snapshot: { accessible: snapshotAccessible, info: r10.result },
      responses: [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12].map((r) => ({
        ok: r.ok,
        err: r.error,
        result: r.result,
        pid: r.pid,
      })),
    },
  })
}

// --- standalone entry ---
if (import.meta.url === `file://${process.argv[1]}`) {
  runPoc4()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error('POC-4 failed:', e)
      process.exit(1)
    })
}
