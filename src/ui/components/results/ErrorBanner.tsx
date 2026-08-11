/**
 * ErrorBanner — pedagogical error display.
 *
 * Surfaces a {@link SerializedError} (or any value carrying the same
 * shape) in a way that is *useful* to a learner, not just
 * informational:
 *
 *  - Title: the short, translated message (Spanish, e.g. "No existe
 *    la tabla `userss`").
 *  - If `offendingToken` is present, the banner pinpoints the
 *    problem: "Token problemático: `userss`".
 *  - If `hints` is present, the banner lists them as "Sugerencias"
 *    (e.g. "¿Quisiste decir `users`?").
 *  - If `table` or `column` is present, the banner proposes
 *    Levenshtein-≤2 candidates from a name pool provided by the
 *    parent (the parent has access to the live schema and the
 *    ErrorTranslator's `did-you-mean` dictionary).
 *  - "Mostrar error técnico" toggles a panel with the raw
 *    `error.message` (useful for bug reports).
 */
import { useMemo, useState } from 'react'
import { AlertOctagon, ChevronDown, ChevronRight } from 'lucide-react'

import type { SerializedError } from '../../../workers/types'
import styles from './results.module.css'

export interface ErrorBannerProps {
  /** The structured error to display. */
  error: SerializedError | null | undefined
  /**
   * Optional pool of known table names used to suggest similar
   * names when `error.table` is set. Falls back to a static set of
   * common SQL keywords if not provided.
   */
  knownTables?: ReadonlyArray<string>
  /** Optional pool of known column names (same purpose as above). */
  knownColumns?: ReadonlyArray<string>
  /** Maximum number of suggestions to show. Default 3. */
  maxSuggestions?: number
}

/**
 * Levenshtein distance between two strings. Implementation is the
 * classic dynamic-programming table — `O(|a|·|b|)`. Both strings are
 * short in practice (table/column names), so this is fine.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const del = (prev[j] ?? 0) + 1
      const ins = (curr[j - 1] ?? 0) + 1
      const sub = (prev[j - 1] ?? 0) + cost
      curr[j] = Math.min(del, ins, sub)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0
  }
  return prev[b.length] ?? 0
}

function suggestClosest(
  needle: string,
  pool: ReadonlyArray<string>,
  maxDistance: number,
  maxResults: number,
): string[] {
  if (!needle) return []
  const lowerNeedle = needle.toLowerCase()
  const ranked: Array<{ name: string; distance: number }> = []
  for (const candidate of pool) {
    if (candidate === needle) continue
    const distance = levenshtein(lowerNeedle, candidate.toLowerCase())
    if (distance > 0 && distance <= maxDistance) {
      ranked.push({ name: candidate, distance })
    }
  }
  ranked.sort((a, b) => a.distance - b.distance)
  return ranked.slice(0, maxResults).map((r) => r.name)
}

export function ErrorBanner({
  error,
  knownTables = [],
  knownColumns = [],
  maxSuggestions = 3,
}: ErrorBannerProps): React.ReactNode {
  const [showTechnical, setShowTechnical] = useState<boolean>(false)
  const suggestions = useMemo(() => {
    if (!error) return []
    const target = error.table ?? error.column ?? error.offendingToken
    if (!target) return []
    const pool = error.table ? knownTables : knownColumns
    return suggestClosest(target, pool, 2, maxSuggestions)
  }, [error, knownTables, knownColumns, maxSuggestions])

  if (!error) return null

  const title = error.translatedMessage || error.message || 'Error al ejecutar la consulta'
  const code = error.code ? ` · ${error.code}` : ''

  return (
    <div
      className={styles.errorBanner}
      role="alert"
      data-testid="error-banner"
      data-error-code={error.code ?? ''}
    >
      <span className={styles.errorIcon} aria-hidden="true">
        <AlertOctagon size={16} />
      </span>
      <div className={styles.errorBody}>
        <div className={styles.errorTitle}>
          {title}
          {code ? <span style={{ color: 'var(--color-text-muted)' }}>{code}</span> : null}
        </div>

        {error.offendingToken ? (
          <div className={styles.errorToken}>
            Token problemático: <code>{error.offendingToken}</code>
          </div>
        ) : null}

        {(error.hints && error.hints.length > 0) || suggestions.length > 0 ? (
          <ul className={styles.errorHints}>
            {(error.hints ?? []).map((hint, i) => (
              <li key={`hint-${i}`}>{hint}</li>
            ))}
            {suggestions.map((s) => (
              <li key={`sugg-${s}`}>
                ¿Quisiste decir <code>{s}</code>?
              </li>
            ))}
          </ul>
        ) : null}

        {error.message ? (
          <>
            <button
              type="button"
              className={styles.errorToggle}
              aria-expanded={showTechnical}
              onClick={() => setShowTechnical((v) => !v)}
            >
              {showTechnical ? (
                <ChevronDown size={14} aria-hidden="true" />
              ) : (
                <ChevronRight size={14} aria-hidden="true" />
              )}
              {showTechnical ? 'Ocultar error técnico' : 'Mostrar error técnico'}
            </button>
            {showTechnical ? (
              <pre className={styles.errorTechnical} data-testid="error-technical">
                {error.message}
              </pre>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

export default ErrorBanner
