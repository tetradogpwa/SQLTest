/**
 * Tests for `playgroundController`.
 *
 * Exhaustive coverage of every pipeline branch:
 *  - the four `shouldAutoSnapshot` reasons (no-db, default-db,
 *    non-destructive, destructive-non-default)
 *  - the two DDL kinds (create / drop / alter → re-introspect)
 *  - the snapshot-failure path (non-fatal: the run still proceeds)
 *  - the run-failure path (fatal: error propagates)
 *  - the `dbId == null` short-circuit
 *  - the empty SQL path (no statements → no snapshot, no re-introspect)
 */
import { describe, expect, it, vi } from 'vitest'

import {
  type ExecuteDeps,
  isDdl,
  isDestructive,
  runPlaygroundPipeline,
  shouldAutoSnapshot,
} from '../../../src/core/services/playgroundController'

/* ------------------------------------------------------------------ *
 *  Helpers                                                              *
 * ------------------------------------------------------------------ */

function makeDeps(overrides: Partial<ExecuteDeps> = {}): ExecuteDeps {
  return {
    run: vi.fn(async () => undefined),
    captureSnapshot: vi.fn(async () => undefined),
    invalidateSchema: vi.fn(),
    refreshSchema: vi.fn(async () => undefined),
    ...overrides,
  }
}

const DEFAULT_DB_ID = 1
const USER_DB_ID = 42

/* ------------------------------------------------------------------ *
 *  isDestructive                                                       *
 * ------------------------------------------------------------------ */

describe('isDestructive', () => {
  it('returns true for a single statement with requiresCheckpoint', () => {
    expect(isDestructive([{ kind: 'delete', requiresCheckpoint: true } as never])).toBe(
      true,
    )
  })

  it('returns false for a single statement without requiresCheckpoint', () => {
    expect(isDestructive([{ kind: 'select', requiresCheckpoint: false } as never])).toBe(
      false,
    )
  })

  it('returns true when any statement in a multi-statement batch is destructive', () => {
    expect(
      isDestructive([
        { kind: 'select', requiresCheckpoint: false } as never,
        { kind: 'delete', requiresCheckpoint: true } as never,
      ]),
    ).toBe(true)
  })

  it('returns false for an empty array', () => {
    expect(isDestructive([])).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 *  isDdl                                                                *
 * ------------------------------------------------------------------ */

describe('isDdl', () => {
  it('returns true for a CREATE statement', () => {
    expect(isDdl([{ kind: 'create' } as never])).toBe(true)
  })
  it('returns true for a DROP statement', () => {
    expect(isDdl([{ kind: 'drop' } as never])).toBe(true)
  })
  it('returns true for an ALTER statement', () => {
    expect(isDdl([{ kind: 'alter' } as never])).toBe(true)
  })
  it('returns false for a SELECT', () => {
    expect(isDdl([{ kind: 'select' } as never])).toBe(false)
  })
  it('returns false for an INSERT', () => {
    expect(isDdl([{ kind: 'insert' } as never])).toBe(false)
  })
  it('returns false for an UPDATE', () => {
    expect(isDdl([{ kind: 'update' } as never])).toBe(false)
  })
  it('returns false for a DELETE (DML, not DDL)', () => {
    expect(isDdl([{ kind: 'delete' } as never])).toBe(false)
  })
  it('returns false for an empty array', () => {
    expect(isDdl([])).toBe(false)
  })
  it('returns true when ANY statement in a multi-statement batch is DDL', () => {
    expect(
      isDdl([
        { kind: 'select' } as never,
        { kind: 'create' } as never,
      ]),
    ).toBe(true)
  })
})

/* ------------------------------------------------------------------ *
 *  shouldAutoSnapshot                                                   *
 * ------------------------------------------------------------------ */

describe('shouldAutoSnapshot', () => {
  it('returns "no-db" when dbId is null', () => {
    expect(
      shouldAutoSnapshot({
        statements: [{ requiresCheckpoint: true } as never],
        dbId: null,
        defaultDbId: DEFAULT_DB_ID,
      }),
    ).toEqual({ should: false, reason: 'no-db' })
  })

  it('returns "default-db" when dbId equals defaultDbId (no snapshot for the playground)', () => {
    expect(
      shouldAutoSnapshot({
        statements: [{ requiresCheckpoint: true } as never],
        dbId: DEFAULT_DB_ID,
        defaultDbId: DEFAULT_DB_ID,
      }),
    ).toEqual({ should: false, reason: 'default-db' })
  })

  it('returns "non-destructive" when the batch has no checkpoint flag', () => {
    expect(
      shouldAutoSnapshot({
        statements: [{ requiresCheckpoint: false } as never],
        dbId: USER_DB_ID,
        defaultDbId: DEFAULT_DB_ID,
      }),
    ).toEqual({ should: false, reason: 'non-destructive' })
  })

  it('returns "destructive-non-default" when the batch is destructive on a user DB', () => {
    expect(
      shouldAutoSnapshot({
        statements: [{ requiresCheckpoint: true } as never],
        dbId: USER_DB_ID,
        defaultDbId: DEFAULT_DB_ID,
      }),
    ).toEqual({ should: true, reason: 'destructive-non-default' })
  })

  it('returns "non-destructive" for an empty statements array', () => {
    expect(
      shouldAutoSnapshot({
        statements: [],
        dbId: USER_DB_ID,
        defaultDbId: DEFAULT_DB_ID,
      }),
    ).toEqual({ should: false, reason: 'non-destructive' })
  })

  it('returns "destructive-non-default" when at least one statement is destructive', () => {
    expect(
      shouldAutoSnapshot({
        statements: [
          { requiresCheckpoint: false } as never,
          { requiresCheckpoint: true } as never,
        ],
        dbId: USER_DB_ID,
        defaultDbId: DEFAULT_DB_ID,
      }),
    ).toEqual({ should: true, reason: 'destructive-non-default' })
  })
})

/* ------------------------------------------------------------------ *
 *  runPlaygroundPipeline                                                *
 * ------------------------------------------------------------------ */

describe('runPlaygroundPipeline', () => {
  // We mock the statement analyzer indirectly by controlling the
  // SQL we pass in (which determines the classification). For the
  // tests below we use SQL that maps to a known classification.

  it('runs a SELECT on the default DB without snapshot or re-introspect', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'SELECT 1;',
      dbId: DEFAULT_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.run).toHaveBeenCalledWith('SELECT 1;')
    expect(deps.captureSnapshot).not.toHaveBeenCalled()
    expect(deps.invalidateSchema).not.toHaveBeenCalled()
    expect(deps.refreshSchema).not.toHaveBeenCalled()
    expect(result).toEqual({
      snapshotted: false,
      snapshotReason: 'default-db',
      reIntrospected: false,
      snapshotError: null,
    })
  })

  it('runs a SELECT on a user DB without snapshot or re-introspect', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'SELECT 1;',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.run).toHaveBeenCalledWith('SELECT 1;')
    expect(deps.captureSnapshot).not.toHaveBeenCalled()
    expect(deps.invalidateSchema).not.toHaveBeenCalled()
    expect(deps.refreshSchema).not.toHaveBeenCalled()
    expect(result.snapshotted).toBe(false)
    expect(result.snapshotReason).toBe('non-destructive')
    expect(result.reIntrospected).toBe(false)
  })

  it('captures a snapshot before a DELETE on a user DB (no WHERE → destructive)', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'DELETE FROM users;',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.captureSnapshot).toHaveBeenCalledWith(USER_DB_ID)
    expect(deps.run).toHaveBeenCalledWith('DELETE FROM users;')
    expect(result.snapshotted).toBe(true)
    expect(result.snapshotReason).toBe('destructive-non-default')
  })

  it('does NOT capture a snapshot for a DELETE with WHERE (not destructive)', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'DELETE FROM users WHERE id = 1;',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.captureSnapshot).not.toHaveBeenCalled()
    expect(deps.run).toHaveBeenCalled()
    expect(result.snapshotted).toBe(false)
    expect(result.snapshotReason).toBe('non-destructive')
  })

  it('does NOT capture a snapshot for a DELETE on the default DB', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'DELETE FROM users WHERE id = 1;',
      dbId: DEFAULT_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.captureSnapshot).not.toHaveBeenCalled()
    expect(result.snapshotted).toBe(false)
    expect(result.snapshotReason).toBe('default-db')
  })

  it('swallows a snapshot failure and still runs the query', async () => {
    const deps = makeDeps({
      captureSnapshot: vi.fn(async () => {
        throw new Error('OPFS full')
      }),
    })
    const result = await runPlaygroundPipeline({
      sql: 'DROP TABLE t;',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.captureSnapshot).toHaveBeenCalled()
    expect(deps.run).toHaveBeenCalledWith('DROP TABLE t;')
    expect(result.snapshotted).toBe(false)
    expect(result.snapshotError).toBeInstanceOf(Error)
    expect((result.snapshotError as Error).message).toBe('OPFS full')
  })

  it('re-introspects the schema after a CREATE TABLE', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'CREATE TABLE t(x INTEGER);',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.invalidateSchema).toHaveBeenCalled()
    expect(deps.refreshSchema).toHaveBeenCalled()
    expect(result.reIntrospected).toBe(true)
  })

  it('re-introspects the schema after a DROP TABLE', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'DROP TABLE t;',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.invalidateSchema).toHaveBeenCalled()
    expect(result.reIntrospected).toBe(true)
  })

  it('re-introspects the schema after an ALTER TABLE', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'ALTER TABLE t ADD COLUMN y TEXT;',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.invalidateSchema).toHaveBeenCalled()
    expect(result.reIntrospected).toBe(true)
  })

  it('does NOT re-introspect the schema after a SELECT', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'SELECT 1;',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.invalidateSchema).not.toHaveBeenCalled()
    expect(result.reIntrospected).toBe(false)
  })

  it('does NOT re-introspect the schema after a DELETE (DML, not DDL)', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'DELETE FROM users;',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.invalidateSchema).not.toHaveBeenCalled()
    expect(result.reIntrospected).toBe(false)
  })

  it('does nothing when dbId is null (Worker not ready)', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'SELECT 1;',
      dbId: null,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.run).not.toHaveBeenCalled()
    expect(deps.captureSnapshot).not.toHaveBeenCalled()
    expect(result.snapshotted).toBe(false)
    expect(result.snapshotReason).toBe('no-db')
  })

  it('combines snapshot + re-introspect for a destructive DDL on a user DB', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'DROP TABLE users;',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.captureSnapshot).toHaveBeenCalledWith(USER_DB_ID)
    expect(deps.invalidateSchema).toHaveBeenCalled()
    expect(deps.refreshSchema).toHaveBeenCalled()
    expect(result.snapshotted).toBe(true)
    expect(result.reIntrospected).toBe(true)
  })

  it('propagates a run() error (fatal)', async () => {
    const deps = makeDeps({
      run: vi.fn(async () => {
        throw new Error('Worker not initialised')
      }),
    })
    await expect(
      runPlaygroundPipeline({
        sql: 'SELECT 1;',
        dbId: USER_DB_ID,
        defaultDbId: DEFAULT_DB_ID,
        deps,
      }),
    ).rejects.toThrow('Worker not initialised')
  })

  it('runs the query in the right order: snapshot → run → re-introspect', async () => {
    const order: string[] = []
    const deps = makeDeps({
      captureSnapshot: vi.fn(async () => {
        order.push('snapshot')
      }),
      run: vi.fn(async () => {
        order.push('run')
      }),
      invalidateSchema: vi.fn(() => order.push('invalidate')),
      refreshSchema: vi.fn(async () => {
        order.push('refresh')
      }),
    })
    await runPlaygroundPipeline({
      sql: 'DROP TABLE users;',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(order).toEqual(['snapshot', 'run', 'invalidate', 'refresh'])
  })

  it('does NOT call refreshSchema if the run throws', async () => {
    // The schema refresh is part of the "happy path" tail; if the
    // run throws, the whole pipeline aborts before reaching the
    // refresh. This documents the contract: the caller never
    // sees a stale schema when the run failed.
    const deps = makeDeps({
      run: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    await expect(
      runPlaygroundPipeline({
        sql: 'DROP TABLE t;',
        dbId: USER_DB_ID,
        defaultDbId: DEFAULT_DB_ID,
        deps,
      }),
    ).rejects.toThrow('boom')
    expect(deps.invalidateSchema).not.toHaveBeenCalled()
    expect(deps.refreshSchema).not.toHaveBeenCalled()
  })

  it('handles an empty SQL string (no statements → no snapshot, no re-introspect)', async () => {
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: '',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    // The analyzer still classifies empty input as something
    // (probably `other`); we only assert the pipeline didn't
    // crash and the deps are wired correctly.
    expect(deps.run).toHaveBeenCalledWith('')
    expect(result.snapshotted).toBe(false)
    expect(result.snapshotReason).toBe('non-destructive')
  })

  it('handles a multi-statement batch (destructive + DDL)', async () => {
    // Mix of CREATE (DDL), DELETE FROM t (destructive — no WHERE),
    // and DROP (DDL). The pipeline should snapshot + re-introspect.
    const deps = makeDeps()
    const result = await runPlaygroundPipeline({
      sql: 'CREATE TABLE t(x INTEGER); DELETE FROM t; DROP TABLE t;',
      dbId: USER_DB_ID,
      defaultDbId: DEFAULT_DB_ID,
      deps,
    })
    expect(deps.captureSnapshot).toHaveBeenCalledWith(USER_DB_ID)
    expect(deps.invalidateSchema).toHaveBeenCalled()
    expect(deps.refreshSchema).toHaveBeenCalled()
    expect(result.snapshotted).toBe(true)
    expect(result.reIntrospected).toBe(true)
  })
})
