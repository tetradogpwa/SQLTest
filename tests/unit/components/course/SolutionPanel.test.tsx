/**
 * Tests for `SolutionPanel`.
 *
 * Asserts on:
 *   - The hidden state: a single "Ver solución" button.
 *   - The revealed state: solution SQL + explanation.
 *   - The "no solution" edge case: a muted message instead of code.
 *   - The reveal button invokes the `onReveal` callback.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { SolutionPanel } from '../../../../src/ui/components/course/SolutionPanel'

afterEach(() => {
  cleanup()
})

describe('SolutionPanel', () => {
  it('shows only the reveal button when the solution is hidden', () => {
    render(
      <SolutionPanel
        solution={null}
        revealed={false}
        onReveal={() => undefined}
      />,
    )
    expect(screen.getByTestId('solution-panel')).toBeInTheDocument()
    expect(screen.getByTestId('solution-reveal-button')).toBeInTheDocument()
    expect(screen.queryByTestId('solution-sql')).toBeNull()
    expect(screen.queryByTestId('solution-explanation')).toBeNull()
  })

  it('calls onReveal when the reveal button is clicked', () => {
    const handler = vi.fn()
    render(
      <SolutionPanel
        solution={null}
        revealed={false}
        onReveal={handler}
      />,
    )
    fireEvent.click(screen.getByTestId('solution-reveal-button'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('renders the SQL and explanation when revealed', () => {
    render(
      <SolutionPanel
        solution={{
          sql: 'SELECT id, titulo FROM libros',
          explanation: 'porque queremos ver el identificador y el título',
        }}
        revealed={true}
        onReveal={() => undefined}
      />,
    )
    const sql = screen.getByTestId('solution-sql') as HTMLElement
    const explanation = screen.getByTestId('solution-explanation')
    expect(sql.textContent).toContain('SELECT id, titulo FROM libros')
    expect(explanation.textContent).toContain(
      'porque queremos ver el identificador y el título',
    )
    // The reveal button is no longer shown.
    expect(screen.queryByTestId('solution-reveal-button')).toBeNull()
  })

  it('renders a muted message when revealed but the exercise has no solution', () => {
    render(
      <SolutionPanel
        solution={null}
        revealed={true}
        onReveal={() => undefined}
      />,
    )
    expect(screen.getByTestId('solution-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('solution-sql')).toBeNull()
  })

  it('handles an empty explanation with a muted placeholder', () => {
    render(
      <SolutionPanel
        solution={{ sql: 'SELECT 1', explanation: '' }}
        revealed={true}
        onReveal={() => undefined}
      />,
    )
    const explanation = screen.getByTestId('solution-explanation')
    expect(explanation.textContent).toContain('no incluye una explicación adicional')
  })
})
