/**
 * Public surface of the exercise engine.
 *
 * Re-exports the types, the comparator, the strategies, the orchestrator,
 * the runner, the hint engine and the error-pattern detector. Consumers
 * should import from this barrel rather than the individual files to
 * keep a stable import surface.
 */

export * from './types'
export * from './result-comparator'
export * from './strategies'
export * from './validator'
export * from './runner'
export * from './hint-engine'
export * from './error-pattern-detector'
