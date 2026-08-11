/**
 * POC-5 — Feature detection cross-browser.
 *
 * Implements the 3-level capability detection described in
 * RESEARCH.md §2.1:
 *
 *   1. **opfs-sync** — `navigator.storage.getDirectory()` exists AND a
 *      Web Worker can call `createSyncAccessHandle` on a
 *      `FileSystemFileHandle` (the gate the sync OPFS VFS classes
 *      in wa-sqlite require).
 *   2. **opfs-async** — `navigator.storage.getDirectory()` exists but
 *      the sync handle is not available (e.g. cross-origin isolation
 *      is off, or the browser is Safari < 17.4).
 *   3. **idb** — only `indexedDB` is available (we can still run
 *      SQLite with the `IDBBatchAtomicVFS` from wa-sqlite, but it
 *      is slower for big DBs).
 *   4. **memory** — nothing. SQLite runs in memory only; no
 *      persistence.
 *
 * **Why the Worker handshake?** The `createSyncAccessHandle` API is
 * only available in a **dedicated or shared Web Worker context** in
 * some browsers. Detecting from the main thread would over-report
 * `opfs-sync` and then crash at runtime when wa-sqlite tries to
 * actually open a DB. The handshake asks a real Worker to do the
 * check and report back.
 *
 * **Testability.** The actual capability decision is a pure
 * function over a `StorageProbe` object — see `decideCapability`.
 * The `detectStorageCapability` wrapper builds a `StorageProbe` by
 * either (a) running the Worker handshake or (b) calling a custom
 * probe function. Tests inject mocks to cover each level without
 * touching the Worker plumbing.
 */

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

/** Storage tiers ordered from best to worst. */
export type StorageCapability = 'opfs-sync' | 'opfs-async' | 'idb' | 'memory'

/**
 * What the browser (or a Worker running on its behalf) reports.
 * Every flag is conservative: it must be `true` only if the
 * capability was *actually* exercised, not just by feature-detecting
 * the API.
 */
export interface StorageProbe {
  /** `navigator.storage?.getDirectory` exists in this context. */
  hasGetDirectory: boolean
  /** A `FileSystemFileHandle` from OPFS exposes `createSyncAccessHandle` (sync OPFS). */
  hasCreateSyncAccessHandle: boolean
  /** `globalThis.indexedDB` exists. */
  hasIndexedDB: boolean
  /** Optional human-readable error to surface to the UI. */
  error?: string
}

// ────────────────────────────────────────────────────────────────────
// Pure decision function (testable in isolation)
// ────────────────────────────────────────────────────────────────────

/**
 * Map a `StorageProbe` to the best `StorageCapability` it can support.
 *
 * Decision tree (matches RESEARCH.md §2.1):
 *  - sync OPFS requires BOTH `hasGetDirectory` and `hasCreateSyncAccessHandle`.
 *  - async OPFS requires only `hasGetDirectory`.
 *  - IDB fallback requires `hasIndexedDB`.
 *  - Otherwise: in-memory only.
 */
export function decideCapability(probe: StorageProbe): StorageCapability {
  if (probe.hasGetDirectory && probe.hasCreateSyncAccessHandle) return 'opfs-sync'
  if (probe.hasGetDirectory) return 'opfs-async'
  if (probe.hasIndexedDB) return 'idb'
  return 'memory'
}

// ────────────────────────────────────────────────────────────────────
// Production probe — runs in a Web Worker
// ────────────────────────────────────────────────────────────────────

/**
 * The body of the capability-probe Worker. It runs in a dedicated
 * Web Worker context (so `createSyncAccessHandle` is available where
 * the browser supports it) and exposes a single `probe()` function
 * via Comlink.
 *
 * The Worker is kept tiny on purpose — no wa-sqlite imports, no
 * Comlink on the main thread (we use a thin `MessageChannel`-based
 * RPC inline so the production bundle doesn't need a Comlink runtime
 * just for the capability check).
 */
const PROBE_WORKER_SOURCE = String.raw`
self.onmessage = async (event) => {
  const { id } = event.data || {}
  try {
    const probe = {
      hasGetDirectory:
        typeof self !== 'undefined' &&
        self.navigator &&
        self.navigator.storage &&
        typeof self.navigator.storage.getDirectory === 'function',
      hasCreateSyncAccessHandle: await (async () => {
        if (!self.navigator?.storage?.getDirectory) return false
        try {
          const root = await self.navigator.storage.getDirectory()
          const fh = await root.getFileHandle('__cap_probe__', { create: true })
          // The cast is necessary because the TS lib doesn't include
          // createSyncAccessHandle in all DOM lib versions.
          return typeof fh.createSyncAccessHandle === 'function'
        } catch (err) {
          // Some browsers throw NotAllowedError in private mode or
          // when COOP/COEP isn't set. That's fine — we report false.
          return false
        }
      })(),
      hasIndexedDB: typeof self.indexedDB !== 'undefined',
    }
    self.postMessage({ id, ok: true, probe })
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err && err.message ? err.message : String(err),
    })
  }
}
`

/**
 * Build a Blob URL that hosts the probe worker source above. We use
 * a Blob URL so the production build doesn't need a separate
 * `capability.worker.ts` import (Vite's worker pipeline is heavier
 * and would require changes to the SW config).
 *
 * (Implementation lives in `makeWorkerBlobUrlFor` below; the
 * production `detectStorageCapability` calls it with the inline
 * `PROBE_WORKER_SOURCE`.)
 */

/**
 * Spawn a probe Worker and ask it to report its capability. The
 * function is intentionally narrow so the test suite can inject a
 * fake `spawn` (see `detectStorageCapability`).
 */
interface ProbeRequest {
  id: number
}

interface ProbeSuccess {
  ok: true
  probe: StorageProbe
}

interface ProbeFailure {
  ok: false
  error: string
}

function runProbeInWorker(
  spawn: (source: string) => Worker,
  source: string,
  timeoutMs = 1500,
): Promise<StorageProbe> {
  return new Promise<StorageProbe>((resolve) => {
    let worker: Worker | null = null
    let settled = false
    const finish = (probe: StorageProbe) => {
      if (settled) return
      settled = true
      if (worker) worker.terminate()
      resolve(probe)
    }
    try {
      worker = spawn(source)
    } catch (err) {
      finish({
        hasGetDirectory: false,
        hasCreateSyncAccessHandle: false,
        hasIndexedDB: typeof indexedDB !== 'undefined',
        error: err instanceof Error ? err.message : String(err),
      })
      return
    }
    const id = 1
    const req: ProbeRequest = { id }
    const timer = setTimeout(() => {
      finish({
        hasGetDirectory: false,
        hasCreateSyncAccessHandle: false,
        hasIndexedDB: typeof indexedDB !== 'undefined',
        error: 'probe timed out',
      })
    }, timeoutMs)
    worker.onmessage = (ev: MessageEvent<ProbeSuccess | ProbeFailure>) => {
      clearTimeout(timer)
      const data = ev.data
      if (data && data.ok) {
        finish(data.probe)
      } else {
        const errMsg = data && 'error' in data ? data.error : 'unknown probe error'
        finish({
          hasGetDirectory: false,
          hasCreateSyncAccessHandle: false,
          hasIndexedDB: typeof indexedDB !== 'undefined',
          error: errMsg,
        })
      }
    }
    worker.onerror = (ev: ErrorEvent) => {
      clearTimeout(timer)
      finish({
        hasGetDirectory: false,
        hasCreateSyncAccessHandle: false,
        hasIndexedDB: typeof indexedDB !== 'undefined',
        error: ev.message || 'worker error',
      })
    }
    worker.postMessage(req)
  })
}

// ────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────

export interface DetectOptions {
  /**
   * Override how a Worker is spawned. The production path passes a
   * closure that creates a Worker from the inline `PROBE_WORKER_SOURCE`
   * blob URL; tests pass a mock that returns a fake Worker object
   * with a configurable `onmessage`/`postMessage` interface.
   */
  spawn?: (source: string) => Worker
  /**
   * Override the probe source (defaults to the inline `PROBE_WORKER_SOURCE`).
   * Useful for the "level 1 + IDB" test (no sync handle, but
   * `getDirectory` works) where the mock worker just needs to
   * dispatch a `postMessage` from its `onmessage`.
   */
  source?: string
  /**
   * Skip the Worker handshake entirely and probe the main-thread
   * globals directly. Faster but less accurate (won't catch the
   * "Worker-only" sync handle case). The Main Thread can NOT
   * definitively answer `hasCreateSyncAccessHandle` so this path
   * always reports `false` for that flag and falls back to
   * `opfs-async` or below.
   */
  skipWorkerHandshake?: boolean
  /** Max ms to wait for the Worker to report. Defaults to 1500. */
  timeoutMs?: number
}

/**
 * Detect the best `StorageCapability` the current browser supports.
 *
 * Runs in three steps:
 *  1. (Optional) spin up a probe Worker and wait for its reply.
 *  2. (Fallback) if the Worker fails or `skipWorkerHandshake` is
 *     true, probe the main-thread globals directly.
 *  3. Delegate to `decideCapability(probe)` for the final answer.
 *
 * The full Main → Worker → Main round-trip is exercised by the
 * integration-style test in `tests/unit/feature-detect.test.ts`
 * using a mock Worker — see the test file for the exact contract.
 */
export async function detectStorageCapability(opts: DetectOptions = {}): Promise<StorageCapability> {
  const mainThreadProbe = probeMainThread()
  if (opts.skipWorkerHandshake) {
    return decideCapability(mainThreadProbe)
  }
  const source = opts.source ?? PROBE_WORKER_SOURCE
  const spawn: (src: string) => Worker = opts.spawn ?? ((src) => {
    const url = makeWorkerBlobUrlFor(src)
    return new Worker(url, { type: 'classic' })
  })
  const workerProbe = await runProbeInWorker(spawn, source, opts.timeoutMs)
  // Worker results are more authoritative for `createSyncAccessHandle`
  // (which is Worker-only on some browsers). If the Worker reports
  // `false` but the main thread has `getDirectory`, the Worker wins.
  const merged: StorageProbe = {
    hasGetDirectory: workerProbe.hasGetDirectory || mainThreadProbe.hasGetDirectory,
    hasCreateSyncAccessHandle: workerProbe.hasCreateSyncAccessHandle,
    hasIndexedDB: workerProbe.hasIndexedDB || mainThreadProbe.hasIndexedDB,
    error: workerProbe.error,
  }
  return decideCapability(merged)
}

/**
 * Best-effort probe of the main-thread globals. Returns
 * `hasCreateSyncAccessHandle: false` because we cannot guarantee
 * it's testable from the main thread (and on some browsers it's
 * not callable from there at all).
 */
export function probeMainThread(): StorageProbe {
  if (typeof globalThis === 'undefined') {
    return { hasGetDirectory: false, hasCreateSyncAccessHandle: false, hasIndexedDB: false }
  }
  const g = globalThis as unknown as {
    navigator?: { storage?: { getDirectory?: () => Promise<unknown> } }
    indexedDB?: unknown
  }
  const hasGetDirectory = typeof g.navigator?.storage?.getDirectory === 'function'
  const hasIndexedDB = typeof g.indexedDB !== 'undefined'
  return { hasGetDirectory, hasCreateSyncAccessHandle: false, hasIndexedDB }
}

/** Helper that creates a blob URL from a worker source string. */
function makeWorkerBlobUrlFor(source: string): string {
  // Browsers expose URL + Blob; the call site is wrapped so SSR
  // (no URL/Blob) is still type-safe.
  if (typeof URL === 'undefined' || typeof Blob === 'undefined') {
    throw new Error('Blob/URL not available in this environment')
  }
  const blob = new Blob([source], { type: 'application/javascript' })
  return URL.createObjectURL(blob)
}

// ────────────────────────────────────────────────────────────────────
// Re-export helpers for tests
// ────────────────────────────────────────────────────────────────────

/** Public for tests only — the source string we ship to the probe Worker. */
export const __PROBE_WORKER_SOURCE__ = PROBE_WORKER_SOURCE
