/**
 * Public entry point of the persistence layer.
 *
 * Re-exports every store singleton and the `PersistenceService`
 * singleton, plus all the public interfaces from `types.ts` so that
 * consumers can `import { settings, type Database } from
 * '@/core/persistence'`.
 *
 * The Dexie class and table row types are **not** re-exported here
 * because the UI should consume stores, not poke at the DB directly.
 * Tests that need a custom Dexie instance import from `./dexie`
 * explicitly.
 */

export { settings, DEFAULT_SETTINGS } from './settings'
export type { SettingsListener, Unsubscribe } from './settings'

export { progressStore } from './progress-store'
export type { LessonProgress, CourseProgress, CourseCatalogProvider } from './progress-store'

export { editorDrafts } from './editor-drafts'
export type { EditorDraftContextType } from './editor-drafts'

export { queryHistory } from './query-history'
export { DEFAULT_MAX_ENTRIES_PER_DB } from './query-history'

export { savedQueries } from './saved-queries'

export { dbMetadata } from './db-metadata'

export { snapshotMetadataStore } from './snapshot-metadata-store'
export { DEFAULT_MAX_SNAPSHOTS_PER_DB } from './snapshot-metadata-store'

export { undoStore } from './undo-store'
export { DEFAULT_MAX_UNDO_PER_DB } from './undo-store'

export { persistence } from './persistence-service'
export type { PersistenceMessage, WorkerDBAPI } from './persistence-service'

export type {
  Progress,
  Database,
  DatabaseOrigin,
  Setting,
  Settings,
  QueryHistory,
  SavedQuery,
  EditorDraft,
  EditorDraftContext,
  SnapshotMetadataEntry,
  SnapshotReason,
  UndoEntry,
  UndoOperationType,
  ExerciseStat,
  ExerciseAttemptType,
} from './types'
