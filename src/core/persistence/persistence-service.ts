/**
 * Persistence service.
 *
 * The bridge between the Worker (which owns OPFS and the SQLite handles)
 * and Dexie (which lives on the Main Thread). Per RESEARCH.md §13.1 the
 * Worker **never** touches Dexie directly — it sends messages of the
 * form `{ type: 'snapshot:created' | 'undo:entry' | ... }` via Comlink
 * (or `postMessage`), and this service applies them to the appropriate
 * store.
 *
 * Responsibilities:
 *
 *  1. Translate `PersistenceMessage` payloads into the matching store
 *     call (`snapshotMetadata.add`, `undoStore.addEntry`, …).
 *  2. Expose draft helpers (`saveDraft`, `loadDraft`) that React
 *     components call directly — these are *not* triggered by the
 *     Worker.
 *  3. Optionally pin the `DBAPI` reference so future enhancements can
 *     trigger side-effects in the Worker after a Dexie write commits
 *     (e.g. `restoreSnapshot`).
 *
 * The service is a *singleton* (`persistence`) so callers do not have
 * to thread the instance through every React component.
 */

import type { Remote } from 'comlink'

import { editorDrafts } from './editor-drafts'
import { dbMetadata } from './db-metadata'
import { queryHistory } from './query-history'
import { snapshotMetadataStore } from './snapshot-metadata-store'
import { undoStore } from './undo-store'
import type { EditorDraftContextType } from './editor-drafts'
import type { SnapshotReason } from './types'

/**
 * Minimal shape of the Worker's DBAPI that the PersistenceService
 * needs. We import only the type — the actual class lives in
 * `src/workers/dbapi.ts` to keep the bundle clean. Using a structural
 * type also makes tests easier (no need to spin up a Comlink worker).
 */
export interface WorkerDBAPI {
  restore?(dbId: number, snapId: string): Promise<void>
}

/* ------------------------------------------------------------------ *
 *  Message types                                                      *
 * ------------------------------------------------------------------ */

/**
 * The Worker → Main Thread persistence channel. The Worker emits one
 * of these after it has completed a side-effect that needs to be
 * reflected in the local UI (e.g. a new snapshot was written to OPFS).
 *
 * Field semantics:
 *  - `dbId` is the user-database id (string slug) — same value the
 *    `DbMetadataStore` and `SnapshotMetadataStore` use. The Worker
 *    maps its numeric handle to this string via the DBAPI contract.
 *  - `snapshotId` is the OPFS filename the Worker assigned (e.g.
 *    `snap-${dbId}-${timestamp}`).
 *  - `sizeBytes` is the size of the snapshot bytes (NOT the user DB).
 *  - `timestamp` is `Date.now()` at the moment the Worker emitted
 *    the event.
 */
export type PersistenceMessage =
  | {
      type: 'snapshot:created'
      dbId: string
      snapId: string
      label: string
      sizeBytes: number
      reason: SnapshotReason
      timestamp: number
    }
  | {
      type: 'snapshot:restored'
      dbId: string
      snapId: string
      timestamp: number
    }
  | {
      type: 'undo:entry'
      dbId: string
      operation: string
      operationType: 'dml' | 'ddl' | 'dcl' | 'tx'
      affectedRows?: number
      timestamp: number
      snapshotId: string
      description: string
    }
  | {
      type: 'query:executed'
      dbId: number
      sql: string
      success: boolean
      executionMs: number
      errorMessage?: string
      timestamp: number
    }
  | {
      type: 'db:registered'
      dbId: string
      name: string
      sizeBytes: number
      timestamp: number
    }
  | {
      type: 'db:deleted'
      dbId: string
      timestamp: number
    }
  | {
      type: 'db:sizeChanged'
      dbId: string
      sizeBytes: number
      timestamp: number
    }

/* ------------------------------------------------------------------ *
 *  Service                                                             *
 * ------------------------------------------------------------------ */

export class PersistenceService {
  private workerApi: Remote<WorkerDBAPI> | WorkerDBAPI | null = null

  /**
   * Pin a reference to the Worker's DBAPI. Optional — the service
   * is fully functional without it (the message handlers never
   * call back into the Worker). Stored as a Comlink `Remote<...>` so
   * the same instance can be used by other Comlink-aware code.
   */
  attach(workerApi: Remote<WorkerDBAPI> | WorkerDBAPI): void {
    this.workerApi = workerApi
  }

  detach(): void {
    // Keep the getter alive — consumers of the service may need to
    // query whether a Worker has been attached, so `detach` clears
    // the reference and `getWorkerApi` exposes the current binding.
    this.workerApi = null
  }

  /**
   * Returns the currently-attached Worker reference, or `null` if the
   * service is detached. Exposed so Comlink-aware consumers (e.g. a
   * future hook that needs to call `restore`) can read the binding
   * without going through React context.
   */
  getWorkerApi(): Remote<WorkerDBAPI> | WorkerDBAPI | null {
    return this.workerApi
  }

  /**
   * `true` when a Worker reference is currently pinned. Convenience
   * for tests and for code that wants to short-circuit when no
   * Worker is attached.
   */
  isAttached(): boolean {
    return this.workerApi !== null
  }

  /**
   * Dispatch a single Worker-originated message to the right store.
   * All handlers are `await`-ed so a failure in one does not block
   * the next message; errors are reported but never thrown upward
   * (the Worker has no useful recovery path on UI persistence failure).
   */
  async handleMessage(msg: PersistenceMessage): Promise<void> {
    try {
      switch (msg.type) {
        case 'snapshot:created':
          await snapshotMetadataStore.add({
            dbId: msg.dbId,
            snapshotId: msg.snapId,
            label: msg.label,
            createdAt: msg.timestamp,
            sizeBytes: msg.sizeBytes,
            reason: msg.reason,
          })
          // Keep undo metadata aligned: the new snapshot itself
          // doesn't add an undo entry (you cannot undo the act of
          // snapshotting), but a future `undo:entry` message will
          // reference it. No-op here.
          return

        case 'snapshot:restored':
          // No metadata change on restore — the snapshot row is
          // still meaningful, and the user just consumed it. We
          // could mark it as "consumed" in a future POC.
          return

        case 'undo:entry': {
          const entry = {
            dbId: msg.dbId,
            operation: msg.operation,
            operationType: msg.operationType,
            timestamp: msg.timestamp,
            snapshotId: msg.snapshotId,
            description: msg.description,
            ...(msg.affectedRows !== undefined ? { affectedRows: msg.affectedRows } : {}),
          }
          await undoStore.addEntry(entry)
          return
        }

        case 'query:executed': {
          await queryHistory.addEntry(
            msg.dbId,
            msg.sql,
            msg.success,
            msg.executionMs,
            msg.errorMessage,
          )
          // Optional: re-enforce the per-DB cap on every insert. Cheap
          // because the count is bounded by 100; we just want to keep
          // the table from growing unbounded if the user runs many
          // queries in a single session.
          await queryHistory.enforceLimit(msg.dbId)
          return
        }

        case 'db:registered': {
          // The Worker may emit `db:registered` after `import()`. We
          // only add the row if it does not already exist — the UI
          // may have called `register` directly.
          const existing = await dbMetadata.get(msg.dbId)
          if (!existing) {
            await dbMetadata.register(msg.dbId, msg.name, msg.sizeBytes)
          } else {
            // Refresh size in case the Worker computed it differently.
            await dbMetadata.updateSize(msg.dbId, msg.sizeBytes)
          }
          return
        }

        case 'db:deleted': {
          // Cascade: drop every metadata fragment we hold for this DB.
          // The Worker has already removed the bytes from OPFS.
          await Promise.all([
            dbMetadata.unregister(msg.dbId),
            snapshotMetadataStore.removeByDb(msg.dbId),
            undoStore.removeByDb(msg.dbId),
          ])
          return
        }

        case 'db:sizeChanged': {
          await dbMetadata.updateSize(msg.dbId, msg.sizeBytes)
          return
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[persistence] failed to handle message', msg, e)
    }
  }

  /* ------------------------------------------------------------------ *
   *  Draft helpers (called directly by React, NOT by the Worker)        *
   * ------------------------------------------------------------------ */

  /** Save a debounced draft on behalf of a React hook. */
  async saveDraft(
    contextType: EditorDraftContextType,
    contextId: string,
    content: string,
  ): Promise<void> {
    await editorDrafts.saveDraft(contextType, contextId, content)
  }

  /** Load a draft for a given editor context. */
  async loadDraft(
    contextType: EditorDraftContextType,
    contextId: string,
  ): Promise<string | null> {
    return editorDrafts.loadDraft(contextType, contextId)
  }

  /** Delete a draft (e.g. when an exercise is marked as completed). */
  async deleteDraft(
    contextType: EditorDraftContextType,
    contextId: string,
  ): Promise<void> {
    await editorDrafts.deleteDraft(contextType, contextId)
  }
}

export const persistence = new PersistenceService()
