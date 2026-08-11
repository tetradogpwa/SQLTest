/**
 * Detector de patrones de error comunes (RESEARCH §18.3 AC-P5).
 *
 * Inspección **estática** (regex-based) del par `(SerializedError, userSql)`
 * para producir una lista de `PatternMatch` con sugerencias pedagógicas en
 * español. Se usa desde el runner para enriquecer el feedback que se
 * muestra al alumno cuando su SQL falla.
 *
 *   - Pure module: sin I/O, sin acceso a Dexie ni al Worker.
 *   - Lenguaje: español, mensajes concisos, en minúscula y con punto final.
 *   - Cobertura: al menos 12 patrones de inicio (ver `BUILTIN_PATTERNS`).
 *   - `confidence` ∈ [0, 1]: 1.0 cuando el patrón es inequívoco, 0.5 cuando
 *     requiere corroborar contexto adicional (palabras clave del SQL).
 *
 * Uso:
 *
 * ```ts
 * import { detectPatterns } from '@/core/exercises'
 *
 * const matches = detectPatterns(error, userSql, schema)
 * for (const m of matches) {
 *   console.log(m.pattern.message, m.pattern.fix, '→', m.confidence)
 * }
 * ```
 */

import type { DatabaseSchema, SerializedError } from '../../workers/types'
import type { ErrorPattern, PatternMatch } from './types'

/* ──────────────────────────────────────────────────────────────────── *
 *  Re-exports                                                            *
 * ──────────────────────────────────────────────────────────────────── */

export type { PatternMatch }

/* ──────────────────────────────────────────────────────────────────── *
 *  Patrones "starter" (12+)                                              *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Lista de patrones predefinidos. El orden interno **no** es relevante;
 * `detectPatterns` los evalúa todos y devuelve los que coincidan,
 * ordenados por `confidence` descendente.
 *
 * Reglas de confianza:
 *   - `1.0` → match sobre el mensaje SQLite canónico (ej. "no such table").
 *   - `0.8` → match sobre la versión localizada o casi canónica.
 *   - `0.6` → match por palabras clave; puede haber falsos positivos.
 *   - `0.5` → heurística amplia (ej. detectar ORDER BY faltante a partir
 *             de la ausencia en el SQL).
 */
export const BUILTIN_PATTERNS: ReadonlyArray<ErrorPattern> = [
  {
    id: 'no-such-table',
    pattern: /no such table:?\s*['"`]?([A-Za-z_][\w]*)['"`]?/i,
    category: 'reference',
    message: '¿La tabla existe? Revisa el nombre y el esquema.',
    fix:
      'verifica el nombre exacto de la tabla y que la base de datos cargada sea la correcta.',
    example: 'SELECT * FROM users;',
  },
  {
    id: 'no-such-column',
    pattern: /no such column:?\s*['"`]?([A-Za-z_][\w]*)['"`]?/i,
    category: 'reference',
    message: '¿La columna existe en esa tabla?',
    fix: 'comprueba con `PRAGMA table_info(<tabla>)` que la columna existe y está bien escrita.',
    example: 'SELECT username FROM users;',
  },
  {
    id: 'syntax-error-near',
    // SQLite moderno: `near "X": syntax error`. Aceptamos también
    // el formato `syntax error near "X"` por si cambia en el futuro.
    pattern: /near\s+["']?([^"'\n]+?)["']?:\s*syntax error|syntax error near\s+["']?([^"'\n]+?)["']?/i,
    category: 'syntax',
    message:
      'Falta o sobra un token cerca del texto resaltado. Revisa paréntesis y comas.',
    fix: 'lee la query de izquierda a derecha verificando comillas, comas y paréntesis balanceados.',
  },
  {
    id: 'ambiguous-column',
    pattern: /ambiguous column name:?\s*['"`]?([A-Za-z_][\w]*)['"`]?/i,
    category: 'reference',
    message:
      'La columna existe en varias tablas del JOIN. Cualifícala con `tabla.columna`.',
    fix: 'cualifícala con `tabla.columna` (p. ej. `u.name`) o añade un alias en el FROM.',
    example: 'SELECT u.name, u.email FROM users u JOIN profiles p ON p.user_id = u.id;',
  },
  {
    id: 'datatype-mismatch',
    pattern: /datatype mismatch|datatypes? do not match|type mismatch/i,
    category: 'semantic',
    message: 'El tipo de dato no encaja. ¿Estás comparando texto con número?',
    fix: 'compara valores del mismo tipo o convierte explícitamente (CAST/CONVERT).',
    example: "SELECT * FROM users WHERE age = '25';  -- convierte o quita las comillas",
  },
  {
    id: 'unique-constraint-failed',
    pattern: /UNIQUE constraint failed:?\s*([\w."`]+)/i,
    category: 'semantic',
    message:
      'Ya existe una fila con ese valor. Usa un valor distinto o considera `INSERT OR REPLACE`.',
    fix:
      'usa `INSERT OR REPLACE`/`INSERT OR IGNORE`, genera un valor único (autoincrement, UUID) o limpia el duplicado antes de insertar.',
  },
  {
    id: 'not-null-constraint-failed',
    pattern: /NOT NULL constraint failed:?\s*([\w."`]+)/i,
    category: 'semantic',
    message: 'La columna no admite NULL. Proporciona un valor.',
    fix:
      'asegúrate de pasar un valor para esa columna en el INSERT, o rellénala con un DEFAULT/COALESCE.',
  },
  {
    id: 'foreign-key-constraint-failed',
    pattern: /FOREIGN KEY constraint failed/i,
    category: 'semantic',
    message:
      'El valor que intentas usar no existe en la tabla referenciada.',
    fix:
      'inserta primero el registro padre o usa un valor que ya exista en la tabla referenciada.',
  },
  {
    id: 'group-by-missing',
    // No aparece en el mensaje de SQLite como tal, lo detectamos con
    // heurística en `detectPatterns` (ver abajo). Aquí dejamos el patrón
    // preparado para la heurística del SQL.
    pattern: /misuse of aggregate|must appear in the GROUP BY clause|not a single-group group function/i,
    category: 'logic',
    message:
      'Las columnas del SELECT que no son agregadas deben aparecer en GROUP BY.',
    fix:
      'añade `GROUP BY <columna>` con todas las columnas no agregadas del SELECT, o agrega la función de agregado (COUNT/SUM/AVG…) que corresponda.',
    example: 'SELECT department, COUNT(*) FROM employees GROUP BY department;',
  },
  {
    id: 'misuse-of-aggregate',
    pattern: /misuse of aggregate/i,
    category: 'logic',
    message: 'No puedes mezclar columnas y `COUNT()` sin GROUP BY.',
    fix:
      'envuelve las columnas no agregadas en GROUP BY, o aplica una función de agregado a cada columna del SELECT.',
  },
  {
    id: 'order-by-non-deterministic',
    // Mensaje pedagógico cuando la query tiene SELECT/LIMIT pero ningún
    // ORDER BY: la detección es por SQL (ver heurística en detectPatterns).
    pattern: /ORDER BY/i,
    category: 'logic',
    message:
      'La query devuelve resultados en orden no determinista; añade un ORDER BY explícito.',
    fix:
      'añade `ORDER BY <columna>` para fijar el orden de las filas, sobre todo si usas LIMIT.',
    example: 'SELECT name FROM users ORDER BY created_at DESC LIMIT 10;',
  },
  {
    id: 'trailing-comma',
    // Captura: coma antes de paréntesis de cierre, coma doble, o una
    // coma inmediatamente antes de un keyword SQL (FROM, WHERE, …) que
    // sería un SELECT list mal formado.
    pattern: /,\s*\)|,\s*,|\b,\s+(?=(FROM|WHERE|GROUP|ORDER|LIMIT|HAVING|JOIN|LEFT|RIGHT|INNER|OUTER|ON|UNION)\b)/i,
    category: 'syntax',
    message: 'Hay una coma sobrante antes de un paréntesis de cierre o una coma doble.',
    fix: 'elimina la coma final antes de `)` y las comas duplicadas o colgantes en la lista de columnas.',
    example: 'SELECT id, name FROM users;  -- sin coma tras "name"',
  },
  {
    id: 'reserved-word-identifier',
    // Detecta uso de palabras reservadas como identificadores sin comillas.
    // La heurística vive en `detectPatterns` (necesita el SQL completo).
    pattern:
      /\b(order|group|user|table|select|from|where|index|view|trigger)\b\s+[A-Za-z_]\w*\s*[,)]/i,
    category: 'syntax',
    message:
      'Has usado una palabra reservada (ORDER, GROUP, USER, TABLE…) como nombre de columna o tabla.',
    fix:
      'rodea el identificador con comillas dobles o backticks, o renómbralo (p. ej. `user` → `user_name`).',
    example: 'SELECT "user" FROM accounts;  -- o: SELECT user_name FROM accounts;',
  },
]

/* ──────────────────────────────────────────────────────────────────── *
 *  Heurísticas sobre el SQL (no error.message)                          *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Heurística: si la query usa `SELECT … LIMIT` sin `ORDER BY`, añadimos
 * el patrón `order-by-non-deterministic` con confidence media.
 */
function heuristicMissingOrderBy(sql: string): boolean {
  const hasLimit = /\bLIMIT\s+\d+/i.test(sql)
  const hasOrder = /\bORDER\s+BY\b/i.test(sql)
  return hasLimit && !hasOrder
}

/**
 * Heurística: si la query tiene funciones de agregado (`COUNT`, `SUM`,
 * `AVG`, `MIN`, `MAX`) mezcladas con columnas sueltas en el SELECT y
 * NO tiene GROUP BY, añadimos el patrón `group-by-missing`.
 */
function heuristicMissingGroupBy(sql: string): boolean {
  const hasAggregate = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(sql)
  if (!hasAggregate) return false
  const hasGroupBy = /\bGROUP\s+BY\b/i.test(sql)
  if (hasGroupBy) return false
  // SELECT … FROM …  con al menos un identificador antes del FROM.
  // Simplificado: miramos si hay más de un item separado por comas en
  // el SELECT, o un identificador seguido de FROM.
  const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM\b/i)
  if (!selectMatch) return false
  const selectList = selectMatch[1] ?? ''
  // Si hay comas en el select list, hay varias columnas → probable mezcla.
  if (selectList.includes(',')) return true
  // Si hay un identificador antes de la función de agregado, también.
  if (/[A-Za-z_]\w*\s*,\s*(COUNT|SUM|AVG|MIN|MAX)/i.test(selectList)) return true
  return false
}

/* ──────────────────────────────────────────────────────────────────── *
 *  API pública                                                            *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Detecta patrones aplicables a partir del error de SQLite y del SQL del
 * usuario. Devuelve un array (posiblemente vacío) de `PatternMatch`
 * ordenados por `confidence` descendente.
 *
 * - `error` puede ser `null` (no hubo error; en ese caso solo se aplican
 *   las heurísticas de SQL).
 * - `userSql` se analiza además para detectar problemas lógicos que
 *   SQLite no reporta (falta de GROUP BY, falta de ORDER BY antes de
 *   LIMIT, palabras reservadas como identificador, coma colgante).
 * - `schema` se reserva para futuros patrones que necesiten nombres de
 *   tabla/columna (no se usa en esta versión).
 */
export function detectPatterns(
  error: SerializedError | null,
  userSql: string,
  _schema: DatabaseSchema,
): PatternMatch[] {
  const matches: PatternMatch[] = []
  const sql = (userSql ?? '').trim()
  const message = error?.message ?? ''

  // 1. Patrones basados en el mensaje del error.
  for (const pattern of BUILTIN_PATTERNS) {
    // El patrón `order-by-non-deterministic` se evalúa solo por SQL
    // (heurística), no por mensaje. El `reserved-word-identifier` y
    // `group-by-missing` también se evalúan por SQL.
    if (pattern.id === 'order-by-non-deterministic') continue
    if (pattern.id === 'reserved-word-identifier') continue
    if (pattern.id === 'group-by-missing') continue
    if (!message) continue
    const m = pattern.pattern.exec(message)
    if (m) {
      matches.push({
        pattern,
        confidence: 1.0,
        matchedText: m[0],
      })
    }
  }

  // 2. Heurísticas basadas en el SQL (no en el mensaje).
  if (sql) {
    if (heuristicMissingOrderBy(sql)) {
      const pattern = BUILTIN_PATTERNS.find((p) => p.id === 'order-by-non-deterministic')
      if (pattern) {
        matches.push({ pattern, confidence: 0.7, matchedText: 'LIMIT sin ORDER BY' })
      }
    }
    if (heuristicMissingGroupBy(sql)) {
      const pattern = BUILTIN_PATTERNS.find((p) => p.id === 'group-by-missing')
      if (pattern) {
        matches.push({ pattern, confidence: 0.8, matchedText: 'SELECT mixto sin GROUP BY' })
      }
    }
    // trailing-comma y reserved-word-identifier sobre el SQL.
    for (const pattern of BUILTIN_PATTERNS) {
      if (pattern.id === 'order-by-non-deterministic') continue
      if (pattern.id === 'group-by-missing') continue
      if (pattern.id !== 'trailing-comma' && pattern.id !== 'reserved-word-identifier') {
        continue
      }
      const m = pattern.pattern.exec(sql)
      if (m) {
        matches.push({
          pattern,
          // Heurísticas: 0.6 (puede haber falsos positivos).
          confidence: 0.6,
          matchedText: m[0],
        })
      }
    }
  }

  // 3. Ordenar por confianza descendente; empates por id alfabético.
  matches.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return a.pattern.id.localeCompare(b.pattern.id)
  })

  return matches
}
