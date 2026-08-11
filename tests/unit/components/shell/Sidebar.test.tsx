/**
 * Tests for Sidebar.
 *
 * The sidebar has two variants:
 *  - `rail` — persistent on desktop.
 *  - `drawer` — slide-over on mobile, controlled by the shell.
 *
 * Each variant renders either a compact icon-only list (no labels)
 * or an expanded list (with labels + progress text). The tests
 * exercise both combinations.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { Sidebar } from '../../../../src/ui/components/shell/Sidebar'

// Each test gets its own mock so the module-level Dexie live query
// can be controlled per case.
let mockPercent: number = 0
let mockHydrated: boolean = true

vi.mock('dexie-react-hooks', async (importOriginal) => {
  const mod = await importOriginal<typeof import('dexie-react-hooks')>()
  return {
    ...mod,
    useLiveQuery: () =>
      mockHydrated
        ? {
            totalLessons: 16,
            completedLessons: 4,
            totalExercises: 100,
            completedExercises: Math.round((mockPercent / 100) * 100),
            percent: mockPercent,
          }
        : undefined,
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  mockPercent = 25
  mockHydrated = true
})

describe('Sidebar (rail variant)', () => {
  it('renders the navigation links', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar variant="rail" />
      </MemoryRouter>,
    )
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    // The brand and a few nav links must be present.
    expect(links.some((a) => a.getAttribute('href') === '/')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '/course')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '/playground')).toBe(true)
  })

  it('does not render expanded labels in the rail variant when collapsed', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar variant="rail" collapsed />
      </MemoryRouter>,
    )
    // The expanded "Inicio" label should not be present when the
    // rail is collapsed — only icons are shown.
    expect(screen.queryByText('Inicio')).toBeNull()
  })

  it('marks the active link with aria-current="page"', () => {
    render(
      <MemoryRouter initialEntries={['/playground']}>
        <Sidebar variant="rail" />
      </MemoryRouter>,
    )
    const active = screen.getByRole('link', { name: /playground/i })
    expect(active.getAttribute('aria-current')).toBe('page')
  })
})

describe('Sidebar (drawer variant)', () => {
  it('renders the navigation links when open', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar variant="drawer" mobileOpen onRequestClose={vi.fn()} />
      </MemoryRouter>,
    )
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
  })

  it('renders the expanded labels in the drawer', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar variant="drawer" mobileOpen onRequestClose={vi.fn()} />
      </MemoryRouter>,
    )
    // Drawer shows the text labels next to the icons.
    expect(screen.getAllByText('Inicio').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Curso').length).toBeGreaterThan(0)
  })

  it('calls onRequestClose when a link is clicked (drawer only)', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar variant="drawer" mobileOpen onRequestClose={onClose} />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /playground/i })
    fireEvent.click(link)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not call onRequestClose from the rail variant', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter initialEntries={['/']}>
        {/* `onRequestClose` is ignored for the rail variant. */}
        <Sidebar variant="rail" onRequestClose={onClose} />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /playground/i })
    fireEvent.click(link)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Sidebar (progress)', () => {
  it('renders the progress bar with the right aria-valuenow', () => {
    // The bar's `aria-valuenow` is driven by the `percent` value
    // from the useLiveQuery result, which we mock to 25. The
    // rendered "Sin progreso" text is gated on a separate
    // `hydrated` flag that requires the settings store to be
    // populated — we exercise that here by simply asserting the
    // aria-valuenow.
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar variant="drawer" mobileOpen onRequestClose={vi.fn()} />
      </MemoryRouter>,
    )
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('25')
  })

  it('renders the "empty" text in the drawer when there is no progress', async () => {
    // Override the mock for this single test.
    vi.doMock('../../../../src/hooks/useProgress', () => ({
      useProgress: () => ({
        courseProgress: { totalLessons: 0, completedLessons: 0, totalExercises: 0, completedExercises: 0, percent: 0 },
        completedExerciseIds: new Set<string>(),
        progressRows: [],
        statsRows: [],
      }),
    }))
    const { Sidebar: Fresh } = await import('../../../../src/ui/components/shell/Sidebar')
    render(
      <MemoryRouter initialEntries={['/']}>
        <Fresh variant="drawer" mobileOpen onRequestClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/sin progreso/i)).toBeTruthy()
  })
})
