/**
 * Type augmentation for the `vitest-axe` matchers.
 *
 * The library extends Vitest's `expect()` with a `toHaveNoViolations`
 * matcher that the a11y smoke tests rely on. We import the package's
 * own type definitions so the matcher shows up in the IDE and the
 * strict typecheck (`tsconfig.app.json`) accepts the new assertion.
 */
/// <reference types="vitest" />
/// <reference types="vitest-axe/dist/to-have-no-violations-e1679411" />

import type AxeCore from 'axe-core'

interface NoViolationsMatcherResult {
  pass: boolean
  message(): string
  actual: AxeCore.Result[]
}

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): NoViolationsMatcherResult
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): NoViolationsMatcherResult
  }
}

export {}
