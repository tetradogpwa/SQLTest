/**
 * Timeout controller for wa-sqlite queries.
 *
 * The Worker's only realistic way to interrupt a long-running query inside
 * the WASM module is `sqlite3_progress_handler` (POC-2 finding). The
 * C-level `sqlite3_interrupt` is **not exported** in the wa-sqlite 1.0.0
 * WASM build, so we cannot rely on it from the Main Thread either.
 *
 * Strategy (mirrors POC-2 / RESEARCH §7):
 *   1. `start(db, timeoutMs)` registers a progress handler that returns
 *      `1` (cancel) when the elapsed wall-clock time exceeds the cap.
 *      `vmSteps = 1000` is the same cadence POC-2 used to interrupt a
 *      1 M-row cross-join in <500 ms.
 *   2. `stop(db)` removes the handler (`nProgressOps = 0`).
 *   3. `cancel(db)` is a no-op alias for `start(db, 0)` — we ask SQLite
 *      to cancel on the very next progress tick. Because there is no
 *      `sqlite3_interrupt`, there is no way to interrupt from another
 *      thread; cancel only works while a query is actively running.
 *
 * The class is decoupled from `wa-sqlite` proper: it depends on a tiny
 * `SQLiteForTimeout` interface that exposes only `progress_handler`.
 * That makes it trivial to unit-test.
 */

import * as SQLite from 'wa-sqlite/src/sqlite-constants.js'

/** Minimal API the controller needs from wa-sqlite. */
export interface SQLiteForTimeout {
  progress_handler(
    db: number,
    nProgressOps: number,
    handler: ((userData: unknown) => number) | null,
    userData: unknown,
  ): void
}

/** Configurable defaults — keep in one place so they are easy to tune. */
export interface TimeoutConfig {
  defaultMs: number
  exerciseMs: number
  playgroundMs: number
  heavyOperationMs: number
  /** VM opcodes between handler invocations. POC-2 used 1000. */
  vmSteps: number
  /** Monotonic clock — defaults to `Date.now`. Injectable for tests. */
  now?: () => number
}

export const TIMEOUT_CONFIG: TimeoutConfig = {
  defaultMs: 5_000,
  exerciseMs: 3_000,
  playgroundMs: 10_000,
  heavyOperationMs: 30_000,
  vmSteps: 1000,
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Controller                                                           *
 * ──────────────────────────────────────────────────────────────────── */

export class TimeoutController {
  private readonly sqlite3: SQLiteForTimeout
  private readonly config: TimeoutConfig
  /** Maps `db → startTimestamp` for every active timeout. */
  private readonly activeStarts = new Map<number, number>()
  /** Maps `db → expected timeoutMs` for the currently active handler. */
  private readonly activeMs = new Map<number, number>()

  constructor(sqlite3: SQLiteForTimeout, config?: TimeoutConfig) {
    this.sqlite3 = sqlite3
    this.config = {
      ...TIMEOUT_CONFIG,
      ...(config ?? {}),
    }
  }

  private now(): number {
    return this.config.now ? this.config.now() : Date.now()
  }

  /**
   * Register a progress handler on `db` that will cancel the running
   * query when the wall-clock time exceeds `timeoutMs`.
   *
   * Calling `start` while another handler is active on the same `db`
   * replaces the previous one — the timestamp resets.
   */
  start(db: number, timeoutMs: number = this.config.defaultMs): void {
    const startTs = this.now()
    this.activeStarts.set(db, startTs)
    this.activeMs.set(db, timeoutMs)
    this.sqlite3.progress_handler(
      db,
      this.config.vmSteps,
      () => {
        const startedAt = this.activeStarts.get(db)
        const cap = this.activeMs.get(db)
        if (startedAt === undefined || cap === undefined) return 0
        // cap === 0 means "cancel on the very next VM tick" (used by
        // cancel()). Anything else cancels when wall-clock elapsed
        // exceeds the cap.
        if (cap <= 0) return 1
        if (this.now() - startedAt > cap) {
          // Non-zero return cancels the running query. SQLite then
          // surfaces SQLITE_INTERRUPT (rc=9), which the error translator
          // converts into a friendly Spanish message.
          return 1
        }
        return 0
      },
      /* userData */ null,
    )
  }

  /**
   * Remove the progress handler from `db`. Safe to call when no handler
   * is active.
   */
  stop(db: number): void {
    this.sqlite3.progress_handler(db, 0, null, null)
    this.activeStarts.delete(db)
    this.activeMs.delete(db)
  }

  /**
   * Best-effort cancel for the next VM tick. Waits for the handler to
   * fire. Useful when the Main Thread presses "Cancel" — the running
   * query is interrupted the next time the VM ticks.
   */
  cancel(db: number): void {
    this.start(db, 0)
  }

  /** True when a handler is currently armed for `db`. */
  isActive(db: number): boolean {
    return this.activeStarts.has(db)
  }

  /** Wall-clock ms since the current handler was installed on `db`. */
  elapsedMs(db: number): number {
    const startedAt = this.activeStarts.get(db)
    return startedAt === undefined ? 0 : this.now() - startedAt
  }

  /** Default cap for the current context. */
  getDefaultTimeoutMs(): number {
    return this.config.defaultMs
  }

  /** Heavy queries (VACUUM INTO, EXPLAIN of massive plans). */
  getHeavyTimeoutMs(): number {
    return this.config.heavyOperationMs
  }

  getConfig(): TimeoutConfig {
    return this.config
  }

  /**
   * SQLite result code the controller expects to surface when a timeout
   * fires. Exposed so the executor / error-translator can recognise it
   * without importing `sqlite-constants` themselves.
   */
  static get INTERRUPT_RC(): number {
    return SQLite.SQLITE_INTERRUPT
  }
}
