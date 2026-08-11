/**
 * Tipos del motor de ejercicios (RESEARCH §10, §10.1-§10.7, §11).
 *
 * Este módulo es la **única fuente de verdad** para los tipos del engine
 * de validación. Re-exporta los tipos del worker (QueryResult, DatabaseSchema,
 * etc.) para evitar duplicación y mantener una única definición canónica.
 *
 * Organización:
 *
 *   1. Re-exports de `workers/types.ts`
 *   2. Helpers de esquema esperado (ExpectedColumn, ExpectedForeignKey)
 *   3. Forma de resultado esperado (QueryResultShape)
 *   4. 11 interfaces de validación
 *   5. `Validation` (unión discriminada)
 *   6. `DatabaseStateCheck` (sub-tipo de DatabaseStateValidation)
 *   7. `ValidationContext` y `ValidationResult`
 *   8. `ValidationStrategy` (interfaz Strategy)
 *   9. `ExerciseType` (enum) y `Exercise` (contenido)
 *  10. `Hint` y `ErrorPattern` (pedagogía)
 *
 * Todos los mensajes visibles al usuario están en español.
 */

import type {
  DatabaseSchema,
  QueryResult,
  StorageCapability,
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
} from '../../workers/types'

/* ──────────────────────────────────────────────────────────────────── *
 *  1. Re-exports desde `workers/types`                                 *
 * ──────────────────────────────────────────────────────────────────── */

export type { DatabaseSchema, QueryResult, StorageCapability, TableInfo, ColumnInfo, ForeignKeyInfo }

/* ──────────────────────────────────────────────────────────────────── *
 *  2. Forma esperada del esquema                                        *
 * ──────────────────────────────────────────────────────────────────── */

/** Descripción de una columna esperada por `SchemaValidation`. */
export interface ExpectedColumn {
  /** Nombre de la columna. */
  name: string
  /** Tipo SQL declarado (case-insensitive en la comparación). */
  type: string
  /** Si acepta NULL. `true` significa "nullable". */
  nullable: boolean
  /** Valor por defecto textual (ej. `'activo'`, `0`, `CURRENT_TIMESTAMP`). */
  defaultValue?: string | null
  /** Posición dentro de la PRIMARY KEY (1-based). `0` = no parte. */
  primaryKeyPosition?: number
}

/** Descripción de una FOREIGN KEY esperada por `SchemaValidation`. */
export interface ExpectedForeignKey {
  /** Columna local (la que tiene el FK). */
  from: string
  /** Tabla referenciada. */
  table: string
  /** Columna referenciada en la tabla destino. */
  to: string
  /** Acción ante UPDATE (ej. `CASCADE`, `RESTRICT`, `SET NULL`). */
  onUpdate?: string
  /** Acción ante DELETE. */
  onDelete?: string
}

/* ──────────────────────────────────────────────────────────────────── *
 *  3. QueryResultShape                                                  *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Forma esperada de un resultado de query.
 * Usado por `InvariantValidation` y por los ejercicios `predictResult`.
 */
export interface QueryResultShape {
  /** Nombres de columnas (orden importa para `InvariantValidation`). */
  columns: string[]
  /** Filas como arrays de celdas (orden importa si la invariante lo requiere). */
  rows: unknown[][]
}

/* ──────────────────────────────────────────────────────────────────── *
 *  4. Las 11 interfaces de validación                                  *
 * ──────────────────────────────────────────────────────────────────── */

export interface QueryResultValidation {
  type: 'result'
  /** Si `true`, el orden de las filas es significativo. */
  orderMatters: boolean
  /** Si `true`, se permiten columnas extra en el resultado del usuario. */
  ignoreExtraColumns?: boolean
  /**
   * Mapa de alias: clave = nombre de columna en la solución,
   * valor = nombre(s) aceptables en el resultado del usuario.
   * Si la columna no está en el mapa, se compara estrictamente.
   */
  columnAliases?: Record<string, string>
  /** Si `true` (default), `NULL === NULL`. Si `false`, `NULL ≠ NULL`. */
  nullEqualsNull?: boolean
}

export interface DatabaseStateCheck {
  /** SQL a ejecutar sobre la DB del usuario. Debe devolver 1 fila/valor. */
  sql: string
  /**
   * Valor esperado. Tres formas:
   *   - `number` → comparar primera celda de primera fila.
   *   - `boolean` → idem, interpretando 0/1 como false/true.
   *   - `unknown[][]` → comparar filas completas (multiset).
   */
  expected: number | boolean | unknown[][]
}

export interface DatabaseStateValidation {
  type: 'dbState'
  /** Descripción legible de la invariante (se muestra al fallar). */
  description: string
  /** Lista de sub-checks; TODOS deben pasar. */
  checks: DatabaseStateCheck[]
}

export interface SchemaValidation {
  type: 'schema'
  /** Tabla a inspeccionar. */
  table: string
  /** Columnas esperadas (orden no significativo, sí el conjunto). */
  expectedColumns: ExpectedColumn[]
  /** PK esperada; omitir para no validar PK. */
  expectedPrimaryKey?: string[]
  /** FKs esperadas; omitir para no validar FKs. */
  expectedForeignKeys?: ExpectedForeignKey[]
}

export interface RowCountValidation {
  type: 'rowCount'
  /** Tabla a contar. */
  table: string
  /** Número de filas esperado. */
  expected: number
  /** Margen de tolerancia (±). Default 0 (exacto). */
  tolerance?: number
}

export interface RowExistsValidation {
  type: 'rowExists'
  /** Tabla a inspeccionar. */
  table: string
  /** Cláusula WHERE (sin la palabra `WHERE`). */
  where: string
  /** Mínimo de matches. Default 1. */
  minMatches?: number
}

export interface TableExistsValidation {
  type: 'tableExists'
  /** Nombre de la tabla que debe existir. */
  table: string
}

export type ConstraintKind =
  | 'NOT NULL'
  | 'UNIQUE'
  | 'CHECK'
  | 'DEFAULT'
  | 'PRIMARY KEY'

export interface ConstraintValidation {
  type: 'constraint'
  /** Tabla que contiene la columna. */
  table: string
  /** Columna a inspeccionar. */
  column: string
  /** Tipo de constraint. */
  constraint: ConstraintKind
  /**
   * Para `CHECK`: expresión esperada (normalizada: minúsculas, sin espacios
   * redundantes). Para `DEFAULT`: valor por defecto esperado.
   * Para `NOT NULL` / `UNIQUE` / `PRIMARY KEY` no se usa.
   */
  expected?: string
}

export interface KeywordUsageValidation {
  type: 'usesKeyword'
  /** Lista de keywords que deben (o pueden) aparecer. */
  keywords: string[]
  /**
   * - `true` (default): TODAS las keywords deben aparecer.
   * - `false`: basta con que UNA aparezca.
   */
  all?: boolean
}

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS'

export interface JoinUsageValidation {
  type: 'usesJoin'
  /** Mínimo de cláusulas JOIN requeridas. */
  minJoins: number
  /** Máximo permitido; omitir = sin tope. */
  maxJoins?: number
  /**
   * Si se da, solo se cuentan JOINs de estos tipos. Si no, se cuentan
   * todos (INNER/LEFT/RIGHT/FULL/CROSS).
   */
  joinTypes?: JoinType[]
}

export interface InvariantValidation {
  type: 'invariant'
  /** SQL que captura la condición a verificar. */
  sql: string
  /** Resultado esperado. */
  expectedResult: QueryResultShape
  /** Descripción legible de la invariante. */
  description: string
}

export interface QueryPlanValidation {
  type: 'queryPlan'
  /** Tokens que DEBEN aparecer en el plan (ej. `SEARCH`, `USING INDEX`). */
  expectedNodes?: string[]
  /** Tokens que NO deben aparecer (ej. `SCAN`). */
  notExpectedNodes?: string[]
}

export interface CustomValidation {
  type: 'custom'
  /** ID de un validator registrado en el runner (no del Worker). */
  validatorId: string
}

/* ──────────────────────────────────────────────────────────────────── *
 *  5. Unión discriminada                                                *
 * ──────────────────────────────────────────────────────────────────── */

export type Validation =
  | QueryResultValidation
  | DatabaseStateValidation
  | SchemaValidation
  | RowCountValidation
  | RowExistsValidation
  | TableExistsValidation
  | ConstraintValidation
  | KeywordUsageValidation
  | JoinUsageValidation
  | InvariantValidation
  | QueryPlanValidation
  | CustomValidation

/** Tipo discriminado por `Validation['type']` (útil para maps). */
export type ValidationType = Validation['type']

/* ──────────────────────────────────────────────────────────────────── *
 *  6. Contexto de ejecución del validator                               *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Interfaz que consume el motor de ejercicios (RESEARCH §9.3).
 *
 *   - Los **strategies de validación** solo necesitan `exec`, `schema`,
 *     `snapshot`, `restore` y `listSnapshots`.
 *   - El **Exercise Runner** además necesita `open`, `close`, `closeAll`,
 *     `cancel`, `deleteUserDatabase` y `listUserDatabases` para gestionar
 *     la working-copy y la solution-copy.
 *
 * Definido como interfaz (no importamos la clase concreta `DBAPI` del
 * Worker) para:
 *   - evitar acoplamiento al Worker en tests;
 *   - permitir mocks limpios con `vi.fn()`.
 */
export interface DBApi {
  /** Abre (o crea) la DB `filename` bajo el handle `dbId`. */
  open: (
    dbId: number,
    filename: string,
    mode?: 'read' | 'write' | 'readwrite',
  ) => Promise<{ filename: string; sizeBytes: number }>
  /** Cierra la conexión con `dbId`. */
  close: (dbId: number) => Promise<void>
  /** Cierra todas las conexiones abiertas. */
  closeAll: () => Promise<void>
  /** Ejecuta SQL sobre `dbId`. */
  exec: (
    dbId: number,
    sql: string,
    options?: { timeoutMs?: number; params?: unknown[] },
  ) => Promise<QueryResult>
  /** Cancela la query en curso sobre `dbId` (best-effort). */
  cancel: (dbId: number) => Promise<void>
  /** Devuelve el esquema actual de `dbId`. */
  schema: (dbId: number) => Promise<DatabaseSchema>
  /** Crea un snapshot de la DB. */
  snapshot: (
    dbId: number,
    label: string,
    reason?: 'auto' | 'manual' | 'pre-restore' | 'pre-destructive',
  ) => Promise<{ id: string }>
  /** Restaura un snapshot previo. */
  restore: (dbId: number, snapId: string) => Promise<void>
  /** Lista snapshots disponibles. */
  listSnapshots: (dbId: number) => Promise<Array<{ id: string }>>
  /** Borra un snapshot concreto. */
  deleteSnapshot: (dbId: number, snapId: string) => Promise<void>
  /** Borra una DB de usuario (cierra + elimina archivo). */
  deleteUserDatabase: (dbId: number) => Promise<void>
  /** Lista las DBs de usuario (para depuración / UI). */
  listUserDatabases: () => Promise<Array<{ dbId: number; name: string; filename: string }>>
}

/**
 * Contexto que el Validator pasa a cada strategy. Contiene todo lo que
 * los strategies necesitan sin acoplarse al Worker.
 *
 * - `userResult` / `solutionResult` pueden ser `null` si la query
 *   no devolvió filas o si la ejecución falló.
 * - `userSchema` / `solutionSchema` se re-introspectan al inicio de la
 *   comprobación para tener datos frescos.
 */
export interface ValidationContext {
  /** API del Worker (inyectada). */
  api: DBApi
  /** dbId de la working-copy sobre la que corre la query del usuario. */
  dbId: number
  /** SQL enviado por el usuario. */
  userSql: string
  /** SQL de referencia (solución). */
  solutionSql: string
  /** Resultado de la query del usuario. `null` si no produjo filas. */
  userResult: QueryResult | null
  /** Resultado de la query solución. `null` si no produjo filas. */
  solutionResult: QueryResult | null
  /** Esquema de la DB del usuario tras su query. */
  userSchema: DatabaseSchema
  /** Esquema de la DB de la solución tras su query. */
  solutionSchema: DatabaseSchema
  /** Capacidad de almacenamiento detectada. */
  capability: StorageCapability
  /** Nº de pistas ya reveladas (0 si ninguna). */
  hintsRevealed: number
}

/* ──────────────────────────────────────────────────────────────────── *
 *  7. Resultado de una validación                                       *
 * ──────────────────────────────────────────────────────────────────── */

export interface ValidationResult {
  /** `true` si la validación pasó. */
  passed: boolean
  /** Mensaje pedagógico en español (lo ve el alumno). */
  message: string
  /** Detalle técnico opcional (para devs/logs). */
  details?: string
  /** Sugerencias accionables (ej. "Revisa el WHERE"). */
  suggestions?: string[]
  /** Tipo de validación de la que proviene (para la UI). */
  strategyType?: ValidationType
}

/* ──────────────────────────────────────────────────────────────────── *
 *  8. Strategy interface                                                 *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Contrato de un strategy de validación.
 * Cada subclase implementa `apply` y declara su `type`.
 */
export interface ValidationStrategy {
  /** Tipo de validación que maneja. */
  readonly type: ValidationType
  /** Ejecuta la validación sobre el contexto. */
  apply(ctx: ValidationContext, validation: Validation): Promise<ValidationResult>
}

/* ──────────────────────────────────────────────────────────────────── *
 *  9. Ejercicios                                                        *
 * ──────────────────────────────────────────────────────────────────── */

export type ExerciseType =
  | 'writeQuery'
  | 'predictResult'
  | 'findError'
  | 'completeQuery'
  | 'fixQuery'
  | 'modifyQuery'
  | 'explore'
  | 'challenge'

/**
 * Ejercicio del curso. Estructura "enriquecida" sobre el modelo del
 * RESEARCH §11.2 — soporta todos los tipos (writeQuery, predictResult,
 * findError, fixQuery, completeQuery, modifyQuery, explore, challenge).
 *
 * Los campos opcionales cambian de obligatoriedad según el `type`:
 *   - `writeQuery` | `modifyQuery`: requieren `solution` + `validation`.
 *   - `predictResult`: requiere `expectedResult` (no `validation`).
 *   - `findError` | `fixQuery`: requieren `buggyCode` + `solution`.
 *   - `completeQuery`: requiere `partialCode` + `solution`.
 *   - `explore`: solo `objective` + `explorationHints`.
 *   - `challenge`: `challenge` + opcionalmente `solution`.
 *
 * Para no atar el tipo a cada variante (manteniendo el JSON simple),
 * todos los campos opcionales quedan como `?`.
 */
export interface Exercise {
  /** ID único (slug). */
  id: string
  /** Lección a la que pertenece. */
  lessonId: string
  /** Tipo de ejercicio. */
  type: ExerciseType
  /** Título corto para el header. */
  title: string
  /** Enunciado (markdown permitido en la UI). */
  prompt: string
  /** Código inicial en el editor (opcional). */
  starterCode?: string
  /** SQL de referencia (solución). Opcional para `explore`. */
  solution?: string
  /** Por qué la solución funciona (se muestra al revelar). */
  solutionExplanation: string
  /** Validaciones a ejecutar; TODAS deben pasar. */
  validation: Validation[]
  /** Pistas disponibles (se revelan progresivamente según `Hint.after`). */
  hints: Hint[]
  /** Dificultad 1-5. */
  difficulty: 1 | 2 | 3 | 4 | 5
  /** Tags para filtrado / búsqueda. */
  tags: string[]
  /** dbId sembrado para este ejercicio (referencia al catálogo). */
  databaseId: string
  /**
   * SQL que se ejecuta sobre la working-copy al `start()` para sembrar
   * los datos del ejercicio. El runner lo corre dentro de un
   * `api.exec(workingDbId, lessonDbSeed, ...)`.
   *
   * Si la working-copy ya existe en OPFS (por ejemplo, el alumno
   * abandonó y volvió), NO se vuelve a ejecutar.
   */
  lessonDbSeed?: string
  // ── Campos específicos por tipo (opcionales) ────────────────────
  /** `predictResult`: la query cuyo resultado debe predecirse. */
  promptQuery?: string
  /** `predictResult`: resultado esperado. */
  expectedResult?: QueryResultShape
  /** `predictResult`: explicación del resultado. */
  explanation?: string
  /** `findError` | `fixQuery`: código con error. */
  buggyCode?: string
  /** `findError`: pista sobre qué tipo de error buscar. */
  errorToFind?: string
  /** `completeQuery`: código con huecos `___`. */
  partialCode?: string
  /** `explore`: objetivo sugerido. */
  objective?: string
  /** `explore`: pistas para experimentar. */
  explorationHints?: string[]
  /** `challenge`: descripción abierta. */
  challenge?: string
  /**
   * `modifyQuery`: la query base que el alumno debe modificar. Se muestra
   * en el editor pre-rellena; la `solution` es la versión modificada.
   * El `validation` compara el resultado de la versión modificada.
   */
  baseQuery?: string
  /**
   * `modifyQuery`: instrucción concreta de modificación (ej. "añade un
   * filtro WHERE categoria = 'electronics'"). Distinto de `prompt`, que
   * describe el problema global; `modificationPrompt` es la tarea
   * concreta de modificación.
   */
  modificationPrompt?: string
}

/* ──────────────────────────────────────────────────────────────────── *
 *  10. Pedagogía                                                        *
 * ──────────────────────────────────────────────────────────────────── */

export type HintLevel = 1 | 2 | 3

export type HintAfter =
  | 'never'
  | 'after-failure'
  | 'after-2-failures'
  | 'after-3-failures'

export type HintType = 'conceptual' | 'syntactic' | 'semantic' | 'reference'

/** Pista graduada asociada a un ejercicio. */
export interface Hint {
  /** Nivel (1 = más general, 3 = más específica). */
  level: HintLevel
  /** Texto de la pista. */
  text: string
  /** Cuándo se desbloquea. */
  after: HintAfter
  /** Categoría pedagógica. */
  type: HintType
}

/** Patrón de error común con mensaje y corrección pedagógicos. */
export interface ErrorPattern {
  /** ID único del patrón. */
  id: string
  /** Regex que detecta el patrón (sobre el SQL del usuario). */
  pattern: RegExp
  /** Categoría del error. */
  category: 'syntax' | 'semantic' | 'reference' | 'logic'
  /** Mensaje pedagógico en español. */
  message: string
  /** Sugerencia de corrección. */
  fix: string
  /** Ejemplo de SQL correcto (opcional). */
  example?: string
}

/**
 * Coincidencia detectada por `detectPatterns`. Combina el patrón con
 * un nivel de confianza (0..1) y, opcionalmente, el texto que disparó
 * la coincidencia.
 */
export interface PatternMatch {
  pattern: ErrorPattern
  /** 0 = dudoso, 1 = inequívoco. */
  confidence: number
  /** Substring concreto que disparó la regex (cuando aplica). */
  matchedText?: string
}
