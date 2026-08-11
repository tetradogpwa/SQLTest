/**
 * Tests for `ProgressBar`.
 *
 * Asserts on the width computation, the label rendering, and the
 * "all done" state.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { ProgressBar } from '../../../../src/ui/components/course/ProgressBar'

afterEach(() => {
  cleanup()
})

describe('ProgressBar', () => {
  it('sets the inner fill width to done/total as a percentage', () => {
    render(<ProgressBar done={3} total={6} />)
    const fill = screen.getByTestId('progress-fill') as HTMLElement
    expect(fill.style.width).toBe('50%')
    expect(fill.dataset.width).toBe('50%')
  })

  it('renders the default "X / Y" label when no label prop is provided', () => {
    render(<ProgressBar done={2} total={5} />)
    expect(screen.getByTestId('progress-bar-label').textContent).toBe('2 / 5')
  })

  it('uses the explicit label when supplied', () => {
    render(<ProgressBar done={1} total={6} label="L1.1 · 1 / 6" />)
    expect(screen.getByTestId('progress-bar-label').textContent).toBe('L1.1 · 1 / 6')
  })

  it('fills to 100% when done equals total', () => {
    render(<ProgressBar done={4} total={4} />)
    const fill = screen.getByTestId('progress-fill') as HTMLElement
    expect(fill.style.width).toBe('100%')
    const bar = screen.getByTestId('progress-bar') as HTMLElement
    expect(bar.dataset.pct).toBe('100')
  })

  it('renders an empty bar when total is 0 (label "0 / 0")', () => {
    render(<ProgressBar done={0} total={0} />)
    const fill = screen.getByTestId('progress-fill') as HTMLElement
    expect(fill.style.width).toBe('0%')
    expect(screen.getByTestId('progress-bar-label').textContent).toBe('0 / 0')
  })

  it('exposes ARIA progressbar attributes for accessibility', () => {
    render(<ProgressBar done={2} total={4} />)
    const bar = screen.getByTestId('progress-bar') as HTMLElement
    expect(bar.getAttribute('role')).toBe('progressbar')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('4')
    expect(bar.getAttribute('aria-valuenow')).toBe('2')
  })
})
