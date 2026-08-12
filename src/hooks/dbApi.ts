/**
 * Shared types for the database hook / worker session.
 *
 * The `DBApi` interface is the subset of the worker's surface that
 * the React hooks depend on. It lives in this separate file (not
 * inside `useDatabase.ts`) to avoid a circular dependency between
 * the hook and the `workerSessionService` that the hook uses.
 */
import type { Remote } from 'comlink'

import type { InitResult } from '../workers/types'

/**
 * Subset of the DBAPI surface that this hook needs. We re-declare it
 * here (rather than importing the full class) so the hook bundle
 * stays independent of the worker's internals. Tests mock this
 * interface.
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

/** Re-export for convenience (avoids a second import in the hook). */
export type { Remote, InitResult }
