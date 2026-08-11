/**
 * Exercise Runner (RESEARCH §5.2, §11, §13).
 *
 * Ciclo de vida del runner:
 *
 *   constructor  → configura rutas, dbIds, validator
 *   start()      → abre la working-copy (la crea si no existe) y la siembra
 *   runUserSql() → ejecuta el SQL del alumno contra la working-copy
 *   check()      → corre user SQL + solution SQL + valida
 *   reset()      → descarta la working-copy y la recrea desde el seed
 *   revealSolution() → crea una solution-copy efímera y corre la solución
 *   destroy()    → cierra y borra working-copy + solution-copy
 *
 * Reglas duras (RESEARCH §5.2 + §13):
 *
 *   - Las DBs viven en `exercises/{exerciseId}/{sessionId}-{kind}.sqlite3`.
 *   - El sessionId lo aporta el Main Thread (random por mount).
 *   - El runner NUNCA escribe en Dexie. La UI es responsable de llamar
 *     a `progressStore` y `exerciseStats` después de cada `check()`.
 *   - En el camino feliz, los errores se devuelven como
 *     `ValidationResult.passed: false` con un mensaje pedagógico
 *     ("error interno: …") y NO se relanzan al caller.
 *
 * El runner no toca UI ni Dexie. Toda interacción con la UI pasa por
 * los valores que devuelve (`QueryResult`, `ValidationReport`, …).
 */

import type { DatabaseSchema, QueryResult, StorageCapability } from '../../workers/types'
import type {
  DBApi,
  Exercise,
  ValidationContext,
  ValidationResult,
  ValidationStrategy,
} from './types'
import type { ValidationReport } from './validator'
import { Validator } from './validator'
import { defaultStrategies } from './strategies'

/* ──────────────────────────────────────────────────────────────────── *
 *  Tipos públicos                                                        *
 * ──────────────────────────────────────────────────────────────────── */

export interface ExerciseRunnerOptions {
  /** Fachada del Worker (DBApi). */
  api: DBApi
  /** Ejercicio a resolver. */
  exercise: Exercise
  /** Capacidad de almacenamiento detectada. */
  capability: StorageCapability
  /** ID aleatorio por mount (lo provee el Main Thread). */
  sessionId: string
  /**
   * Strategies de validación. Si no se pasan, se usan los 11 por defecto
   * (sin `CustomStrategy`; añadirlo explícitamente si el ejercicio lo
   * requiere). El caller puede inyectar su propio `Validator` vía
   * `validatorFactory` para tener más control.
   */
  strategies?: ValidationStrategy[]
  /** Factoría opcional para construir un `Validator` con DI completa. */
  validatorFactory?: (strategies: ValidationStrategy[]) => Validator
}

export interface CheckOptions {
  /** SQL a validar. Si se omite, se usa el último SQL ejecutado por `runUserSql`. */
  sql?: string
  /** Nº de pistas ya reveladas (se inyecta en el contexto). */
  hintsRevealed?: number
  /** Timeout por defecto para cada `exec` durante el check (ms). */
  timeoutMs?: number
}

export interface RevealResult {
  result: QueryResult
  schema: DatabaseSchema
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers                                                                *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Genera un dbId determinista pero único a partir de un string. Usa
 * un hash FNV-1a de 32 bits, reducido a un rango seguro (≥ 1000 para
 * no chocar con DBs que el Main Thread pueda abrir con dbIds bajos).
 */
function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  // Devolvemos en un rango alto (> 1000) para no chocar con los dbIds
  // que el Playground pueda asignar.
  return 1000 + (hash % 1_000_000_000)
}

/** Mensaje de error interno (en español) cuando algo explota. */
function internalError(detail: string): ValidationResult {
  return {
    passed: false,
    message: `error interno: ${detail}.`,
    suggestions: [
      'intenta reiniciar el ejercicio.',
      'si persiste, reporta el problema con el identificador del ejercicio.',
    ],
    strategyType: 'result',
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Runner                                                                 *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Estado del runner. El diagrama:
 *
 *   fresh --start()--> started --runUserSql()--> started
 *                     started --check()--------> started
 *                     started --reset()--------> started (nueva seed)
 *                     started --destroy()------> destroyed
 *                     started --revealSolution()--> started
 *
 * `destroyed` es terminal: cualquier método (salvo `destroy` mismo) lanza
 * un error descriptivo. Esto evita "uso después de dispose".
 */
export class ExerciseRunner {
  readonly exercise: Exercise
  readonly sessionId: string
  readonly capability: StorageCapability
  private readonly api: DBApi
  private readonly validator: Validator

  /** Path OPFS de la working-copy. */
  readonly workingFilename: string
  /** Path OPFS de la solution-copy (solo se crea en `revealSolution()`). */
  readonly solutionFilename: string

  /** dbId de la working-copy (estable durante la vida del runner). */
  readonly workingDbId: number
  /** dbId de la solution-copy. */
  readonly solutionDbId: number

  /** Última SQL ejecutada por el usuario (para `check()` sin argumentos). */
  private lastUserSql: string | null = null

  /** Última QueryResult devuelta al usuario. */
  private lastUserResult: QueryResult | null = null

  /** Estado del ciclo de vida. */
  private state: 'fresh' | 'started' | 'destroyed' = 'fresh'

  constructor(opts: ExerciseRunnerOptions) {
    this.exercise = opts.exercise
    this.sessionId = opts.sessionId
    this.capability = opts.capability
    this.api = opts.api
    const strategies = opts.strategies ?? [...defaultStrategies]
    this.validator = opts.validatorFactory
      ? opts.validatorFactory(strategies)
      : new Validator(strategies)

    this.workingFilename = `exercises/${opts.exercise.id}/${opts.sessionId}-work.sqlite3`
    this.solutionFilename = `exercises/${opts.exercise.id}/${opts.sessionId}-solution.sqlite3`
    this.workingDbId = fnv1aHash(`work:${opts.exercise.id}:${opts.sessionId}`)
    this.solutionDbId = fnv1aHash(`solution:${opts.exercise.id}:${opts.sessionId}`)
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  Estado                                                          *
   * ──────────────────────────────────────────────────────────────── */

  /** `true` si `start()` se llamó y `destroy()` no. */
  isStarted(): boolean {
    return this.state === 'started'
  }

  /** `true` si `destroy()` se llamó. Tras esto el runner es inutilizable. */
  isDestroyed(): boolean {
    return this.state === 'destroyed'
  }

  /** Última SQL que ejecutó el usuario (o `null` si todavía ninguna). */
  getLastUserSql(): string | null {
    return this.lastUserSql
  }

  /** Última QueryResult producida por `runUserSql`. */
  getLastUserResult(): QueryResult | null {
    return this.lastUserResult
  }

  private ensureAlive(): void {
    if (this.state === 'destroyed') {
      throw new Error('ExerciseRunner.destroyed: el runner fue destruido y no puede usarse.')
    }
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  start / reset / destroy                                         *
   * ──────────────────────────────────────────────────────────────── */

  /**
   * Inicializa el runner:
   *   1. Abre la working-copy (la crea si no existe).
   *   2. Si `exercise.lessonDbSeed` está definido y el runner está
   *      en estado `fresh` (es decir, es la primera vez que se abre
   *      este session), ejecuta el seed.
   *
   * Es idempotente: si ya está en estado `started`, no hace nada.
   */
  async start(): Promise<void> {
    this.ensureAlive()
    if (this.state === 'started') return

    try {
      await this.api.open(this.workingDbId, this.workingFilename, 'readwrite')
    } catch (e) {
      throw new Error(
        `ExerciseRunner.start: no se pudo abrir la working-copy (${(e as Error).message})`,
      )
    }

    if (this.exercise.lessonDbSeed) {
      try {
        await this.api.exec(this.workingDbId, this.exercise.lessonDbSeed, {
          timeoutMs: 5000,
        })
      } catch (e) {
        // Si la siembra falla, intentamos cerrar y propagar.
        await this.safeClose(this.workingDbId)
        throw new Error(
          `ExerciseRunner.start: la siembra (lessonDbSeed) falló (${(e as Error).message})`,
        )
      }
    }

    this.state = 'started'
  }

  /**
   * Descarta la working-copy y la recrea desde el seed. El Main Thread
   * puede llamar a esto cuando el alumno pulsa "Reiniciar ejercicio".
   */
  async reset(): Promise<void> {
    this.ensureAlive()
    try {
      await this.safeClose(this.workingDbId)
      try {
        await this.api.deleteUserDatabase(this.workingDbId)
      } catch {
        // Si deleteUserDatabase no está implementado en el mock, no
        // es grave: la próxima `open()` la sobrescribirá.
      }
      // También descartamos la solution-copy si existe.
      await this.safeClose(this.solutionDbId)
      try {
        await this.api.deleteUserDatabase(this.solutionDbId)
      } catch {
        // ver nota arriba
      }
    } finally {
      this.state = 'fresh'
      this.lastUserSql = null
      this.lastUserResult = null
    }
    await this.start()
  }

  /**
   * Cierra ambas DBs y borra los archivos. Tras esto el runner es
   * inutilizable. Es idempotente: llamarlo dos veces no rompe nada.
   */
  async destroy(): Promise<void> {
    if (this.state === 'destroyed') return
    try {
      await this.safeClose(this.workingDbId)
      await this.safeClose(this.solutionDbId)
      try {
        await this.api.deleteUserDatabase(this.workingDbId)
      } catch {
        /* ver reset() */
      }
      try {
        await this.api.deleteUserDatabase(this.solutionDbId)
      } catch {
        /* ver reset() */
      }
    } finally {
      this.state = 'destroyed'
      this.lastUserSql = null
      this.lastUserResult = null
    }
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  Ejecución                                                       *
   * ──────────────────────────────────────────────────────────────── */

  /**
   * Ejecuta la SQL del usuario sobre la working-copy. Si la llamada
   * tiene éxito, actualiza `lastUserSql` y `lastUserResult` para que
   * `check()` pueda validar sin necesidad de re-pasar la SQL.
   *
   * Si el runner todavía no está `started`, llama a `start()` primero
   * (cortesía para tests / uso inmediato tras el constructor).
   */
  async runUserSql(sql: string, opts?: { timeoutMs?: number }): Promise<QueryResult> {
    this.ensureAlive()
    if (this.state === 'fresh') await this.start()
    const result = await this.api.exec(this.workingDbId, sql, {
      ...(opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    })
    this.lastUserSql = sql
    this.lastUserResult = result
    return result
  }

  /**
   * Ejecuta el flujo de validación:
   *   1. Re-ejecuta la SQL del usuario sobre la working-copy
   *      (o toma `opts.sql` si se pasa explícitamente).
   *   2. Crea una solution-copy efímera a partir del seed, le corre
   *      `exercise.solution`, e introspecciona su schema.
   *   3. Construye el `ValidationContext` y delega en el Validator.
   *
   * Si algo explota, devuelve un `ValidationReport` con
   * `allPassed: false` y un único `ValidationResult` de error interno
   * (no relanza al caller, salvo que el runner esté destruido).
   */
  async check(opts: CheckOptions = {}): Promise<ValidationReport> {
    this.ensureAlive()
    if (this.state === 'fresh') await this.start()

    const userSql = opts.sql ?? this.lastUserSql
    if (!userSql) {
      return {
        allPassed: false,
        passedCount: 0,
        failedCount: 1,
        results: [
          {
            passed: false,
            message: 'todavía no has ejecutado ninguna consulta.',
            suggestions: [
              'pulsa "Ejecutar" para probar tu SQL y luego "Comprobar".',
            ],
            strategyType: 'result',
          },
        ],
      }
    }

    if (!this.exercise.solution) {
      return {
        allPassed: false,
        passedCount: 0,
        failedCount: 1,
        results: [
          {
            passed: false,
            message: 'este ejercicio no tiene una solución de referencia.',
            details: `ejercicio ${this.exercise.id} (tipo ${this.exercise.type})`,
            strategyType: 'result',
          },
        ],
      }
    }

    try {
      // 1. Re-ejecutar SQL del usuario sobre la working-copy para
      //    tener un `userResult` fresco. Usamos el mismo timeout que
      //    el último run, si lo hay.
      const timeout = opts.timeoutMs ?? 5000
      const userResult = await this.api.exec(this.workingDbId, userSql, { timeoutMs: timeout })
      this.lastUserSql = userSql
      this.lastUserResult = userResult

      // 2. Crear la solution-copy efímera: abrir, sembrar, correr la
      //    solución, introspeccionar. La cerramos al final.
      const solutionOpened = await this.openSolutionCopy()
      let solutionResult: QueryResult | null = null
      let userSchema: DatabaseSchema
      let solutionSchema: DatabaseSchema

      try {
        solutionResult = await this.api.exec(this.solutionDbId, this.exercise.solution, {
          timeoutMs: timeout,
        })
        ;[userSchema, solutionSchema] = await Promise.all([
          this.api.schema(this.workingDbId),
          this.api.schema(this.solutionDbId),
        ])
      } finally {
        // Independientemente de si los exec fallaron, cerramos la
        // solution-copy para no dejar basura.
        await this.safeClose(this.solutionDbId)
      }
      // Suprimimos warning de `solutionOpened` no usado: lo conservamos
      // para asserts futuros (es un side-effect de abrir la solution-copy).
      void solutionOpened

      // 3. Construir el contexto y delegar.
      const ctx: ValidationContext = {
        api: this.api,
        dbId: this.workingDbId,
        userSql,
        solutionSql: this.exercise.solution,
        userResult,
        solutionResult,
        userSchema,
        solutionSchema,
        capability: this.capability,
        hintsRevealed: opts.hintsRevealed ?? 0,
      }

      return await this.validator.runAll(ctx, this.exercise.validation)
    } catch (e) {
      return {
        allPassed: false,
        passedCount: 0,
        failedCount: this.exercise.validation.length || 1,
        results: [internalError((e as Error).message)],
      }
    }
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  Solución                                                        *
   * ──────────────────────────────────────────────────────────────── */

  /**
   * Crea una solution-copy efímera, le corre `exercise.solution` y
   * devuelve el resultado + el schema. La solution-copy se cierra
   * antes de devolver, pero su archivo puede quedar en OPFS hasta
   * el próximo `reset()`/`destroy()` (no es estrictamente necesario
   * borrarlo en cada reveal, pero `reset` y `destroy` lo hacen).
   */
  async revealSolution(opts?: { timeoutMs?: number }): Promise<RevealResult> {
    this.ensureAlive()
    if (this.state === 'fresh') await this.start()

    if (!this.exercise.solution) {
      return {
        result: {
          ok: false,
          error: {
            code: 'SQLITE_ERROR',
            message: 'no solution',
            translatedMessage: 'este ejercicio no tiene una solución de referencia.',
          },
          executionMs: 0,
          statementKind: 'other',
        },
        schema: { tables: [], views: [], indexes: [], triggers: [] },
      }
    }

    try {
      await this.openSolutionCopy()
      const timeout = opts?.timeoutMs ?? 5000
      const result = await this.api.exec(this.solutionDbId, this.exercise.solution, {
        timeoutMs: timeout,
      })
      const schema = await this.api.schema(this.solutionDbId)
      // Cerramos la solution-copy; si el usuario quiere volver a
      // revelar, `openSolutionCopy` la reabrirá.
      await this.safeClose(this.solutionDbId)
      return { result, schema }
    } catch (e) {
      await this.safeClose(this.solutionDbId)
      return {
        result: {
          ok: false,
          error: {
            code: 'SQLITE_ERROR',
            message: (e as Error).message,
            translatedMessage: `error al revelar la solución: ${(e as Error).message}.`,
          },
          executionMs: 0,
          statementKind: 'other',
        },
        schema: { tables: [], views: [], indexes: [], triggers: [] },
      }
    }
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  Internos                                                         *
   * ──────────────────────────────────────────────────────────────── */

  /**
   * Abre la solution-copy y siembra su contenido. Si ya existe (por
   * una llamada previa a `revealSolution` sin `reset`), la reutiliza
   * pero **vuelve a sembrar** para garantizar que esté en el estado
   * inicial esperado.
   */
  private async openSolutionCopy(): Promise<void> {
    // close previo por si quedó abierta
    await this.safeClose(this.solutionDbId)
    await this.api.open(this.solutionDbId, this.solutionFilename, 'readwrite')
    if (this.exercise.lessonDbSeed) {
      await this.api.exec(this.solutionDbId, this.exercise.lessonDbSeed, {
        timeoutMs: 5000,
      })
    }
  }

  private async safeClose(dbId: number): Promise<void> {
    try {
      await this.api.close(dbId)
    } catch {
      // idempotente: si no estaba abierta, ignore.
    }
  }
}
