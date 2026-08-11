/**
 * Tests for `FeedbackBanner`.
 *
 * Asserts on:
 *   - The idle state (success === null): nothing is rendered.
 *   - The success state (success === true): green banner + check.
 *   - The failure state (success === false): red banner, failed
 *     sub-cards, top patterns section, dismiss callback.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { FeedbackBanner } from '../../../../src/ui/components/course/FeedbackBanner'
import type { PatternMatch } from '../../../../src/core/exercises/types'
import type { ValidationReport } from '../../../../src/core/exercises/validator'

afterEach(() => {
  cleanup()
})

const SUCCESS_REPORT: ValidationReport = {
  allPassed: true,
  results: [
    { passed: true, message: 'esquema correcto', strategyType: 'schema' },
    { passed: true, message: 'filas coinciden', strategyType: 'result' },
  ],
  passedCount: 2,
  failedCount: 0,
}

const FAILURE_REPORT: ValidationReport = {
  allPassed: false,
  results: [
    { passed: true, message: 'esquema correcto', strategyType: 'schema' },
    {
      passed: false,
      message: 'falta una fila en el resultado',
      strategyType: 'result',
      suggestions: ['Revisa el WHERE', 'Asegúrate de incluir todas las filas'],
    },
    {
      passed: false,
      message: 'falta el JOIN esperado',
      strategyType: 'usesJoin',
    },
  ],
  passedCount: 1,
  failedCount: 2,
}

const PATTERNS: PatternMatch[] = [
  {
    pattern: {
      id: 'no-such-table',
      pattern: /no such table/i,
      category: 'reference',
      message: '¿La tabla existe?',
      fix: 'verifica el nombre exacto de la tabla.',
    },
    confidence: 1.0,
    matchedText: 'no such table: userss',
  },
  {
    pattern: {
      id: 'syntax-error-near',
      pattern: /syntax error/i,
      category: 'syntax',
      message: 'Falta o sobra un token.',
      fix: 'lee la query de izquierda a derecha.',
    },
    confidence: 0.9,
  },
]

describe('FeedbackBanner', () => {
  it('renders nothing when the user has not run a check yet', () => {
    const { container } = render(
      <FeedbackBanner
        report={null}
        patterns={[]}
        success={null}
        onDismiss={() => undefined}
      />,
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('feedback-banner')).toBeNull()
  })

  it('renders the green success banner with the pass count when success is true', () => {
    render(
      <FeedbackBanner
        report={SUCCESS_REPORT}
        patterns={[]}
        success={true}
        onDismiss={() => undefined}
      />,
    )
    const banner = screen.getByTestId('feedback-banner')
    expect(banner.dataset.success).toBe('true')
    expect(banner.textContent).toContain('¡Correcto!')
    expect(banner.textContent).toContain('2 / 2 comprobaciones')
  })

  it('renders the red failure banner with sub-cards per failed validation', () => {
    render(
      <FeedbackBanner
        report={FAILURE_REPORT}
        patterns={[]}
        success={false}
        onDismiss={() => undefined}
      />,
    )
    const banner = screen.getByTestId('feedback-banner')
    expect(banner.dataset.success).toBe('false')
    expect(banner.textContent).toContain('Hay cosas que revisar')
    // Failed rows are present (2 of them).
    expect(screen.getByTestId('feedback-row-result')).toBeInTheDocument()
    expect(screen.getByTestId('feedback-row-usesJoin')).toBeInTheDocument()
    // Suggestion text is rendered for the result sub-card.
    expect(banner.textContent).toContain('Revisa el WHERE')
  })

  it('prepends a "Sugerencias automáticas" section with top pattern fixes', () => {
    render(
      <FeedbackBanner
        report={FAILURE_REPORT}
        patterns={PATTERNS}
        success={false}
        onDismiss={() => undefined}
      />,
    )
    expect(screen.getByTestId('feedback-pattern-no-such-table')).toBeInTheDocument()
    expect(screen.getByTestId('feedback-pattern-syntax-error-near')).toBeInTheDocument()
    const banner = screen.getByTestId('feedback-banner')
    expect(banner.textContent).toContain('Sugerencias automáticas')
    expect(banner.textContent).toContain('verifica el nombre exacto de la tabla')
  })

  it('invokes onDismiss when the × button is clicked', () => {
    const handler = vi.fn()
    render(
      <FeedbackBanner
        report={SUCCESS_REPORT}
        patterns={[]}
        success={true}
        onDismiss={handler}
      />,
    )
    fireEvent.click(screen.getByTestId('feedback-dismiss'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('caps the pattern list to 3 entries when there are more', () => {
    const manyPatterns: PatternMatch[] = [
      ...PATTERNS,
      {
        pattern: {
          id: 'extra-1',
          pattern: /./,
          category: 'logic',
          message: 'extra 1',
          fix: 'fix 1',
        },
        confidence: 0.5,
      },
      {
        pattern: {
          id: 'extra-2',
          pattern: /./,
          category: 'logic',
          message: 'extra 2',
          fix: 'fix 2',
        },
        confidence: 0.5,
      },
    ]
    render(
      <FeedbackBanner
        report={FAILURE_REPORT}
        patterns={manyPatterns}
        success={false}
        onDismiss={() => undefined}
      />,
    )
    // 3 patterns are visible (capped). The 4th and 5th are not.
    expect(screen.getByTestId('feedback-pattern-no-such-table')).toBeInTheDocument()
    expect(screen.getByTestId('feedback-pattern-syntax-error-near')).toBeInTheDocument()
    expect(screen.getByTestId('feedback-pattern-extra-1')).toBeInTheDocument()
    expect(screen.queryByTestId('feedback-pattern-extra-2')).toBeNull()
  })
})
