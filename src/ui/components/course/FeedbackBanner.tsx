/**
 * FeedbackBanner — top-of-editor banner that summarises the last check.
 *
 * Sits between the toolbar and the editor: when the user clicks
 * "Comprobar", this component renders the result of the validation
 * pipeline (the `ValidationReport` from the engine) plus the
 * pedagogical hints that the error-pattern detector produced for the
 * last error.
 *
 * Three states:
 *
 *   1. `success === true`  → green "¡Correcto!" banner (minimal).
 *   2. `success === false` → red banner with one sub-card per failed
 *      validation, plus a "Sugerencias automáticas" section listing
 *      the top 2-3 patterns' `fix` text.
 *   3. `success === null`  → render nothing (the user hasn't
 *      clicked "Comprobar" yet, or the last run was a `run()`).
 *
 * The banner owns **no** business state — it just renders what the
 * parent feeds it. The parent (ExerciseView) reads the latest
 * `checkReport` + `lastPatterns` from `useExercise` and decides
 * whether to render it (or to dismiss it).
 */
import { CheckCircle2, X, XCircle } from 'lucide-react'

import type { PatternMatch, ValidationResult } from '../../../core/exercises/types'
import type { ValidationReport } from '../../../core/exercises/validator'
import styles from './FeedbackBanner.module.css'

export interface FeedbackBannerProps {
  /**
   * Latest validation report. `null` means "no check has been run
   * yet" — the banner renders nothing in that case.
   */
  report: ValidationReport | null
  /**
   * Patterns from the error-pattern detector. Shown as a
   * "Sugerencias automáticas" section on failure.
   */
  patterns: PatternMatch[]
  /**
   * Coarse outcome of the last check.
   *   - `true`  → all checks passed (green banner).
   *   - `false` → at least one check failed (red banner).
   *   - `null`  → idle / no check yet (render nothing).
   */
  success: boolean | null
  /** Called when the user clicks the dismiss (×) button. */
  onDismiss(): void
}

/** Maximum number of automatic suggestions to show below the failures. */
const MAX_PATTERNS = 3

export function FeedbackBanner({
  report,
  patterns,
  success,
  onDismiss,
}: FeedbackBannerProps): React.ReactNode {
  // Idle state: no check has happened yet (or the user dismissed).
  if (success === null || !report) {
    return null
  }

  // Success: minimal green banner. The validator already gave us the
  // green light on every check; no extra reading required.
  if (success && report.allPassed) {
    return (
      <div
        className={`${styles.banner} ${styles.success}`}
        role="status"
        data-testid="feedback-banner"
        data-success="true"
        aria-label="Resultado correcto"
      >
        <span className={styles.icon} aria-hidden="true">
          <CheckCircle2 size={18} />
        </span>
        <div className={styles.body}>
          <div className={styles.title}>
            <span>¡Correcto! Has superado el ejercicio.</span>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontWeight: 'normal',
              }}
            >
              {report.passedCount} / {report.results.length} comprobaciones
            </span>
          </div>
        </div>
        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          data-testid="feedback-dismiss"
          aria-label="Cerrar el resumen"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    )
  }

  // Failure: a red banner with the failed sub-cards and (if any) the
  // top patterns below. We deliberately separate the two: the
  // `ValidationResult` rows are authoritative, the patterns are
  // *supporting* suggestions from the error-pattern detector.
  const failedResults: ValidationResult[] = report.results.filter((r) => !r.passed)
  const topPatterns = patterns.slice(0, MAX_PATTERNS)

  return (
    <div
      className={`${styles.banner} ${styles.failure}`}
      role="alert"
      data-testid="feedback-banner"
      data-success="false"
      aria-label="Resultado de la comprobación con fallos"
    >
      <span className={styles.icon} aria-hidden="true">
        <XCircle size={18} />
      </span>
      <div className={styles.body}>
        <div className={styles.title}>
          <span>Hay cosas que revisar</span>
          <span
            style={{
              color: 'var(--color-text-muted)',
              fontWeight: 'normal',
            }}
          >
            {report.passedCount} / {report.results.length} comprobaciones
          </span>
        </div>

        {failedResults.length > 0 ? (
          <ul className={styles.failuresList}>
            {failedResults.map((r, i) => (
              <li
                key={`fail-${i}`}
                className={styles.failureCard}
                data-testid={`feedback-row-${r.strategyType ?? 'result'}`}
                data-strategy={r.strategyType ?? 'result'}
              >
                <span className={styles.failureMessage}>{r.message}</span>
                {r.suggestions && r.suggestions.length > 0 ? (
                  <div className={styles.failureSuggestions}>
                    {r.suggestions.map((s: string, j: number) => (
                      <span key={`sugg-${j}`} className={styles.suggestionItem}>
                        {s}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {topPatterns.length > 0 ? (
          <>
            <hr className={styles.divider} />
            <p className={styles.sectionTitle}>Sugerencias automáticas</p>
            <ul className={styles.patternsList}>
              {topPatterns.map((m, i) => (
                <li
                  key={`patt-${i}`}
                  className={styles.patternCard}
                  data-testid={`feedback-pattern-${m.pattern.id}`}
                  data-pattern-id={m.pattern.id}
                >
                  <span className={styles.patternMessage}>{m.pattern.message}</span>
                  <span className={styles.patternFix}>{m.pattern.fix}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <button
        type="button"
        className={styles.dismiss}
        onClick={onDismiss}
        data-testid="feedback-dismiss"
        aria-label="Cerrar el resumen"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

export default FeedbackBanner
