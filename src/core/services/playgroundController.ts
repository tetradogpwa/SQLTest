/**
 * Playground controller.
 *
 * Pure-TS pipeline that the playground page runs every time the
 * user executes a query. The decisions live here; the React side
 * just wires the buttons.
 *
 * Pipeline (in order):
 *  1. `analyze(sql)` to classify every statement.
 *  2. If any statement requires a checkpoint **and** the active DB
 *     is not the built-in `playground`, capture a pre-destructive
 *     snapshot (best-effort: a failure here does not abort the run).
 *  3. `run(sql)` to actually execute the query.
 *  4. If any statement is DDL (`create` / `drop` / `alter`), invalidate
 *     + refresh the schema cache so the explorer updates.
 *
 * The service is **I/O-free**: every side effect goes through an
 * injected `ExecuteDeps` callback. The page constructs the deps
 * once per render from the existing `useQuery` / `useSchema` hooks
 * + the Comlink proxy.
 */
import { analyze } from '../../workers/statement-analyzer'
import type { AnalyzedStatement } from '../../workers/types'

/* ------------------------------------------------------------------ *
 *  Pure predicates                                                      *
 * ------------------------------------------------------------------ */

/** Statement kinds that change the schema. */
const DDL_KINDS: ReadonlySet<AnalyzedStatement['kind']> = new Set([
  'create',
  'drop',
  'alter',
])

/** True when at least one statement in the batch requires a snapshot. */
export function isDestructive(statements: ReadonlyArray<AnalyzedStatement>): boolean {
  return statements.some((s) => s.requiresCheckpoint)
}

/** True when at least one statement is DDL (schema-changing). */
export function isDdl(statements: ReadonlyArray<AnalyzedStatement>): boolean {
  return statements.some((s) => DDL_KINDS.has(s.kind))
}

/* ------------------------------------------------------------------ *
 *  Decision: should we auto-snapshot?                                   *
 * ------------------------------------------------------------------ */

export interface ShouldAutoSnapshotInput {
  /** The statements the user is about to run. */
  statements: ReadonlyArray<AnalyzedStatement>
  /** The active dbId (the Worker handle). `null` when the Worker is not ready. */
  dbId: number | null
  /** The "built-in playground" dbId. Auto-snapshots are disabled for it. */
  defaultDbId: number
}

export interface ShouldAutoSnapshotResult {
  should: boolean
  reason: 'destructive-non-default' | 'non-destructive' | 'default-db' | 'no-db'
}

/**
 * Decide whether the playground should auto-capture a pre-destructive
 * snapshot before running the given statements.
 *
 * The decision is `true` **iff**:
 *  - the Worker is ready (`dbId != null`),
 *  - at least one statement is destructive (`requiresCheckpoint`),
 *  - and the active dbId is **not** the built-in playground (the
 *    playground is reset on every app start; auto-snapshots would
 *    be noise).
 *
 * The function returns a tagged result so tests can assert the
 * exact branch (not just the boolean).
 */
export function shouldAutoSnapshot(input: ShouldAutoSnapshotInput): ShouldAutoSnapshotResult {
  if (input.dbId == null) {
    return { should: false, reason: 'no-db' }
  }
  if (input.dbId === input.defaultDbId) {
    return { should: false, reason: 'default-db' }
  }
  if (!isDestructive(input.statements)) {
    return { should: false, reason: 'non-destructive' }
  }
  return { should: true, reason: 'destructive-non-default' }
}

/* ------------------------------------------------------------------ *
 *  Pipeline composition                                                 *
 * ------------------------------------------------------------------ */

export interface ExecuteDeps {
  /** Run the SQL through the worker's `useQuery` pipeline. */
  run: (sql: string) => Promise<unknown>
  /**
   * Capture a snapshot. Throwing is **non-fatal** — the pipeline
   * swallows the error and proceeds with the run.
   */
  captureSnapshot: (dbId: number) => Promise<unknown>
  /** Mark the schema cache stale. */
  invalidateSchema: () => void
  /** Re-fetch the schema. */
  refreshSchema: () => Promise<unknown> | void
}

export interface ExecuteInput {
  sql: string
  dbId: number | null
  defaultDbId: number
  deps: ExecuteDeps
}

export interface ExecuteResult {
  /** Did the pipeline capture a snapshot? */
  snapshotted: boolean
  /** Reason for the snapshot decision (for tests + telemetry). */
  snapshotReason: ShouldAutoSnapshotResult['reason']
  /** Did the pipeline re-introspect the schema after the run? */
  reIntrospected: boolean
  /** The error swallowed by the snapshot step, if any. */
  snapshotError: unknown
}

/**
 * Run the full playground pipeline. Used by the page's
 * `handleExecute` callback; the React layer just wires the deps.
 *
 * Early-return: when `dbId == null` (the Worker is not ready or
 * the user has not selected a DB), the pipeline is a no-op and
 * returns a result with every flag set to `false`. This matches
 * the original `handleExecute` behaviour in the page
 * (`if (!api || dbId == null) return`).
 *
 * The pipeline is **idempotent on snapshot errors**: a snapshot
 * failure is recorded in `snapshotError` but the run still
 * proceeds. A `run` failure is propagated as a thrown error.
 */
export async function runPlaygroundPipeline(input: ExecuteInput): Promise<ExecuteResult> {
  const { sql, dbId, defaultDbId, deps } = input
  if (dbId == null) {
    return {
      snapshotted: false,
      snapshotReason: 'no-db',
      reIntrospected: false,
      snapshotError: null,
    }
  }
  const statements = analyze(sql)
  const decision = shouldAutoSnapshot({
    statements,
    dbId,
    defaultDbId,
  })

  let snapshotError: unknown = null
  if (decision.should) {
    try {
      await deps.captureSnapshot(dbId)
    } catch (e) {
      // Non-fatal — the user still wants their query to run.
      snapshotError = e
    }
  }

  await deps.run(sql)

  const reIntrospected = isDdl(statements)
  if (reIntrospected) {
    deps.invalidateSchema()
    void deps.refreshSchema()
  }

  return {
    snapshotted: decision.should && snapshotError === null,
    snapshotReason: decision.reason,
    reIntrospected,
    snapshotError,
  }
}
