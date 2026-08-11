/**
 * Comparación de resultados de query (RESEARCH §10.7).
 *
 * Funciones puras (sin I/O) que comparan dos `QueryResult` para determinar
 * si son equivalentes. Diseñadas para ser usadas por el `ResultStrategy` y
 * por cualquier otro strategy que necesite comparar resultados.
 *
 * Reglas de comparación (alineadas con RESEARCH §10.7):
 *
 *   - **Columnas**: por defecto, los nombres deben coincidir uno-a-uno en
 *     el mismo orden. `columnAliases` permite aceptar nombres alternativos.
 *   - **Filas**: si `orderMatters`, se comparan en orden; si no, como
 *     multiset (se ordenan y se comparan).
 *   - **NULLs**: por defecto `NULL === NULL`. Con `nullEqualsNull: false`
 *     un `NULL` solo es igual a otro `NULL` en la misma posición tras
 *     ordenar por clave completa.
 *   - **Coerción numérica**: `'1'` y `1` se tratan como iguales.
 *
 * Todas las funciones devuelven `{ equal, diff? }` con un mensaje en
 * español apto para la UI cuando difieren.
 */

import type { QueryResult } from '../../workers/types'

/* ──────────────────────────────────────────────────────────────────── *
 *  Opciones                                                              *
 * ──────────────────────────────────────────────────────────────────── */

export interface CompareOptions {
  /** Si `true`, el orden de filas es significativo. */
  orderMatters: boolean
  /** Acepta columnas extra en el resultado del usuario. */
  ignoreExtraColumns?: boolean
  /** Alias permitidos: `solutionCol → userColAceptada`. */
  columnAliases?: Record<string, string>
  /** Default `true`. Si `false`, `NULL ≠ NULL`. */
  nullEqualsNull?: boolean
}

/** Resultado de una comparación. */
export interface CompareResult {
  equal: boolean
  /** Mensaje explicando la diferencia (español, cuando `equal: false`). */
  diff?: string
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers de celda                                                     *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Normaliza una celda para comparación.
 *
 * - `null` / `undefined` → mismo símbolo (sentinel para nullEqualsNull).
 * - booleanos → números 0/1 (SQLite no distingue en result sets).
 * - números y strings numéricos → se comparan como números.
 * - todo lo demás → string lowercase trimmed.
 */
export function coerceForCompare(
  value: unknown,
  _nullEqualsNull: boolean,
): unknown {
  if (value === null || value === undefined) {
    return { __null: true }
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    // Coerción numérica si aplica.
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
      return Number(trimmed)
    }
    return trimmed.toLowerCase()
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

/**
 * Convierte una fila en una "clave" comparable (para multiset sort).
 * Usa `JSON.stringify` sobre el array ya normalizado.
 */
export function rowToComparableKey(row: unknown[]): string {
  return JSON.stringify(row)
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Comparación de columnas                                              *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Compara dos arrays de nombres de columna según `opts`.
 *
 * - Si `columnAliases` está presente, se permite que la columna de la
 *   solución aparezca con un nombre alternativo en el resultado del usuario.
 * - Si `ignoreExtraColumns: true`, columnas extra en el usuario no fallan.
 * - El orden de columnas no se considera significativo por defecto (las
 *   celdas se proyectan luego por nombre al comparar filas).
 */
export function columnsMatch(
  userCols: string[] | undefined,
  solutionCols: string[] | undefined,
  opts: CompareOptions,
): { equal: boolean; diff?: string; userColIndex?: Map<string, number> } {
  const u = (userCols ?? []).map((c) => c.trim())
  const s = (solutionCols ?? []).map((c) => c.trim())

  if (u.length === 0 && s.length === 0) {
    return { equal: true }
  }

  const aliases = opts.columnAliases ?? {}

  // Construimos el "mapa efectivo" solución→usuario.
  // Para cada columna de la solución, miramos si está en `u` con el
  // mismo nombre o con el alias declarado.
  const userIdx = new Map<string, number>()
  u.forEach((c, i) => userIdx.set(c, i))

  const solutionToUser: Array<number | null> = []
  const missing: string[] = []

  for (const solCol of s) {
    if (userIdx.has(solCol)) {
      solutionToUser.push(userIdx.get(solCol) ?? -1)
      continue
    }
    const alias = aliases[solCol]
    if (alias && userIdx.has(alias)) {
      solutionToUser.push(userIdx.get(alias) ?? -1)
      continue
    }
    missing.push(solCol)
  }

  if (missing.length > 0) {
    return {
      equal: false,
      diff: `faltan columnas: ${missing.join(', ')} (esperaba: ${s.join(', ')})`,
    }
  }

  if (!opts.ignoreExtraColumns) {
    const expectedUserCols = new Set<string>()
    for (const solCol of s) {
      if (userIdx.has(solCol)) expectedUserCols.add(solCol)
      else if (aliases[solCol]) expectedUserCols.add(aliases[solCol]!)
    }
    const extras: string[] = []
    for (const uc of u) {
      if (!expectedUserCols.has(uc)) extras.push(uc)
    }
    if (extras.length > 0) {
      return {
        equal: false,
        diff: `columnas extra no permitidas: ${extras.join(', ')}`,
      }
    }
  }

  // Devolvemos un índice para proyectar las filas del usuario al orden de la solución.
  const userColIndex = new Map<string, number>()
  s.forEach((solCol, i) => {
    const mapped = solutionToUser[i]
    if (mapped !== null && mapped !== undefined) {
      const userColName = u[mapped]!
      userColIndex.set(solCol, mapped)
      // Para que el caller pueda proyectar también por nombre de la solución.
      void userColName
    }
  })
  return { equal: true, userColIndex: new Map(solutionToUser.map((idx, i) => [s[i]!, idx ?? -1])) }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Comparación de filas (ordenadas / multiset)                          *
 * ──────────────────────────────────────────────────────────────────── */

function isNullSentinel(v: unknown): boolean {
  return typeof v === 'object' && v !== null && (v as { __null?: boolean }).__null === true
}

/** Proyecta una fila del usuario al orden de columnas de la solución. */
function projectRow(row: unknown[], projection: number[]): unknown[] {
  return projection.map((i) => (i >= 0 && i < row.length ? row[i] : null))
}

function normalizeRow(
  row: unknown[],
  projection: number[],
  nullEqualsNull: boolean,
): unknown[] {
  return projectRow(row, projection).map((c) => coerceForCompare(c, nullEqualsNull))
}

/**
 * Compara filas en orden (orden Matters). Devuelve `diff` con índice y
 * valor esperado/observado en caso de discrepancia.
 */
export function rowsEqualOrdered(
  userRows: unknown[][] | undefined,
  solutionRows: unknown[][] | undefined,
  opts: CompareOptions,
  projection: number[],
): CompareResult {
  const u = userRows ?? []
  const s = solutionRows ?? []
  const nullEqualsNull = opts.nullEqualsNull !== false

  if (u.length !== s.length) {
    return {
      equal: false,
      diff: `número de filas diferente: esperaba ${s.length}, obtuve ${u.length}`,
    }
  }

  for (let i = 0; i < s.length; i++) {
    const expected = normalizeRow(s[i]!, projection, nullEqualsNull)
    const actual = normalizeRow(u[i]!, projection, nullEqualsNull)
    if (!cellArrayEqual(expected, actual, nullEqualsNull)) {
      return {
        equal: false,
        diff: `fila ${i + 1} no coincide (esperaba ${JSON.stringify(s[i])} obtuve ${JSON.stringify(u[i])})`,
      }
    }
  }

  return { equal: true }
}

/**
 * Compara filas como multiset. Ordena ambas por clave comparable y compara.
 *
 * - Si una fila aparece N veces en la solución y M veces en el usuario,
 *   se reporta el desajuste.
 */
export function rowsEqualAsMultiset(
  userRows: unknown[][] | undefined,
  solutionRows: unknown[][] | undefined,
  opts: CompareOptions,
  projection: number[],
): CompareResult {
  const u = userRows ?? []
  const s = solutionRows ?? []
  const nullEqualsNull = opts.nullEqualsNull !== false

  const uNorm = u.map((r) => normalizeRow(r, projection, nullEqualsNull))
  const sNorm = s.map((r) => normalizeRow(r, projection, nullEqualsNull))

  const uKeys = uNorm.map(rowToComparableKey).sort()
  const sKeys = sNorm.map(rowToComparableKey).sort()

  if (uKeys.length !== sKeys.length) {
    return {
      equal: false,
      diff: `número de filas diferente: esperaba ${s.length}, obtuve ${u.length}`,
    }
  }

  // Multiset: agrupamos claves idénticas y comparamos frecuencias.
  let i = 0
  while (i < sKeys.length) {
    let countS = 0
    let countU = 0
    const key = sKeys[i]!
    while (i + countS < sKeys.length && sKeys[i + countS] === key) countS++
    while (i + countU < uKeys.length && uKeys[i + countU] === key) countU++
    if (countS !== countU) {
      return {
        equal: false,
        diff: `la fila ${key} aparece ${countS} veces en la solución y ${countU} veces en tu resultado`,
      }
    }
    i += countS
  }

  return { equal: true }
}

function cellArrayEqual(a: unknown[], b: unknown[], nullEqualsNull: boolean): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!cellEqual(a[i], b[i], nullEqualsNull)) return false
  }
  return true
}

function cellEqual(a: unknown, b: unknown, nullEqualsNull: boolean): boolean {
  if (isNullSentinel(a) && isNullSentinel(b)) {
    return nullEqualsNull
  }
  if (isNullSentinel(a) || isNullSentinel(b)) return false
  return a === b
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Entry point                                                           *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Punto de entrada principal. Compara dos `QueryResult` siguiendo `opts`.
 */
export function compareResults(
  user: QueryResult | null,
  solution: QueryResult | null,
  opts: CompareOptions,
): CompareResult {
  // 1. Si la solución no devolvió filas, se considera "sin resultado
  //    esperado" → cualquier resultado del usuario que tampoco tenga
  //    filas pasa; con filas falla.
  if (!solution || !solution.columns || solution.columns.length === 0) {
    if (!user || !user.columns || user.columns.length === 0) {
      return { equal: true }
    }
    return {
      equal: false,
      diff: 'se esperaban 0 columnas pero el resultado tiene ' + user.columns.length,
    }
  }

  // 2. La query del usuario debe haber tenido éxito.
  if (!user || user.ok === false) {
    return {
      equal: false,
      diff: 'la consulta no se ejecutó correctamente. Revisa la sintaxis y los nombres de tablas.',
    }
  }
  if (!user.columns || user.columns.length === 0) {
    return {
      equal: false,
      diff: 'la consulta no devolvió columnas. ¿Olvidaste el SELECT?',
    }
  }

  // 3. Comparar columnas (con proyección).
  const colResult = columnsMatch(user.columns, solution.columns, opts)
  if (!colResult.equal) {
    return { equal: false, diff: `columnas: ${colResult.diff}` }
  }

  // Construir proyección user[solCol[i]] → celda.
  const projection: number[] = solution.columns.map(
    (solCol) => (colResult.userColIndex?.get(solCol) ?? -1),
  )

  // 4. Comparar filas.
  if (opts.orderMatters) {
    return rowsEqualOrdered(user.rows, solution.rows, opts, projection)
  }
  return rowsEqualAsMultiset(user.rows, solution.rows, opts, projection)
}
