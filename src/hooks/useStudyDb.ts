/**
 * useStudyDb — per-lesson "study mode" toggle.
 *
 * A lesson can be studied against a persistent user DB instead of
 * the per-session working-copy the runner creates by default. The
 * user picks the study DB on the lesson page; this hook reads /
 * writes that selection from / to Dexie's `lessonStudyDb` table.
 *
 * The hook is the React adapter over `studyDbService` and the
 * runner's `start()` (which re-seeds the DB). All pure decisions
 * (validation, key derivation) live in the service; this module
 * only does the I/O.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { useDatabase } from './useDatabase'
import { db as defaultDb } from '../core/persistence/dexie'
import { resolveExerciseContext } from '../core/services/exerciseHookService'
import {
  buildStudyDbSeed,
  studyDbSelectionKey,
  validateStudyDbSelection,
} from '../core/services/studyDbService'
import { loadCourse } from '../content/loaders'
import type { QueryResult } from '../workers/types'
import type { Database } from '../core/persistence'

export interface UseStudyDbResult {
  /**
   * The currently-selected user DB id (`db-<n>`) for this lesson,
   * or `null` if study mode is off.
   */
  selectedDbId: string | null

  /**
   * The currently-selected user DB object (id + name + sizeBytes).
   * Resolved from the `selectedDbId` against the user's database
   * list. `null` when nothing is selected or the dbId is stale.
   */
  selectedDb: Pick<Database, 'id' | 'name' | 'sizeBytes'> | null

  /**
   * `true` once the hook has read the initial selection from
   * Dexie. The UI can use this to avoid flashing the wrong state
   * on first render.
   */
  ready: boolean

  /** Pick a user DB as the study DB for this lesson. */
  select: (dbId: string) => Promise<void>

  /** Clear the study-DB selection (the runner falls back to working-copy). */
  clear: () => Promise<void>

  /**
   * Re-apply the lesson seed to the selected study DB. The caller
   * has to confirm — the operation is destructive (it overwrites
   * all rows the user has created in the DB).
   *
   * Returns the number of SQL statements executed (0 if the lesson
   * has no seed or no DB is selected).
   */
  reset: () => Promise<number>
}

interface SelectionRow {
  key: string
  dbId: string
  updatedAt: number
}

export function useStudyDb(lessonId: string): UseStudyDbResult {
  const { api } = useDatabase()
  const key = studyDbSelectionKey(lessonId)

  // Live read of the selection row. The querier captures `key`
  // by reference; the live query observes the table for changes
  // and re-emits on every write.
  const selectionRow = useLiveQuery<SelectionRow | undefined>(
    () => defaultDb.lessonStudyDb.get(key),
    [key],
  )

  // The user's database list (live). Used to resolve the
  // selection's dbId into a real DB object.
  const databases = useLiveQuery<ReadonlyArray<Database>, ReadonlyArray<Database>>(
    async () => {
      const rows = await defaultDb.databases.toArray()
      return rows
    },
    [],
    [] as ReadonlyArray<Database>,
  )

  // `useLiveQuery` does not surface a distinct "ready" signal —
  // it returns `undefined` until the first emission, then the
  // result (which may also be `undefined` for an empty table).
  // We track the first emission explicitly so the consumer can
  // tell "still loading" from "loaded, nothing there".
  const [ready, setReady] = useState<boolean>(false)
  useEffect(() => {
    setReady(true)
  }, [key])

  // The currently-selected user DB id (validated).
  const selectedDbId = useMemo<string | null>(() => {
    const raw = selectionRow?.dbId
    const v = validateStudyDbSelection(raw)
    return v.ok ? v.dbId : null
  }, [selectionRow?.dbId])

  // The matching user DB object.
  const selectedDb = useMemo<UseStudyDbResult['selectedDb']>(() => {
    if (!selectedDbId) return null
    return databases.find((d) => d.id === selectedDbId) ?? null
  }, [selectedDbId, databases])

  const select = useCallback(
    async (dbId: string): Promise<void> => {
      const v = validateStudyDbSelection(dbId)
      if (!v.ok) return
      await defaultDb.lessonStudyDb.put({
        key,
        dbId: v.dbId,
        updatedAt: Date.now(),
      })
    },
    [key],
  )

  const clear = useCallback(async (): Promise<void> => {
    await defaultDb.lessonStudyDb.delete(key)
  }, [key])

  const reset = useCallback(async (): Promise<number> => {
    if (!api || !selectedDbId) return 0
    // Find the first exercise of this lesson to get the seed.
    const ctx = resolveExerciseContext(loadCourse('es'), lessonId)
    const exercise = ctx.exercise ?? null
    const seed = buildStudyDbSeed(exercise)
    if (!seed) return 0
    // The Dexie id is `db-<n>`; the Worker uses the numeric part.
    const numericDbId = Number(selectedDbId.slice('db-'.length))
    if (!Number.isFinite(numericDbId)) return 0
    const rc = (await api.exec(numericDbId, seed, {
      singleOnly: false,
    })) as QueryResult
    if (!rc.ok) {
      throw new Error(
        `No se pudo restaurar la base de datos: ${rc.error?.message ?? 'error desconocido'}`,
      )
    }
    return 1
  }, [api, lessonId, selectedDbId])

  return {
    selectedDbId,
    selectedDb,
    ready,
    select,
    clear,
    reset,
  }
}
