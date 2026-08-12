/**
 * useDatabase — hook for talking to the SQLite Worker.
 *
 * This module is now a **thin wrapper** around `WorkerSession` (see
 * `src/core/services/workerSessionService.ts`). The session owns
 * the lifecycle, state machine, and recovery logic; the hook
 * just wires it to React (state subscription, lifecycle effect,
 * return type assembly).
 *
 * Usage
 * -----
 * ```tsx
 * const { api, dbId, setActiveDb, ready, error } = useDatabase()
 * if (!ready || !api) return <Spinner />
 * const result = await api.exec(dbId, 'SELECT 1')
 * ```
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { StorageCapability } from '../workers/types'

import {
  WorkerSession,
  defaultWorkerDeps,
  type WorkerSessionDeps,
  type WorkerStatus,
} from '../core/services/workerSessionService'
import type { DBApi } from './dbApi'

/**
 * Configuration knobs exposed by the hook for tests and for the
 * `createWorker` story for non-Vite test environments.
 */
export interface UseDatabaseOptions {
  /**
   * Worker URL. Defaults to the production worker bundled by Vite.
   * Tests can pass a custom URL or use the `createWorker` injection
   * point below.
   */
  workerUrl?: URL
  /**
   * Factory used to build the API surface. Defaults to wrapping the
   * Worker with Comlink. Override in tests to return a mock.
   */
  createApi?: never // deprecated: use deps.createWorker instead
  /**
   * Initial `dbId` to track. `null` means "no database selected yet".
   * Most pages set this from the persisted `defaultDatabase` setting.
   */
  initialDbId?: number | null
  /**
   * Skip the real worker entirely and use a user-provided `api`. Used
   * in unit tests to inject a fake DBAPI.
   */
  api?: import('comlink').Remote<DBApi> | null
  /**
   * When `true`, the hook will not attempt to spin up a Worker.
   * Useful in tests where the `api` is provided externally.
   * Defaults to `false`.
   */
  disabled?: boolean
  /**
   * Lower-level escape hatch: full deps override for tests that
   * need to mock `createWorker` + `onWorkerError`. When provided,
   * takes precedence over `api` and `createApi`.
   */
  deps?: WorkerSessionDeps
}

export type { DBApi }

/** Re-export so consumers can use a single import for the API type. */
export { type WorkerStatus, type StorageCapability }

/* ------------------------------------------------------------------ *
 *  Session singleton                                                     *
 * ------------------------------------------------------------------ *
 * The WorkerSession is a singleton per session. We keep a single
 * instance per `useDatabase` mount and let React's `useRef` preserve
 * it across re-renders. Tests use `__resetDatabaseSession` to clear
 * the singleton.
 */

let currentSession: WorkerSession | null = null
let currentDeps: WorkerSessionDeps | null = null

function getOrCreateSession(deps: WorkerSessionDeps): WorkerSession {
  if (!currentSession || currentDeps !== deps) {
    currentSession = new WorkerSession(deps)
    currentDeps = deps
  }
  return currentSession
}

/* ------------------------------------------------------------------ *
 *  React hook                                                           *
 * ------------------------------------------------------------------ */

export interface UseDatabaseResult {
  /** The Comlink-wrapped DBAPI. `null` until `init()` resolves. */
  api: import('comlink').Remote<DBApi> | null
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
  initResult: import('../workers/types').InitResult | null
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
  // Resolve the deps exactly once per `options` instance. Tests
  // typically pass a fresh deps object per mount; production uses
  // the default deps.
  const deps: WorkerSessionDeps = useMemo(
    () =>
      options.deps ??
      defaultWorkerDeps(),
    [options.deps],
  )

  const session = getOrCreateSession(deps)

  // Subscribe to state changes by bumping React state on every
  // broadcast. The current `generation` is captured in `useState`
  // so React notices when it changes.
  const [generation, setGeneration] = useState(session.state.generation)

  useEffect(() => {
    const unsubscribe = session.subscribe(() => {
      setGeneration(session.state.generation)
    })
    return unsubscribe
  }, [session])

  // Boot the Worker on first mount unless the consumer asked us
  // to stay disabled. When an `api` was injected via options we
  // still need to call `api.init()` so the session captures the
  // capability + version. We deliberately do not await this
  // inside the effect — the hook returns `ready: false` and
  // consumers can render a spinner until the Worker reports
  // `'ready'`.
  const optionsRef = useRef<UseDatabaseOptions>(options)
  optionsRef.current = options

  useEffect(() => {
    const opts = optionsRef.current
    if (opts.disabled) {
      // Even when disabled, if an api was passed we still need to
      // surface it through the session so the api reference is
      // set.
      if (opts.api) {
        session.attachInjectedApi(opts.api)
      }
      return
    }
    if (session.state.status === 'uninitialized' || session.state.status === 'dead') {
      // Fire and forget; errors land in `state.lastError`.
      void session.ensureReady().catch(() => {
        // ensureReady already populates `lastError` and broadcasts;
        // we swallow here to avoid an unhandled rejection.
      })
    }
  }, [session])

  // Reset the active dbId when the consumer passes a new one.
  useEffect(() => {
    if (options.initialDbId !== undefined) {
      session.setActiveDb(options.initialDbId)
    }
  }, [session, options.initialDbId])

  // Re-render on every broadcast. The `generation` value is
  // captured in `useState`; this effect is a no-op for the
  // component but it lets us read the latest `state` snapshot.
  void generation

  const state = session.state
  const ready = state.status === 'ready' && state.handle !== null
  const initializing = state.status === 'initializing' || state.status === 'recovering'

  const setActiveDb = useCallback(
    (dbId: number | null): void => {
      session.setActiveDb(dbId)
    },
    [session],
  )
  const registerDb = useCallback(
    (dbId: number, filename: string): void => {
      session.registerDb(dbId, filename)
    },
    [session],
  )
  const unregisterDb = useCallback(
    (dbId: number): void => {
      session.unregisterDb(dbId)
    },
    [session],
  )
  const retry = useCallback(
    async (): Promise<void> => {
      await session.retry()
    },
    [session],
  )

  return {
    api: state.handle?.api ?? null,
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

/* ------------------------------------------------------------------ *
 *  Test helpers                                                         *
 * ------------------------------------------------------------------ */

/**
 * Reset the session-level singleton. Intended for tests; not
 * exported from the package barrel. Call this from `afterEach` to
 * ensure each test gets a fresh Worker (or fresh mock).
 */
export function __resetDatabaseSession(): void {
  currentSession?.reset()
  currentSession = null
  currentDeps = null
}
