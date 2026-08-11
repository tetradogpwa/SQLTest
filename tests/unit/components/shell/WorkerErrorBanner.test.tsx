/**
 * Tests for WorkerErrorBanner.
 *
 * The banner subscribes to `useDatabase` and surfaces the `error`
 * string + a "retry" action. We mock `useDatabase` and assert:
 *  - the banner is absent when there is no error
 *  - the banner renders the error message
 *  - clicking "Reintentar" calls `retry()`
 *  - clicking the dismiss button hides the banner for the rest of
 *    the session
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

let mockState: {
  error: string | null
  retry: ReturnType<typeof vi.fn>
  status: string
} = {
  error: null,
  retry: vi.fn(async () => undefined),
  status: 'ready',
}

vi.mock('../../../../src/hooks/useDatabase', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/hooks/useDatabase')>()
  return {
    ...mod,
    useDatabase: () => mockState,
  }
})

import { WorkerErrorBanner } from '../../../../src/ui/components/shell/WorkerErrorBanner'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  mockState = {
    error: null,
    retry: vi.fn(async () => undefined),
    status: 'ready',
  }
})

function Wrapper(): ReactNode {
  return (
    <>
      <WorkerErrorBanner />
      <span data-testid="harness-sentinel" />
    </>
  )
}

describe('WorkerErrorBanner', () => {
  it('renders nothing when there is no error', () => {
    render(<Wrapper />)
    expect(screen.queryByTestId('worker-error-banner')).toBeNull()
  })

  it('renders the error message when useDatabase reports one', () => {
    mockState = { error: 'OPFS no disponible', retry: vi.fn(), status: 'dead' }
    render(<Wrapper />)
    expect(screen.getByTestId('worker-error-banner')).toBeTruthy()
    expect(screen.getByTestId('worker-error-banner').textContent).toMatch(/OPFS no disponible/)
  })

  it('clicking "Reintentar" calls retry', async () => {
    const retry = vi.fn(async () => undefined)
    mockState = { error: 'algo falló', retry, status: 'dead' }
    render(<Wrapper />)
    fireEvent.click(screen.getByTestId('worker-error-retry'))
    await waitFor(() => expect(retry).toHaveBeenCalled())
  })

  it('clicking the dismiss button hides the banner', () => {
    mockState = { error: 'algo falló', retry: vi.fn(), status: 'dead' }
    render(<Wrapper />)
    expect(screen.getByTestId('worker-error-banner')).toBeTruthy()
    fireEvent.click(screen.getByTestId('worker-error-dismiss'))
    expect(screen.queryByTestId('worker-error-banner')).toBeNull()
  })

  it('hides the banner while the Worker is recovering', () => {
    mockState = { error: 'algo falló', retry: vi.fn(), status: 'recovering' }
    render(<Wrapper />)
    expect(screen.queryByTestId('worker-error-banner')).toBeNull()
  })

  it('hides the banner while the Worker is initializing', () => {
    mockState = { error: 'algo falló', retry: vi.fn(), status: 'initializing' }
    render(<Wrapper />)
    expect(screen.queryByTestId('worker-error-banner')).toBeNull()
  })

  it('has the alert role so screen readers announce it', () => {
    mockState = { error: 'algo falló', retry: vi.fn(), status: 'dead' }
    render(<Wrapper />)
    const banner = screen.getByTestId('worker-error-banner')
    expect(banner.getAttribute('role')).toBe('alert')
    expect(banner.getAttribute('aria-live')).toBe('assertive')
  })
})
