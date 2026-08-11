/**
 * useDatabase — hook for talking to the SQLite Worker.
 *
 * Responsibilities
 * ----------------
 *  - Lazily boots the dedicated Worker (`sqlite.worker.ts`) on first use
 *    and wraps it with Comlink so the rest of the app speaks the
 *    `DBAPI` façade as a typed `Remote`.
 *  - Tracks the *active* `dbId` so that downstream hooks
 *    (`useQuery`, `useSchema`) don't have to thread the database id
 *    through every call.
 *  - Recreates the Worker if it crashes (RESEARCH §8 — *Worker
 *    recuperable*). All previously opened databases are re-opened
 *    automatically from the bookkeeping map below.
 *  - Is a **singleton per session**: every call to `useDatabase()`
 *    returns the same Worker, the same Comlink handle and the same
 *    `dbId`. The React tree only sees `useState` for the things that
 *    genuinely need a render (status, dbId, error). The `api` itself
 *    is held in a `useRef` so re-renders don't tear it down.
 *
 * Usage
 * -----
 * ```tsx
 * const { api, dbId, setActiveDb, ready, error } = useDatabase()
 * if (!ready || !api) return <Spinner />
 * const result = await api.exec(dbId, 'SELECT 1')
 * ```
 */
import * as Comlink from 'comlink'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Remote } from 'comlink'

import type { InitResult, StorageCapability } from '../workers/types'

/**
 * Subset of the DBAPI surface that this hook needs. We re-declare it
 * here (rather than importing the full class) so the hook bundle stays
 * independent of the worker's internals. Tests mock this interface.
 */
export interface DBApi {
  init(): Promise<InitResult>
  open(dbId: number, filename: string, mode?: 'read' | 'write' | 'readwrite'): Promise<unknown>
  close(dbId: number): Promise<void>
  closeAll(): Promise<void>
  exec(dbId: number, sql: string, options?: unknown): Promise<unknown>
  cancel(dbId: number): Promise<void>
  schema(dbId: number): Promise<unknown>
  snapshot(dbId: number, label: string, reason?: string): Promise<unknown>
  restore(dbId: number, snapId: string): Promise<void>
  listSnapshots(dbId: number): Promise<unknown[]>
  deleteSnapshot(dbId: number, snapId: string): Promise<void>
  import(bytes: Uint8Array, targetName: string): Promise<unknown>
  export(dbId: number): Promise<Uint8Array>
  listUserDatabases(): Promise<unknown[]>
  deleteUserDatabase(dbId: number): Promise<void>
  createUserDatabase(name: string): Promise<unknown>
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Worker bootstrapping                                                 *
 * ──────────────────────────────────────────────────────────────────── */

/** Maximum number of times we attempt to recover before giving up. */
const MAX_RECOVERY_ATTEMPTS = 3

/**
 * Configuration knobs exposed by the hook for tests and for the
 * `createWorker` story for non-Vite test environments.
 */
export interface UseDatabaseOptions {
  /**
   * Worker URL. Defaults to the production worker bundled by Vite. Tests
   * can pass a custom URL (e.g. an empty `Blob` worker) or use the
   * `createApi` injection point below.
   */
  workerUrl?: URL
  /**
   * Factory used to build the API surface. Defaults to wrapping the
   * Worker with Comlink. Override in tests to return a mock.
   */
  createApi?: (worker: Worker) => Remote<DBApi>
  /**
   * Initial `dbId` to track. `null` means "no database selected yet".
   * Most pages set this from the persisted `defaultDatabase` setting.
   */
  initialDbId?: number | null
  /**
   * Skip the real worker entirely and use a user-provided `api`. Used
   * in unit tests to inject a fake DBAPI.
   */
  api?: Remote<DBApi> | null
  /**
   * When `true`, the hook will not attempt to spin up a Worker. Useful
   * in tests where the `api` is provided externally. Defaults to
   * `false` (i.e. Worker is created on first use).
   */
  disabled?: boolean
}

interface WorkerHandle {
  worker: Worker
  api: Remote<DBApi>
  /** dbId → filename (or whatever opaque key the host uses). */
  openDbs: Map<number, string>
  /** Number of consecutive failures. Reset to 0 on a successful boot. */
  failureCount: number
}

const defaultCreateApi = (worker: Worker): Remote<DBApi> => Comlink.wrap<DBApi>(worker)

function defaultWorkerUrl(): URL {
  // Vite resolves the `?worker` import to a URL at build time. The
  // explicit `URL` cast keeps TypeScript happy across the optional
  // dependency on the `vite/client` types.
  return new URL(new URL('../workers/sqlite.worker.ts', import.meta.url).href, import.meta.url)
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Session-scoped singleton                                             *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Global state shared across every `useDatabase()` call within the
 * same JavaScript realm. We intentionally do **not** use React context
 * for this because we want a single Worker even when several sub-trees
 * (e.g. PlaygroundPage + TopBar) call the hook in parallel.
 */
interface SessionDbState {
  handle: WorkerHandle | null
  activeDbId: number | null
  status: WorkerStatus
  initResult: InitResult | null
  lastError: string | null
  /** Bumped on every (re)create so React subscribers can re-read. */
  generation: number
  /** Subscribers used to broadcast changes to the React tree. */
  listeners: Set<() => void>
}

export type WorkerStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'busy'
  | 'recovering'
  | 'dead'

let session: SessionDbState | null = null

function getSession(): SessionDbState {
  if (!session) {
    session = {
      handle: null,
      activeDbId: null,
      status: 'uninitialized',
      initResult: null,
      lastError: null,
      generation: 0,
      listeners: new Set(),
    }
  }
  return session
}

function broadcast(state: SessionDbState): void {
  for (const fn of state.listeners) {
    try {
      fn()
    } catch {
      // Swallow listener errors — they should not break the broadcast.
    }
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Worker lifecycle                                                     *
 * ──────────────────────────────────────────────────────────────────── */

function terminateHandle(handle: WorkerHandle | null): void {
  if (!handle) return
  try {
    handle.worker.terminate()
  } catch {
    // Best effort.
  }
  handle.openDbs.clear()
}

async function bootWorker(
  state: SessionDbState,
  options: UseDatabaseOptions,
): Promise<WorkerHandle> {
  if (options.disabled) {
    throw new Error('useDatabase() called with disabled=true and no api override')
  }
  const url = options.workerUrl ?? defaultWorkerUrl()
  const worker = new Worker(url, { type: 'module' })
  const api = options.createApi
    ? options.createApi(worker)
    : defaultCreateApi(worker)

  // Wire up an `error` listener so a crashed Worker can be detected
  // even when the error is not surfaced as a Comlink rejection (e.g. a
  // top-level uncaught error in the boot sequence). The `'error'`
  // event is fired by the browser when the Worker's script throws.
  worker.addEventListener('error', (event) => {
    const message =
      (event as ErrorEvent).message ?? 'Worker error without message'
    state.lastError = message
    state.status = 'dead'
    state.generation += 1
    broadcast(state)
  })

  const handle: WorkerHandle = {
    worker,
    api,
    openDbs: new Map(),
    failureCount: 0,
  }

  // Initialise SQLite inside the Worker. `init` returns the
  // capability + version chosen at boot. The Main Thread consults this
  // for telemetry and to decide if the OPFS path was used.
  const result = await api.init()
  state.initResult = result
  state.status = 'ready'

  return handle
}

async function ensureHandle(
  state: SessionDbState,
  options: UseDatabaseOptions,
): Promise<WorkerHandle> {
  if (options.api && !state.handle) {
    // External API: skip Worker creation entirely. We still wrap the
    // provided handle so the rest of the code path is uniform.
    state.handle = {
      worker: null as unknown as Worker,
      api: options.api,
      openDbs: new Map(),
      failureCount: 0,
    }
    try {
      const result = await options.api.init()
      state.initResult = result
    } catch (e) {
      // Non-fatal — the caller will see `ready=false` and surface the
      // error.
      state.lastError = e instanceof Error ? e.message : String(e)
    }
    state.status = 'ready'
    state.generation += 1
    broadcast(state)
    return state.handle
  }

  if (state.handle && state.status !== 'dead' && state.status !== 'recovering') {
    return state.handle
  }

  if (state.handle) {
    state.handle.failureCount += 1
    if (state.handle.failureCount > MAX_RECOVERY_ATTEMPTS) {
      state.status = 'dead'
      state.lastError = 'El motor SQL no se pudo recuperar tras varios intentos.'
      state.generation += 1
      broadcast(state)
      throw new Error(state.lastError)
    }
    state.status = 'recovering'
    state.generation += 1
    broadcast(state)
    terminateHandle(state.handle)
    state.handle = null
  } else {
    state.status = 'initializing'
    state.generation += 1
    broadcast(state)
  }

  try {
    const handle = await bootWorker(state, options)
    // Re-open every DB the user expects to be open. The bookkeeping
    // map survived the Worker death because it lives on the Main
    // Thread.
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
    broadcast(state)
    return handle
  } catch (e) {
    state.status = 'dead'
    state.lastError = e instanceof Error ? e.message : String(e)
    state.generation += 1
    broadcast(state)
    throw e
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  React hook                                                           *
 * ──────────────────────────────────────────────────────────────────── */

export interface UseDatabaseResult {
  /** The Comlink-wrapped DBAPI. `null` until `init()` resolves. */
  api: Remote<DBApi> | null
  /** Active `dbId`. `null` when no database is selected. */
  dbId: number | null
  /** Change the active database. Persisted in component state only. */
  setActiveDb: (dbId: number | null) => void
  /** `true` when the Worker is `ready` *and* a database is selected. */
  ready: boolean
  /** `true` while the Worker is booting or recovering. */
  initializing: boolean
  /** Human-readable error message. `null` when there is no error. */
  error: string | null
  /** Result of the last `init()` call (capability + version). */
  initResult: InitResult | null
  /** Storage capability chosen at boot. */
  capability: StorageCapability | null
  /** Status of the Worker (mirrors RESEARCH §8.2). */
  status: WorkerStatus
  /**
   * Register a database so it is reopened automatically after a
   * Worker crash. The hook does *not* call `open()` for you — pass
   * the same `dbId` you used when calling `api.open()`.
   */
  registerDb: (dbId: number, filename: string) => void
  /** Drop a database from the bookkeeping map. */
  unregisterDb: (dbId: number) => void
  /** Manually retry the Worker after a `'dead'` state. */
  retry: () => Promise<void>
}

export function useDatabase(options: UseDatabaseOptions = {}): UseDatabaseResult {
  const stateRef = useRef<SessionDbState>(getSession())
  const state = stateRef.current

  // Subscribe to state changes by bumping React state on every
  // `broadcast()`. The current `generation` is captured in the
  // `useState` below so React notices when it changes.
  const [, setGeneration] = useState<number>(state.generation)

  useEffect(() => {
    const listener = (): void => {
      setGeneration(state.generation)
    }
    state.listeners.add(listener)
    return () => {
      state.listeners.delete(listener)
    }
  }, [state])

  // The API itself lives in a ref (per the spec). The ref always
  // points at the *current* handle, not a snapshot from the first
  // render. This is critical because the handle can be replaced after
  // a recovery cycle.
  const apiRef = useRef<Remote<DBApi> | null>(state.handle?.api ?? null)
  apiRef.current = state.handle?.api ?? null

  // `setActiveDb` mutates the session state directly. We do not
  // re-render unless the active id actually changes.
  const setActiveDb = useCallback(
    (dbId: number | null): void => {
      if (state.activeDbId === dbId) return
      state.activeDbId = dbId
      state.generation += 1
      broadcast(state)
    },
    [state],
  )

  const registerDb = useCallback(
    (dbId: number, filename: string): void => {
      if (!state.handle) return
      state.handle.openDbs.set(dbId, filename)
    },
    [state],
  )

  const unregisterDb = useCallback(
    (dbId: number): void => {
      if (!state.handle) return
      state.handle.openDbs.delete(dbId)
    },
    [state],
  )

  // Capture the options in a ref so the boot effect doesn't re-run
  // on every render (the consumer typically passes a fresh `options`
  // object literal on each call).
  const optionsRef = useRef<UseDatabaseOptions>(options)
  optionsRef.current = options

  const retry = useCallback(async (): Promise<void> => {
    state.status = 'uninitialized'
    state.lastError = null
    state.generation += 1
    broadcast(state)
    await ensureHandle(state, optionsRef.current)
  }, [state])

  // Boot the Worker on first mount unless the consumer asked us to
  // stay disabled. When an `api` was injected via options we still
  // want to call `api.init()` so the session captures the capability
  // + version. We deliberately do not await this inside the effect —
  // the hook returns `ready: false` and consumers can render a
  // spinner until the Worker reports `ready`.
  useEffect(() => {
    const opts = optionsRef.current
    if (opts.disabled) {
      // Even when disabled, if an api was passed we still need to
      // surface it through the session so `apiRef.current` is set.
      if (opts.api) {
        if (!state.handle || state.handle.api !== opts.api) {
          state.handle = {
            worker: null as unknown as Worker,
            api: opts.api,
            openDbs: new Map(),
            failureCount: 0,
          }
          state.status = 'ready'
          state.generation += 1
          broadcast(state)
        }
      }
      return
    }
    if (state.status === 'uninitialized' || state.status === 'dead') {
      // Fire and forget; errors land in `state.lastError`.
      void ensureHandle(state, opts).catch((e: unknown) => {
        state.lastError = e instanceof Error ? e.message : String(e)
        state.status = 'dead'
        state.generation += 1
        broadcast(state)
      })
    }
    return undefined
  }, [state])

  const ready = state.status === 'ready' && state.handle !== null
  const initializing =
    state.status === 'initializing' || state.status === 'recovering'

  return {
    api: apiRef.current,
    dbId: state.activeDbId,
    setActiveDb,
    ready,
    initializing,
    error: state.lastError,
    initResult: state.initResult,
    capability: state.initResult?.capability ?? null,
    status: state.status,
    registerDb,
    unregisterDb,
    retry,
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Test helpers                                                         *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Reset the session-level singleton. Intended for tests; not exported
 * from the package barrel. Call this from `afterEach` to ensure each
 * test gets a fresh Worker (or fresh mock).
 */
export function __resetDatabaseSession(): void {
  if (session?.handle) {
    terminateHandle(session.handle)
  }
  session = null
}
