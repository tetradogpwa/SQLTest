/**
 * Unit tests for TimeoutController.
 *
 * The controller is decoupled from `wa-sqlite`; the test uses a fake
 * SQLiteForTimeout that records every `progress_handler` call so we
 * can assert:
 *   - the handler is registered with vmSteps=1000 (POC-2 verdict)
 *   - `start` records the start time + cap
 *   - the registered handler returns 1 when the timeout elapses
 *   - `stop` unregisters the handler
 *   - `cancel` registers a 0ms handler (effective immediate cancel)
 *   - the static INTERRUPT_RC is SQLITE_INTERRUPT
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  TimeoutController,
  TIMEOUT_CONFIG,
  type SQLiteForTimeout,
} from '../../src/workers/timeout-controller'
import * as SQLite from 'wa-sqlite/src/sqlite-constants.js'

interface HandlerCall {
  db: number
  nOps: number
  fn: ((userData: unknown) => number) | null
  userData: unknown
}

class FakeSqlite implements SQLiteForTimeout {
  calls: HandlerCall[] = []
  /** Current "wall clock" override; tests advance it via `setNow`. */
  now = 1_000_000

  progress_handler(
    db: number,
    nProgressOps: number,
    handler: ((userData: unknown) => number) | null,
    userData: unknown,
  ): void {
    this.calls.push({ db, nOps: nProgressOps, fn: handler, userData })
  }

  setNow(n: number) {
    this.now = n
  }
}

describe('TimeoutController', () => {
  let fake: FakeSqlite
  let controller: TimeoutController

  beforeEach(() => {
    fake = new FakeSqlite()
    controller = new TimeoutController(fake, {
      ...TIMEOUT_CONFIG,
      defaultMs: 100,
      now: () => fake.now,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers a progress handler with vmSteps=1000 (POC-2 verdict)', () => {
    controller.start(42, 5000)
    const call = fake.calls.at(-1)!
    expect(call.db).toBe(42)
    expect(call.nOps).toBe(1000)
    expect(typeof call.fn).toBe('function')
  })

  it('the registered handler returns 0 when the timeout has not elapsed', () => {
    controller.start(42, 1000)
    const call = fake.calls.at(-1)!
    fake.setNow(fake.now + 500) // +500 ms
    const result = call.fn!(null)
    expect(result).toBe(0)
  })

  it('the registered handler returns 1 (cancel) when the timeout has elapsed', () => {
    controller.start(42, 100)
    const call = fake.calls.at(-1)!
    fake.setNow(fake.now + 101) // +101 ms, past the 100 ms cap
    const result = call.fn!(null)
    expect(result).toBe(1)
  })

  it('stop() unregisters the handler (nOps=0, fn=null)', () => {
    controller.start(42, 1000)
    controller.stop(42)
    const stopCall = fake.calls.at(-1)!
    expect(stopCall.db).toBe(42)
    expect(stopCall.nOps).toBe(0)
    expect(stopCall.fn).toBeNull()
  })

  it('isActive() reflects current state', () => {
    expect(controller.isActive(42)).toBe(false)
    controller.start(42, 1000)
    expect(controller.isActive(42)).toBe(true)
    controller.stop(42)
    expect(controller.isActive(42)).toBe(false)
  })

  it('elapsedMs() advances as time passes', () => {
    controller.start(42, 1000)
    fake.setNow(fake.now + 200)
    expect(controller.elapsedMs(42)).toBe(200)
  })

  it('cancel(db) registers a 0ms cap (cancels on next tick)', () => {
    controller.start(42, 5_000)
    controller.cancel(42)
    const cancelCall = fake.calls.at(-1)!
    expect(cancelCall.db).toBe(42)
    expect(cancelCall.nOps).toBe(1000)
    // Any call to the handler now returns 1 (immediate cancel).
    expect(cancelCall.fn!(null)).toBe(1)
  })

  it('repeated start() replaces the previous handler', () => {
    controller.start(42, 1000)
    const first = fake.calls.at(-1)!
    controller.start(42, 5000)
    const second = fake.calls.at(-1)!
    expect(first).not.toBe(second)
    expect(second.nOps).toBe(1000)
  })

  it('INTERRUPT_RC matches SQLite.SQLITE_INTERRUPT', () => {
    expect(TimeoutController.INTERRUPT_RC).toBe(SQLite.SQLITE_INTERRUPT)
  })

  it('respects the default timeout from the injected config', () => {
    const ctrl = new TimeoutController(fake, {
      ...TIMEOUT_CONFIG,
      defaultMs: 999,
      now: () => fake.now,
    })
    ctrl.start(7)
    const call = fake.calls.at(-1)!
    fake.setNow(fake.now + 998)
    expect(call.fn!(null)).toBe(0)
    fake.setNow(fake.now + 2)
    expect(call.fn!(null)).toBe(1)
  })

  it('exposes the heavy / default timeouts', () => {
    expect(controller.getDefaultTimeoutMs()).toBe(100)
    expect(controller.getHeavyTimeoutMs()).toBe(30_000)
  })
})
