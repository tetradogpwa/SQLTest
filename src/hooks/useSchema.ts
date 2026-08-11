/**
 * useSchema — reactive schema for the active database.
 *
 * Wraps `api.schema(dbId)` in a small React state machine. The schema
 * is cached for `ttlMs` (default 5 minutes) and invalidated on demand
 * by the consumer (e.g. after a DDL statement completes).
 *
 * If the database or the Worker is not ready yet, the hook returns
 * `{ schema: null, loading: false, error: null }` and *waits* — it
 * does not fire a query until both preconditions hold. The second
 * argument can also be a manual `dbId` override (e.g. for a peek at a
 * database that is not the active one).
 *
 * Error handling: the error is reported as a string (the
 * `SerializedError.translatedMessage` if the Worker returned a
 * `QueryResult`-style error, or the raw error message otherwise). The
 * consumer decides how to surface it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { DatabaseSchema } from '../workers/types'
import { useDatabase } from './useDatabase'

export interface UseSchemaOptions {
  /** Override the active `dbId` from `useDatabase`. */
  dbId?: number | null
  /** Time-to-live for the cached schema. Default 5 minutes. */
  ttlMs?: number
  /** Skip the network call entirely (e.g. while another tab holds the lock). */
  skip?: boolean
}

export interface UseSchemaResult {
  schema: DatabaseSchema | null
  loading: boolean
  error: string | null
  /** Force a re-introspection, ignoring the TTL. */
  refresh: () => Promise<void>
  /** Mark the cached schema stale (e.g. after a DDL). Next call refreshes. */
  invalidate: () => void
  /** Whether the Worker + dbId are ready (so a `refresh` will succeed). */
  canQuery: boolean
}

interface CacheEntry {
  schema: DatabaseSchema
  fetchedAt: number
}

const DEFAULT_TTL_MS = 5 * 60_000

export function useSchema(options: UseSchemaOptions = {}): UseSchemaResult {
  const { api, dbId: activeDbId } = useDatabase()
  const dbId = options.dbId !== undefined ? options.dbId : activeDbId
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS

  // Cache is keyed by `dbId` so changing the active database does not
  // require an additional fetch if the schema was recently retrieved.
  const cacheRef = useRef<Map<number, CacheEntry>>(new Map())
  const inflightRef = useRef<Map<number, Promise<DatabaseSchema>>>(new Map())

  const [schema, setSchema] = useState<DatabaseSchema | null>(() => {
    if (dbId == null) return null
    const cached = cacheRef.current.get(dbId)
    return cached ? cached.schema : null
  })
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  // `stale` is set by `invalidate()` and read on the next fetch.
  const [generation, setGeneration] = useState<number>(0)

  const canQuery = api != null && dbId != null && !options.skip

  const fetchSchema = useCallback(async (): Promise<void> => {
    if (!api || dbId == null) return
    const cache = cacheRef.current
    const cached = cache.get(dbId)
    const now = Date.now()
    if (cached && now - cached.fetchedAt < ttlMs && generation === 0) {
      setSchema(cached.schema)
      return
    }
    // De-duplicate concurrent fetches.
    const inflight = inflightRef.current.get(dbId)
    if (inflight) {
      setLoading(true)
      try {
        const result = await inflight
        cache.set(dbId, { schema: result, fetchedAt: Date.now() })
        setSchema(result)
        setError(null)
      } finally {
        setLoading(false)
      }
      return
    }
    setLoading(true)
    setError(null)
    const promise = (async (): Promise<DatabaseSchema> => {
      const result = (await api.schema(dbId)) as DatabaseSchema
      return result
    })()
    inflightRef.current.set(dbId, promise)
    try {
      const result = await promise
      cache.set(dbId, { schema: result, fetchedAt: Date.now() })
      setSchema(result)
      setError(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
    } finally {
      inflightRef.current.delete(dbId)
      setLoading(false)
    }
  }, [api, dbId, ttlMs, generation])

  // Fetch on mount + whenever the deps change.
  useEffect(() => {
    if (!canQuery) {
      // Clear stale schema so the consumer can render a "no DB selected" state.
      setSchema(null)
      return undefined
    }
    void fetchSchema()
    return undefined
  }, [canQuery, dbId, fetchSchema])

  const refresh = useCallback(async (): Promise<void> => {
    if (dbId != null) cacheRef.current.delete(dbId)
    setGeneration(0)
    await fetchSchema()
  }, [dbId, fetchSchema])

  const invalidate = useCallback((): void => {
    if (dbId != null) cacheRef.current.delete(dbId)
    setGeneration((g) => g + 1)
  }, [dbId])

  return { schema, loading, error, refresh, invalidate, canQuery }
}
