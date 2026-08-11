/**
 * Shared mock helper for DBApi used in exercise-engine tests.
 *
 * El `DBApi` real tiene tipos muy estrictos (literal unions para
 * `statementKind`, etc.) que no encajan con la inferencia de
 * `vi.fn(async () => ...)`. Esta helper construye mocks con la
 * firma correcta usando funciones reales (no `vi.fn` para los
 * argumentos) y expone contadores por método.
 */

import { vi } from 'vitest'
import type { DBApi } from '../../src/core/exercises'
import type { QueryResult, DatabaseSchema } from '../../src/workers/types'

export interface ApiCounters {
  execCalls: number
  schemaCalls: number
  snapshotCalls: number
  restoreCalls: number
  listSnapshotsCalls: number
  openCalls: number
  closeCalls: number
  closeAllCalls: number
  cancelCalls: number
  deleteSnapshotCalls: number
  deleteUserDatabaseCalls: number
  listUserDatabasesCalls: number
}

const emptyResult: QueryResult = {
  ok: true,
  columns: [],
  rows: [],
  executionMs: 0,
  statementKind: 'select',
}

const emptySchema: DatabaseSchema = { tables: [], views: [], indexes: [], triggers: [] }

type OpenFn = (
  dbId: number,
  filename: string,
  mode?: 'read' | 'write' | 'readwrite',
) => Promise<{ filename: string; sizeBytes: number }>

type CloseFn = (dbId: number) => Promise<void>
type CloseAllFn = () => Promise<void>
type CancelFn = (dbId: number) => Promise<void>
type DeleteSnapshotFn = (dbId: number, snapId: string) => Promise<void>
type DeleteUserDatabaseFn = (dbId: number) => Promise<void>
type ListUserDatabasesFn = () => Promise<
  Array<{ dbId: number; name: string; filename: string }>
>
type ExecFn = (
  dbId: number,
  sql: string,
  options?: { timeoutMs?: number; params?: unknown[] },
) => Promise<QueryResult>

type SchemaFn = (dbId: number) => Promise<DatabaseSchema>
type SnapshotFn = (
  dbId: number,
  label: string,
  reason?: 'auto' | 'manual' | 'pre-restore' | 'pre-destructive',
) => Promise<{ id: string }>
type RestoreFn = (dbId: number, snapId: string) => Promise<void>
type ListSnapshotsFn = (dbId: number) => Promise<Array<{ id: string }>>

/** Crea un mock de DBApi con implementaciones por defecto.
 *
 * Los métodos devueltos son `vi.fn`-wrapped con la firma correcta
 * para que el type-checker esté contento. Los overrides son funciones
 * (no mocks) — se envuelven en `vi.fn` por dentro para que puedas
 * inspeccionar las llamadas.
 *
 * NOTA: el `override.exec` debe ser una función con la firma correcta.
 * Si pasas `vi.fn(async () => ...)` el inferido será `Mock<()>` y no
 * encajará con `ExecFn`. Si necesitas inspeccionar llamadas usa la
 * función (no el mock) y luego `vi.fn(impl)` por dentro.
 */
export function mkApiMock(overrides: {
  open?: OpenFn
  close?: CloseFn
  closeAll?: CloseAllFn
  cancel?: CancelFn
  deleteSnapshot?: DeleteSnapshotFn
  deleteUserDatabase?: DeleteUserDatabaseFn
  listUserDatabases?: ListUserDatabasesFn
  exec?: ExecFn
  schema?: SchemaFn
  snapshot?: SnapshotFn
  restore?: RestoreFn
  listSnapshots?: ListSnapshotsFn
} = {}): DBApi {
  const openImpl: OpenFn =
    overrides.open ?? (async (_dbId, filename) => ({ filename, sizeBytes: 0 }))
  const closeImpl: CloseFn = overrides.close ?? (async () => undefined)
  const closeAllImpl: CloseAllFn = overrides.closeAll ?? (async () => undefined)
  const cancelImpl: CancelFn = overrides.cancel ?? (async () => undefined)
  const deleteSnapshotImpl: DeleteSnapshotFn =
    overrides.deleteSnapshot ?? (async () => undefined)
  const deleteUserDatabaseImpl: DeleteUserDatabaseFn =
    overrides.deleteUserDatabase ?? (async () => undefined)
  const listUserDatabasesImpl: ListUserDatabasesFn =
    overrides.listUserDatabases ?? (async () => [])
  const execImpl: ExecFn = overrides.exec ?? (async () => emptyResult)
  const schemaImpl = overrides.schema ?? (async () => emptySchema)
  const snapImpl =
    overrides.snapshot ?? (async () => ({ id: 'snap-1' }))
  const restoreImpl: RestoreFn = overrides.restore ?? (async () => undefined)
  const listImpl: ListSnapshotsFn = overrides.listSnapshots ?? (async () => [])

  // Wrap cada impl en vi.fn para que tests puedan inspeccionar llamadas.
  // El cast a `unknown as DBApi[…]` es necesario porque vi.fn preserva
  // una firma más permisiva.
  return {
    open: vi.fn(openImpl) as unknown as DBApi['open'],
    close: vi.fn(closeImpl) as unknown as DBApi['close'],
    closeAll: vi.fn(closeAllImpl) as unknown as DBApi['closeAll'],
    cancel: vi.fn(cancelImpl) as unknown as DBApi['cancel'],
    deleteSnapshot: vi.fn(deleteSnapshotImpl) as unknown as DBApi['deleteSnapshot'],
    deleteUserDatabase: vi.fn(deleteUserDatabaseImpl) as unknown as DBApi['deleteUserDatabase'],
    listUserDatabases: vi.fn(listUserDatabasesImpl) as unknown as DBApi['listUserDatabases'],
    exec: vi.fn(execImpl) as unknown as DBApi['exec'],
    schema: vi.fn(schemaImpl) as unknown as DBApi['schema'],
    snapshot: vi.fn(snapImpl) as unknown as DBApi['snapshot'],
    restore: vi.fn(restoreImpl) as unknown as DBApi['restore'],
    listSnapshots: vi.fn(listImpl) as unknown as DBApi['listSnapshots'],
  }
}
