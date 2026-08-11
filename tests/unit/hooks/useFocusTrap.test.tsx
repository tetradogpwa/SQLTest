/**
 * Tests for useFocusTrap.
 *
 * The hook is the cornerstone of the modal a11y contract (WCAG
 * 2.4.3 / 2.1.2). We assert:
 *  - when `active` flips to `true`, the first focusable element
 *    inside the container receives focus;
 *  - when `active` flips to `false`, the previously-focused element
 *    gets focus back;
 *  - Tab / Shift+Tab cycle inside the container, even when the
 *    active element has already left it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'

import { useFocusTrap } from '../../../src/hooks/useFocusTrap'

afterEach(() => {
  cleanup()
})

function TrapHarness(): ReactNode {
  const [open, setOpen] = useState<boolean>(false)
  const ref = useFocusTrap<HTMLDivElement>(open)
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)} data-testid="open">
        Open
      </button>
      {open ? (
        <div ref={ref} role="dialog" data-testid="dialog" tabIndex={-1}>
          <button type="button" data-testid="first">
            First
          </button>
          <button type="button" data-testid="middle">
            Middle
          </button>
          <button type="button" data-testid="last" onClick={() => setOpen(false)}>
            Last
          </button>
        </div>
      ) : null}
      <button type="button" data-testid="outside">
        Outside
      </button>
    </div>
  )
}

describe('useFocusTrap', () => {
  it('focuses the first focusable element when the trap becomes active', async () => {
    render(<TrapHarness />)
    fireEvent.click(screen.getByTestId('open'))
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('first'))
    })
  })

  it('cycles from the last focusable to the first on Tab', async () => {
    render(<TrapHarness />)
    fireEvent.click(screen.getByTestId('open'))
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('first'))
    })
    // Move focus to the last button.
    ;(screen.getByTestId('last') as HTMLButtonElement).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByTestId('first'))
  })

  it('cycles from the first focusable to the last on Shift+Tab', async () => {
    render(<TrapHarness />)
    fireEvent.click(screen.getByTestId('open'))
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('first'))
    })
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByTestId('last'))
  })

  it('restores focus to the trigger element on close', async () => {
    render(<TrapHarness />)
    const trigger = screen.getByTestId('open') as HTMLButtonElement
    trigger.focus()
    fireEvent.click(trigger)
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('first'))
    })
    // Close by clicking the "Last" button.
    fireEvent.click(screen.getByTestId('last'))
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('does not steal focus when inactive', () => {
    render(<TrapHarness />)
    // No trap mounted → the dialog is not in the DOM and the
    // outside button has not been focused.
    expect(screen.queryByTestId('dialog')).toBeNull()
    expect(document.activeElement).not.toBe(screen.getByTestId('outside'))
  })
})
