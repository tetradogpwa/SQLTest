/**
 * Tests for ImportDatabaseDialog.
 *
 * The dialog is controlled and dumb; we drive it through user events
 * and assert the validation rules and the file upload flow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ImportDatabaseDialog } from '../../../../src/ui/components/databases/ImportDatabaseDialog'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

function makeDbFile(name: string, size: number, type = 'application/octet-stream'): File {
  // We don't actually allocate the full bytes — `size` is overridden.
  const file = new File([new Uint8Array(Math.min(10, size))], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('ImportDatabaseDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ImportDatabaseDialog open={false} onClose={vi.fn()} onSubmit={vi.fn(async () => undefined)} />,
    )
    expect(container.querySelector('[data-testid="import-database-dialog"]')).toBeNull()
  })

  it('renders the dropzone + file input when open', () => {
    render(
      <ImportDatabaseDialog open={true} onClose={vi.fn()} onSubmit={vi.fn(async () => undefined)} />,
    )
    expect(screen.getByTestId('import-database-dialog-dropzone')).toBeTruthy()
    expect(screen.getByTestId('import-database-dialog-file-input')).toBeTruthy()
  })

  it('rejects files with a wrong extension', async () => {
    const onSubmit = vi.fn(async () => undefined)
    render(
      <ImportDatabaseDialog open={true} onClose={vi.fn()} onSubmit={onSubmit} />,
    )
    const input = screen.getByTestId('import-database-dialog-file-input') as HTMLInputElement
    const file = makeDbFile('foo.txt', 1024)
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => {
      expect(screen.getByTestId('import-database-dialog-error')).toBeTruthy()
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects files larger than 100 MB', async () => {
    const onSubmit = vi.fn(async () => undefined)
    render(
      <ImportDatabaseDialog open={true} onClose={vi.fn()} onSubmit={onSubmit} />,
    )
    const input = screen.getByTestId('import-database-dialog-file-input') as HTMLInputElement
    const file = makeDbFile('huge.db', 200 * 1024 * 1024)
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => {
      expect(screen.getByTestId('import-database-dialog-error').textContent).toMatch(/límite/i)
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the picked file with the display name', async () => {
    const onSubmit = vi.fn(async () => undefined)
    render(
      <ImportDatabaseDialog open={true} onClose={vi.fn()} onSubmit={onSubmit} />,
    )
    const input = screen.getByTestId('import-database-dialog-file-input') as HTMLInputElement
    const file = makeDbFile('imported.db', 1024)
    fireEvent.change(input, { target: { files: [file] } })
    // Wait for the filename to render.
    await waitFor(() => {
      expect(screen.getByTestId('import-database-dialog-file-name').textContent).toMatch(/imported\.db/)
    })
    fireEvent.click(screen.getByTestId('import-database-dialog-submit'))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })
    const [submittedFile, submittedName] = onSubmit.mock.calls[0] as unknown as [File, string]
    expect(submittedFile.name).toBe('imported.db')
    expect(submittedName).toBe('imported')
  })

  it('surfaces the parent error in a red banner', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('boom')
    })
    render(
      <ImportDatabaseDialog open={true} onClose={vi.fn()} onSubmit={onSubmit} />,
    )
    const input = screen.getByTestId('import-database-dialog-file-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeDbFile('x.db', 1024)] } })
    fireEvent.click(screen.getByTestId('import-database-dialog-submit'))
    await waitFor(() => {
      expect(screen.getByTestId('import-database-dialog-error').textContent).toMatch(/boom/)
    })
  })
})
