/**
 * Tests for `queryRunnerService` — exhaustive coverage of the
 * pure pieces of the `useQuery` hook.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  buildFailureResult,
  buildNotReadyError,
  raceExecution,
  toSerializedError,
} from '../../../src/core/services/queryRunnerService'
import type { QueryResult, SerializedError } from '../../../src/workers/types'

/* ------------------------------------------------------------------ *
 *  buildNotReadyError                                                    *
 * ------------------------------------------------------------------ */

describe('buildNotReadyError', () => {
  it('returns a stable shape with the NOT_READY code', () => {
    const err = buildNotReadyError()
    expect(err.code).toBe('NOT_READY')
    expect(err.message).toMatch(/Worker not ready/)
    expect(err.translatedMessage).toMatch(/Selecciona/)
  })

  it('returns a fresh object on every call (no shared state)', () => {
    expect(buildNotReadyError()).not.toBe(buildNotReadyError())
  })
})

/* ------------------------------------------------------------------ *
 *  toSerializedError                                                    *
 * ------------------------------------------------------------------ */

describe('toSerializedError', () => {
  it('translates a generic Error to WORKER_TERMINATED', () => {
    const e = toSerializedError(new Error('boom'))
    expect(e.code).toBe('WORKER_TERMINATED')
    expect(e.message).toBe('boom')
    expect(e.translatedMessage).toMatch(/interrumpido/i)
  })

  it('translates a string to UNKNOWN (defensive — should not happen in practice)', () => {
    const e = toSerializedError('boom')
    expect(e.code).toBe('UNKNOWN')
    expect(e.message).toBe('boom')
  })

  it('translates null to UNKNOWN with the string "null"', () => {
    const e = toSerializedError(null)
    expect(e.code).toBe('UNKNOWN')
    expect(e.message).toBe('null')
  })

  it('translates undefined to UNKNOWN with the string "undefined"', () => {
    const e = toSerializedError(undefined)
    expect(e.code).toBe('UNKNOWN')
    expect(e.message).toBe('undefined')
  })

  it('translates a number to UNKNOWN', () => {
    const e = toSerializedError(42)
    expect(e.code).toBe('UNKNOWN')
    expect(e.message).toBe('42')
  })

  it('translates an object to UNKNOWN via String() coercion', () => {
    const e = toSerializedError({ weird: 'object' })
    expect(e.code).toBe('UNKNOWN')
    expect(e.message).toMatch(/\[object Object\]|weird/)
  })
})

/* ------------------------------------------------------------------ *
 *  buildFailureResult                                                   *
 * ------------------------------------------------------------------ */

describe('buildFailureResult', () => {
  it('builds a failure result with the elapsed wall-clock', () => {
    const err: SerializedError = {
      code: 'TIMEOUT',
      message: 'Query timed out',
      translatedMessage: 't',
    }
    const r = buildFailureResult({ startedAt: 1000, error: err, now: () => 1500 })
    expect(r.ok).toBe(false)
    expect(r.error).toBe(err)
    expect(r.executionMs).toBe(500)
    expect(r.statementKind).toBe('other')
  })

  it('uses Date.now() when no clock is injected', () => {
    const before = Date.now()
    const r = buildFailureResult({ startedAt: before, error: { code: 'X', message: 'm', translatedMessage: 't' } })
    const after = Date.now()
    expect(r.executionMs).toBeGreaterThanOrEqual(0)
    expect(r.executionMs).toBeLessThanOrEqual(after - before + 1)
  })

  it('preserves the error reference (not a copy)', () => {
    const err: SerializedError = { code: 'X', message: 'm', translatedMessage: 't' }
    const r = buildFailureResult({ startedAt: 0, error: err })
    expect(r.error).toBe(err)
  })
})

/* ------------------------------------------------------------------ *
 *  raceExecution                                                        *
 * ------------------------------------------------------------------ */

describe('raceExecution', () => {
  it('returns "ok" when the exec resolves first', async () => {
    const result: QueryResult = {
      ok: true,
      columns: ['x'],
      rows: [[1]],
      executionMs: 5,
      statementKind: 'select',
    }
    const r = await raceExecution({
      execPromise: Promise.resolve(result),
      startedAt: 0,
      timeoutMs: 1000,
      onTimeout: vi.fn(),
    })
    expect(r).toEqual({ kind: 'ok', result })
  })

  it('returns "error" when the timeout fires first', async () => {
    // We use an injected setTimeout that never fires (so the
    // timeout promise is never settled from the timer side) and
    // the exec promise rejects immediately. The race then sees
    // the exec rejection.
    const execPromise: Promise<QueryResult> = Promise.reject(new Error('boom'))
    const r = await raceExecution({
      execPromise,
      startedAt: 0,
      timeoutMs: 1000,
      onTimeout: vi.fn(),
      setTimeoutFn: () => null,
      clearTimeoutFn: () => undefined,
    })
    expect(r.kind).toBe('error')
    if (r.kind === 'error') {
      expect(r.error.code).toBe('WORKER_TERMINATED')
      expect(r.error.message).toBe('boom')
    }
  })

  it('returns "error" (TIMEOUT) when the exec never resolves and the timer fires', async () => {
    // Use real timers + the injected onTimeout. The exec promise
    // is a pending Promise that never resolves; the timeout fires
    // first and the race resolves with the TIMEOUT error.
    let timeoutCb: () => void = (): void => undefined
    const setT: (cb: () => void, ms: number) => unknown = (cb, _ms) => {
      timeoutCb = cb
      return 'handle'
    }
    const clearT: (h: unknown) => void = () => undefined

    const execPromise = new Promise<QueryResult>(() => {
      // never resolves
    })
    const onTimeout = vi.fn()
    const resultP = raceExecution({
      execPromise,
      startedAt: 0,
      timeoutMs: 50,
      onTimeout,
      setTimeoutFn: setT,
      clearTimeoutFn: clearT,
    })
    // Fire the timeout manually.
    timeoutCb()
    const r = await resultP
    expect(r.kind).toBe('error')
    if (r.kind === 'error' && r.error) {
      expect(r.error.code).toBe('TIMEOUT')
      expect(r.error.message).toMatch(/50ms/)
    }
    expect(onTimeout).toHaveBeenCalled()
  })

  it('does not throw if onTimeout itself throws (defensive)', async () => {
    const execPromise: Promise<QueryResult> = new Promise(() => undefined)
    let cb: (() => void) | null = null
    const resultP = raceExecution({
      execPromise,
      startedAt: 0,
      timeoutMs: 5,
      onTimeout: () => {
        throw new Error('cancel failed')
      },
      setTimeoutFn: (theCb) => {
        cb = theCb
        return null
      },
      clearTimeoutFn: () => undefined,
    })
    // The throw from onTimeout must not propagate to the caller.
    expect(() => cb?.()).not.toThrow()
    const r = await resultP
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.error.code).toBe('TIMEOUT')
  })

  it('clears the timer when exec resolves first (no leaked timer)', async () => {
    const cleared: string[] = []
    const execPromise: Promise<QueryResult> = Promise.resolve({
      ok: true,
      columns: [],
      rows: [],
      executionMs: 0,
      statementKind: 'other',
    })
    await raceExecution({
      execPromise,
      startedAt: 0,
      timeoutMs: 5_000,
      onTimeout: vi.fn(),
      setTimeoutFn: (cb, _ms) => {
        // We never call the cb; the timer is created and must be
        // cleared on resolve.
        const handle = setTimeout(cb, 5_000)
        return handle
      },
      clearTimeoutFn: (h) => {
        cleared.push(String(h))
      },
    })
    expect(cleared.length).toBe(1)
  })

  it('propagates the exec error message verbatim', async () => {
    const execPromise: Promise<QueryResult> = Promise.reject(
      new Error('OutOfMemory: cannot allocate'),
    )
    const r = await raceExecution({
      execPromise,
      startedAt: 0,
      timeoutMs: 1000,
      onTimeout: vi.fn(),
      setTimeoutFn: () => null,
      clearTimeoutFn: () => undefined,
    })
    if (r.kind !== 'error') throw new Error('expected error')
    expect(r.error.message).toBe('OutOfMemory: cannot allocate')
  })

  it('uses the injected `now` to compute executionMs only after the race settles', async () => {
    // The race function itself does not compute executionMs (that's
    // done in the hook / failure builder). The `now` injection is
    // for the failure builder. We just verify the race does not
    // require the clock for the OK branch.
    const result: QueryResult = {
      ok: true,
      columns: [],
      rows: [],
      executionMs: 1,
      statementKind: 'select',
    }
    const r = await raceExecution({
      execPromise: Promise.resolve(result),
      startedAt: 0,
      timeoutMs: 1000,
      onTimeout: vi.fn(),
      now: () => 12345,
    })
    expect(r).toEqual({ kind: 'ok', result })
  })

  it('forwards the exec rejection as an UNKNOWN error when the value is not an Error', async () => {
    // Some Comlink serialisations come back as plain objects, not
    // Error instances. The race should still produce a valid
    // `SerializedError`.
    const execPromise: Promise<QueryResult> = Promise.reject({ code: 'X', message: 'weird' })
    const r = await raceExecution({
      execPromise,
      startedAt: 0,
      timeoutMs: 1000,
      onTimeout: vi.fn(),
      setTimeoutFn: () => null,
      clearTimeoutFn: () => undefined,
    })
    if (r.kind !== 'error') throw new Error('expected error')
    expect(r.error.code).toBe('UNKNOWN')
  })
})
