/**
 * Tests for `useExercise`.
 *
 * Strategy:
 *  - Provide a fake `DBApi` (built with `mkApiMock` from the existing
 *    test helper) and the simplest possible StorageCapability.
 *  - The hook resolves the exercise from the catalog, so we pick a
 *    real exerciseId from the seeded content (`L1.1-e1`).
 *  - We don't render `<ExerciseView>` here — the hook is the unit under
 *    test. We assert on the `UseExerciseResult` it returns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'

import { useExercise, type UseExerciseResult } from '../../../src/hooks/useExercise'
import { mkApiMock } from '../../helpers/dbapi-mock'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'
import { ProgressStore } from '../../../src/core/persistence/progress-store'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'

let testDb: SqlAcademyDB | null = null
let originalDb: SqlAcademyDB | null = null

beforeEach(async () => {
  testDb = createTestDb()
  const mod = await import('../../../src/core/persistence/progress-store')
  originalDb = (mod.progressStore as unknown as { db: SqlAcademyDB }).db ?? null
  ;(mod.progressStore as unknown as { db: SqlAcademyDB }).db = testDb
  // Silence the unused-import warning for the class itself.
  void ProgressStore
})

afterEach(async () => {
  cleanup()
  if (testDb) await resetTestDb(testDb)
  testDb = null
  if (originalDb) {
    const mod = await import('../../../src/core/persistence/progress-store')
    ;(mod.progressStore as unknown as { db: SqlAcademyDB }).db = originalDb
  }
})

interface Holder {
  state: UseExerciseResult | null
}

const holder: Holder = { state: null }

function HookHarness({ exerciseId, api }: { exerciseId: string; api: ReturnType<typeof mkApiMock> }) {
  const state = useExercise(exerciseId, api, 'memory')
  useEffect(() => {
    holder.state = state
  })
  return null
}

void vi // satisfy the noUnusedLocals rule for the `vi` import in some lint configs.

async function getProgress() {
  return import('../../../src/core/persistence/progress-store')
}

describe('useExercise', () => {
  it('auto-starts and reaches the ready state', async () => {
    const api = mkApiMock()
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => {
      expect(holder.state).not.toBeNull()
      expect(holder.state!.status).toBe('ready')
    })
    // The runner should have called open + (optionally) the seed.
    expect(api.open).toHaveBeenCalled()
  })

  it('run(sql) executes and stores the result', async () => {
    const api = mkApiMock({
      exec: async () => ({
        ok: true,
        columns: ['id'],
        rows: [[1]],
        executionMs: 1,
        statementKind: 'select',
      }),
    })
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    await act(async () => {
      await holder.state!.run('SELECT 1')
    })
    expect(holder.state!.lastResult).not.toBeNull()
    expect(holder.state!.lastResult?.ok).toBe(true)
    expect(api.exec).toHaveBeenCalled()
  })

  it('run(sql) captures errors and exposes a SerializedError', async () => {
    const api = mkApiMock({
      exec: async () => ({
        ok: false,
        error: {
          code: 'SQLITE_ERROR',
          message: 'no such table: foo',
          translatedMessage: 'No existe la tabla `foo`.',
        },
        executionMs: 1,
        statementKind: 'select',
      }),
    })
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    await act(async () => {
      await holder.state!.run('SELECT * FROM foo')
    })
    expect(holder.state!.lastError).not.toBeNull()
    expect(holder.state!.lastError?.code).toBe('SQLITE_ERROR')
  })

  it('check() marks the exercise completed on a full pass', async () => {
    const api = mkApiMock({
      // Both user SQL and solution SQL succeed.
      exec: async () => ({
        ok: true,
        columns: ['id', 'titulo', 'anio_publicacion'],
        rows: [[1, 'A', 2000]],
        executionMs: 1,
        statementKind: 'select',
      }),
      // Same schema for both copies.
      schema: async () => ({
        tables: [
          {
            name: 'libros',
            columns: [
              { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, primaryKeyPosition: 1 },
              { name: 'titulo', type: 'TEXT', nullable: false, defaultValue: null, primaryKeyPosition: 0 },
              { name: 'anio_publicacion', type: 'INTEGER', nullable: true, defaultValue: null, primaryKeyPosition: 0 },
            ],
            primaryKey: ['id'],
            foreignKeys: [],
            uniqueConstraints: [],
            checkConstraints: [],
            rowCountEstimate: 0,
            createSql: '',
          },
        ],
        views: [],
        indexes: [],
        triggers: [],
      }),
    })
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    // The runner needs at least one run before check.
    await act(async () => {
      await holder.state!.run('SELECT id, titulo, anio_publicacion FROM libros ORDER BY id ASC')
    })
    await act(async () => {
      const report = await holder.state!.check()
      expect(report.allPassed).toBe(true)
    })
    expect(holder.state!.checkReport?.allPassed).toBe(true)
    // The hook should have written a progress row.
    const mod = await getProgress()
    const rows = await mod.progressStore['db'].progress.toArray()
    expect(rows.length).toBe(1)
    expect(rows[0]?.exerciseId).toBe('L1.1-e1')
  })

  it('check() records a failed attempt when the report is not allPassed', async () => {
    // The runner calls exec() for the user SQL twice (once in run(),
    // once in check()) and then for the solution. We make the user
    // SQL return 1 row and the solution SQL return 2 rows so the
    // comparator reports a mismatch.
    const api = mkApiMock({
      exec: async (_dbId, sql) => {
        const isSolution = /ORDER BY id ASC/.test(sql)
        if (isSolution) {
          return {
            ok: true,
            columns: ['id', 'titulo', 'anio_publicacion'],
            rows: [
              [1, 'A', 2000],
              [2, 'B', 2010],
            ],
            executionMs: 1,
            statementKind: 'select',
          }
        }
        // User SQL: 1 row.
        return {
          ok: true,
          columns: ['id', 'titulo', 'anio_publicacion'],
          rows: [[1, 'A', 2000]],
          executionMs: 1,
          statementKind: 'select',
        }
      },
      schema: async () => ({ tables: [], views: [], indexes: [], triggers: [] }),
    })
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    await act(async () => {
      await holder.state!.run('SELECT id, titulo, anio_publicacion FROM libros')
    })
    await act(async () => {
      const report = await holder.state!.check()
      expect(report.allPassed).toBe(false)
    })
    // Failed submit should bump `attempts` and record an exerciseStats row.
    await waitFor(() => expect(holder.state!.attempts).toBe(1))
    const mod = await getProgress()
    const stats = await mod.progressStore['db'].exerciseStats.toArray()
    expect(stats.length).toBe(1)
  })

  it('revealNextHint() returns the next hint and increments the counter', async () => {
    // User SQL returns 1 row; solution returns 2 rows. The check
    // fails and bumps `attempts` to 1, which unlocks the first hint
    // (which has `after: 'after-failure'`).
    const api = mkApiMock({
      exec: async (_dbId, sql) => {
        const isSolution = /ORDER BY id ASC/.test(sql)
        if (isSolution) {
          return {
            ok: true,
            columns: ['id', 'titulo', 'anio_publicacion'],
            rows: [
              [1, 'A', 2000],
              [2, 'B', 2010],
            ],
            executionMs: 1,
            statementKind: 'select',
          }
        }
        return {
          ok: true,
          columns: ['id', 'titulo', 'anio_publicacion'],
          rows: [[1, 'A', 2000]],
          executionMs: 1,
          statementKind: 'select',
        }
      },
    })
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    await act(async () => {
      await holder.state!.run('SELECT id, titulo, anio_publicacion FROM libros')
    })
    await act(async () => {
      await holder.state!.check()
    })
    await waitFor(() => expect(holder.state!.attempts).toBe(1))
    // Now `after-failure` is satisfied and the first hint is unlocked.
    const hint1 = holder.state!.revealNextHint()
    expect(hint1).not.toBeNull()
    // Wait for the state to reflect the increment.
    await waitFor(() => expect(holder.state!.hintsRevealed).toBe(1))
  })

  it('revealSolution() populates the solution state', async () => {
    const api = mkApiMock({
      exec: async () => ({
        ok: true,
        columns: [],
        rows: [],
        executionMs: 1,
        statementKind: 'select',
      }),
    })
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    await act(async () => {
      await holder.state!.revealSolution()
    })
    expect(holder.state!.solution).not.toBeNull()
    expect(holder.state!.solution!.sql).toContain('SELECT')
    expect(holder.state!.solution!.explanation.length).toBeGreaterThan(0)
  })

  it('reset() clears transient state but keeps the runner alive', async () => {
    const api = mkApiMock()
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    await act(async () => {
      await holder.state!.run('SELECT 1')
    })
    expect(holder.state!.lastResult).not.toBeNull()
    await act(async () => {
      await holder.state!.reset()
    })
    expect(holder.state!.lastResult).toBeNull()
    expect(holder.state!.lastError).toBeNull()
    expect(holder.state!.checkReport).toBeNull()
    expect(holder.state!.status).toBe('ready')
  })

  it('destroy() called directly invokes the runner cleanup', async () => {
    const api = mkApiMock()
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    // Calling `destroy()` from the hook should call `runner.destroy()`
    // synchronously. After that, the runner is in `destroyed` state
    // and any further call throws.
    await act(async () => {
      holder.state!.destroy()
    })
    expect(() => holder.state!.runner.runUserSql('SELECT 1')).rejects.toThrow(/destroyed/i)
  })

  it('run() surfaces a Comlink-style thrown error (worker died)', async () => {
    const api = mkApiMock({
      exec: async () => {
        // The runner.runUserSql awaits `api.exec(...)`; if the
        // promise rejects, the hook catches + maps to UNEXPECTED.
        throw {
          code: 'WORKER_TERMINATED',
          message: 'Worker died',
          translatedMessage: 'El motor SQL se ha interrumpido.',
        }
      },
    })
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    await act(async () => {
      await holder.state!.run('SELECT 1')
    })
    expect(holder.state!.lastError).not.toBeNull()
    expect(holder.state!.lastError?.code).toBe('WORKER_TERMINATED')
    // Status falls back to `failed` when the run throws (the runner
    // itself does not recover).
    expect(holder.state!.status).toBe('failed')
  })

  it('run() surfaces a native Error thrown synchronously', async () => {
    const api = mkApiMock({
      exec: async () => {
        throw new Error('boom')
      },
    })
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    await act(async () => {
      await holder.state!.run('SELECT 1')
    })
    expect(holder.state!.lastError).not.toBeNull()
    expect(holder.state!.lastError?.code).toBe('UNEXPECTED')
    expect(holder.state!.lastError?.message).toBe('boom')
  })

  it('check() with a thrown error builds a defensive failure report (never throws)', async () => {
    const api = mkApiMock()
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    // Destroy the runner directly so the next `check()` call throws
    // `ExerciseRunner.destroyed: ...`. The hook's catch arm wraps
    // the error into a synthetic `ValidationReport`.
    await act(async () => {
      holder.state!.runner.destroy()
    })
    let report
    await act(async () => {
      report = await holder.state!.check()
    })
    expect(report).toBeDefined()
    expect(report!.allPassed).toBe(false)
    expect(report!.failedCount).toBe(1)
    expect(report!.results[0]?.passed).toBe(false)
    // The error is also surfaced via `lastError`.
    expect(holder.state!.lastError).not.toBeNull()
  })

  it('start() failure transitions the hook to `failed` and surfaces a SerializedError', async () => {
    // `api.open` rejects → runner.start() throws → the useEffect
    // catch arm runs and sets status to 'failed' + lastError. The
    // runner wraps the error message before the hook sees it, so
    // we just assert that *some* error is surfaced.
    const api = mkApiMock({
      open: async () => {
        throw new Error('OPFS unavailable')
      },
    })
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('failed'))
    expect(holder.state?.lastError).not.toBeNull()
    expect(holder.state?.lastError?.code).toBe('UNEXPECTED')
    expect(holder.state?.lastError?.message).toMatch(/OPFS|abrir|runner/i)
  })

  it('revealNextHint() returns null when no hint is unlocked (attempts=0)', async () => {
    // The seed hints are gated by `after-failure` / `after-N-failures`
    // — with attempts=0, none are unlocked yet. The function
    // returns null and `hintsRevealed` stays at 0.
    const api = mkApiMock()
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    const hint = holder.state!.revealNextHint()
    expect(hint).toBeNull()
    expect(holder.state!.hintsRevealed).toBe(0)
  })

  it('revealNextHint() does not increment the counter when returning null', async () => {
    const api = mkApiMock()
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    for (let i = 0; i < 5; i += 1) {
      void holder.state!.revealNextHint()
    }
    expect(holder.state!.hintsRevealed).toBe(0)
  })

  it('revealSolution() sets a placeholder when the exercise has no solution', async () => {
    // Pick an exercise that does have a solution (the seed). To
    // test the no-solution branch, we patch the exercise object
    // through the resolved context by mounting a harness that
    // looks up an unknown id (the placeholder returns no solution).
    const api = mkApiMock()
    function NoSolutionHarness(): ReactNode {
      const state = useExercise('nonexistent-exercise-id', api, 'memory')
      useEffect(() => {
        holder.state = state
      })
      return null
    }
    render(<NoSolutionHarness />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    await act(async () => {
      await holder.state!.revealSolution()
    })
    expect(holder.state!.solution).not.toBeNull()
    expect(holder.state!.solution?.sql).toBe('')
    expect(holder.state!.solution?.explanation).toMatch(/no tiene una solución/i)
  })

  it('does NOT bump attempts on a successful check()', async () => {
    // The "marks the exercise completed" test already covers
    // allPassed=true; here we explicitly assert that attempts stays
    // at 0 so we have a focused test for that branch.
    const api = mkApiMock({
      exec: async () => ({
        ok: true,
        columns: ['id', 'titulo', 'anio_publicacion'],
        rows: [[1, 'A', 2000]],
        executionMs: 1,
        statementKind: 'select',
      }),
      schema: async () => ({
        tables: [
          {
            name: 'libros',
            columns: [
              { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, primaryKeyPosition: 1 },
              { name: 'titulo', type: 'TEXT', nullable: false, defaultValue: null, primaryKeyPosition: 0 },
              { name: 'anio_publicacion', type: 'INTEGER', nullable: true, defaultValue: null, primaryKeyPosition: 0 },
            ],
            primaryKey: ['id'],
            foreignKeys: [],
            uniqueConstraints: [],
            checkConstraints: [],
            rowCountEstimate: 0,
            createSql: '',
          },
        ],
        views: [],
        indexes: [],
        triggers: [],
      }),
    })
    render(<HookHarness exerciseId="L1.1-e1" api={api} />)
    await waitFor(() => expect(holder.state?.status).toBe('ready'))
    await act(async () => {
      await holder.state!.run('SELECT id, titulo, anio_publicacion FROM libros ORDER BY id ASC')
    })
    await act(async () => {
      await holder.state!.check()
    })
    expect(holder.state!.attempts).toBe(0)
  })
})
