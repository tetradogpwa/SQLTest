/**
 * useUserDatabases — reactive list of user databases + CRUD actions.
 *
 * The hook is the React adapter over `userDatabasesService`. All
 * business logic (validation, sanitisation, ID assignment, error
 * normalisation) lives in the service; this hook is a thin wrapper
 * that:
 *
 *  - subscribes to the Dexie `databases` table via `useLiveQuery`
 *  - tracks `loading` / `error` state in `useState`
 *  - delegates every action to a service function that receives
 *    the Worker call as an injected callback
 *
 * The split makes the service testable with pure vitest (no React,
 * no Comlink, no Dexie). The hook keeps the React-specific
 * concerns — state, lifecycle, error mapping — out of the
 * service.
 */
import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { useDatabase } from './useDatabase'
import { dbMetadata, snapshotMetadataStore, undoStore } from '../core/persistence'
import { db as defaultDb } from '../core/persistence/dexie'
import type { Database } from '../core/persistence'
import {
  createDatabase,
  createDatabaseRow,
  DatabaseValidationError,
  importDatabase,
  ImportValidationError,
  toErrorMessage,
  toExportBlob,
  validateDatabaseName,
} from '../core/services/userDatabasesService'

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
    if (defaultDb.databases) {
      await defaultDb.databases.toArray()
    }
  }, [])

  // Centralised error mapping: every action wraps `setError(msg)` so
  // the user always sees a string (never an object / null / undefined).
  // The service is responsible for normalising the input via
  // `toErrorMessage`.
  const runAction = useCallback(
    async <T>(action: () => Promise<T>): Promise<T> => {
      setLoading(true)
      setError(null)
      try {
        return await action()
      } catch (e) {
        const mapped = toErrorMessage(e)
        // Validation errors carry the i18n key directly (e.g.
        // `databases.createDialog.error.invalidName`). The UI
        // displays the key when present, otherwise the message.
        if (e instanceof DatabaseValidationError || e instanceof ImportValidationError) {
          setError(e.key)
        } else if (mapped.kind === 'empty') {
          // No message came out of the service — do not set a
          // banner. The hook treats "no info" as "no error".
          setError(null)
        } else {
          setError(mapped.message)
        }
        throw e
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const create = useCallback(
    (name: string): Promise<Database> =>
      runAction(async () => {
        if (!api) throw new Error('Worker no está listo.')
        const row = await createDatabase({
          name,
          callWorker: async (sanitized: string) => {
            const result = (await api.createUserDatabase(sanitized)) as {
              dbId: number
              sizeBytes: number
            }
            return result
          },
        })
        await dbMetadata['db'].databases.add(row)
        return row
      }),
    [api, runAction],
  )

  const importFile = useCallback(
    (file: File, displayName?: string): Promise<Database> =>
      runAction(async () => {
        if (!api) throw new Error('Worker no está listo.')
        const row = await importDatabase({
          file,
          ...(displayName !== undefined ? { displayName } : {}),
          callWorker: async (bytes, sanitized) => {
            const result = (await api.import(bytes, sanitized)) as {
              dbId: number
              sizeBytes: number
            }
            return result
          },
        })
        await dbMetadata['db'].databases.add(row)
        return row
      }),
    [api, runAction],
  )

  const exportFile = useCallback(
    (id: string): Promise<{ blob: Blob; filename: string }> =>
      runAction(async () => {
        if (!api) throw new Error('Worker no está listo.')
        const row = await dbMetadata.get(id)
        if (!row) throw new Error('Base de datos no encontrada.')
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
        return toExportBlob({ bytes, name: row.name })
      }),
    [api, runAction],
  )

  const rename = useCallback(
    (id: string, newName: string): Promise<Database> =>
      runAction(async () => {
        // Re-validate via the service so we share the same rules
        // as the create flow. (Tests cover the validation
        // function; the hook just calls it.)
        const validation = validateDatabaseName(newName)
        if (!validation.ok) {
          throw new DatabaseValidationError(validation.key)
        }
        await dbMetadata.rename(id, validation.trimmed)
        const row = await dbMetadata.get(id)
        if (!row) throw new Error('Base de datos no encontrada.')
        // Re-stamp `updatedAt` via the row constructor so the
        // service owns the timestamp logic.
        return createDatabaseRow({
          dbId: Number((/^db-(\d+)$/.exec(id) ?? [])[1] ?? 0),
          name: row.name,
          sizeBytes: row.sizeBytes,
          origin: row.origin,
          // The Dexie rename already touched updatedAt; we keep
          // the service's `now()` for consistency.
        })
      }),
    [runAction],
  )

  const deleteDb = useCallback(
    (id: string): Promise<void> =>
      runAction(async () => {
        if (!api) throw new Error('Worker no está listo.')
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
      }),
    [api, runAction],
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
