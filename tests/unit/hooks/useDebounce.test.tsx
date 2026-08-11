/**
 * Tests for useDebounce.
 *
 * Covers the timer-bouncing logic + the early-exit when delayMs <= 0.
 * Uses fake timers so the test is deterministic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useState, type ReactElement } from 'react'

import { useDebounce } from '../../../src/hooks/useDebounce'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

function Probe({ value, delayMs }: { value: string; delayMs: number }): ReactElement {
  const debounced = useDebounce(value, delayMs)
  return <span data-testid="probe">{debounced}</span>
}

describe('useDebounce', () => {
  it('returns the value immediately on first render', () => {
    render(<Probe value="alpha" delayMs={200} />)
    expect(screen.getByTestId('probe').textContent).toBe('alpha')
  })

  it('does not update while changes are within the delay window', () => {
    function Host(): ReactElement {
      const [v, setV] = useState('a')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__setV = setV
      const debounced = useDebounce(v, 200)
      return <span data-testid="host">{debounced}</span>
    }
    render(<Host />)
    expect(screen.getByTestId('host').textContent).toBe('a')
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__setV('b')
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(screen.getByTestId('host').textContent).toBe('a')
  })

  it('updates once the delay elapses without further changes', () => {
    function Host(): ReactElement {
      const [v, setV] = useState('a')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__setV = setV
      const debounced = useDebounce(v, 200)
      return <span data-testid="host">{debounced}</span>
    }
    render(<Host />)
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__setV('b')
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByTestId('host').textContent).toBe('b')
  })

  it('coalesces rapid updates into a single late update', () => {
    function Host(): ReactElement {
      const [v, setV] = useState('a')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__setV = setV
      const debounced = useDebounce(v, 200)
      return <span data-testid="host">{debounced}</span>
    }
    render(<Host />)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setV = (globalThis as any).__setV as (v: string) => void
    act(() => setV('b'))
    act(() => vi.advanceTimersByTime(50))
    act(() => setV('c'))
    act(() => vi.advanceTimersByTime(50))
    act(() => setV('d'))
    act(() => vi.advanceTimersByTime(50))
    // Still nothing — 150ms total < 200ms, and the latest value is 'd'.
    expect(screen.getByTestId('host').textContent).toBe('a')
    act(() => vi.advanceTimersByTime(200))
    expect(screen.getByTestId('host').textContent).toBe('d')
  })

  it('updates immediately when delayMs <= 0', () => {
    function Host(): ReactElement {
      const [v, setV] = useState('a')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__setV = setV
      const debounced = useDebounce(v, 0)
      return <span data-testid="host">{debounced}</span>
    }
    render(<Host />)
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__setV('b')
    })
    // No timer advance needed — should reflect synchronously.
    expect(screen.getByTestId('host').textContent).toBe('b')
  })
})
