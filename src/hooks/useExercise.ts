/**
 * useExercise — orchestrates a single `ExerciseRunner` for one exercise.
 *
 * Owns the runner's lifecycle (auto-start on mount, destroy on unmount)
 * and exposes a `UseExerciseResult` that the ExerciseView can render
 * without ever touching the runner directly. Concretely:
 *
 *   - `run(sql)`            — execute SQL against the working-copy,
 *                             store the result for the next `check()`.
 *   - `check()`             — re-run + validate; mark completed in
 *                             Dexie on full pass, attempt otherwise.
 *   - `revealNextHint()`    — ask the hint engine for the next hint.
 *   - `revealSolution()`    — run the solution in a copy, expose SQL
 *                             and explanation.
 *   - `reset()`             — discard the working-copy, re-seed.
 *   - `destroy()`           — close everything; usually automatic.
 *
 * The hook is **stateless across mounts**: every mount generates a new
 * `sessionId` (a random UUID-like string) so the OPFS filenames are
 * isolated per session. Closing a tab and re-opening gives a fresh
 * runner — the persisted `progress` table is the only cross-session
 * memory.
 *
 * Persistence side-effects (markCompleted / markAttempted) happen in
 * `check()`. The runner itself never touches Dexie (RESEARCH §5.2).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { ExerciseRunner } from '../core/exercises/runner'
import { pickNextHint } from '../core/exercises/hint-engine'
import { detectPatterns } from '../core/exercises/error-pattern-detector'
import type { ValidationReport } from '../core/exercises/validator'
import type { DBApi, Exercise, Hint, PatternMatch } from '../core/exercises/types'
import type { QueryResult, SerializedError, StorageCapability } from '../workers/types'
import { progressStore } from '../core/persistence/progress-store'
import { loadCourse } from '../content/loaders'
import type { Course, Lesson } from '../content/types'

/** Lifecycle of the hook (independent from the runner's internal state). */
export type UseExerciseStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'running'
  | 'failed'

export interface UseExerciseResult {
  /** The runner instance (exposed for advanced consumers / debugging). */
  runner: ExerciseRunner
  /** Coarse-grained status of the hook. */
  status: UseExerciseStatus
  /** Number of *failed* `check()` calls since mount. */
  attempts: number
  /** Latest `QueryResult` from `run()`. */
  lastResult: QueryResult | null
  /** Latest structured error from `run()` or `check()`. */
  lastError: SerializedError | null
  /** Latest `PatternMatch[]` derived from `lastError` + SQL. */
  lastPatterns: PatternMatch[]
  /** How many hints have been revealed so far. */
  hintsRevealed: number
  /** Latest `ValidationReport` from `check()`. */
  checkReport: ValidationReport | null
  /** Solution SQL + explanation, populated by `revealSolution()`. */
  solution: { sql: string; explanation: string } | null
  /** Execute the SQL against the working-copy. */
  run(sql: string): Promise<void>
  /** Run the validation pipeline. Updates `attempts`, `checkReport`. */
  check(): Promise<ValidationReport>
  /** Reveal the next hint (sequential). */
  revealNextHint(): Hint | null
  /** Reveal the canonical solution. */
  revealSolution(): Promise<void>
  /** Discard the working-copy and re-seed. */
  reset(): Promise<void>
  /** Tear down the runner. Called automatically on unmount. */
  destroy(): void
}

export interface UseExerciseOptions {
  /** Hint count to *start* with (defaults to 0). */
  initialHintsRevealed?: number
}

/**
 * Hook that wires a single `ExerciseRunner` to the React lifecycle.
 *
 * `api` and `capability` come from `useDatabase()` — the hook does not
 * own the Worker. `exerciseId` is the slug of the exercise; we look up
 * the rest of the `Exercise` from the catalog inside the hook so the
 * caller doesn't have to plumb it through.
 */
export function useExercise(
  exerciseId: string,
  api: DBApi,
  capability: StorageCapability,
  options: UseExerciseOptions = {},
): UseExerciseResult {
  // 1. Resolve the exercise from the catalog. We re-load on every
  //    render so the hook stays correct after navigation between
  //    exercises; `loadCourse` is cheap (memoised) so this is fine.
  const course: Course = loadCourse('es')
  const ctx = resolveExerciseContext(course, exerciseId)
  const exercise: Exercise = ctx.exercise
  const lesson: Lesson = ctx.lesson

  // 2. Per-mount sessionId. Generated once via a ref so it survives
  //    re-renders but is fresh for every new mount.
  const sessionIdRef = useRef<string | null>(null)
  if (sessionIdRef.current == null) {
    sessionIdRef.current = generateSessionId()
  }
  const sessionId = sessionIdRef.current

  // 3. The runner. We construct it eagerly (it doesn't touch the DB
  //    until `start()` is called) and keep a stable ref.
  const runnerRef = useRef<ExerciseRunner | null>(null)
  if (runnerRef.current == null) {
    runnerRef.current = new ExerciseRunner({
      api,
      exercise,
      capability,
      sessionId,
    })
  }
  const runner = runnerRef.current

  // 4. Local state. We keep everything in `useState` so consumers can
  //    subscribe to fine-grained slices without re-rendering on every
  //    transient change.
  const [status, setStatus] = useState<UseExerciseStatus>('idle')
  const [attempts, setAttempts] = useState<number>(0)
  const [lastResult, setLastResult] = useState<QueryResult | null>(null)
  const [lastError, setLastError] = useState<SerializedError | null>(null)
  const [lastPatterns, setLastPatterns] = useState<PatternMatch[]>([])
  const [hintsRevealed, setHintsRevealed] = useState<number>(
    options.initialHintsRevealed ?? 0,
  )
  const [checkReport, setCheckReport] = useState<ValidationReport | null>(null)
  const [solution, setSolution] = useState<{ sql: string; explanation: string } | null>(null)

  // 5. Auto-start on mount, destroy on unmount. The lifecycle is
  //    deterministic so the UI can rely on the runner being `started`
  //    once the hook reports `status === 'ready'`.
  useEffect(() => {
    let cancelled = false
    setStatus('starting')
    void runner
      .start()
      .then(() => {
        if (!cancelled) setStatus('ready')
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setStatus('failed')
          setLastError(toSerializedError(e))
        }
      })
    return () => {
      cancelled = true
      // destroy is idempotent.
      void runner.destroy()
    }
    // We deliberately don't re-run on every prop change: the runner
    // captures `api`, `capability`, `exercise` at construction. The
    // caller is expected to remount the hook when the exerciseId or
    // the api changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 6. Action callbacks. Each is wrapped in `useCallback` so the
  //    ExerciseView can depend on them without re-creating handlers.
  //    For values that change frequently (attempts, lastError, ...),
  //    we also keep refs so the callbacks always see the latest value
  //    without forcing a re-render on every keystroke.
  const attemptsRef = useRef<number>(0)
  const lastErrorRef = useRef<SerializedError | null>(null)
  const lastResultRef = useRef<QueryResult | null>(null)
  const hintsRevealedRef = useRef<number>(options.initialHintsRevealed ?? 0)

  const run = useCallback(
    async (sql: string): Promise<void> => {
      setStatus('running')
      setLastError(null)
      try {
        const result = await runner.runUserSql(sql)
        setLastResult(result)
        lastResultRef.current = result
        if (!result.ok && result.error) {
          setLastError(result.error)
          lastErrorRef.current = result.error
        }
        const patterns = detectPatterns(result.error ?? null, sql, {
          tables: [],
          views: [],
          indexes: [],
          triggers: [],
        })
        setLastPatterns(patterns)
        setStatus('ready')
      } catch (e) {
        const err = toSerializedError(e)
        setLastError(err)
        lastErrorRef.current = err
        setLastPatterns(
          detectPatterns(err, sql, {
            tables: [],
            views: [],
            indexes: [],
            triggers: [],
          }),
        )
        setStatus('failed')
      }
    },
    [runner],
  )

  const check = useCallback(async (): Promise<ValidationReport> => {
    setStatus('running')
    let report: ValidationReport
    try {
      report = await runner.check({ hintsRevealed: hintsRevealedRef.current })
    } catch (e) {
      // The runner already swallows errors, so this branch is mostly
      // defensive. We still want to surface something to the UI.
      const err = toSerializedError(e)
      setLastError(err)
      lastErrorRef.current = err
      report = {
        allPassed: false,
        results: [{ passed: false, message: err.translatedMessage, strategyType: 'result' }],
        passedCount: 0,
        failedCount: 1,
      }
    }
    setCheckReport(report)
    setStatus('ready')
    if (report.allPassed) {
      await progressStore.markExerciseCompleted(exercise.id, lesson.id)
    } else {
      attemptsRef.current += 1
      setAttempts(attemptsRef.current)
      await progressStore.markExerciseAttempted(exercise.id, lesson.id, false)
    }
    return report
  }, [runner, exercise.id, lesson.id])

  const revealNextHint = useCallback((): Hint | null => {
    const hint = pickNextHint({
      exercise,
      attempts: attemptsRef.current,
      lastError: lastErrorRef.current,
      lastResult: lastResultRef.current,
      hintsRevealed: hintsRevealedRef.current,
    })
    if (hint) {
      hintsRevealedRef.current += 1
      setHintsRevealed(hintsRevealedRef.current)
    }
    return hint
  }, [exercise])

  const revealSolution = useCallback(async (): Promise<void> => {
    if (!exercise.solution) {
      setSolution({
        sql: '',
        explanation: 'Este ejercicio no tiene una solución de referencia.',
      })
      return
    }
    // We deliberately ignore the result here: the UI only needs the
    // solution SQL + explanation, which we already have on the
    // exercise object. The runner-side reveal still happens (so the
    // solution-copy exists in OPFS), but we discard the QueryResult
    // because the user has already seen the SQL itself.
    await runner.revealSolution()
    setSolution({
      sql: exercise.solution,
      explanation: exercise.solutionExplanation ?? '',
    })
  }, [runner, exercise.solution, exercise.solutionExplanation])

  const reset = useCallback(async (): Promise<void> => {
    setStatus('starting')
    await runner.reset()
    setLastResult(null)
    lastResultRef.current = null
    setLastError(null)
    lastErrorRef.current = null
    setLastPatterns([])
    setCheckReport(null)
    setSolution(null)
    setStatus('ready')
  }, [runner])

  const destroy = useCallback((): void => {
    void runner.destroy()
  }, [runner])

  return {
    runner,
    status,
    attempts,
    lastResult,
    lastError,
    lastPatterns,
    hintsRevealed,
    checkReport,
    solution,
    run,
    check,
    revealNextHint,
    revealSolution,
    reset,
    destroy,
  }
}

/* ------------------------------------------------------------------ *
 *  Internal helpers                                                   *
 * ------------------------------------------------------------------ */

interface ResolvedContext {
  exercise: Exercise
  lesson: Lesson
}

function resolveExerciseContext(course: Course, exerciseId: string): ResolvedContext {
  for (const level of course.levels) {
    for (const lesson of level.lessons) {
      for (const ex of lesson.exercises) {
        if (ex.id === exerciseId) return { exercise: ex, lesson }
      }
    }
  }
  // Fallback: a *placeholder* exercise with a no-op solution. The
  // page-level guard (ExercisePage only mounts for a known id) means
  // we never reach this in production; the placeholder keeps the
  // type-checker happy.
  return {
    exercise: {
      id: exerciseId,
      lessonId: 'unknown',
      type: 'writeQuery',
      title: '(ejercicio no encontrado)',
      prompt: '',
      solution: '',
      solutionExplanation: '',
      validation: [],
      hints: [],
      difficulty: 1,
      tags: [],
      databaseId: 'unknown',
    },
    lesson: {
      id: 'unknown',
      order: 0,
      title: '(lección desconocida)',
      description: '',
      objectives: [],
      exercises: [],
    },
  }
}

/**
 * Generate a per-mount session id. We use `Math.random` to avoid
 * pulling in a UUID library; the id is only used as a filename prefix
 * so collisions are acceptable (they would just overwrite the file).
 */
function generateSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Wrap an unknown thrown value in a `SerializedError`. */
function toSerializedError(e: unknown): SerializedError {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    return e as SerializedError
  }
  const message = e instanceof Error ? e.message : String(e)
  return {
    code: 'UNEXPECTED',
    message,
    translatedMessage: `Error inesperado: ${message}.`,
  }
}
