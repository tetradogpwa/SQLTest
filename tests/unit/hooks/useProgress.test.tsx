/**
 * Tests for `useProgress`.
 *
 * Strategy:
 *  - Use the `useLiveQuery` machinery via `@testing-library/react` to
 *    assert that the hook reacts to changes in the underlying Dexie
 *    tables.
 *  - Inject a fresh `SqlAcademyDB` via `createTestDb` so each test
 *    gets a hermetic store. The hook uses the module-level
 *    `progressStore` singleton — we monkey-patch the `db` field on it
 *    before mounting the harness and restore it in `afterEach`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'

import { useProgress, type UseProgressResult } from '../../../src/hooks/useProgress'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'

let testDb: SqlAcademyDB | null = null
let originalDb: SqlAcademyDB | null = null

beforeEach(async () => {
  testDb = createTestDb()
  // The hook reads `progressStore.db` directly. Swap the underlying
  // db on the singleton so we use the test instance.
  const mod = await import('../../../src/core/persistence/progress-store')
  originalDb = (mod.progressStore as unknown as { db: SqlAcademyDB }).db ?? null
  ;(mod.progressStore as unknown as { db: SqlAcademyDB }).db = testDb
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  if (testDb) await resetTestDb(testDb)
  testDb = null
  if (originalDb) {
    const mod = await import('../../../src/core/persistence/progress-store')
    ;(mod.progressStore as unknown as { db: SqlAcademyDB }).db = originalDb
  }
})

interface Snapshot {
  state: UseProgressResult
}

let latest: Snapshot | null = null

function Harness(): ReactNode {
  const state = useProgress()
  useEffect(() => {
    latest = { state }
  })
  return null
}

async function getMod() {
  return import('../../../src/core/persistence/progress-store')
}

describe('useProgress', () => {
  it('returns an empty completed set on a fresh store', async () => {
    render(<Harness />)
    await waitFor(() => expect(latest).not.toBeNull())
    expect(latest!.state.completedExerciseIds.size).toBe(0)
    expect(latest!.state.attemptedExerciseIds.size).toBe(0)
    expect(latest!.state.completedLessonIds.size).toBe(0)
    expect(latest!.state.completionByLevel.size).toBeGreaterThan(0)
  })

  it('reflects markExerciseCompleted in completedExerciseIds', async () => {
    render(<Harness />)
    await waitFor(() => expect(latest).not.toBeNull())
    const mod = await getMod()
    await act(async () => {
      await mod.progressStore.markExerciseCompleted('L1.1-e1', 'L1.1')
    })
    await waitFor(() => {
      expect(latest!.state.completedExerciseIds.has('L1.1-e1')).toBe(true)
    })
  })

  it('records attempted exercises without marking them completed', async () => {
    render(<Harness />)
    await waitFor(() => expect(latest).not.toBeNull())
    const mod = await getMod()
    await act(async () => {
      await mod.progressStore.markExerciseAttempted('L1.1-e2', 'L1.1', false)
    })
    await waitFor(() => {
      expect(latest!.state.attemptedExerciseIds.has('L1.1-e2')).toBe(true)
    })
    expect(latest!.state.completedExerciseIds.has('L1.1-e2')).toBe(false)
  })

  it('completes a lesson once all of its exercises are done', async () => {
    render(<Harness />)
    await waitFor(() => expect(latest).not.toBeNull())
    const mod = await getMod()
    // L1.1 has 7 exercises in the seeded content. We mark them all.
    const exerciseIds = [
      'L1.1-e1',
      'L1.1-e2',
      'L1.1-e3',
      'L1.1-e4',
      'L1.1-e5',
      'L1.1-e6',
      'L1.1-e7',
    ]
    await act(async () => {
      for (const id of exerciseIds) {
        await mod.progressStore.markExerciseCompleted(id, 'L1.1')
      }
    })
    await waitFor(() => {
      expect(latest!.state.completedLessonIds.has('L1.1')).toBe(true)
    })
  })

  it('computes completionByLevel correctly (done / total / pct)', async () => {
    render(<Harness />)
    await waitFor(() => expect(latest).not.toBeNull())
    const mod = await getMod()
    // Mark one of library's exercises as complete (6 of 24).
    await act(async () => {
      await mod.progressStore.markExerciseCompleted('L1.1-e1', 'L1.1')
    })
    await waitFor(() => {
      const completion = latest!.state.completionByLevel.get('L1')
      expect(completion).toBeDefined()
      expect(completion!.done).toBe(1)
      expect(completion!.total).toBeGreaterThan(0)
      expect(completion!.pct).toBeGreaterThan(0)
      expect(completion!.pct).toBeLessThanOrEqual(1)
    })
  })

  it('markCompleted marks the lesson complete when the last exercise finishes', async () => {
    render(<Harness />)
    await waitFor(() => expect(latest).not.toBeNull())
    const mod = await getMod()
    // Pre-fill 6 of the 7 exercises in L1.1.
    const ids = ['L1.1-e1', 'L1.1-e2', 'L1.1-e3', 'L1.1-e4', 'L1.1-e5', 'L1.1-e6']
    for (const id of ids) {
      await mod.progressStore.markExerciseCompleted(id, 'L1.1')
    }
    // Use the hook's markCompleted to finish the lesson.
    await act(async () => {
      await latest!.state.markCompleted('L1.1-e7', 'L1.1')
    })
    await waitFor(() => {
      expect(latest!.state.completedLessonIds.has('L1.1')).toBe(true)
    })
  })

  it('reset() wipes all progress', async () => {
    render(<Harness />)
    await waitFor(() => expect(latest).not.toBeNull())
    const mod = await getMod()
    await act(async () => {
      await mod.progressStore.markExerciseCompleted('L1.1-e1', 'L1.1')
    })
    await waitFor(() => {
      expect(latest!.state.completedExerciseIds.has('L1.1-e1')).toBe(true)
    })
    await act(async () => {
      await latest!.state.reset()
    })
    await waitFor(() => {
      expect(latest!.state.completedExerciseIds.size).toBe(0)
    })
  })

  it('loads the course and exposes it on the result', async () => {
    render(<Harness />)
    await waitFor(() => expect(latest).not.toBeNull())
    expect(latest!.state.course).toBeDefined()
    expect(latest!.state.course.levels.length).toBeGreaterThan(0)
  })
})
