/**
 * ProgressBar — small horizontal progress indicator.
 *
 * A 6px-tall bar with a single label above it (right-aligned). Used
 * by `CourseSidebar` (per-level "X / Y") and reusable anywhere a
 * compact "done / total" indicator is needed.
 *
 * The component is **presentational** and **stateless**:
 *
 *   - `done` / `total` come from the parent (typically
 *     `useProgress().completionByLevel`).
 *   - The `label` is optional and is rendered as-is when supplied;
 *     when omitted, we render a default "X / Y" so the bar still
 *     carries meaning in isolation (e.g. inside tests).
 *
 * Percentage is computed locally: `done / total`, clamped to `[0, 1]`
 * and multiplied by 100 to produce a `width: NN%` string for the
 * inner fill. When `total === 0`, the bar renders empty (0%) and the
 * label says "0 / 0".
 */
import { useMemo } from 'react'

import styles from './ProgressBar.module.css'

export interface ProgressBarProps {
  /** Number of items done. */
  done: number
  /** Total items. */
  total: number
  /**
   * Optional label rendered above the bar. When omitted we render a
   * default "X / Y" so the component is meaningful in isolation
   * (tests, etc.).
   */
  label?: string
  /** Optional `aria-label` for the bar; defaults to "Progreso". */
  ariaLabel?: string
}

export function ProgressBar({
  done,
  total,
  label,
  ariaLabel = 'Progreso',
}: ProgressBarProps): React.ReactNode {
  const safeDone = Math.max(0, done)
  const safeTotal = Math.max(0, total)
  const pct = useMemo<number>(() => {
    if (safeTotal === 0) return 0
    return Math.min(1, Math.max(0, safeDone / safeTotal))
  }, [safeDone, safeTotal])

  const widthPct = `${Math.round(pct * 100)}%`
  const defaultLabel = `${safeDone} / ${safeTotal}`
  const visibleLabel = label ?? defaultLabel

  return (
    <div className={styles.wrapper} data-testid="progress-bar-wrapper">
      <span className={styles.label} data-testid="progress-bar-label">
        {visibleLabel}
      </span>
      <div
        className={styles.bar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-valuenow={safeDone}
        aria-label={ariaLabel}
        data-testid="progress-bar"
        data-pct={Math.round(pct * 100)}
      >
        <div
          className={styles.fill}
          style={{ width: widthPct }}
          data-testid="progress-fill"
          data-width={widthPct}
        />
      </div>
    </div>
  )
}

export default ProgressBar
