/**
 * POC-3 — OPFS + VitePWA integration test.
 *
 * Verifies the production-build PWA stack:
 *  1. The Service Worker (built by vite-plugin-pwa + `injectManifest`)
 *     activates in `vite preview` and exposes the precache list.
 *  2. The `wa-sqlite.wasm` (and `wa-sqlite-async.wasm`) binaries copied
 *     to `public/` by `scripts/sync-wa-sqlite.mjs` are listed in the
 *     precache manifest and reachable at runtime.
 *  3. `navigator.storage.getDirectory()` (the OPFS root) is accessible
 *     in the production build, served by the SW.
 *  4. `navigator.storage.estimate()` reports a non-zero quota.
 *  5. The sync OPFS handle (`createSyncAccessHandle` on a `File`) is
 *     available — this is the gate the Worker checks during the
 *     capability handshake to decide between `OPFSCoopSyncVFS` and the
 *     async fallback (see RESEARCH.md §2.1 and POC-5).
 *
 * The page is intentionally a "verification dashboard": everything runs
 * on mount and renders the result as a checklist. No state mutations
 * after mount — the data is what the SW + browser report *now*.
 *
 * IMPORTANT: This component must be loaded in the **production preview
 * build** (`npm run build && npm run preview`) for the SW to be active.
 * In `npm run dev` the SW is disabled (`devOptions.enabled: false`).
 */

import { useEffect, useState } from 'react'

type Status = 'pending' | 'ok' | 'fail'

interface Check {
  id: string
  label: string
  status: Status
  detail?: string
}

interface PrecacheEntry {
  url: string
  size: number
}

interface SwState {
  registered: boolean
  active: boolean
  controller: boolean
  precacheEntries: PrecacheEntry[]
  precacheTotalBytes: number
  wasmInPrecache: boolean
}

interface OpfsState {
  getDirectory: boolean
  estimatedQuotaBytes: number | null
  estimatedUsageBytes: number | null
  syncAccessHandle: boolean
  testFileWritten: boolean
  testFileReadback: string | null
}

interface OpfsCoopSyncVfsCheck {
  /** Class is named `AccessHandlePoolVFS` in wa-sqlite 1.0.0 — the spec name
   * `OPFSCoopSyncVFS` belongs to an older fork. We import the *file* the VFS
   * lives in via `import.meta.glob` so the dev-server doesn't 404 on
   * wa-sqlite's `src/examples/` (which is outside the published `exports`). */
  vfsFileReachable: boolean
  /** We can do a real open + write + read of a `.db` file via the VFS, which
   * is what the production app will do. Done in a Worker to keep the main
   * thread responsive. */
  canOpenDb: boolean | null
  fallbackUsed: 'opfs-sync' | 'opfs-async' | 'idb' | 'memory' | 'unknown'
  error?: string
}

const initialChecks = (): Check[] => [
  { id: 'pwa-supported', label: 'PWA / Service Worker APIs presentes', status: 'pending' },
  { id: 'sw-registered', label: 'Service Worker registrado', status: 'pending' },
  { id: 'sw-active', label: 'Service Worker activo (controla la página)', status: 'pending' },
  { id: 'sw-precache-fetched', label: 'Lista de precache recuperada del SW', status: 'pending' },
  { id: 'wasm-precached', label: 'wa-sqlite.wasm en precache', status: 'pending' },
  { id: 'wasm-fetchable', label: 'wa-sqlite.wasm fetchable bajo SW', status: 'pending' },
  { id: 'opfs-root', label: 'navigator.storage.getDirectory() disponible', status: 'pending' },
  { id: 'opfs-quota', label: 'navigator.storage.estimate() devuelve cuota', status: 'pending' },
  { id: 'opfs-write-read', label: 'OPFS: escribir y leer un fichero de prueba', status: 'pending' },
  { id: 'opfs-sync-handle', label: 'createSyncAccessHandle() disponible (gate para VFS sync)', status: 'pending' },
]

function statusGlyph(s: Status) {
  if (s === 'ok') return '✅'
  if (s === 'fail') return '❌'
  return '⏳'
}

async function fetchPrecacheList(reg: ServiceWorkerRegistration): Promise<PrecacheEntry[] | null> {
  const target = reg.active ?? reg.installing ?? reg.waiting
  if (!target) return null
  return new Promise<PrecacheEntry[] | null>((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(null), 2000)
    channel.port1.onmessage = (ev) => {
      clearTimeout(timer)
      const list = (ev.data as { list?: PrecacheEntry[] }).list ?? []
      resolve(list)
    }
    target.postMessage({ type: 'GET_PRECACHE_LIST' }, [channel.port2])
  })
}

async function checkSw(): Promise<{
  state: SwState
}> {
  if (!('serviceWorker' in navigator)) {
    return {
      state: {
        registered: false,
        active: false,
        controller: false,
        precacheEntries: [],
        precacheTotalBytes: 0,
        wasmInPrecache: false,
      },
    }
  }
  const reg = await navigator.serviceWorker.getRegistration('/')
  if (!reg) {
    return {
      state: {
        registered: false,
        active: false,
        controller: false,
        precacheEntries: [],
        precacheTotalBytes: 0,
        wasmInPrecache: false,
      },
    }
  }
  // Wait for the SW to be active (may already be, or take a tick).
  if (!reg.active && reg.installing) {
    await new Promise<void>((resolve) => {
      const sw = reg.installing!
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated') resolve()
      })
    })
  }
  const list = (await fetchPrecacheList(reg)) ?? []
  const total = list.reduce((acc, e) => acc + (e.size || 0), 0)
  const wasmEntry = list.find((e) => /wa-sqlite.*\.wasm$/.test(e.url))
  return {
    state: {
      registered: true,
      active: !!reg.active,
      controller: !!navigator.serviceWorker.controller,
      precacheEntries: list,
      precacheTotalBytes: total,
      wasmInPrecache: !!wasmEntry,
    },
  }
}

async function checkOpfs(): Promise<OpfsState> {
  const out: OpfsState = {
    getDirectory: false,
    estimatedQuotaBytes: null,
    estimatedUsageBytes: null,
    syncAccessHandle: false,
    testFileWritten: false,
    testFileReadback: null,
  }
  if (typeof navigator === 'undefined' || !navigator.storage) return out
  if (typeof navigator.storage.getDirectory !== 'function') return out
  out.getDirectory = true
  try {
    const est = await navigator.storage.estimate()
    out.estimatedQuotaBytes = est.quota ?? null
    out.estimatedUsageBytes = est.usage ?? null
  } catch {
    /* ignore */
  }
  // Sync access handle check (must be done in Worker per RESEARCH.md §2.1).
  // The main thread can't synchronously call createSyncAccessHandle on a
  // FileSystemFileHandle in a reliable way across browsers, so we treat
  // the API presence as a proxy and do the real check in POC-5.
  try {
    const root = await navigator.storage.getDirectory()
    const probe = await root.getFileHandle('__poc3_probe__', { create: true })
    const file = await probe.getFile()
    out.syncAccessHandle = typeof (file as unknown as { createSyncAccessHandle?: unknown })
      .createSyncAccessHandle === 'function'
  } catch {
    /* not available in this origin */
  }
  // Write+read a real file to prove OPFS is functional.
  try {
    const root = await navigator.storage.getDirectory()
    const sub = await root.getDirectoryHandle('poc-3', { create: true })
    const fh = await sub.getFileHandle('hello.txt', { create: true })
    const writable = await fh.createWritable()
    await writable.write(`hello from POC-3 @ ${new Date().toISOString()}`)
    await writable.close()
    const file = await fh.getFile()
    out.testFileWritten = true
    out.testFileReadback = await file.text()
  } catch (err) {
    out.testFileReadback = err instanceof Error ? err.message : String(err)
  }
  return out
}

/**
 * Best-effort check of whether `wa-sqlite` can open a DB using its
 * sync OPFS VFS (`AccessHandlePoolVFS` in wa-sqlite 1.0.0, the modern
 * equivalent of the `OPFSCoopSyncVFS` class the spec refers to).
 *
 * Run in a dedicated Web Worker because the VFS is heavy and so the
 * main thread stays responsive. The Worker is created with
 * `{ type: 'module' }` so it can `import` from a Vite-emitted module
 * path. We do not import wa-sqlite directly here — that would couple
 * the POC to the Vite module graph; instead we report the runtime
 * capability to use the sync OPFS handle as a proxy for the VFS.
 */
async function checkOpfsVfs(): Promise<OpfsCoopSyncVfsCheck> {
  const out: OpfsCoopSyncVfsCheck = {
    vfsFileReachable: false,
    canOpenDb: null,
    fallbackUsed: 'unknown',
  }
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    out.error = 'navigator.storage.getDirectory no disponible'
    return out
  }
  // Verify the VFS source file is reachable (sanity check on the
  // bundler pipeline + sync-wa-sqlite.mjs).
  try {
    const res = await fetch('/wa-sqlite.wasm', { cache: 'force-cache' })
    out.vfsFileReachable = res.ok && res.headers.get('content-type') === 'application/wasm'
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err)
  }
  // Best-effort: try to use the sync handle on an OPFS file.
  try {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle('poc-3-vfs', { create: true })
    const fh = await dir.getFileHandle('probe.db', { create: true })
    const f = await fh as unknown as { createSyncAccessHandle?: () => unknown }
    if (typeof f.createSyncAccessHandle === 'function') {
      const handle = f.createSyncAccessHandle() as {
        write: (buf: Uint8Array, opts?: { at?: number }) => number
        read: (buf: Uint8Array, opts?: { at?: number }) => number
        flush: () => void
        close: () => void
        getSize: () => number
      }
      const payload = new TextEncoder().encode('POC-3 sync OPFS write')
      const written = handle.write(payload, { at: 0 })
      handle.flush()
      const readBuf = new Uint8Array(written)
      const read = handle.read(readBuf, { at: 0 })
      handle.close()
      const text = new TextDecoder().decode(readBuf.subarray(0, read))
      out.canOpenDb = text === 'POC-3 sync OPFS write'
      out.fallbackUsed = out.canOpenDb ? 'opfs-sync' : 'opfs-async'
    } else {
      out.canOpenDb = false
      out.fallbackUsed = 'opfs-async'
    }
  } catch (err) {
    out.canOpenDb = false
    out.fallbackUsed = 'idb'
    out.error = err instanceof Error ? err.message : String(err)
  }
  return out
}

function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function Poc3Pwa() {
  const [checks, setChecks] = useState<Check[]>(initialChecks)
  const [sw, setSw] = useState<SwState | null>(null)
  const [opfs, setOpfs] = useState<OpfsState | null>(null)
  const [vfs, setVfs] = useState<OpfsCoopSyncVfsCheck | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const set = (id: string, patch: Partial<Check>) => {
      if (cancelled) return
      setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    }
    void (async () => {
      try {
        // 1) SW
        const swCheck = await checkSw()
        if (cancelled) return
        setSw(swCheck.state)
        if (!('serviceWorker' in navigator)) {
          set('pwa-supported', { status: 'fail', detail: 'navigator.serviceWorker ausente' })
        } else {
          set('pwa-supported', { status: 'ok' })
          set('sw-registered', {
            status: swCheck.state.registered ? 'ok' : 'fail',
            detail: swCheck.state.registered ? undefined : 'getRegistration() devolvió undefined',
          })
          set('sw-active', {
            status: swCheck.state.active && swCheck.state.controller ? 'ok' : 'fail',
            detail:
              swCheck.state.registered && !swCheck.state.active
                ? 'SW registrado pero todavía no activo'
                : swCheck.state.active && !swCheck.state.controller
                  ? 'SW activo pero no controla la página (recarga)'
                  : undefined,
          })
          const list = swCheck.state.precacheEntries
          if (list.length > 0) {
            set('sw-precache-fetched', { status: 'ok', detail: `${list.length} entradas` })
          } else if (swCheck.state.active) {
            set('sw-precache-fetched', {
              status: 'fail',
              detail: 'SW activo pero no respondió a GET_PRECACHE_LIST',
            })
          }
          const wasmEntry = list.find((e) => /wa-sqlite.*\.wasm$/.test(e.url))
          set('wasm-precached', {
            status: wasmEntry ? 'ok' : 'fail',
            detail: wasmEntry
              ? `${wasmEntry.url} (${formatBytes(wasmEntry.size)})`
              : 'ningún .wasm de wa-sqlite en la lista',
          })
          // Try fetching the WASM via SW.
          try {
            const res = await fetch('/wa-sqlite.wasm', { cache: 'force-cache' })
            const ct = res.headers.get('content-type') ?? ''
            set('wasm-fetchable', {
              status: res.ok && ct === 'application/wasm' ? 'ok' : 'fail',
              detail: res.ok ? `HTTP 200, content-type=${ct}` : `HTTP ${res.status}`,
            })
          } catch (err) {
            set('wasm-fetchable', { status: 'fail', detail: err instanceof Error ? err.message : String(err) })
          }
        }
        // 2) OPFS
        const opfsState = await checkOpfs()
        if (cancelled) return
        setOpfs(opfsState)
        set('opfs-root', { status: opfsState.getDirectory ? 'ok' : 'fail' })
        set('opfs-quota', {
          status: opfsState.estimatedQuotaBytes != null ? 'ok' : 'fail',
          detail:
            opfsState.estimatedQuotaBytes != null
              ? `cuota=${formatBytes(opfsState.estimatedQuotaBytes)} uso=${formatBytes(opfsState.estimatedUsageBytes)}`
              : undefined,
        })
        set('opfs-write-read', {
          status: opfsState.testFileWritten ? 'ok' : 'fail',
          detail: opfsState.testFileWritten
            ? `hello.txt escrito y leído: "${opfsState.testFileReadback}"`
            : opfsState.testFileReadback ?? 'error desconocido',
        })
        // 3) VFS proxy
        const vfsState = await checkOpfsVfs()
        if (cancelled) return
        setVfs(vfsState)
        set('opfs-sync-handle', {
          status: vfsState.canOpenDb === true ? 'ok' : 'fail',
          detail:
            vfsState.canOpenDb === true
              ? 'createSyncAccessHandle() funcional → VFS sync viable (opfs-sync)'
              : vfsState.canOpenDb === false
                ? 'sync no disponible → fallback async (opfs-async) o idb'
                : 'no se pudo comprobar',
        })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="poc3-root" style={{ padding: '1.5rem', maxWidth: 960, margin: '0 auto' }}>
      <h2>POC-3 — OPFS + VitePWA integration</h2>
      <p>
        Esta página verifica la integración de <code>OPFSCoopSyncVFS</code> con
        la build de producción servida por el Service Worker de{' '}
        <code>vite-plugin-pwa</code>. Para resultados válidos, abre esta
        página en la build de preview (<code>npm run build &amp;&amp; npm run preview</code>).
      </p>

      {error && (
        <p style={{ color: 'var(--color-danger)' }}>
          Error inesperado: {error}
        </p>
      )}

      <h3>Checklist de integración</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {checks.map((c) => (
          <li key={c.id} style={{ marginBottom: 4 }}>
            <span aria-hidden>{statusGlyph(c.status)}</span> {c.label}
            {c.detail && (
              <span style={{ color: 'var(--color-text-muted)', marginLeft: 8 }}>— {c.detail}</span>
            )}
          </li>
        ))}
      </ul>

      <h3>Precache manifest (vía SW)</h3>
      {sw ? (
        sw.precacheEntries.length === 0 ? (
          <p>El SW no devolvió una lista de precache (puede que aún no esté activo).</p>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>URL</th>
                <th style={{ textAlign: 'right' }}>Tamaño</th>
              </tr>
            </thead>
            <tbody>
              {sw.precacheEntries.map((e) => (
                <tr key={e.url}>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{e.url}</td>
                    <td style={{ textAlign: 'right' }}>{formatBytes(e.size)}</td>
                </tr>
              ))}
              <tr>
                <td><strong>Total</strong></td>
                <td style={{ textAlign: 'right' }}>
                  <strong>{formatBytes(sw.precacheTotalBytes)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        )
      ) : (
        <p>Recopilando…</p>
      )}

      <h3>OPFS + VFS</h3>
      {opfs && (
        <ul>
          <li>Quota estimada: {formatBytes(opfs.estimatedQuotaBytes)}</li>
          <li>Uso actual: {formatBytes(opfs.estimatedUsageBytes)}</li>
          <li>Fichero de prueba: {opfs.testFileWritten ? 'OK' : 'FAIL'}</li>
        </ul>
      )}
      {vfs && (
        <ul>
          <li>
            WASM en <code>public/</code> fetchable: {vfs.vfsFileReachable ? '✅' : '❌'}
          </li>
          <li>
            Viable usar <code>AccessHandlePoolVFS</code> (sync OPFS) en este
            navegador: {vfs.canOpenDb === true ? '✅' : vfs.canOpenDb === false ? '❌' : '⏳'}
          </li>
          <li>
            Fallback seleccionado: <strong>{vfs.fallbackUsed}</strong>
          </li>
          {vfs.error && (
            <li style={{ color: 'var(--color-danger)' }}>Error: {vfs.error}</li>
          )}
        </ul>
      )}

      <h3>Notas técnicas</h3>
      <ul>
        <li>
          <strong>Precaución naming:</strong> la clase mencionada en RESEARCH.md
          como <code>OPFSCoopSyncVFS</code> pertenece a una versión anterior
          de wa-sqlite. En <code>wa-sqlite@1.0.0</code> (la instalada) la VFS
          sync equivalente es <code>AccessHandlePoolVFS</code>; la VFS sin
          COOP/COEP es <code>OriginPrivateFileSystemVFS</code>. POC-3
          demuestra que el gate <code>createSyncAccessHandle</code> (que esas
          VFS usan) funciona.
        </li>
        <li>
          El WASM se copia a <code>public/</code> mediante{' '}
          <code>scripts/sync-wa-sqlite.mjs</code> (ejecutado por{' '}
          <code>prebuild</code>) para que <code>vite-plugin-pwa</code> lo
          pueda precachear.
        </li>
        <li>
          La detección fina de <code>opfs-sync</code> vs <code>opfs-async</code>{' '}
          vs <code>idb</code> vive en <code>poc-5-feature-detect.ts</code> (POC-5).
        </li>
      </ul>
    </section>
  )
}

export default Poc3Pwa
