/**
 * Small helpers shared by the worker modules.
 *
 * This file intentionally does NOT export any heavy implementation; it
 * is a place for utilities that:
 *   - Are used by two or more worker modules (types, result-shaping).
 *   - Need to be unit-testable without spinning up wa-sqlite.
 *
 * The POC found that `sqlite3_serialize` / `sqlite3_deserialize` are not
 * available in wa-sqlite 1.0.0, so the helpers here avoid relying on
 * them — `VACUUM INTO` is the canonical snapshot / export path.
 */

import type {
  AnalyzedStatement,
  SerializedError,
  StatementKind,
} from './types'

/* ──────────────────────────────────────────────────────────────────── *
 *  Type re-exports                                                      *
 * ──────────────────────────────────────────────────────────────────── */

export type { SerializedError, StatementKind, AnalyzedStatement }

/* ──────────────────────────────────────────────────────────────────── *
 *  Result limits                                                        *
 * ──────────────────────────────────────────────────────────────────── */

export const RESULT_LIMITS = {
  /** Hard cap on rows returned to the Main Thread. */
  maxRows: 10_000,
  /** Soft warning threshold — UI shows a hint above this. */
  warningThreshold: 1_000,
  /** Max byte size for serialised query results (~5 MB). */
  maxBytes: 5 * 1024 * 1024,
} as const

/* ──────────────────────────────────────────────────────────────────── *
 *  Path helpers                                                         *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Snapshots live at `<dbId>/<snapId>.db` inside a known root. This
 * function is the single source of truth for that mapping.
 */
export function snapshotPath(dbId: number, snapId: string): string {
  return `${dbId}/${snapId}.db`
}

/** Snapshots root (relative to whatever VFS root the manager uses). */
export const SNAPSHOTS_ROOT = '.snapshots'

/** User databases root. */
export const USER_DB_ROOT = 'user'

/** Exercise (temporary) databases root. */
export const EXERCISE_DB_ROOT = 'exercises'

/* ──────────────────────────────────────────────────────────────────── *
 *  Error coercion                                                       *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Coerce any thrown value into a JSON-serialisable object. Useful when
 * an exception needs to cross the Comlink boundary.
 */
export function toSerializedError(e: unknown): SerializedError {
  if (
    typeof e === 'object' &&
    e !== null &&
    'translatedMessage' in e &&
    'code' in e
  ) {
    return e as SerializedError
  }
  if (e instanceof Error) {
    return {
      code: 'JS_ERROR',
      message: e.message,
      translatedMessage: `[JS_ERROR] ${e.message}`,
      rc: undefined,
    }
  }
  return {
    code: 'JS_ERROR',
    message: String(e),
    translatedMessage: `[JS_ERROR] ${String(e)}`,
    rc: undefined,
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Comlink-friendly transfer of Uint8Array                             *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Comlink transfers `Uint8Array` as a copy by default, which is fine for
 * our sizes (snapshots are <10 MB). We expose this helper to make the
 * intent obvious at call sites and to keep a single chokepoint if we
 * later need to switch to `Transfer` (zero-copy) for very large blobs.
 */
export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Always copy so the caller's buffer can be GC'd after the call.
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

/** Inverse of {@link bytesToArrayBuffer} — used when receiving. */
export function arrayBufferToBytes(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf)
}
