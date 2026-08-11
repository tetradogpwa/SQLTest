/**
 * Tests for StatsPanel.
 *
 * Pure presentational component. We assert the three metric rows
 * render and that the error row gets the right class.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { StatsPanel } from '../../../../src/ui/components/playground/StatsPanel'

afterEach(() => {
  cleanup()
})

describe('StatsPanel', () => {
  it('renders the size / queries / error rows', () => {
    render(<StatsPanel sizeBytes={2048} queriesExecuted={7} lastError={null} />)
    expect(screen.getByTestId('stats-size').textContent).toMatch(/2\.0 KB/)
    expect(screen.getByTestId('stats-queries').textContent).toMatch(/7/)
    expect(screen.getByTestId('stats-last-error').textContent).toMatch(/—/)
  })

  it('shows the error text in the error class when present', () => {
    render(<StatsPanel sizeBytes={null} queriesExecuted={0} lastError="boom" />)
    const lastError = screen.getByTestId('stats-last-error')
    expect(lastError.textContent).toMatch(/boom/)
    expect(lastError.className).toMatch(/error/)
  })
})
