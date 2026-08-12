/**
 * useQuery — run SQL against the active database and persist history.
 *
 * The hook is the React adapter over `queryRunnerService`. All
 * decision logic (error normalisation, exec vs timeout race,
 * failure-result construction) lives in the service; the hook
 * owns the React state, the cancellation timer, and the Dexie
 * history persistence.
 *
 * State machine:
 *  - `result`: latest `QueryResultShape` returned by the Worker
 *    (or the synthetic failure shape). `null` until the first run.
 *  - `loading`: `true` while a run is in flight.
 *  - `error`: latest `SerializedError`, or `null`.
 *  - `history`: the last 10 entries (live from Dexie).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { useDatabase } from './useDatabase'
import { queryHistory } from '../core/persistence'
import { db as defaultDb } from '../core/persistence/dexie'
import type { QueryHistory } from '../core/persistence'
import type { QueryResult, SerializedError } from '../workers/types'
import {
  buildFailureResult,
  buildNotReadyError,
  raceExecution,
  toSerializedError,
  type QueryResultShape,
} from '../core/services/queryRunnerService'

/** Maximum number of history entries the hook exposes. */
export const MAX_HISTORY_ENTRIES = 10

/** Re-export so consumers (and tests) keep the same import. */
export type { QueryResultShape }

/** Default timeout for a query, in milliseconds. */
const DEFAULT_TIMEOUT_MS = 5_000

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

/** Stable empty array used as the initial value for `history`. */
const EMPTY_HISTORY: ReadonlyArray<QueryHistory> = Object.freeze([])

interface InflightRun {
  cancelled: boolean
  startedAt: number
  timer: ReturnType<typeof setTimeout> | null
}

export function useQuery(): UseQueryResult {
  const { api, dbId, ready, retry } = useDatabase()
  const [result, setResult] = useState<QueryResultShape | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<SerializedError | null>(null)
  const [tick, setTick] = useState<number>(0)
  const inflightRef = useRef<InflightRun | null>(null)

  // `useLiveQuery` is reactive — any write to `queryHistory` is
  // reflected automatically. We pass `tick` so a fresh write
  // re-reads the latest rows.
  const historyResult = useLiveQuery<ReadonlyArray<QueryHistory>>(
    async () => {
      if (dbId == null) return EMPTY_HISTORY
      const rows = await queryHistory.getRecent(dbId, MAX_HISTORY_ENTRIES)
      return rows
    },
    [dbId, tick],
  )
  const history: ReadonlyArray<QueryHistory> = historyResult ?? EMPTY_HISTORY

  const clearHistory = useCallback(async (): Promise<void> => {
    if (dbId == null) return
    await defaultDb.queryHistory.where('dbId').equals(dbId).delete()
    setTick((t) => t + 1)
  }, [dbId])

  const run = useCallback(
    async (sql: string, options: RunOptions = {}): Promise<QueryResultShape> => {
      if (!api || dbId == null) {
        const err = buildNotReadyError()
        setError(err)
        const synthetic: QueryResultShape = {
          ok: false,
          error: err,
          executionMs: 0,
          statementKind: 'other',
        }
        setResult(synthetic)
        return synthetic
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

      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

      const outcome = await raceExecution({
        execPromise: api.exec(dbId, sql, { timeoutMs, singleOnly: false }) as Promise<QueryResult>,
        startedAt: runId.startedAt,
        timeoutMs,
        onTimeout: () => {
          runId.cancelled = true
          // Best-effort cancel; the race has already resolved with
          // an error so the awaiter below is the only one that
          // surfaces it to the consumer.
          void api.cancel(dbId).catch(() => undefined)
        },
      })

      if (runId.cancelled && outcome.kind === 'error') {
        // A cancellation already happened — don't update the
        // result (the consumer's `cancel()` already settled state).
        setLoading(false)
        return buildFailureResult({ startedAt: runId.startedAt, error: outcome.error })
      }

      if (outcome.kind === 'ok') {
        const response = outcome.result as QueryResultShape
        setResult(response)
        if (response.ok) {
          setError(null)
        } else if (response.error) {
          setError(response.error)
        }
        if (options.persistHistory !== false) {
          const executionMs = response.executionMs ?? Date.now() - runId.startedAt
          await queryHistory
            .addEntry(dbId, sql, response.ok, executionMs, response.error?.message)
            .catch(() => undefined)
          setTick((t) => t + 1)
        }
        setLoading(false)
        return response
      }

      // outcome.kind === 'error' (timeout or exec rejection).
      const failure = buildFailureResult({ startedAt: runId.startedAt, error: outcome.error })
      setResult(failure)
      setError(failure.error ?? toSerializedError(undefined))
      if (options.persistHistory !== false) {
        await queryHistory
          .addEntry(dbId, sql, false, failure.executionMs, failure.error?.message)
          .catch(() => undefined)
        setTick((t) => t + 1)
      }
      setLoading(false)
      return failure
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
