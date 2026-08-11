/**
 * HintPanel — collapsible list of pedagogical hints.
 *
 * The panel owns the **reveal progress** of the current exercise: the
 * parent (ExerciseView) keeps the *full* hint list and the number of
 * already-revealed hints; this component renders the visible subset
 * and a button that asks the parent to reveal one more.
 *
 * Pedagogical design (RESEARCH §11.3, §18.3 AC-P3):
 *
 *   - Hints are revealed **one at a time** (sequential policy from
 *     `pickNextHint`). The button caption always advertises "siguiente".
 *   - Each hint has a small icon tied to its category so the learner
 *     can scan the list visually.
 *   - When all hints are revealed, the button disappears and a muted
 *     "Has visto todas las pistas" message takes its place — this is
 *     the signal that the help channel is exhausted.
 *   - The header is always visible (so the count is always known) and
 *     the body collapses with a chevron.
 *
 * The component is presentational. It does **not** call
 * `pickNextHint` itself; the parent owns the engine integration via
 * `useExercise`. The `hints` prop may mix sequential and contextual
 * hints (the contract is "the list of hints to be revealed" — the
 * parent decides which ones and in what order).
 */
import { useState } from 'react'
import { Book, ChevronRight, Code, Compass, Lightbulb } from 'lucide-react'

import type { Hint, HintType } from '../../../core/exercises/types'
import styles from './HintPanel.module.css'

export interface HintPanelProps {
  /** Full hint list (revealed + unrevealed). */
  hints: Hint[]
  /** Number of revealed hints (0..hints.length). */
  revealedCount: number
  /** Called when the user clicks "Mostrar siguiente pista". */
  onRevealNext(): void
  /** Optional: collapse the body by default. Defaults to `false`. */
  initialCollapsed?: boolean
}

/** Map a `HintType` to a Lucide icon. */
const TYPE_ICON: Record<HintType, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  conceptual: Lightbulb,
  syntactic: Code,
  semantic: Compass,
  reference: Book,
}

const TYPE_LABEL: Record<HintType, string> = {
  conceptual: 'pista conceptual',
  syntactic: 'pista sintáctica',
  semantic: 'pista semántica',
  reference: 'pista de referencia',
}

/**
 * Decode a textual hint (which may have a "Pista ... · nivel X" prefix
 * courtesy of `formatHint`) into a clean display body. If the hint
 * looks like raw markdown, we keep the body but drop the leading
 * quote. This is best-effort and intentionally lightweight: we don't
 * want a Markdown dependency in the bundle.
 */
function stripMarkdownHeader(text: string): string {
  const trimmed = text.trim()
  // Drop a leading `> **…**\n\n` block (what `formatHint` produces).
  const match = trimmed.match(/^>\s*\*\*[^*]+\*\*\s*\n+([\s\S]+)$/u)
  if (match) return (match[1] ?? '').trim()
  return trimmed
}

export function HintPanel({
  hints,
  revealedCount,
  onRevealNext,
  initialCollapsed = false,
}: HintPanelProps): React.ReactNode {
  const [collapsed, setCollapsed] = useState<boolean>(initialCollapsed)

  // `revealedCount` is the parent's view of how many of `hints` are
  // visible. We clamp it to [0, hints.length] for safety.
  const sequentialRevealed = Math.max(0, Math.min(revealedCount, hints.length))
  const totalAvailable = hints.length
  const allRevealed = totalAvailable > 0 && sequentialRevealed >= totalAvailable
  const noHints = totalAvailable === 0

  return (
    <section
      className={styles.panel}
      data-testid="hint-panel"
      aria-label="Pistas del ejercicio"
    >
      <button
        type="button"
        className={styles.header}
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        data-testid="hint-panel-toggle"
      >
        <span
          className={`${styles.chevron} ${collapsed ? '' : styles.chevronOpen}`}
          aria-hidden="true"
        >
          <ChevronRight size={14} />
        </span>
        <span className={styles.headerTitle}>pistas</span>
        <span className={styles.headerCount} data-testid="hint-panel-count">
          {sequentialRevealed} / {totalAvailable}
        </span>
      </button>

      {!collapsed ? (
        <div className={styles.body}>
          {noHints ? (
            <p className={styles.empty} data-testid="hint-panel-empty">
              Este ejercicio no tiene pistas disponibles.
            </p>
          ) : (
            <ul className={styles.cardList}>
              {hints.slice(0, sequentialRevealed).map((h, idx) => {
                const Icon = TYPE_ICON[h.type] ?? Lightbulb
                return (
                  <li
                    key={`hint-${idx}`}
                    className={styles.card}
                    data-testid={`hint-card-${idx}`}
                    data-hint-type={h.type}
                  >
                    <span
                      className={styles.cardIcon}
                      data-type={h.type}
                      aria-hidden="true"
                    >
                      <Icon size={16} />
                    </span>
                    <div className={styles.cardBody}>
                      <span className={styles.cardLabel}>{TYPE_LABEL[h.type]}</span>
                      <span className={styles.cardText}>{stripMarkdownHeader(h.text)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {noHints ? null : (
            <div className={styles.actions}>
              {allRevealed ? (
                <span className={styles.allRevealed} data-testid="hint-panel-all-revealed">
                  Has visto todas las pistas
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.revealButton}
                  onClick={onRevealNext}
                  data-testid="hint-reveal-button"
                  aria-label="Mostrar siguiente pista"
                >
                  <Lightbulb size={14} aria-hidden="true" /> Mostrar siguiente pista
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}

export default HintPanel
