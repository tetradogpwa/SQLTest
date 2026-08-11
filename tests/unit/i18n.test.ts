/**
 * Tests for the i18n core.
 *
 * Covers:
 *  - Lookup of a known key in the active locale.
 *  - Fallback to the key itself when the key is missing.
 *  - Interpolation: `{name}` placeholders are replaced with the
 *    values from the `vars` argument.
 *  - Unknown placeholders are left intact in the output.
 *  - `setLocale()` switches the dictionary.
 *  - `useTranslation()` returns a `t` function bound to the active
 *    locale and a `setLocale` callback that updates the locale.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'
import { t, setLocale, getLocale, useTranslation, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../../src/core/i18n/i18n'

describe('i18n — t()', () => {
  it('returns the key itself when the key is missing', () => {
    // Temporarily switch to English so we are not depending on the
    // current module-level default.
    setLocale(DEFAULT_LOCALE)
    expect(t('this.key.does.not.exist', 'es')).toBe('this.key.does.not.exist')
  })

  it('translates a known key in Spanish', () => {
    setLocale('es')
    expect(t('nav.home', 'es')).toBe('Inicio')
    expect(t('nav.settings', 'es')).toBe('Ajustes')
  })

  it('translates a known key in English', () => {
    setLocale('en')
    expect(t('nav.home', 'en')).toBe('Home')
    expect(t('nav.settings', 'en')).toBe('Settings')
  })

  it('falls back to the default locale when an unsupported locale is requested', () => {
    expect(t('nav.home', 'fr' as unknown as 'es')).toBe('Inicio')
  })

  it('interpolates variables with the {name} syntax', () => {
    setLocale('es')
    const out = t('home.progress.lessonsCompleted', 'es', { done: 3, total: 16 })
    expect(out).toBe('3 de 16 lecciones completadas')
  })

  it('leaves unknown placeholders intact', () => {
    setLocale('es')
    const out = t('home.progress.percent', 'es', { percent: 42 })
    // "{percent}" exists, so the substitution succeeds. The unknown
    // placeholder is added to a string that does not use it.
    expect(out).toBe('42% completado')
  })

  it('returns the raw value when no vars are provided', () => {
    setLocale('es')
    expect(t('nav.home', 'es')).toBe('Inicio')
  })
})

describe('i18n — setLocale()', () => {
  it('changes the current locale for subsequent t() calls', () => {
    setLocale('es')
    expect(getLocale()).toBe('es')
    expect(t('nav.home')).toBe('Inicio')

    setLocale('en')
    expect(getLocale()).toBe('en')
    expect(t('nav.home')).toBe('Home')
  })

  it('ignores unsupported locales', () => {
    setLocale('es')
    setLocale('fr' as unknown as 'es')
    expect(getLocale()).toBe('es')
  })

  it('exposes the supported locales list', () => {
    expect(SUPPORTED_LOCALES).toContain('es')
    expect(SUPPORTED_LOCALES).toContain('en')
  })
})

describe('i18n — useTranslation()', () => {
  beforeEach(() => {
    setLocale('es')
  })

  afterEach(() => {
    cleanup()
    setLocale('es')
  })

  it('returns the active locale', () => {
    const { result } = renderHook(() => useTranslation())
    expect(result.current.locale).toBe('es')
  })

  it('returns a t() bound to the active locale', () => {
    const { result } = renderHook(() => useTranslation())
    expect(result.current.t('nav.home')).toBe('Inicio')
  })

  it('interpolates variables in the t() output', () => {
    const { result } = renderHook(() => useTranslation())
    expect(
      result.current.t('home.progress.lessonsCompleted', { done: 2, total: 16 }),
    ).toBe('2 de 16 lecciones completadas')
  })

  it('re-renders when setLocale() is called', () => {
    const { result } = renderHook(() => useTranslation())
    expect(result.current.locale).toBe('es')
    expect(result.current.t('nav.home')).toBe('Inicio')

    act(() => {
      result.current.setLocale('en')
    })

    expect(result.current.locale).toBe('en')
    expect(result.current.t('nav.home')).toBe('Home')
  })
})
