/**
 * `custom` strategy (RESEARCH §10.1).
 *
 * Las validaciones `custom` referencian un validator registrado en
 * código (no en JSON). Este strategy no las implementa — delega en
 * un `CustomValidatorRegistry` que el runner provee.
 *
 * Si el validator no está registrado, se reporta como fallo pedagógico
 * con mensaje claro (en español).
 */

import type {
  CustomValidation,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from '../types'

/** Firma de un custom validator registrado en el runner. */
export type CustomValidatorFn = (
  ctx: ValidationContext,
  validation: CustomValidation,
) => Promise<ValidationResult>

/** Registry público (inyectado al strategy). */
export interface CustomValidatorRegistryLike {
  get(id: string): CustomValidatorFn | undefined
}

export class CustomStrategy implements ValidationStrategy {
  readonly type = 'custom' as const
  private readonly registry: CustomValidatorRegistryLike

  constructor(registry: CustomValidatorRegistryLike = { get: () => undefined }) {
    this.registry = registry
  }

  async apply(
    ctx: ValidationContext,
    validation: CustomValidation,
  ): Promise<ValidationResult> {
    const fn = this.registry.get(validation.validatorId)
    if (!fn) {
      return {
        passed: false,
        message: `no hay un validator registrado para "${validation.validatorId}".`,
        details: 'los validators custom se registran en el runner, no en el JSON del ejercicio.',
        strategyType: 'custom',
      }
    }
    try {
      const result = await fn(ctx, validation)
      return { ...result, strategyType: 'custom' }
    } catch (e) {
      return {
        passed: false,
        message: 'el validator custom lanzó un error.',
        details: (e as Error).message,
        strategyType: 'custom',
      }
    }
  }
}
