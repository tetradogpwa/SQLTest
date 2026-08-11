/**
 * useUserDatabases — reactive list of user databases + CRUD actions.
 *
 * The hook is the single entry point for the "Bases de datos" page
 * (and the playground's DB selector) to interact with the Worker's
 * import / export / create / delete surface. It owns:
 *
 *   - `databases`  → live view of the Dexie `databases` table
 *                    (re-renders on any insert / update / delete).
 *   - `loading`    → `true` while any in-flight action is running.
 *   - `error`      → last error message (or `null`).
 *   - action methods (`create`, `import`, `export`, `rename`,
 *     `delete`, `refresh`) that orchestrate the Worker + the
 *     `dbMetadata` store. The Worker is the source of truth for the
 *     bytes; the Dexie row is the source of truth for the UI list.
 *
 * The Main Thread is the *only* writer to Dexie (RESEARCH §13.1); this
 * hook does not talk to Dexie from a Worker module. When the Worker
 * emits a `db:registered` / `db:deleted` / `db:sizeChanged` event via
 * the `PersistenceService`, the corresponding row is added / updated
 * automatically — the hook does not subscribe to those events
 * directly.
 */
import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { useDatabase } from './useDatabase'
import { dbMetadata, snapshotMetadataStore, undoStore } from '../core/persistence'
import { db as defaultDb } from '../core/persistence/dexie'
import type { Database } from '../core/persistence'

export interface UseUserDatabasesResult {
  /** The full list of user databases, newest first. */
  databases: ReadonlyArray<Database>
  /** `true` while an action is in flight. */
  loading: boolean
  /** Last error message, or `null`. */
  error: string | null
  /** Manually re-read the Dexie list (rarely needed; useLiveQuery does it). */
  refresh: () => Promise<void>

  /**
   * Create a brand-new empty database. The Worker allocates a
   * `dbId` and a filename, the Dexie row is added with
   * `origin: 'created'`. Returns the new row.
   */
  create: (name: string) => Promise<Database>
  /**
   * Import a `.db` file. The bytes are uploaded to the Worker which
   * persists them under `user/`. A Dexie row with `origin: 'imported'`
   * is added on success.
   */
  importFile: (file: File, displayName?: string) => Promise<Database>
  /**
   * Export a database as a Blob. The Worker returns the raw bytes
   * via `VACUUM INTO`; this helper wraps them into a `Blob` so the
   * UI can call `URL.createObjectURL` and trigger a download.
   */
  exportFile: (id: string) => Promise<{ blob: Blob; filename: string }>
  /**
   * Rename a database. Only the Dexie row is updated (the bytes
   * are not touched). Returns the updated row.
   */
  rename: (id: string, newName: string) => Promise<Database>
  /**
   * Delete a database — bytes + Dexie row + every snapshot.
   */
  delete: (id: string) => Promise<void>
}

/** A reasonable cap on import size; the Worker also enforces this. */
const MAX_IMPORT_BYTES = 100 * 1024 * 1024 // 100 MB

/**
 * Slugify the filename to derive a stable Dexie `id`. The Worker
 * sanitises the name differently; this id is purely a Main-Thread
 * bookkeeping key. The Worker's internal `dbId` is numeric and
 * assigned by `ImportExportManager`; we never expose it here.
 */
function fileToId(name: string): string {
  const trimmed = name.trim()
  const base = trimmed.split(/[\\/]/).pop() ?? trimmed
  const slug = base
    .replace(/\.(sqlite3?|db)$/i, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  const safe = slug.length > 0 ? slug.slice(0, 48) : 'db'
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${safe}-${suffix}`
}

function isValidName(name: string): boolean {
  const trimmed = name.trim()
  if (trimmed.length === 0) return false
  if (trimmed.length > 64) return false
  // No path separators, no control chars. Allow letters, digits,
  // spaces, dash, underscore, dot.
  return /^[\p{L}\p{N} ._-]+$/u.test(trimmed)
}

export function useUserDatabases(): UseUserDatabasesResult {
  const { api, ready } = useDatabase()
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Live view of the Dexie `databases` table. `useLiveQuery` re-runs
  // whenever any row is added / updated / deleted.
  const databasesResult = useLiveQuery(
    async () => {
      const rows = await dbMetadata.listAll()
      return rows
    },
    [],
    [] as ReadonlyArray<Database>,
  )
  const databases: ReadonlyArray<Database> = databasesResult ?? []

  // Whenever the Worker's active dbId changes, clear the error so the
  // banner does not get stuck after a successful subsequent action.
  useEffect(() => {
    setError(null)
  }, [ready])

  const refresh = useCallback(async (): Promise<void> => {
    // `useLiveQuery` already keeps the list in sync; this is exposed
    // for symmetry with the other actions and for manual refresh in
    // edge cases (e.g. after a Dexie write from outside the hook).
    if (defaultDb.databases) {
      await defaultDb.databases.toArray()
    }
  }, [])

  const create = useCallback(
    async (name: string): Promise<Database> => {
      if (!api) throw new Error('Worker no está listo.')
      if (!isValidName(name)) {
        throw new Error('Nombre inválido.')
      }
      setLoading(true)
      setError(null)
      try {
        const { dbId, sizeBytes } = (await api.createUserDatabase(name)) as {
          dbId: number
          sizeBytes: number
        }
        const id = `db-${dbId}`
        const now = Date.now()
        const row: Database = {
          id,
          name: name.trim(),
          createdAt: now,
          updatedAt: now,
          sizeBytes,
          origin: 'created',
        }
        await dbMetadata['db'].databases.add(row)
        return row
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [api],
  )

  const importFile = useCallback(
    async (file: File, displayName?: string): Promise<Database> => {
      if (!api) throw new Error('Worker no está listo.')
      if (file.size === 0) {
        throw new Error('El archivo está vacío.')
      }
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error('El archivo excede el límite permitido.')
      }
      setLoading(true)
      setError(null)
      try {
        const buffer = await file.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        const targetName = (displayName ?? file.name).replace(/\.(sqlite3?|db)$/i, '')
        const { sizeBytes } = (await api.import(bytes, targetName)) as {
          dbId: number
          sizeBytes: number
        }
        const id = fileToId(file.name)
        const now = Date.now()
        const row: Database = {
          id,
          name: targetName,
          createdAt: now,
          updatedAt: now,
          sizeBytes,
          origin: 'imported',
        }
        await dbMetadata['db'].databases.add(row)
        return row
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [api],
  )

  const exportFile = useCallback(
    async (id: string): Promise<{ blob: Blob; filename: string }> => {
      if (!api) throw new Error('Worker no está listo.')
      const row = await dbMetadata.get(id)
      if (!row) throw new Error('Base de datos no encontrada.')
      setLoading(true)
      setError(null)
      try {
        // The Dexie row id is a string; the Worker uses the numeric
        // dbId assigned at creation/import. The mapping is
        // `id = "db-<numeric>"` for created/imported rows, so we
        // extract the numeric part.
        const match = /^db-(\d+)$/.exec(row.id)
        if (!match || !match[1]) {
          throw new Error('No se puede exportar esta base de datos.')
        }
        const numericDbId = Number(match[1])
        const bytes = (await api.export(numericDbId)) as Uint8Array
        const blob = new Blob([new Uint8Array(bytes)], {
          type: 'application/x-sqlite3',
        })
        const filename = `${row.name}.sqlite3`
        return { blob, filename }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [api],
  )

  const rename = useCallback(
    async (id: string, newName: string): Promise<Database> => {
      if (!isValidName(newName)) {
        throw new Error('Nombre inválido.')
      }
      setLoading(true)
      setError(null)
      try {
        await dbMetadata.rename(id, newName.trim())
        const row = await dbMetadata.get(id)
        if (!row) throw new Error('Base de datos no encontrada.')
        return row
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const deleteDb = useCallback(
    async (id: string): Promise<void> => {
      if (!api) throw new Error('Worker no está listo.')
      setLoading(true)
      setError(null)
      try {
        const match = /^db-(\d+)$/.exec(id)
        if (match && match[1]) {
          const numericDbId = Number(match[1])
          await (api as { deleteUserDatabase(dbId: number): Promise<void> })
            .deleteUserDatabase(numericDbId)
            .catch((e: unknown) => {
              // Don't fail the UI flow if the Worker doesn't know
              // about this dbId (e.g. a row added before the Worker
              // wired the manager).
              // eslint-disable-next-line no-console
              console.warn('[databases] worker delete failed:', e)
            })
        }
        await dbMetadata.unregister(id)
        // Drop every snapshot + undo entry for this db. The Worker
        // also wipes the bytes when the manager knows the file, but
        // we mirror that here so the UI list stays clean.
        await snapshotMetadataStore.removeByDb(id).catch(() => undefined)
        await undoStore.removeByDb(id).catch(() => undefined)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [api],
  )

  return {
    databases,
    loading,
    error,
    refresh,
    create,
    importFile,
    exportFile,
    rename,
    delete: deleteDb,
  }
}
