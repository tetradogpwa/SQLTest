// POC-4 SQLite worker.
//
// Se ejecuta en un `node:worker_threads.Worker` para validar el ciclo de
// vida: init → open → exec → (muerte) → nuevo worker → reopen. La fuente
// de verdad es el VFS persistente (en este test, MemoryVFS; en el
// navegador, OPFS). El worker se comunica con el main thread vía
// `postMessage` — Comlink se añade en la POC-5.
//
// Mensajes:
//   { op: 'init' }                                          → { ok, pid, result: { libversion } }
//   { op: 'open',  filename }                               → { ok, result: { dbId } }
//   { op: 'exec',  sql }                                    → { ok, result: { rc } }
//   { op: 'count', sql }                                    → { ok, result: { count } }
//   { op: 'vacuum', filename, schema? }                     → { ok, result: { rc } }
//   { op: 'openSnapshot', filename }                        → { ok, result: { dbId, count } }
//   { op: 'listSnapshots' }                                 → { ok, result: { files: string[] } }
//   { op: 'shutdown' }                                      → { ok, result: { closed } }

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { parentPort } from 'node:worker_threads'

// Resolve the WASM path relative to this file.
// /…/pocs/engine/sqlite.worker.mjs → /…/node_modules/wa-sqlite/dist/wa-sqlite.wasm
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const WASM_PATH = resolve(ROOT, 'node_modules/wa-sqlite/dist/wa-sqlite.wasm')

let Module = null
let sqlite3 = null
const openDbs = new Map() // filename → db handle
let vfs = null

async function init() {
  if (sqlite3) return { libversion: sqlite3.libversion() }

  // Use the async build of wa-sqlite when running with the SharedVFS (which
  // has async xRead/xWrite/xOpen/xClose). The sync build (wa-sqlite.mjs)
  // can only be used with synchronous VFS like MemoryVFS.
  const vfsDir = process.env.POC4_VFS_DIR
  const useAsync = !!vfsDir
  const bundleFile = useAsync ? 'wa-sqlite-async.mjs' : 'wa-sqlite.mjs'
  const wasmFile = useAsync ? 'wa-sqlite-async.wasm' : 'wa-sqlite.wasm'
  const bundlePath = resolve(ROOT, `node_modules/wa-sqlite/dist/${bundleFile}`)
  const wasmPath = resolve(ROOT, `node_modules/wa-sqlite/dist/${wasmFile}`)

  const [bundleDefault, wasmBytes] = await Promise.all([
    import(bundlePath).then((m) => m.default),
    readFile(wasmPath),
  ])

  Module = await bundleDefault({
    locateFile: (file) => resolve(wasmPath, '..', file),
    wasmBinary: wasmBytes,
  })
  await Module.ready

  // Wrap the Module with the high-level SQLite API.
  const { Factory: SQLiteFactory } = await import('wa-sqlite/src/sqlite-api.js')
  sqlite3 = SQLiteFactory(Module)

  // Register VFS. In the test runner we use SharedVFS (writes to disk so
  // multiple workers in the same process can see each other's files). In
  // the browser the real app would use OriginPrivateFileSystemVFS.
  if (vfsDir) {
    const { SharedVFS } = await import('./shared-vfs.mjs')
    vfs = new SharedVFS(vfsDir)
  } else {
    const { MemoryVFS } = await import('wa-sqlite/src/examples/MemoryVFS.js')
    vfs = new MemoryVFS()
  }
  sqlite3.vfs_register(vfs, /* makeDefault */ true)

  return { libversion: sqlite3.libversion(), bundle: bundleFile }
}

async function openDb(filename) {
  if (openDbs.has(filename)) return openDbs.get(filename)
  const db = await sqlite3.open_v2(filename, undefined, vfs.name)
  openDbs.set(filename, db)
  return db
}

function lastDb() {
  const it = openDbs.values().next()
  if (it.done) throw new Error('no DB open')
  return it.value
}

async function execSql(sql) {
  return sqlite3.exec(lastDb(), sql)
}

async function countRows(sql) {
  const r = await sqlite3.execWithParams(lastDb(), sql)
  if (!r.rows.length) return -1
  const v = r.rows[0][0]
  return typeof v === 'bigint' ? Number(v) : v
}

async function vacuumInto(snapFile) {
  const escaped = snapFile.replace(/'/g, "''")
  return sqlite3.exec(lastDb(), `VACUUM INTO '${escaped}';`)
}

function listSnapshots() {
  // For SharedVFS, scan the directory. For MemoryVFS, use the in-memory map.
  if (typeof vfs.listFiles === 'function') {
    return vfs.listFiles()
  }
  return Array.from(vfs.mapNameToFile.keys()).filter((k) => k.endsWith('.db'))
}

async function shutdown() {
  let closed = 0
  // The map iteration order is insertion order, but we need to close
  // databases in a specific order. We collect keys first and close them.
  const dbHandles = Array.from(openDbs.values())
  openDbs.clear()
  for (const db of dbHandles) {
    try {
      await sqlite3.close(db)
    } catch (e) {
      process.stderr.write(`[worker] close error: ${e.message}\n`)
    }
    closed++
  }
  if (vfs?.close) {
    await vfs.close()
  }
  return { closed }
}

let msgHandler = null

parentPort.on('message', async (req) => {
  // The first message we receive is the "started" event — drop it and wait
  // for the actual RPC.
  if (req?.event === 'started') return
  const reply = (payload) => parentPort.postMessage({ pid: process.pid, ...payload })
  try {
    switch (req.op) {
      case 'init': {
        const r = await init()
        return reply({ ok: true, result: r })
      }
      case 'open': {
        const dbId = await openDb(req.filename)
        return reply({ ok: true, result: { dbId } })
      }
      case 'exec': {
        try {
          const rc = await execSql(req.sql)
          return reply({ ok: true, result: { rc } })
        } catch (e) {
          return reply({ ok: false, error: `exec failed: ${e.message}` })
        }
      }
      case 'count': {
        try {
          const count = await countRows(req.sql)
          return reply({ ok: true, result: { count } })
        } catch (e) {
          return reply({ ok: false, error: `count failed: ${e.message}` })
        }
      }
      case 'vacuum': {
        try {
          const rc = await vacuumInto(req.filename)
          return reply({ ok: true, result: { rc } })
        } catch (e) {
          return reply({ ok: false, error: `vacuum failed: ${e.message}` })
        }
      }
      case 'openSnapshot': {
        try {
          const dbId = await openDb(req.filename)
          const count = await countRows('SELECT COUNT(*) FROM t;')
          return reply({ ok: true, result: { dbId, count } })
        } catch (e) {
          return reply({ ok: false, error: `openSnapshot failed: ${e.message}` })
        }
      }
      case 'listSnapshots': {
        try {
          const files = await listSnapshots()
          return reply({ ok: true, result: { files } })
        } catch (e) {
          return reply({ ok: false, error: `listSnapshots failed: ${e.message}` })
        }
      }
      case 'shutdown': {
        try {
          const r = await shutdown()
          // Give fs writes a tick to settle before exiting.
          setImmediate(() => setImmediate(() => process.exit(0)))
          return reply({ ok: true, result: r })
        } catch (e) {
          return reply({ ok: false, error: `shutdown failed: ${e.message}` })
        }
      }
      default:
        return reply({ ok: false, error: `unknown op: ${req.op}` })
    }
  } catch (e) {
    return reply({ ok: false, error: `handler error: ${e.message}` })
  }
})

// Signal we are alive
parentPort.postMessage({ ok: true, pid: process.pid, event: 'started' })
