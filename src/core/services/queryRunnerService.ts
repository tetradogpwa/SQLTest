/**
 * Query runner service.
 *
 * Pure-TS pieces of the `useQuery` hook. The hook itself is a
 * stateful React adapter; this module owns the *pure* logic that
 * the hook delegates to:
 *
 *  - error normalisation (worker errors + Comlink rejections +
 *    the "not ready" sentinel)
 *  - the success / failure result builders
 *  - the `exec` vs `timeout` race (with cancellation awareness)
 *
 * I/O lives in the hook. The service only takes inputs (including a
 * clock + a random ID generator) and returns plain values or
 * resolves / rejects a promise. Every branch is testable with pure
 * vitest.
 */
import type { QueryResult, SerializedError } from '../../workers/types'

/* ------------------------------------------------------------------ *
 *  Public types — re-exported for convenience (the hook uses them). *
 * ------------------------------------------------------------------ */

/** A trimmed copy of the worker's `QueryResult` for the hook to surface. */
export interface QueryResultShape {
  ok: boolean
  columns?: string[]
  rows?: unknown[][]
  rowsAffected?: number
  lastInsertRowid?: number
  truncated?: boolean
  error?: SerializedError
  executionMs: number
  statementKind: string
  statements?: ReadonlyArray<{ kind: string }>
}

/* ------------------------------------------------------------------ *
 *  Error factories                                                       *
 * ------------------------------------------------------------------ */

/**
 * The `NOT_READY` error emitted when the hook is asked to run a
 * query before the Worker is ready (or before a DB is selected).
 * Returned in both `error` and the synthetic `QueryResultShape`
 * (with `ok: false`) so the UI can render the banner and the
 * playground can stop the spinner in one go.
 */
export function buildNotReadyError(): SerializedError {
  return {
    code: 'NOT_READY',
    message: 'Worker not ready or no active database',
    translatedMessage: 'Selecciona una base de datos antes de ejecutar consultas.',
  }
}

/**
 * Translate any thrown value into a `SerializedError`. Used when
 * the Worker throws across Comlink, when the timeout fires, or
 * when the user explicitly cancels.
 *
 *  - `Error` instances become `WORKER_TERMINATED` (the only
 *    way we can tell a Comlink rejection from a JS error in
 *    this layer).
 *  - Anything else (string, null, undefined, plain object) is
 *    serialised as `UNKNOWN`.
 */
export function toSerializedError(e: unknown): SerializedError {
  if (e instanceof Error) {
    return {
      code: 'WORKER_TERMINATED',
      message: e.message,
      translatedMessage: 'El motor SQL se ha interrumpido. Por favor, reintenta.',
    }
  }
  return {
    code: 'UNKNOWN',
    message: String(e),
    translatedMessage: 'Error desconocido al ejecutar la consulta.',
  }
}

/* ------------------------------------------------------------------ *
 *  Result builders                                                      *
 * ------------------------------------------------------------------ */

export interface BuildFailureInput {
  /** Wall-clock when the run started; used to derive `executionMs`. */
  startedAt: number
  /** The error to attach to the synthetic result. */
  error: SerializedError
  /** Injectable clock. */
  now?: () => number
}

/**
 * Build the `QueryResultShape` the hook surfaces when a run
 * fails (timeout, cancellation, Comlink rejection). The result has
 * `ok: false`, the `error` attached, and `executionMs` derived from
 * the elapsed wall-clock.
 */
export function buildFailureResult(input: BuildFailureInput): QueryResultShape {
  const now = (input.now ?? (() => Date.now()))()
  return {
    ok: false,
    error: input.error,
    executionMs: now - input.startedAt,
    statementKind: 'other',
  }
}

/* ------------------------------------------------------------------ *
 *  Exec vs. timeout race                                                *
 * ------------------------------------------------------------------ */

export interface RunQueryInput {
  /** Promise returned by the worker's `api.exec(...)`. */
  execPromise: Promise<QueryResult>
  /** Wall-clock when the run started (used for `executionMs` on failure). */
  startedAt: number
  /** Timeout in ms — the run is cancelled if it takes longer. */
  timeoutMs: number
  /**
   * Called when the timeout fires. The implementation should
   * best-effort cancel the underlying Worker call. It must NOT
   * throw — the race treats any throw as a no-op.
   */
  onTimeout: () => void
  /** Injectable timer setter for tests. */
  setTimeoutFn?: (cb: () => void, ms: number) => unknown
  /** Injectable timer clearer for tests. */
  clearTimeoutFn?: (handle: unknown) => void
  /** Injectable clock. */
  now?: () => number
}

export type RaceOutcome =
  | { kind: 'ok'; result: QueryResult }
  | { kind: 'error'; error: SerializedError }

/**
 * Race the Worker's `exec` against a timeout. The returned promise
 * resolves to:
 *
 *  - `{ kind: 'ok', result }` if the exec resolved first.
 *  - `{ kind: 'error', error: timeoutError }` if the timeout fired
 *    first (the underlying exec may still resolve later; the hook
 *    ignores that resolution by checking a `cancelled` flag).
 *
 * The function is **pure** with respect to the inputs (no globals,
 * no `Date.now()` outside the injected `now`). The `setTimeoutFn`
 * and `clearTimeoutFn` defaults use the global `setTimeout` so
 * production code can call this without any DI plumbing.
 */
export function raceExecution(input: RunQueryInput): Promise<RaceOutcome> {
  const now = (input.now ?? (() => Date.now()))()
  const setT = input.setTimeoutFn ?? ((cb, ms): unknown => setTimeout(cb, ms))
  const clearT = input.clearTimeoutFn ?? ((h): void => clearTimeout(h as ReturnType<typeof setTimeout>))
  const timeoutError: SerializedError = {
    code: 'TIMEOUT',
    message: `Query timed out after ${input.timeoutMs}ms`,
    translatedMessage: 'La consulta tardó demasiado. Prueba con un timeout mayor.',
  }

  let timer: unknown = null
  const timeoutPromise = new Promise<RaceOutcome>((resolve) => {
    timer = setT(() => {
      try {
        input.onTimeout()
      } catch {
        // Swallow — the onTimeout hook is best-effort; the race
        // resolves with `error` regardless.
      }
      resolve({ kind: 'error', error: timeoutError })
    }, input.timeoutMs)
  })

  const execPromise = input.execPromise
    .then(
      (result) => ({ kind: 'ok' as const, result }),
      (e: unknown) => ({ kind: 'error' as const, error: toSerializedError(e) }),
    )

  return Promise.race([execPromise, timeoutPromise]).finally(() => {
    if (timer != null) clearT(timer)
    // Wall-clock delta — the actual failure builder also reads
    // `now`, but we want the race result to be a thin shell the
    // hook turns into a `QueryResultShape`.
    void now
  })
}
