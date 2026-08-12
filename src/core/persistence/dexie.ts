/**
 * Dexie schema for SQL Academy.
 *
 * **Source of truth** for the IndexedDB tables used by the persistence
 * layer. All `*Store` classes in this directory and the
 * `PersistenceService` read and write through the `SqlAcademyDB` exported
 * here — there is no second Dexie instance anywhere in the app.
 *
 * Schema and ownership rules are documented in RESEARCH.md §12.1 and
 * §13: the Main Thread is the *only* writer; the Worker talks to the
 * Main Thread via the `PersistenceService` bridge.
 *
 * The interface names exported from `./types` are the public contract.
 * The `*Row` types declared in this file are the Dexie-shaped versions
 * (with `id?: number` etc.) and are kept here so the schema block is
 * self-contained.
 */

import Dexie, { type Table } from 'dexie'

import type {
  Database,
  EditorDraft,
  ExerciseStat,
  Progress,
  QueryHistory,
  SavedQuery,
  Setting,
  SnapshotMetadataEntry,
  UndoEntry,
} from './types'

/* ------------------------------------------------------------------ *
 *  Row types — Dexie-shaped versions of the public interfaces.       *
 *  Kept in this file so the schema declaration is self-contained.     *
 * ------------------------------------------------------------------ */

export type ProgressRow = Progress
export type DatabaseRow = Database
export type SettingRow = Setting
export type QueryHistoryRow = QueryHistory
export type SavedQueryRow = SavedQuery
export type EditorDraftRow = EditorDraft
export type SnapshotMetadataRow = SnapshotMetadataEntry
export type UndoHistoryRow = UndoEntry
export type ExerciseStatsRow = ExerciseStat

/* ------------------------------------------------------------------ *
 *  Database class                                                     *
 * ------------------------------------------------------------------ */

export class SqlAcademyDB extends Dexie {
  progress!: Table<ProgressRow, number>
  databases!: Table<DatabaseRow, string>
  settings!: Table<SettingRow, string>
  queryHistory!: Table<QueryHistoryRow, number>
  savedQueries!: Table<SavedQueryRow, number>
  editorDrafts!: Table<EditorDraftRow, number>
  snapshotMetadata!: Table<SnapshotMetadataRow, number>
  undoHistory!: Table<UndoHistoryRow, number>
  exerciseStats!: Table<ExerciseStatsRow, number>
  /**
   * Per-lesson study-DB selection. The primary key is the
   * `studyDb:<lessonId>` string (see `studyDbService.studyDbSelectionKey`).
   * The value is the user DB id (`db-<n>`).
   */
  lessonStudyDb!: Table<{ key: string; dbId: string; updatedAt: number }, string>

  constructor(name = 'sql-academy') {
    super(name)

    // Schema lifted verbatim from RESEARCH.md §12.1. Do **not** change
    // these strings without also writing a `version(N+1).stores({...}).upgrade(...)`
    // migration — Dexie relies on the schema string for live-query
    // invalidation.
    this.version(1).stores({
      progress: '++id, [lessonId+exerciseId], lessonId, completedAt',
      databases: 'id, name, createdAt, updatedAt, sizeBytes',
      settings: 'key',
      queryHistory: '++id, dbId, executedAt, [dbId+executedAt]',
      savedQueries: '++id, dbId, name, createdAt, updatedAt',
      editorDrafts: '++id, [contextType+contextId], updatedAt',
      snapshotMetadata: '++id, [dbId+createdAt], dbId',
      undoHistory: '++id, [dbId+timestamp], dbId',
      exerciseStats: '++id, [exerciseId+timestamp], exerciseId, attemptType',
    })
    // v2: add the `lessonStudyDb` table. No migration of existing
    // data — the table is fresh.
    this.version(2).stores({
      lessonStudyDb: 'key, updatedAt',
    })
  }
}

/**
 * Default singleton — the real `PersistenceService` (this directory) and
 * any React hooks (`useLiveQuery`) consume this single instance so that
 * every reader sees the same data.
 *
 * Tests should construct their own `SqlAcademyDB` with a unique name
 * (see `tests/helpers/dexie-helper.ts`) so that the shared `fake-indexeddb`
 * instance never bleeds state across test files.
 */
export const db = new SqlAcademyDB()
