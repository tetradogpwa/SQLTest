/**
 * Tests for ErrorBanner.
 *
 * Verifies the null-state, the title rendering, the offending-token
 * display, the Levenshtein-based "did you mean" suggestions, and the
 * toggle for the raw error message.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ErrorBanner } from '../../../../src/ui/components/results/ErrorBanner'
import type { SerializedError } from '../../../../src/workers/types'

afterEach(() => {
  cleanup()
})

const baseError: SerializedError = {
  code: 'SQLITE_ERROR',
  message: 'no such table: userss',
  translatedMessage: 'No existe la tabla `userss`',
  offendingToken: 'userss',
  table: 'userss',
}

describe('ErrorBanner', () => {
  it('renders nothing when the error is null', () => {
    const { container } = render(<ErrorBanner error={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the translated title and the offending token', () => {
    render(<ErrorBanner error={baseError} />)
    expect(screen.getByText(/No existe la tabla/)).toBeTruthy()
    expect(screen.getByText('userss')).toBeTruthy()
  })

  it('suggests similar table names from the knownTables pool', () => {
    render(<ErrorBanner error={baseError} knownTables={['users', 'orders', 'posts']} />)
    // Levenshtein distance 1 (userss vs users).
    expect(screen.getByText(/¿Quisiste decir/i)).toBeTruthy()
    expect(screen.getByText('users')).toBeTruthy()
  })

  it('suggests similar column names from the knownColumns pool when table is missing', () => {
    const err: SerializedError = {
      code: 'SQLITE_ERROR',
      message: 'no such column: emial',
      translatedMessage: 'No existe la columna `emial`',
      column: 'emial',
    }
    render(<ErrorBanner error={err} knownColumns={['email', 'name']} />)
    expect(screen.getByText('email')).toBeTruthy()
  })

  it('toggles the technical error panel on click', () => {
    render(<ErrorBanner error={baseError} />)
    const toggle = screen.getByText('Mostrar error técnico')
    fireEvent.click(toggle)
    expect(screen.getByText('no such table: userss')).toBeTruthy()
    expect(screen.getByText('Ocultar error técnico')).toBeTruthy()
  })

  it('lists the hints provided in the error', () => {
    const err: SerializedError = {
      code: 'SQLITE_ERROR',
      message: 'syntax error',
      translatedMessage: 'Error de sintaxis',
      hints: ['Recuerda terminar con ;', 'Comprueba la posición del WHERE'],
    }
    render(<ErrorBanner error={err} />)
    expect(screen.getByText('Recuerda terminar con ;')).toBeTruthy()
    expect(screen.getByText('Comprueba la posición del WHERE')).toBeTruthy()
  })
})
