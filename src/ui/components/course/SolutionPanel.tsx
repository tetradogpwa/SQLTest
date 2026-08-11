/**
 * SolutionPanel — collapsible solution reveal.
 *
 * A small pedagogical component: the user can choose to look at the
 * canonical answer when they're stuck. The reveal is **explicit**
 * (one button click) and **one-way** (the user can collapse the body
 * by re-rendering, but there's no "hide" button — the user can simply
 * scroll past it).
 *
 * Two states:
 *
 *   1. `revealed === false` — a single "¿Atascado? Ver solución" button.
 *   2. `revealed === true`  — the SQL in a code block + the explanation
 *      text below. If `solution` is `null`, we render a muted line
 *      instead ("Este ejercicio no tiene una solución de referencia").
 *
 * The parent (ExerciseView) owns the `solution` object and the
 * `revealed` flag. The component does not call `revealSolution()`
 * itself — that's the parent's job (it has the hook).
 */
import { Eye } from 'lucide-react'

import styles from './SolutionPanel.module.css'

export interface SolutionPanelProps {
  /**
   * Solution payload. `null` means "not yet revealed" (we show the
   * button). `null` after reveal means "this exercise has no
   * solution" (we show a muted message).
   */
  solution: { sql: string; explanation: string } | null
  /** Whether the user has clicked "Ver solución" at least once. */
  revealed: boolean
  /** Called when the user clicks the reveal button. */
  onReveal(): void
}

export function SolutionPanel({
  solution,
  revealed,
  onReveal,
}: SolutionPanelProps): React.ReactNode {
  // Not yet revealed → just the button.
  if (!revealed) {
    return (
      <section
        className={styles.panel}
        data-testid="solution-panel"
        aria-label="Solución del ejercicio"
      >
        <button
          type="button"
          className={styles.revealButton}
          onClick={onReveal}
          data-testid="solution-reveal-button"
          aria-label="Ver la solución del ejercicio"
        >
          <Eye size={14} aria-hidden="true" /> ¿Atascado? Ver solución
        </button>
      </section>
    )
  }

  // Revealed. If the exercise has no solution, we still want to be
  // explicit about that.
  if (!solution) {
    return (
      <section
        className={styles.panel}
        data-testid="solution-panel"
        data-revealed="true"
        aria-label="Solución del ejercicio"
      >
        <p className={styles.empty} data-testid="solution-empty">
          Este ejercicio no tiene una solución de referencia.
        </p>
      </section>
    )
  }

  // Revealed with a real solution.
  return (
    <section
      className={styles.panel}
      data-testid="solution-panel"
      data-revealed="true"
      aria-label="Solución del ejercicio"
    >
      <div className={styles.body}>
        <pre className={styles.sqlBlock} data-testid="solution-sql">
          <code>{solution.sql || '-- (sin SQL)'}</code>
        </pre>
        {solution.explanation ? (
          <p
            className={styles.explanation}
            data-testid="solution-explanation"
          >
            {solution.explanation}
          </p>
        ) : (
          <p className={styles.explanationMuted} data-testid="solution-explanation">
            (Este ejercicio no incluye una explicación adicional.)
          </p>
        )}
      </div>
    </section>
  )
}

export default SolutionPanel
