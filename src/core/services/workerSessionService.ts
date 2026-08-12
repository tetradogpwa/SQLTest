/**
 * Worker session service.
 *
 * Pure-TS encapsulation of the SQLite Worker lifecycle. Holds the
 * session state (handle, status, active dbId, error, initResult,
 * generation) and exposes methods to mutate it + an observer
 * pattern for the React glue (`useDatabase`) to subscribe to
 * changes.
 *
 * Design goals:
 *  - **Testable without a real Worker.** All I/O goes through
 *    injected callbacks (`createWorker`, `init`, `open`) so unit
 *    tests can drive the state machine with mocks.
 *  - **One source of truth.** The session state is a plain
 *    mutable object; the service provides typed methods to read
 *    and mutate it. No React, no DOM, no globals.
 *  - **The recovery / retry logic is pure.** It is encoded as
 *    state transitions that the tests can drive synchronously.
 *
 * The service is the *only* place that mutates the session state.
 * Callers (the React hook + future code) read `state()` for a
 *    snapshot and `subscribe()` to be notified of changes.
 */
import type { Remote } from 'comlink'

import type { InitResult } from '../../workers/types'
import type { DBApi } from '../../hooks/dbApi'

/* ------------------------------------------------------------------ *
 *  Public types                                                          *
 * ------------------------------------------------------------------ */

/**
 * Maximum number of times the session will attempt to recover the
 * Worker before giving up and transitioning to `'dead'`. Matches the
 * pre-refactor constant in `useDatabase.ts`.
 */
export const MAX_RECOVERY_ATTEMPTS = 3

/** Lifecycle of the Worker, surfaced to the UI for status indicators. */
export type WorkerStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'busy'
  | 'recovering'
  | 'dead'

/** A handle to a live Worker + its Comlink-wrapped DBAPI. */
export interface WorkerHandle {
  worker: Worker
  api: Remote<DBApi>
  /** `dbId → filename` so we can re-open on recovery. */
  openDbs: Map<number, string>
  /** Number of consecutive failures. Reset to 0 on a successful boot. */
  failureCount: number
}

/** The full session state, exposed read-only via `WorkerSession.state`. */
export interface WorkerSessionState {
  handle: WorkerHandle | null
  activeDbId: number | null
  status: WorkerStatus
  initResult: InitResult | null
  lastError: string | null
  /** Bumped on every (re)create so React subscribers can re-read. */
  generation: number
}

/** Callbacks the service uses to interact with the real world. */
export interface WorkerSessionDeps {
  /** Factory that creates the Worker + Comlink-wrapped API. */
  createWorker: () => { worker: Worker; api: Remote<DBApi> }
  /** Called when the Worker fires a top-level `error` event. */
  onWorkerError: (message: string) => void
  /** Optional clock for deterministic tests. */
  now?: () => number
}

/* ------------------------------------------------------------------ *
 *  The service                                                           *
 * ------------------------------------------------------------------ */

/**
 * Encapsulates the Worker session. One instance per "session"
 * (typically per test file, or per app lifetime in production).
 *
 * Usage in the React hook:
 *
 * ```ts
 * const session = useWorkerSession(deps)
 * useEffect(() => { void session.ensureReady() }, [])
 * return <Consumer session={session} />
 * ```
 *
 * Or for direct programmatic use (e.g. in tests):
 *
 * ```ts
 * const session = new WorkerSession({
 *   createWorker: () => ({ worker: fakeWorker, api: fakeApi }),
 *   onWorkerError: () => {},
 * })
 * await session.ensureReady()
 * expect(session.state.status).toBe('ready')
 * ```
 */
export class WorkerSession {
  readonly #state: WorkerSessionState
  readonly #deps: WorkerSessionDeps
  readonly #listeners: Set<() => void> = new Set()

  constructor(deps: WorkerSessionDeps) {
    this.#deps = deps
    this.#state = {
      handle: null,
      activeDbId: null,
      status: 'uninitialized',
      initResult: null,
      lastError: null,
      generation: 0,
    }
  }

  /** Read-only snapshot of the session state. */
  get state(): Readonly<WorkerSessionState> {
    return this.#state
  }

  /**
   * Subscribe to state changes. The listener is called after every
   * mutation. Returns an unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * Notify all subscribers. Errors in a listener are swallowed so
   * one bad subscriber cannot break the broadcast.
   */
  #broadcast(): void {
    for (const fn of this.#listeners) {
      try {
        fn()
      } catch {
        // Swallow listener errors.
      }
    }
  }

  /** Change the active database id. No-op if the value is the same. */
  setActiveDb(dbId: number | null): void {
    if (this.#state.activeDbId === dbId) return
    this.#state.activeDbId = dbId
    this.#state.generation += 1
    this.#broadcast()
  }

  /**
   * Register a database in the bookkeeping map. The Worker is
   * re-opened automatically from this map after a crash.
   */
  registerDb(dbId: number, filename: string): void {
    if (!this.#state.handle) return
    this.#state.handle.openDbs.set(dbId, filename)
  }

  /** Remove a database from the bookkeeping map. */
  unregisterDb(dbId: number): void {
    if (!this.#state.handle) return
    this.#state.handle.openDbs.delete(dbId)
  }

  /**
   * Boot the Worker if not already booted, and recover it on
   * crash. Idempotent: calling it when the Worker is already
   * `'ready'` is a no-op.
   *
   * Returns the (possibly fresh) `WorkerHandle`. Throws if the
   * Worker can't be recovered after `MAX_RECOVERY_ATTEMPTS`.
   */
  async ensureReady(): Promise<WorkerHandle> {
    const state = this.#state

    // 1. External API path (injected via WorkerHandle): the Worker
    //    is already wired by the consumer; we just need to run
    //    `init()` and mark the session as ready. If `init()`
    //    rejects, the session still goes to `'ready'` with the
    //    error captured in `lastError` — the UI shows a banner.
    if (state.handle && state.status !== 'dead' && state.status !== 'recovering') {
      return state.handle
    }

    // 2. Recovery path: a previous handle exists but the session is
    //    dead / recovering. Count the failure; if we exceed
    //    `MAX_RECOVERY_ATTEMPTS`, give up.
    if (state.handle) {
      state.handle.failureCount += 1
      if (state.handle.failureCount > MAX_RECOVERY_ATTEMPTS) {
        state.status = 'dead'
        state.lastError = 'El motor SQL no se pudo recuperar tras varios intentos.'
        state.generation += 1
        this.#broadcast()
        throw new Error(state.lastError)
      }
      state.status = 'recovering'
      state.generation += 1
      this.#broadcast()
      this.#terminateHandle(state.handle)
      state.handle = null
    } else {
      state.status = 'initializing'
      state.generation += 1
      this.#broadcast()
    }

    // 3. Boot the Worker via the injected factory. If the factory
    //    throws or `init()` rejects, the session goes to `'dead'`
    //    and we re-throw so the caller can decide what to do.
    try {
      const handle = this.#bootWorker()
      // Re-open every DB the user expects to be open. The bookkeeping
      // map survived the Worker death because it lives on the
      // Main Thread.
      for (const [dbId, filename] of handle.openDbs) {
        try {
          await handle.api.open(dbId, filename)
        } catch (e) {
          // One reopen failure should not block the others.
          state.lastError = e instanceof Error ? e.message : String(e)
        }
      }
      state.handle = handle
      state.status = 'ready'
      state.lastError = null
      state.generation += 1
      this.#broadcast()
      return handle
    } catch (e) {
      state.status = 'dead'
      state.lastError = e instanceof Error ? e.message : String(e)
      state.generation += 1
      this.#broadcast()
      throw e
    }
  }

  /**
   * Wrap an existing API (no Worker). Mirrors the `if (options.api)`
   * branch of the old `useDatabase`: the caller already opened the
   * DB, we just need to call `init()` and mark the session ready.
   *
   * Returns the wrapped handle. Does nothing if the session already
   * has a handle for this exact `api` instance.
   */
  attachInjectedApi(api: Remote<DBApi>): void {
    const state = this.#state
    if (state.handle && state.handle.api === api) return
    state.handle = {
      worker: null as unknown as Worker,
      api,
      openDbs: new Map(),
      failureCount: 0,
    }
    state.status = 'ready'
    state.generation += 1
    this.#broadcast()
  }

  /**
   * Manually retry after the Worker reached `'dead'`. Resets the
   * session to `'uninitialized'` and triggers `ensureReady()`.
   */
  async retry(): Promise<void> {
    this.#state.status = 'uninitialized'
    this.#state.lastError = null
    this.#state.generation += 1
    this.#broadcast()
    await this.ensureReady()
  }

  /**
   * Hard-reset: clears the handle, sets status to `'uninitialized'`,
   * and drops all bookkeeping. Intended for tests.
   */
  reset(): void {
    this.#terminateHandle(this.#state.handle)
    this.#state.handle = null
    this.#state.activeDbId = null
    this.#state.status = 'uninitialized'
    this.#state.initResult = null
    this.#state.lastError = null
    this.#state.generation += 0
    this.#broadcast()
  }

  /**
   * Create a Worker via the injected factory, attach an `error`
   * listener, run `init()`, and update the state to `'ready'`.
   *
   * Throws if `init()` rejects. The state transitions are
   * managed by `ensureReady` which is the only caller.
   */
  #bootWorker(): WorkerHandle {
    const state = this.#state
    const { worker, api } = this.#deps.createWorker()

    worker.addEventListener('error', (event) => {
      const message =
        (event as ErrorEvent).message ?? 'Worker error without message'
      this.#deps.onWorkerError(message)
      state.lastError = message
      state.status = 'dead'
      state.generation += 1
      this.#broadcast()
    })

    const handle: WorkerHandle = {
      worker,
      api,
      openDbs: new Map(),
      failureCount: 0,
    }

    // The factory returns the handle synchronously; the caller
    // (ensureReady) will await `init()` and update the state.
    // We do this here to keep the service self-contained.
    return handle
  }

  #terminateHandle(handle: WorkerHandle | null): void {
    if (!handle) return
    try {
      handle.worker.terminate()
    } catch {
      // Best effort.
    }
    handle.openDbs.clear()
  }
}

/* ------------------------------------------------------------------ *
 *  Factory helpers                                                      *
 * ------------------------------------------------------------------ */

/**
 * Build a `WorkerSessionDeps` that creates a real Worker + Comlink
 * wrap. The default factory is suitable for production; tests
 * typically inject a fake `createWorker` and `onWorkerError`.
 */
export function defaultWorkerDeps(): WorkerSessionDeps {
  return {
    createWorker: () => {
      // Defer the heavy import so the service module is cheap to
      // load in tests that inject a fake factory.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Comlink = require('comlink') as typeof import('comlink')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const url = (
        require('../workers/sqlite.worker?worker&url') as { default: string }
      ).default
      const worker = new Worker(url, { type: 'module' })
      const api = Comlink.wrap<DBApi>(worker)
      return { worker, api }
    },
    onWorkerError: (message) => {
      // eslint-disable-next-line no-console
      console.warn('[useDatabase] worker error:', message)
    },
  }
}
