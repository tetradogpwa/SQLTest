/**
 * Barrel para los strategies de validación (RESEARCH §10.6).
 *
 * Exporta:
 *   - Las 10 clases de strategy.
 *   - `defaultStrategies`: array con las 10 instancias (sin registry
 *     custom — el runner debe instanciar `CustomStrategy` aparte si
 *     tiene validators registrados).
 *   - `allDefaultStrategies`: las 10 instancias incluyendo un
 *     `CustomStrategy` con registry vacío (suficiente para tests y
 *     para ejercicios que no usen custom).
 *   - Tipos auxiliares: `CustomValidatorFn`, `CustomValidatorRegistryLike`.
 *
 * El Validator consume cualquier `ValidationStrategy[]`. Para añadir
 * un strategy nuevo: implementar la interfaz en `strategies/<name>.ts`
 * y agregarlo aquí.
 */

import { ConstraintStrategy } from './constraint.strategy'
import { CustomStrategy } from './custom.strategy'
import { DatabaseStateStrategy } from './db-state.strategy'
import { InvariantStrategy } from './invariant.strategy'
import { JoinUsageStrategy } from './join-usage.strategy'
import { KeywordUsageStrategy } from './keyword-usage.strategy'
import { QueryPlanStrategy } from './query-plan.strategy'
import { ResultStrategy } from './result.strategy'
import { RowCountStrategy } from './row-count.strategy'
import { RowExistsStrategy } from './row-exists.strategy'
import { SchemaStrategy } from './schema.strategy'
import { TableExistsStrategy } from './table-exists.strategy'

export {
  ConstraintStrategy,
  CustomStrategy,
  DatabaseStateStrategy,
  InvariantStrategy,
  JoinUsageStrategy,
  KeywordUsageStrategy,
  QueryPlanStrategy,
  ResultStrategy,
  RowCountStrategy,
  RowExistsStrategy,
  SchemaStrategy,
  TableExistsStrategy,
}

export type { CustomValidatorFn, CustomValidatorRegistryLike } from './custom.strategy'

/** Strategies "listos para usar" — el runner puede consumir este array. */
export const defaultStrategies: ReadonlyArray<
  | ResultStrategy
  | DatabaseStateStrategy
  | SchemaStrategy
  | RowCountStrategy
  | RowExistsStrategy
  | TableExistsStrategy
  | ConstraintStrategy
  | KeywordUsageStrategy
  | JoinUsageStrategy
  | InvariantStrategy
  | QueryPlanStrategy
> = [
  new ResultStrategy(),
  new DatabaseStateStrategy(),
  new SchemaStrategy(),
  new RowCountStrategy(),
  new RowExistsStrategy(),
  new TableExistsStrategy(),
  new ConstraintStrategy(),
  new KeywordUsageStrategy(),
  new JoinUsageStrategy(),
  new InvariantStrategy(),
  new QueryPlanStrategy(),
]

/** Como `defaultStrategies` pero incluyendo el `CustomStrategy`. */
export const allDefaultStrategies = [
  ...defaultStrategies,
  new CustomStrategy(),
]
