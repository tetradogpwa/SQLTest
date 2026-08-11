/**
 * ExerciseView — the "play" page for a single exercise.
 *
 * Wires together:
 *
 *   - The exercise header (title, type badge, difficulty, tags).
 *   - The prompt callout.
 *   - The FeedbackBanner (top-of-editor summary after a check).
 *   - The SqlEditor (existing component) + a Run/Check toolbar.
 *   - The result / error / validation panels (existing components).
 *   - The HintPanel (sequential + contextual hints).
 *   - The SolutionPanel (collapsible solution reveal).
 *   - A "Volver a la lección" link and a "Reiniciar" button.
 *
 * The view depends on `useExercise` for the lifecycle but stays
 * presentational: the parent supplies the exercise / lesson / level /
 * database.
 *
 * Phase 8.2: the hint / solution / feedback panels land here, plus
 * the "Reiniciar ejercicio" / "Volver a la lección" controls are
 * pushed below the panels for visual hierarchy.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronLeft,
  Play,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react'

import type { DatabaseSeed, Exercise, Level, Lesson } from '../../../content/types'
import { useExercise } from '../../../hooks/useExercise'
import { useDatabase } from '../../../hooks/useDatabase'
import { SqlEditor } from '../editor/SqlEditor'
import { ResultsTable } from '../results/ResultsTable'
import { ErrorBanner } from '../results/ErrorBanner'
import { HintPanel } from './HintPanel'
import { SolutionPanel } from './SolutionPanel'
import { FeedbackBanner } from './FeedbackBanner'
import type { DBApi } from '../../../core/exercises/types'
import type { StorageCapability } from '../../../workers/types'
import type { Remote } from 'comlink'
import type { DBApi as HookDBApi } from '../../../hooks/useDatabase'
import styles from './ExerciseView.module.css'

/**
 * Bridge type: `useDatabase` returns a `Remote<DBApi>` (a Comlink
 * proxy); `useExercise` consumes the `core/exercises/DBApi` interface.
 * The latter is a structural subset of the former (modulo the
 * `deleteSnapshot` / `restore` etc. that the runner doesn't touch),
 * so we cast through `unknown` and trust the structural contract.
 */
type AnyDBApi = DBApi
function bridge(api: Remote<HookDBApi> | null): AnyDBApi | null {
  return api as unknown as AnyDBApi | null
}

export interface ExerciseViewProps {
  exercise: Exercise
  level: Level
  lesson: Lesson
  database: DatabaseSeed
  /** Initial SQL to load in the editor (overrides the exercise's `starterCode`). */
  initialCode?: string
  /**
   * Whether the user is allowed to run / check. Defaults to `true`.
   * Used by parent pages to disable interaction while the worker is
   * recovering, etc.
   */
  enabled?: boolean
}

const TYPE_LABELS: Record<Exercise['type'], string> = {
  writeQuery: 'Escribir consulta',
  predictResult: 'Predecir resultado',
  findError: 'Encontrar error',
  fixQuery: 'Corregir consulta',
  completeQuery: 'Completar consulta',
  modifyQuery: 'Modificar consulta',
  explore: 'Explorar',
  challenge: 'Reto',
}

function difficultyStars(difficulty: Exercise['difficulty']): string {
  return '★'.repeat(difficulty) + '☆'.repeat(5 - difficulty)
}

function statusLabel(status: ReturnType<typeof useExercise>['status']): string {
  switch (status) {
    case 'idle':
      return 'Sin iniciar'
    case 'starting':
      return 'Inicializando…'
    case 'ready':
      return 'Listo'
    case 'running':
      return 'Ejecutando…'
    case 'failed':
      return 'Error'
  }
}

export function ExerciseView({
  exercise,
  level,
  lesson,
  database,
  initialCode,
  enabled = true,
}: ExerciseViewProps): React.ReactNode {
  const { api, capability, ready: dbReady, initializing: dbInitializing } = useDatabase()
  const bridged = bridge(api)
  const [code, setCode] = useState<string>(
    initialCode ?? exercise.starterCode ?? '',
  )

  // The hook needs a DBApi. If the worker isn't ready yet, we
  // render a loading shell rather than throwing.
  if (!bridged || !capability) {
    return (
      <div className={styles.view} data-testid="exercise-view-loading">
        <div className={styles.loadingShell}>
          {dbInitializing ? 'Inicializando el motor SQL…' : 'Esperando al motor SQL…'}
        </div>
      </div>
    )
  }
  if (!dbReady) {
    return (
      <div className={styles.view} data-testid="exercise-view-loading">
        <div className={styles.loadingShell}>El motor SQL no está listo.</div>
      </div>
    )
  }

  return (
    <ExerciseViewInner
      exercise={exercise}
      level={level}
      lesson={lesson}
      database={database}
      code={code}
      setCode={setCode}
      api={bridged}
      capability={capability}
      enabled={enabled}
    />
  )
}

interface InnerProps extends Omit<ExerciseViewProps, 'initialCode' | 'enabled'> {
  code: string
  setCode: (v: string) => void
  api: DBApi
  capability: StorageCapability
  enabled: boolean
}

function ExerciseViewInner({
  exercise,
  level: _level,
  lesson,
  database: _database,
  code,
  setCode,
  api,
  capability,
  enabled,
}: InnerProps): React.ReactNode {
  // The runner pulls the working-copy from the exercise's lessonDbSeed.
  // We don't open the database directly here — `useExercise` does.
  const {
    status,
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
  } = useExercise(exercise.id, api, capability)

  // Whether the FeedbackBanner is visible. Starts as `null` (idle);
  // becomes `true`/`false` after a check, and is reset to `null` when
  // the user clicks the dismiss × or after a `reset()`.
  const [feedbackSuccess, setFeedbackSuccess] = useState<boolean | null>(null)
  const [feedbackReport, setFeedbackReport] = useState<typeof checkReport>(null)
  const [feedbackPatterns, setFeedbackPatterns] = useState<typeof lastPatterns>([])

  // Whenever the engine produces a new `checkReport`, snapshot it
  // for the banner. The banner is independent of the validation
  // report block that always sits below the editor — it can be
  // dismissed without losing the persistent report.
  useEffect(() => {
    if (checkReport) {
      setFeedbackReport(checkReport)
      setFeedbackSuccess(checkReport.allPassed)
      setFeedbackPatterns(lastPatterns ?? [])
    }
  }, [checkReport, lastPatterns])

  // Reset the editor when the exerciseId changes (e.g. navigating
  // between exercises). We deliberately don't reset on every render.
  useEffect(() => {
    setCode(exercise.starterCode ?? '')
    // Clear the panel-local state too so the next exercise starts clean.
    setFeedbackSuccess(null)
    setFeedbackReport(null)
    setFeedbackPatterns([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id])

  const handleRun = useCallback(async (sql: string) => {
    if (!enabled) return
    await run(sql)
  }, [run, enabled])

  const handleCheck = useCallback(async () => {
    if (!enabled) return
    await check()
  }, [check, enabled])

  const handleReset = useCallback(async () => {
    await reset()
    setCode(exercise.starterCode ?? '')
    setFeedbackSuccess(null)
    setFeedbackReport(null)
    setFeedbackPatterns([])
    // Note: we deliberately do NOT clear `hintsRevealed` here —
    // that's engine state and a reset should not "reward" the user
    // by hiding the help they asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset, exercise.starterCode])

  const handleDismissFeedback = useCallback(() => {
    setFeedbackSuccess(null)
  }, [])

  const handleRevealHint = useCallback(() => {
    revealNextHint()
  }, [revealNextHint])

  const handleRevealSolution = useCallback(async () => {
    await revealSolution()
  }, [revealSolution])

  const statusText = statusLabel(status)

  return (
    <article className={styles.view} data-testid="exercise-view">
      <div className={styles.breadcrumb} data-testid="exercise-breadcrumb">
        <Link className={styles.breadcrumbLink} to="/course">
          Curso
        </Link>
        <span aria-hidden="true">·</span>
        <Link
          className={styles.breadcrumbLink}
          to={`/course/lesson/${lesson.id}`}
        >
          {lesson.title}
        </Link>
        <span aria-hidden="true">·</span>
        <span>{exercise.title}</span>
      </div>

      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title} data-testid="exercise-title">
            {exercise.title}
          </h1>
          <div className={styles.meta}>
            <span
              className={styles.statusBadge}
              data-status={status}
              data-testid="exercise-status"
            >
              {statusText}
            </span>
            <span
              className={styles.typeBadge}
              data-testid="exercise-type-badge"
            >
              {TYPE_LABELS[exercise.type] ?? exercise.type}
            </span>
            <span
              className={styles.difficulty}
              aria-label={`Dificultad ${exercise.difficulty} de 5`}
              data-testid="exercise-difficulty"
            >
              {difficultyStars(exercise.difficulty)}
            </span>
          </div>
        </div>
        {exercise.tags.length > 0 ? (
          <div className={styles.meta} data-testid="exercise-tags">
            {exercise.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <div className={styles.promptCallout} data-testid="exercise-prompt">
        {exercise.prompt}
      </div>

      <FeedbackBanner
        report={feedbackReport}
        patterns={feedbackPatterns}
        success={feedbackSuccess}
        onDismiss={handleDismissFeedback}
      />

      <section className={styles.editorSection} aria-label="Editor de SQL">
        <div className={styles.toolbar}>
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleRun(code)}
              disabled={!enabled || status === 'starting' || status === 'running'}
              data-testid="run-button"
              aria-label="Ejecutar la consulta"
            >
              <Play size={14} aria-hidden="true" /> Ejecutar
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleCheck()}
              disabled={!enabled || status === 'starting' || status === 'running'}
              data-testid="check-button"
              aria-label="Comprobar la consulta"
            >
              <ShieldCheck size={14} aria-hidden="true" /> Comprobar
            </button>
          </div>
        </div>
        <SqlEditor
          value={code}
          onChange={setCode}
          onExecute={handleRun}
          schemaContext={null}
          readOnly={!enabled}
          fontSize={14}
          height="320px"
          ariaLabel={`Editor SQL para ${exercise.title}`}
        />
      </section>

      {lastError ? (
        <ErrorBanner
          error={lastError}
          data-testid="exercise-error-banner"
        />
      ) : null}

      {lastResult && lastResult.ok && lastResult.columns && lastResult.rows ? (
        <ResultsTable
          columns={lastResult.columns}
          rows={lastResult.rows}
          truncated={Boolean(lastResult.truncated)}
        />
      ) : null}

      {lastResult && !lastResult.ok && !lastError ? (
        <div className={styles.loadingShell} data-testid="exercise-empty-result">
          La consulta no devolvió resultados.
        </div>
      ) : null}

      {checkReport ? (
        <section
          className={styles.validationReport}
          data-testid="validation-report"
          data-all-passed={checkReport.allPassed ? 'true' : 'false'}
          aria-label="Resultado de la comprobación"
        >
          <header className={styles.validationHeader}>
            {checkReport.allPassed ? (
              <>
                <CheckCircle2 size={18} aria-hidden="true" /> ¡Correcto!
              </>
            ) : (
              <>
                <XCircle size={18} aria-hidden="true" /> Hay cosas que revisar
              </>
            )}
            <span style={{ color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
              {checkReport.passedCount} / {checkReport.results.length} comprobaciones
            </span>
          </header>
          {checkReport.results.map((r, i) => (
            <div
              key={`row-${i}`}
              className={styles.validationRow}
              data-testid={`validation-row-${r.strategyType ?? 'result'}`}
            >
              <span
                className={styles.validationIcon}
                data-passed={r.passed ? 'true' : 'false'}
                aria-hidden="true"
              >
                {r.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              </span>
              <div className={styles.validationBody}>
                <span className={styles.validationMessage}>{r.message}</span>
                {r.strategyType ? (
                  <span className={styles.validationStrategy}>
                    Estrategia: {r.strategyType}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <HintPanel
        hints={exercise.hints}
        revealedCount={hintsRevealed}
        onRevealNext={handleRevealHint}
      />

      <SolutionPanel
        solution={solution}
        revealed={solution != null}
        onReveal={handleRevealSolution}
      />

      <div className={styles.footerActions}>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={() => void handleReset()}
          data-testid="reset-button"
          aria-label="Reiniciar el ejercicio"
        >
          <RotateCcw size={14} aria-hidden="true" /> Reiniciar ejercicio
        </button>
        <Link
          to={`/course/lesson/${lesson.id}`}
          className={styles.breadcrumbLink}
          data-testid="back-to-lesson"
        >
          <ChevronLeft size={14} aria-hidden="true" style={{ verticalAlign: 'middle' }} /> Volver a la lección
        </Link>
      </div>
    </article>
  )
}

export default ExerciseView
