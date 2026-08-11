/**
 * Tests for `HintPanel`.
 *
 * Asserts on:
 *   - Header (count) + chevron rendering.
 *   - The list of revealed hint cards.
 *   - The reveal button is shown while hints remain and disappears
 *     when all hints are revealed (replaced by the muted line).
 *   - The hidden (unrevealed) hints are NOT rendered.
 *   - onRevealNext is invoked when the button is clicked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { HintPanel } from '../../../../src/ui/components/course/HintPanel'
import type { Hint } from '../../../../src/core/exercises/types'

afterEach(() => {
  cleanup()
})

const HINTS: Hint[] = [
  { level: 1, text: 'primera pista conceptual', after: 'never', type: 'conceptual' },
  { level: 2, text: 'segunda pista sintáctica', after: 'after-failure', type: 'syntactic' },
  { level: 3, text: 'tercera pista semántica', after: 'after-2-failures', type: 'semantic' },
]

describe('HintPanel', () => {
  it('renders the header with the count of revealed / total hints', () => {
    render(<HintPanel hints={HINTS} revealedCount={1} onRevealNext={() => undefined} />)
    expect(screen.getByTestId('hint-panel')).toBeInTheDocument()
    expect(screen.getByTestId('hint-panel-count').textContent).toBe('1 / 3')
  })

  it('renders only the revealed hint cards and not the hidden ones', () => {
    render(<HintPanel hints={HINTS} revealedCount={2} onRevealNext={() => undefined} />)
    // The first two cards exist.
    expect(screen.getByTestId('hint-card-0')).toBeInTheDocument()
    expect(screen.getByTestId('hint-card-1')).toBeInTheDocument()
    expect(screen.getByTestId('hint-card-0').textContent).toContain('primera pista conceptual')
    expect(screen.getByTestId('hint-card-1').textContent).toContain('segunda pista sintáctica')
    // The third (still hidden) does not exist.
    expect(screen.queryByTestId('hint-card-2')).toBeNull()
  })

  it('calls onRevealNext when the reveal button is clicked', () => {
    const handler = vi.fn()
    render(<HintPanel hints={HINTS} revealedCount={1} onRevealNext={handler} />)
    fireEvent.click(screen.getByTestId('hint-reveal-button'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('shows "Has visto todas las pistas" when all hints are revealed and hides the button', () => {
    render(<HintPanel hints={HINTS} revealedCount={3} onRevealNext={() => undefined} />)
    expect(screen.getByTestId('hint-panel-all-revealed')).toBeInTheDocument()
    expect(screen.queryByTestId('hint-reveal-button')).toBeNull()
    // All three cards are visible.
    expect(screen.getByTestId('hint-card-0')).toBeInTheDocument()
    expect(screen.getByTestId('hint-card-2')).toBeInTheDocument()
    // The header count is now "3 / 3".
    expect(screen.getByTestId('hint-panel-count').textContent).toBe('3 / 3')
  })

  it('renders the empty-state message when the exercise has no hints', () => {
    render(<HintPanel hints={[]} revealedCount={0} onRevealNext={() => undefined} />)
    expect(screen.getByTestId('hint-panel-empty')).toBeInTheDocument()
    expect(screen.getByTestId('hint-panel-count').textContent).toBe('0 / 0')
  })

  it('collapses and expands the body via the header chevron', () => {
    render(<HintPanel hints={HINTS} revealedCount={1} onRevealNext={() => undefined} />)
    // Initially expanded (default `initialCollapsed = false`).
    expect(screen.getByTestId('hint-card-0')).toBeInTheDocument()
    // Click the toggle to collapse.
    fireEvent.click(screen.getByTestId('hint-panel-toggle'))
    expect(screen.queryByTestId('hint-card-0')).toBeNull()
    // Click again to expand.
    fireEvent.click(screen.getByTestId('hint-panel-toggle'))
    expect(screen.getByTestId('hint-card-0')).toBeInTheDocument()
  })

  it('strips a leading "Pista ... · nivel X" markdown header from the displayed text', () => {
    const hint: Hint = {
      level: 1,
      text: '> **Pista conceptual · nivel 1 (general)**\n\ncuerpo de la pista',
      after: 'never',
      type: 'conceptual',
    }
    render(<HintPanel hints={[hint]} revealedCount={1} onRevealNext={() => undefined} />)
    const card = screen.getByTestId('hint-card-0')
    expect(card.textContent).toContain('cuerpo de la pista')
    expect(card.textContent).not.toContain('nivel 1 (general)')
  })
})
