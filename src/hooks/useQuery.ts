/**
 * useQuery — run SQL against the active database and persist history.
 *
 * The hook owns three pieces of state:
 *
 *  - `result`: the latest `QueryResult` returned by the Worker. The
 *    hook does not *unpack* rows/columns — consumers iterate them
 *    directly. The result is `null` until the first run completes.
 *  - `loading`: `true` while a query is in flight. The UI uses this to
 *    disable the "Run" button and to render a spinner. The query is
 *    *cancellable* via the `cancel()` helper, which calls
 *    `api.cancel(dbId)` on the Worker (the Worker then interrupts on
 *    its next progress tick).
 *  - `error`: a normalised `SerializedError` when the query failed
 *    (and the Worker returned a structured error). Errors thrown by
 *    Comlink (e.g. the Worker died) are caught and translated to a
 *    generic `SerializedError` so the UI can show a consistent banner.
 *
 * History: every successful or failed run is appended to
 * `queryHistory.addEntry(...)`. The hook reads the latest 10 entries
 * via `useLiveQuery` so the panel updates in real time when other tabs
 * also write to history.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { useDatabase } from './useDatabase'
import { queryHistory } from '../core/persistence'
import { db as defaultDb } from '../core/persistence/dexie'
import type { QueryHistory } from '../core/persistence'
import type { SerializedError } from '../workers/types'

/**
 * Local re-export of the worker's `QueryResult` shape. The Worker
 * returns a structured result with `ok`, `columns`, `rows`, `error`,
 * etc. — we forward it as-is so consumers can read everything they
 * need without a separate type.
 */
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

/** Maximum number of history entries the hook exposes. */
export const MAX_HISTORY_ENTRIES = 10

/** Stable empty array used as the initial value for `history`. */
const EMPTY_HISTORY: ReadonlyArray<QueryHistory> = Object.freeze([])

/** Options accepted by `run()`. */
export interface RunOptions {
  /** Override the default timeout (5 000 ms). */
  timeoutMs?: number
  /**
   * Persist the run to history. Defaults to `true`. Pass `false` for
   * test queries or for runs initiated by the validation engine that
   * should not pollute the user-facing history.
   */
  persistHistory?: boolean
}

export interface UseQueryResult {
  /** Run a SQL string. Returns the structured result. */
  run: (sql: string, options?: RunOptions) => Promise<QueryResultShape>
  /** Cancel the in-flight query (no-op when nothing is running). */
  cancel: () => Promise<void>
  /** Latest result. `null` until the first run completes. */
  result: QueryResultShape | null
  /** `true` while a query is being executed. */
  loading: boolean
  /**
   * The `SerializedError` from the most recent run (or `null`).
   * Distinct from `result.error` so the consumer can use it as a
   * "show banner?" flag.
   */
  error: SerializedError | null
  /** Latest 10 runs (newest first) for the active database. */
  history: ReadonlyArray<QueryHistory>
  /** Drop every history row for the active database. */
  clearHistory: () => Promise<void>
  /** Last execution duration in ms (handy for the UI badge). */
  executionMs: number | null
}

interface InflightRun {
  cancelled: boolean
  startedAt: number
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * Build a `SerializedError` from an arbitrary thrown value. Used when
 * the Worker died (Comlink rejects) and we don't have a structured
 * `QueryResult` to forward.
 */
function toSerializedError(e: unknown): SerializedError {
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

export function useQuery(): UseQueryResult {
  const { api, dbId, ready, retry } = useDatabase()
  const [result, setResult] = useState<QueryResultShape | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<SerializedError | null>(null)
  const [tick, setTick] = useState<number>(0) // forces a `useLiveQuery` re-read
  const inflightRef = useRef<InflightRun | null>(null)

  // `useLiveQuery` is reactive — any write to `queryHistory` (from
  // this tab or another) is reflected automatically. We pass `tick`
  // as a key so cancelling + re-running immediately reflects the new
  // row.
  const historyResult = useLiveQuery<ReadonlyArray<QueryHistory>>(
    async () => {
      if (dbId == null) return EMPTY_HISTORY
      const rows = await queryHistory.getRecent(dbId, MAX_HISTORY_ENTRIES)
      return rows
    },
    [dbId, tick],
  )
  // Memoize the fallback so consumers that depend on `history` in a
  // dep array do not enter a re-render loop. We use a stable
  // module-level empty array.
  const history: ReadonlyArray<QueryHistory> = historyResult ?? EMPTY_HISTORY

  const clearHistory = useCallback(async (): Promise<void> => {
    if (dbId == null) return
    await defaultDb.queryHistory.where('dbId').equals(dbId).delete()
    setTick((t) => t + 1)
  }, [dbId])

  const run = useCallback(
    async (sql: string, options: RunOptions = {}): Promise<QueryResultShape> => {
      if (!api || dbId == null) {
        const err: SerializedError = {
          code: 'NOT_READY',
          message: 'Worker not ready or no active database',
          translatedMessage: 'Selecciona una base de datos antes de ejecutar consultas.',
        }
        setError(err)
        setResult({ ok: false, error: err, executionMs: 0, statementKind: 'other' })
        return { ok: false, error: err, executionMs: 0, statementKind: 'other' }
      }

      // Cancel any previous inflight run before starting a new one.
      if (inflightRef.current) {
        inflightRef.current.cancelled = true
        try {
          await api.cancel(dbId)
        } catch {
          // ignore — the previous run was probably already done.
        }
      }

      const runId: InflightRun = {
        cancelled: false,
        startedAt: Date.now(),
        timer: null,
      }
      inflightRef.current = runId

      setLoading(true)
      setError(null)

      const timeoutMs = options.timeoutMs ?? 5_000
      // Set a wall-clock cancel. The Worker will *also* cap with its
      // own progress handler, but the timer here guarantees we don't
      // sit forever if the Worker is wedged in a non-VM-step section.
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        runId.timer = setTimeout(() => {
          if (runId.cancelled) {
            reject(new Error('query cancelled'))
            return
          }
          runId.cancelled = true
          // Best-effort cancel; the awaiter below is what actually
          // surfaces the error to the consumer.
          void api.cancel(dbId).catch(() => undefined)
          reject(new Error(`Query timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      })

      const execPromise = api
        .exec(dbId, sql, { timeoutMs, singleOnly: false })
        .then(
          (raw) => raw as QueryResultShape,
          (e: unknown) => {
            // The exec promise rejected; the race winner may still
            // be the timeout, in which case this rejection is
            // suppressed here. We re-throw to make sure the consumer
            // (or the test cleanup) sees the real error.
            throw e instanceof Error ? e : new Error(String(e))
          },
        )

      try {
        const response = await Promise.race([execPromise, timeoutPromise])
        if (runId.cancelled) {
          // A cancellation already happened — don't update state.
          return response
        }
        setResult(response)
        if (response.ok) {
          setError(null)
        } else if (response.error) {
          setError(response.error)
        }
        // Persist to history.
        if (options.persistHistory !== false) {
          const executionMs = response.executionMs ?? Date.now() - runId.startedAt
          await queryHistory
            .addEntry(
              dbId,
              sql,
              response.ok,
              executionMs,
              response.error?.message,
            )
            .catch(() => undefined)
          setTick((t) => t + 1)
        }
        return response
      } catch (e) {
        if (runId.timer) clearTimeout(runId.timer)
        const se = toSerializedError(e)
        setError(se)
        const failure: QueryResultShape = {
          ok: false,
          error: se,
          executionMs: Date.now() - runId.startedAt,
          statementKind: 'other',
        }
        setResult(failure)
        if (options.persistHistory !== false) {
          await queryHistory
            .addEntry(
              dbId,
              sql,
              false,
              failure.executionMs,
              se.message,
            )
            .catch(() => undefined)
          setTick((t) => t + 1)
        }
        return failure
      } finally {
        if (runId.timer) clearTimeout(runId.timer)
        if (inflightRef.current === runId) {
          inflightRef.current = null
        }
        setLoading(false)
      }
    },
    [api, dbId],
  )

  const cancel = useCallback(async (): Promise<void> => {
    if (!api || dbId == null) return
    if (inflightRef.current) {
      inflightRef.current.cancelled = true
    }
    try {
      await api.cancel(dbId)
    } catch {
      // ignore
    }
  }, [api, dbId])

  // Make sure we don't leak the timer on unmount.
  useEffect(() => {
    return () => {
      if (inflightRef.current?.timer) {
        clearTimeout(inflightRef.current.timer)
      }
    }
  }, [])

  // If the Worker recovers after a crash, give the consumer a way to
  // trigger a re-run. We surface `retry` indirectly via `ready`; the
  // caller decides when to re-run.
  void retry
  void ready

  return {
    run,
    cancel,
    result,
    loading,
    error,
    history,
    clearHistory,
    executionMs: result?.executionMs ?? null,
  }
}
