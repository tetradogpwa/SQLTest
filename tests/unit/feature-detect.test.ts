/**
 * Tests for POC-5 (feature detection cross-browser).
 *
 * These tests cover:
 *  1. The pure `decideCapability` function (3 levels + memory).
 *  2. The full `detectStorageCapability` round-trip:
 *     Main → Worker → Main, with mock Workers simulating each level.
 *  3. Edge cases: timeouts, worker errors, IDB-only fallback,
 *     skipWorkerHandshake mode.
 *
 * No real browser is required — happy-dom provides the DOM, and
 * we inject mock Workers via the `spawn` option.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  decideCapability,
  detectStorageCapability,
  probeMainThread,
  __PROBE_WORKER_SOURCE__,
} from '../../pocs/ui/poc-5-feature-detect'

// ────────────────────────────────────────────────────────────────────
// Mocks
// ────────────────────────────────────────────────────────────────────

/**
 * Build a fake Worker that, when the production code calls
 * `postMessage({ id })`, synchronously schedules a `postMessage`
 * back to the registered `onmessage` handler with the given probe.
 *
 * This faithfully simulates the Main → Worker → Main round-trip
 * because the production code uses `onmessage = (ev) => ...` to
 * receive the reply, exactly as a real Worker would.
 */
function makeFakeWorker(reply: (msg: unknown) => unknown): {
  worker: { postMessage: (msg: unknown) => void; terminate: () => void }
  trigger: (msg: unknown) => void
} {
  let onmessage: ((ev: MessageEvent) => void) | null = null
  const trigger = (msg: unknown) => {
    if (onmessage) onmessage({ data: msg } as MessageEvent)
  }
  const worker = {
    postMessage: (msg: unknown) => {
      // Reply on the next microtask, like a real Worker would.
      queueMicrotask(() => {
        try {
          const replyMsg = reply(msg)
          if (replyMsg !== undefined) trigger(replyMsg)
        } catch (err) {
          // surface as a fake error message
          trigger({ ok: false, error: err instanceof Error ? err.message : String(err) })
        }
      })
    },
    terminate: () => {
      onmessage = null
    },
  }
  // Hook used by the production `runProbeInWorker` to set up `onmessage`.
  Object.defineProperty(worker, 'onmessage', {
    get() {
      return onmessage
    },
    set(handler: ((ev: MessageEvent) => void) | null) {
      onmessage = handler
    },
  })
  return { worker, trigger }
}

/**
 * Wrap a fake Worker in a factory that returns it. The factory
 * signature matches `DetectOptions.spawn`.
 */
function spawnFactory(
  reply: (msg: unknown) => unknown,
): (source: string) => Worker {
  const { worker } = makeFakeWorker(reply)
  return () => worker as unknown as Worker
}

// ────────────────────────────────────────────────────────────────────
// Pure decision function
// ────────────────────────────────────────────────────────────────────

describe('decideCapability — pure decision over StorageProbe', () => {
  it('Level 1: returns opfs-sync when getDirectory + createSyncAccessHandle are both true', () => {
    expect(
      decideCapability({
        hasGetDirectory: true,
        hasCreateSyncAccessHandle: true,
        hasIndexedDB: true,
      }),
    ).toBe('opfs-sync')
  })

  it('Level 2: returns opfs-async when getDirectory is true but sync handle is not', () => {
    expect(
      decideCapability({
        hasGetDirectory: true,
        hasCreateSyncAccessHandle: false,
        hasIndexedDB: true,
      }),
    ).toBe('opfs-async')
  })

  it('Level 3: returns idb when only indexedDB is present', () => {
    expect(
      decideCapability({
        hasGetDirectory: false,
        hasCreateSyncAccessHandle: false,
        hasIndexedDB: true,
      }),
    ).toBe('idb')
  })

  it('Level 4: returns memory when nothing is present', () => {
    expect(
      decideCapability({
        hasGetDirectory: false,
        hasCreateSyncAccessHandle: false,
        hasIndexedDB: false,
      }),
    ).toBe('memory')
  })

  it('sync handle is ignored without getDirectory (defensive — should not happen in practice)', () => {
    expect(
      decideCapability({
        hasGetDirectory: false,
        hasCreateSyncAccessHandle: true, // paradoxical
        hasIndexedDB: true,
      }),
    ).toBe('idb')
  })
})

// ────────────────────────────────────────────────────────────────────
// Main-thread probe
// ────────────────────────────────────────────────────────────────────

describe('probeMainThread — best-effort main-thread capability check', () => {
  it('reports hasCreateSyncAccessHandle=false even if navigator.storage.getDirectory exists', () => {
    const probe = probeMainThread()
    // We always force `false` for the sync handle from the main thread
    // because (a) the API is Worker-only on some browsers, (b) the
    // worker handshake is the authoritative source.
    expect(probe.hasCreateSyncAccessHandle).toBe(false)
    // The other two are best-effort reads from globals.
    expect(typeof probe.hasGetDirectory).toBe('boolean')
    expect(typeof probe.hasIndexedDB).toBe('boolean')
  })
})

// ────────────────────────────────────────────────────────────────────
// Full Main → Worker → Main handshake (mocked)
// ────────────────────────────────────────────────────────────────────

describe('detectStorageCapability — full handshake', () => {
  let originalNavigator: unknown
  let originalIndexedDB: unknown

  beforeEach(() => {
    originalNavigator = (globalThis as { navigator?: unknown }).navigator
    originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB
  })

  afterEach(() => {
    ;(globalThis as { navigator?: unknown }).navigator = originalNavigator
    ;(globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB
  })

  function setGlobals(hasGetDirectory: boolean, hasIndexedDB: boolean) {
    ;(globalThis as { navigator?: unknown }).navigator = {
      storage: hasGetDirectory ? { getDirectory: () => Promise.resolve({}) } : undefined,
    }
    ;(globalThis as { indexedDB?: unknown }).indexedDB = hasIndexedDB ? {} : undefined
  }

  it('Level 1: returns opfs-sync when the Worker reports both OPFS APIs', async () => {
    setGlobals(true, true)
    const spawn = spawnFactory((_msg) => ({
      ok: true,
      probe: {
        hasGetDirectory: true,
        hasCreateSyncAccessHandle: true,
        hasIndexedDB: true,
      },
    }))
    const result = await detectStorageCapability({ spawn, source: __PROBE_WORKER_SOURCE__ })
    expect(result).toBe('opfs-sync')
  })

  it('Level 2: returns opfs-async when Worker reports getDirectory but no sync handle', async () => {
    setGlobals(true, true)
    const spawn = spawnFactory((_msg) => ({
      ok: true,
      probe: {
        hasGetDirectory: true,
        hasCreateSyncAccessHandle: false, // ← this is the gate
        hasIndexedDB: true,
      },
    }))
    const result = await detectStorageCapability({ spawn, source: __PROBE_WORKER_SOURCE__ })
    expect(result).toBe('opfs-async')
  })

  it('Level 3: returns idb when Worker reports only indexedDB', async () => {
    setGlobals(false, true)
    const spawn = spawnFactory((_msg) => ({
      ok: true,
      probe: {
        hasGetDirectory: false,
        hasCreateSyncAccessHandle: false,
        hasIndexedDB: true,
      },
    }))
    const result = await detectStorageCapability({ spawn, source: __PROBE_WORKER_SOURCE__ })
    expect(result).toBe('idb')
  })

  it('Level 4: returns memory when Worker reports nothing', async () => {
    setGlobals(false, false)
    const spawn = spawnFactory((_msg) => ({
      ok: true,
      probe: {
        hasGetDirectory: false,
        hasCreateSyncAccessHandle: false,
        hasIndexedDB: false,
      },
    }))
    const result = await detectStorageCapability({ spawn, source: __PROBE_WORKER_SOURCE__ })
    expect(result).toBe('memory')
  })

  it('falls back to memory when the Worker times out (e.g. CSP blocks Worker creation)', async () => {
    setGlobals(false, false)
    // Never reply → the 1.5 s timeout in runProbeInWorker fires.
    const spawn: (src: string) => Worker = () =>
      ({
        postMessage() {
          /* never replies */
        },
        terminate() {
          /* noop */
        },
        set onmessage(_: ((ev: MessageEvent) => void) | null) {
          /* noop */
        },
      } as unknown as Worker)
    const result = await detectStorageCapability({ spawn, source: __PROBE_WORKER_SOURCE__, timeoutMs: 50 })
    // With no globals either, the merged probe is all-false → memory.
    expect(result).toBe('memory')
  })

  it('falls back to idb on Worker error when main thread has indexedDB', async () => {
    setGlobals(false, true)
    const spawn: (src: string) => Worker = () => {
      const w = {
        postMessage() {
          /* noop */
        },
        terminate() {
          /* noop */
        },
        set onmessage(_: ((ev: MessageEvent) => void) | null) {
          /* noop */
        },
      } as unknown as Worker
      // Simulate a worker error on the next tick.
      queueMicrotask(() => {
        const evt = new MessageEvent('error', { data: 'CSP violation' })
        ;(w as unknown as { onerror?: (ev: ErrorEvent) => void }).onerror?.({
          message: 'CSP blocks Worker',
        } as ErrorEvent)
        // suppress unused-var warning
        void evt
      })
      return w
    }
    const result = await detectStorageCapability({ spawn, source: __PROBE_WORKER_SOURCE__ })
    expect(result).toBe('idb')
  })

  it('skipWorkerHandshake mode defers to main-thread probe and never returns opfs-sync', async () => {
    setGlobals(true, true)
    const result = await detectStorageCapability({ skipWorkerHandshake: true })
    // Main-thread probe always reports hasCreateSyncAccessHandle=false,
    // so the best we can claim without the Worker is opfs-async.
    expect(result).toBe('opfs-async')
  })
})

// ────────────────────────────────────────────────────────────────────
// Sanity: the probe source string is valid worker JS
// ────────────────────────────────────────────────────────────────────

describe('PROBE_WORKER_SOURCE', () => {
  it('is a non-empty string containing the expected handler', () => {
    expect(typeof __PROBE_WORKER_SOURCE__).toBe('string')
    expect(__PROBE_WORKER_SOURCE__.length).toBeGreaterThan(100)
    expect(__PROBE_WORKER_SOURCE__).toMatch(/self\.onmessage/)
    expect(__PROBE_WORKER_SOURCE__).toMatch(/createSyncAccessHandle/)
  })
})
