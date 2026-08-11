/**
 * Tests for CreateDatabaseDialog.
 *
 * The dialog is controlled (`open` prop) and dumb — `onSubmit` is the
 * only side-effect surface. The tests assert:
 *  - the dialog renders nothing when closed
 *  - it renders the form when open
 *  - empty / whitespace name is rejected
 *  - valid name triggers onSubmit with the trimmed value
 *  - the submit error from the parent surfaces as a red banner
 *  - Escape closes the dialog
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { CreateDatabaseDialog } from '../../../../src/ui/components/databases/CreateDatabaseDialog'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('CreateDatabaseDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <CreateDatabaseDialog open={false} onClose={vi.fn()} onSubmit={vi.fn(async () => undefined)} />,
    )
    expect(container.querySelector('[data-testid="create-database-dialog"]')).toBeNull()
  })

  it('renders the form when open', () => {
    render(
      <CreateDatabaseDialog open={true} onClose={vi.fn()} onSubmit={vi.fn(async () => undefined)} />,
    )
    expect(screen.getByTestId('create-database-dialog')).toBeTruthy()
    expect(screen.getByTestId('create-database-dialog-name')).toBeTruthy()
  })

  it('does not call onSubmit when the name is empty', async () => {
    const onSubmit = vi.fn(async () => undefined)
    render(
      <CreateDatabaseDialog open={true} onClose={vi.fn()} onSubmit={onSubmit} />,
    )
    const submit = screen.getByTestId('create-database-dialog-submit') as HTMLButtonElement
    // Submit is disabled when the name is empty.
    expect(submit.disabled).toBe(true)
    // Type a single space and try again.
    const input = screen.getByTestId('create-database-dialog-name') as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    expect(submit.disabled).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with the trimmed name on valid submit', async () => {
    const onSubmit = vi.fn(async () => undefined)
    render(
      <CreateDatabaseDialog open={true} onClose={vi.fn()} onSubmit={onSubmit} />,
    )
    const input = screen.getByTestId('create-database-dialog-name') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  mi-db  ' } })
    const submit = screen.getByTestId('create-database-dialog-submit') as HTMLButtonElement
    fireEvent.click(submit)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('mi-db'))
  })

  it('surfaces the parent error in a red banner', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('algo falló')
    })
    render(
      <CreateDatabaseDialog open={true} onClose={vi.fn()} onSubmit={onSubmit} />,
    )
    const input = screen.getByTestId('create-database-dialog-name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'mi-db' } })
    fireEvent.click(screen.getByTestId('create-database-dialog-submit'))
    await waitFor(() => {
      expect(screen.getByTestId('create-database-dialog-error').textContent).toMatch(/algo falló/)
    })
  })

  it('closes the dialog on Escape', async () => {
    const onClose = vi.fn()
    render(
      <CreateDatabaseDialog open={true} onClose={onClose} onSubmit={vi.fn(async () => undefined)} />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
