/**
 * Validator — orquestador de validaciones (RESEARCH §10.6).
 *
 * El Validator recibe una lista de `Validation` y delega en los
 * `ValidationStrategy` registrados. Cada strategy maneja un tipo; el
 * Validator los indexa en un `Map` por `type` para O(1) lookup.
 *
 * Uso típico:
 *
 * ```ts
 * import { Validator, defaultStrategies } from '@/core/exercises'
 * const validator = new Validator(defaultStrategies)
 * const report = await validator.runAll(ctx, exercise.validation)
 * if (report.allPassed) { ... }
 * ```
 *
 * Notas de diseño:
 *
 *   - Las validaciones se ejecutan **secuencialmente** para mantener
 *     determinismo (los checks pueden depender del orden, ej. schema
 *     antes que rowCount). Si la performance se vuelve un problema,
 *     se puede cambiar a `Promise.all` con un wrapper de isolation.
 *   - Si una validación de tipo desconocido se declara, el Validator
 *     **lanza** un error (esto debe ser detectado en build time por
 *     la catalogación del ejercicio).
 *   - Cada resultado lleva `strategyType` para que la UI pueda agrupar
 *     feedback por categoría.
 */

import type {
  Validation,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
  ValidationType,
} from './types'

/** Reporte agregado de la corrida. */
export interface ValidationReport {
  /** `true` solo si TODAS las validaciones pasaron. */
  allPassed: boolean
  /** Resultados en el mismo orden que `validations`. */
  results: ValidationResult[]
  /** Número de validaciones que pasaron. */
  passedCount: number
  /** Número de validaciones que fallaron. */
  failedCount: number
}

export class Validator {
  private readonly strategies: Map<ValidationType, ValidationStrategy>
  private readonly ordered: ValidationStrategy[]

  constructor(strategies: ValidationStrategy[]) {
    this.ordered = [...strategies]
    this.strategies = new Map()
    for (const s of this.ordered) {
      if (this.strategies.has(s.type)) {
        // Si hay dos strategies para el mismo tipo, el último gana.
        // No lanzamos: a veces se quiere override.
        this.strategies.set(s.type, s)
      } else {
        this.strategies.set(s.type, s)
      }
    }
  }

  /** Devuelve los tipos registrados. */
  registeredTypes(): ValidationType[] {
    return Array.from(this.strategies.keys())
  }

  /** Devuelve el strategy para un tipo, o `undefined`. */
  getStrategy(type: ValidationType): ValidationStrategy | undefined {
    return this.strategies.get(type)
  }

  /**
   * Ejecuta todas las validaciones contra `ctx`. Las validaciones se
   * corren en orden. Cada strategy se llama con su `Validation`
   * específica (discriminada por `type`).
   */
  async runAll(
    ctx: ValidationContext,
    validations: Validation[],
  ): Promise<ValidationReport> {
    const results: ValidationResult[] = []
    for (const validation of validations) {
      const strategy = this.strategies.get(validation.type)
      if (!strategy) {
        throw new Error(
          `Validator: no hay strategy registrado para el tipo "${validation.type}". ` +
            `Registrados: ${this.registeredTypes().join(', ')}`,
        )
      }
      // El cast es seguro porque `strategy.type === validation.type`
      // por construcción del Map, pero TypeScript no lo puede inferir.
      const result = await strategy.apply(ctx, validation as never)
      results.push({
        ...result,
        strategyType: validation.type,
      })
    }
    const passed = results.filter((r) => r.passed).length
    return {
      allPassed: passed === results.length,
      results,
      passedCount: passed,
      failedCount: results.length - passed,
    }
  }

  /**
   * Versión "fail-fast" — corre las validaciones secuencialmente y
   * devuelve en cuanto encuentra un fallo. Útil para UI donde
   * quieres feedback inmediato.
   */
  async runUntilFirstFailure(
    ctx: ValidationContext,
    validations: Validation[],
  ): Promise<ValidationReport> {
    const results: ValidationResult[] = []
    for (const validation of validations) {
      const strategy = this.strategies.get(validation.type)
      if (!strategy) {
        throw new Error(
          `Validator: no hay strategy registrado para el tipo "${validation.type}".`,
        )
      }
      const result = await strategy.apply(ctx, validation as never)
      results.push({ ...result, strategyType: validation.type })
      if (!result.passed) {
        const passed = results.filter((r) => r.passed).length
        return {
          allPassed: false,
          results,
          passedCount: passed,
          failedCount: results.length - passed,
        }
      }
    }
    return {
      allPassed: true,
      results,
      passedCount: results.length,
      failedCount: 0,
    }
  }

  /**
   * Versión paralela: corre todas las validaciones con `Promise.all`.
   * Útil cuando las validaciones son independientes (ej. `usesKeyword`
   * no toca la DB). Las validaciones que tocan la DB no se deben
   * paralelizar porque wa-sqlite no es seguro en concurrencia.
   */
  async runParallel(
    ctx: ValidationContext,
    validations: Validation[],
  ): Promise<ValidationReport> {
    const tasks = validations.map(async (validation) => {
      const strategy = this.strategies.get(validation.type)
      if (!strategy) {
        throw new Error(
          `Validator: no hay strategy registrado para el tipo "${validation.type}".`,
        )
      }
      const result = await strategy.apply(ctx, validation as never)
      return { ...result, strategyType: validation.type }
    })
    const results = await Promise.all(tasks)
    const passed = results.filter((r) => r.passed).length
    return {
      allPassed: passed === results.length,
      results,
      passedCount: passed,
      failedCount: results.length - passed,
    }
  }

  /** Lista los strategies en orden de registro. */
  listStrategies(): ReadonlyArray<ValidationStrategy> {
    return this.ordered
  }
}
