/**
 * Public TypeScript types for the Dexie persistence layer.
 *
 * These interfaces are the *contract* that the UI code, hooks, and the
 * `PersistenceService` consume. They are intentionally narrower than the
 * raw `*Row` types declared inside `dexie.ts` — the row types exist so
 * Dexie can stamp `id?` on each insert; the public types make the contract
 * ergonomic (no `| undefined` noise, sensible defaults).
 *
 * Schema reference: RESEARCH.md §12.1.
 */

/* ------------------------------------------------------------------ *
 *  Lesson / exercise progress                                        *
 * ------------------------------------------------------------------ */

/**
 * A row in the `progress` table.
 *
 * A row is the unit of "I finished exercise X inside lesson Y". The
 * `progress` table is upserted by `[lessonId+exerciseId]` so each
 * (lesson, exercise) pair has at most one row.
 *
 * The optional `hintsUsed` and `timeMs` are recorded by
 * `ProgressStore.markExerciseCompleted` for richer analytics, but the
 * core progress UI only depends on `completedAt`.
 */
export interface Progress {
  id?: number
  lessonId: string
  exerciseId: string
  completedAt: number
  hintsUsed?: number
  timeMs?: number
}

/* ------------------------------------------------------------------ *
 *  User databases (metadata only — bytes live in OPFS)               *
 * ------------------------------------------------------------------ */

/** Origin of a user-managed database. */
export type DatabaseOrigin = 'bundled' | 'imported' | 'created'

/**
 * Metadata for a user database. The actual `.db` bytes live in OPFS
 * via the Worker; `SqlAcademyDB.databases` only tracks the lightweight
 * attributes that the UI needs to render the database list.
 */
export interface Database {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  sizeBytes: number
  origin: DatabaseOrigin
}

/* ------------------------------------------------------------------ *
 *  Settings                                                           *
 * ------------------------------------------------------------------ */

/** Keyed application preferences. Single row per key in `settings`. */
export interface Setting {
  key: string
  value: unknown
}

/** Strongly-typed schema for the values stored in `settings`. */
export interface Settings {
  theme: 'light' | 'dark' | 'auto'
  fontSize: 'sm' | 'md' | 'lg'
  sqlDialect: 'sqlite'
  reducedMotion: boolean
  autoSaveDrafts: boolean
  defaultDatabase: string | null
  firstRunCompleted: boolean
  /** Whether the navigation sidebar is collapsed. */
  sidebarCollapsed: boolean
}

/* ------------------------------------------------------------------ *
 *  Query history (auto-managed, 100-per-DB LRU)                       *
 * ------------------------------------------------------------------ */

/**
 * One entry in the `queryHistory` table — a single executed statement.
 *
 * `dbId` matches the `dbId` used in the Worker so the UI can filter the
 * history per database. The `errorMessage` is only populated when
 * `success === false`.
 */
export interface QueryHistory {
  id?: number
  dbId: number
  sql: string
  executedAt: number
  executionMs: number
  success: boolean
  errorMessage?: string
}

/* ------------------------------------------------------------------ *
 *  Saved queries (user-managed)                                      *
 * ------------------------------------------------------------------ */

export interface SavedQuery {
  id?: number
  dbId: number
  name: string
  sql: string
  description?: string
  createdAt: number
  updatedAt: number
}

/* ------------------------------------------------------------------ *
 *  Editor drafts (debounced autosave)                                *
 * ------------------------------------------------------------------ */

/**
 * What the editor is attached to. The data model also accepts 'lesson'
 * for completeness with the existing Dexie schema (RESEARCH.md §12.1),
 * but the public API exposed by `EditorDraftStore` only allows the
 * two values the UI actually uses.
 */
export type EditorDraftContext = 'exercise' | 'lesson' | 'playground'

export interface EditorDraft {
  id?: number
  contextType: EditorDraftContext
  contextId: string
  content: string
  updatedAt: number
}

/* ------------------------------------------------------------------ *
 *  Snapshot metadata (bytes live in OPFS)                            *
 * ------------------------------------------------------------------ */

export type SnapshotReason = 'auto' | 'manual' | 'pre-restore' | 'pre-destructive'

/**
 * One snapshot — the bytes are stored by the Worker in OPFS, only this
 * lightweight descriptor lives in Dexie so the UI can render a list
 * without round-tripping through the Worker.
 *
 * `snapshotId` is the string the Worker uses as the OPFS filename (e.g.
 * `snap-${dbId}-${timestamp}`). `dbId` is the user-database id (string,
 * not the numeric Worker handle).
 */
export interface SnapshotMetadataEntry {
  id?: number
  dbId: string
  snapshotId: string
  label: string
  createdAt: number
  sizeBytes: number
  reason: SnapshotReason
}

/* ------------------------------------------------------------------ *
 *  Undo history (bytes in OPFS, metadata in Dexie)                   *
 * ------------------------------------------------------------------ */

export type UndoOperationType = 'dml' | 'ddl' | 'dcl' | 'tx'

/**
 * A single undo entry — one destructive or transactional operation
 * that the user can revert. `snapshotId` points to the snapshot row
 * (in `snapshotMetadata`) whose bytes can be restored.
 */
export interface UndoEntry {
  id?: number
  dbId: string
  operation: string
  operationType: UndoOperationType
  affectedRows?: number
  timestamp: number
  snapshotId: string
  description: string
}

/* ------------------------------------------------------------------ *
 *  Exercise statistics (for analytics / "recent attempts" feed)      *
 * ------------------------------------------------------------------ */

export type ExerciseAttemptType = 'submit' | 'run' | 'hint' | 'reveal'

/**
 * Telemetry for one exercise interaction. The `progress` table records
 * the *first successful completion*; `exerciseStats` records *every*
 * interaction so we can show "recent attempts" and detect patterns
 * (e.g. repeated hints without success).
 */
export interface ExerciseStat {
  id?: number
  exerciseId: string
  timestamp: number
  attemptType: ExerciseAttemptType
  correct: boolean
  durationMs?: number
  hintsUsed?: number
}
