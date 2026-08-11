/**
 * Shared types for the SQLite Worker.
 *
 * These types describe the data structures exchanged between the Main Thread
 * and the Worker via Comlink. They mirror the public API documented in
 * RESEARCH.md §9.3 and are intentionally framework-agnostic.
 *
 * NOTE: we re-declare `StorageCapability` here (instead of importing from
 * `core/storage/capability.ts`) so that the Worker bundle stays decoupled
 * from the Main Thread's React/UI modules. The Main Thread re-exports
 * `StorageCapability` from there; values are kept in sync by hand because
 * the union is tiny and stable.
 */

import type { StatementKind } from './statement-analyzer'

/* ──────────────────────────────────────────────────────────────────── *
 *  Storage capability (mirrors core/storage/capability.ts)              *
 * ──────────────────────────────────────────────────────────────────── */

export type StorageCapability = 'opfs-sync' | 'opfs-async' | 'idb' | 'memory'

/* ──────────────────────────────────────────────────────────────────── *
 *  Statement classification (mirrored from statement-analyzer.ts)        *
 * ──────────────────────────────────────────────────────────────────── */

export type { StatementKind } from './statement-analyzer'
export type RiskLevel = 'safe' | 'caution' | 'destructive'
export type EstimatedImpact = 'small' | 'medium' | 'large'

export interface AnalyzedStatement {
  kind: StatementKind
  risk: RiskLevel
  requiresCheckpoint: boolean
  estimatedImpact?: EstimatedImpact
  warnings: string[]
  /** Tables / views / indexes referenced by the statement (best-effort). */
  objects?: string[]
  /** Estimated ratio of rows affected (0..1). `undefined` when unknown. */
  affectedRatio?: number
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Query execution                                                      *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Options accepted by `DBAPI.exec` and `QueryExecutor.exec`.
 *
 * - `timeoutMs` overrides the default 5 000 ms cap.
 * - `singleOnly` rejects multi-statement SQL (e.g. `SELECT 1; SELECT 2`).
 * - `params` binds positional parameters to a single statement. Multi-
 *   statement SQL with params is rejected to keep the contract simple.
 * - `collectRows` defaults to `true`; pass `false` for DDL/DML where the
 *   caller only cares about `rowsAffected` / `lastInsertRowid`.
 */
export interface ExecOptions {
  timeoutMs?: number
  singleOnly?: boolean
  params?: unknown[]
  collectRows?: boolean
}

export interface QueryResult {
  ok: boolean
  /** Column names from the *last* statement that produced rows. */
  columns?: string[]
  /** Row data; truncated to `RESULT_LIMITS.maxRows` when applicable. */
  rows?: unknown[][]
  /** Total rows affected across all statements (sqlite3.changes). */
  rowsAffected?: number
  /** `last_insert_rowid()` after the *last* statement. */
  lastInsertRowid?: number
  /** True when the result set was clipped to the row limit. */
  truncated?: boolean
  /** Structured error if `ok === false`. */
  error?: SerializedError
  /** Wall-clock duration of the exec call, in ms. */
  executionMs: number
  /** Classification of the *first* statement (or the only one). */
  statementKind: StatementKind
  /** All classified statements, when multi-statement SQL was sent. */
  statements?: AnalyzedStatement[]
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Error reporting                                                      *
 * ──────────────────────────────────────────────────────────────────── */

export interface SerializedError {
  /** Canonical SQLite result-code name, e.g. `SQLITE_ERROR`. */
  code: string
  /** Raw error message from SQLite (`sqlite3_errmsg`). */
  message: string
  /** Spanish pedagogical message safe to show the user. */
  translatedMessage: string
  /** Optional list of corrective hints (e.g. did-you-mean suggestions). */
  hints?: string[]
  /** Token flagged by the parser, when available. */
  offendingToken?: string
  /** Table referenced in the error, when recoverable. */
  table?: string
  /** Column referenced in the error, when recoverable. */
  column?: string
  /** Numeric result code (matches `sqlite-constants.js`). */
  rc?: number
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Schema                                                               *
 * ──────────────────────────────────────────────────────────────────── */

export interface DatabaseSchema {
  tables: TableInfo[]
  views: ViewInfo[]
  indexes: IndexInfo[]
  triggers: TriggerInfo[]
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  primaryKey: string[]
  foreignKeys: ForeignKeyInfo[]
  uniqueConstraints: string[][]
  checkConstraints: string[]
  rowCountEstimate: number
  createSql: string
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue: string | null
  /** 0 when not part of any primary key. */
  primaryKeyPosition: number
}

export interface ForeignKeyInfo {
  from: string
  table: string
  to: string
  onUpdate?: string
  onDelete?: string
}

export interface ViewInfo {
  name: string
  createSql: string
}

export interface IndexInfo {
  name: string
  table: string
  unique: boolean
  columns: string[]
  createSql: string
}

export interface TriggerInfo {
  name: string
  table: string
  createSql: string
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Snapshots & user databases                                           *
 * ──────────────────────────────────────────────────────────────────── */

export type SnapshotReason = 'auto' | 'manual' | 'pre-restore' | 'pre-destructive'

export interface SnapshotMetadata {
  id: string
  dbId: number
  label: string
  sizeBytes: number
  createdAt: number
  reason: SnapshotReason
}

export type DatabaseMode = 'read' | 'write' | 'readwrite'

export interface OpenDatabaseResult {
  filename: string
  sizeBytes: number
}

export interface UserDatabaseInfo {
  dbId: number
  name: string
  filename: string
  sizeBytes: number
  createdAt: number
  updatedAt: number
  origin: 'bundled' | 'imported' | 'created'
}

export interface ImportResult {
  dbId: number
  sizeBytes: number
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Init result                                                          *
 * ──────────────────────────────────────────────────────────────────── */

export interface InitResult {
  capability: StorageCapability
  sqliteVersion: string
  vfsName: string
}
