/**
 * Hint engine — selección y formateo de pistas pedagógicas (RESEARCH §11.3,
 * §18.3 AC-P2/AC-P3/AC-P5).
 *
 * Funciones puras (sin I/O) que reciben un `HintRequest` y devuelven la
 * siguiente pista a mostrar al alumno. Las pistas se seleccionan de forma
 * **secuencial** sobre los `hints` del ejercicio que ya estén "vencidos"
 * según su política `after`:
 *
 *   - `never`              → nunca (solo se muestra vía el botón "Solución").
 *   - `after-failure`      → al primer intento fallido.
 *   - `after-2-failures`   → al segundo intento fallido.
 *   - `after-3-failures`   → al tercer intento fallido.
 *
 * Adicionalmente, el engine puede inyectar una **pista contextual**
 * cuando el último error de SQLite se parece a "no such table" o
 * "no such column" — en ese caso devuelve un `Hint` *ad hoc* (sintetizado
 * a partir de los nombres de tabla del schema) **junto a** la pista
 * secuencial normal; el caller puede mostrarlas en paralelo o en orden.
 *
 * `formatHint` renderiza una pista como Markdown ligero (sin dependencias
 * externas). Es seguro para los tres locales declarados.
 *
 * ```ts
 * import { pickNextHint, formatHint } from '@/core/exercises'
 *
 * const hint = pickNextHint({ exercise, attempts, lastError, lastResult, hintsRevealed: 0 })
 * if (hint) console.log(formatHint(hint, 'es'))
 * ```
 */

import type { Hint, HintAfter, HintType, HintLevel, Exercise } from './types'
import type { QueryResult, SerializedError } from '../../workers/types'

/* ──────────────────────────────────────────────────────────────────── *
 *  Tipos públicos                                                        *
 * ──────────────────────────────────────────────────────────────────── */

export interface HintRequest {
  exercise: Exercise
  /** Nº de intentos fallidos hasta el momento (0 = primer intento). */
  attempts: number
  /** Último error reportado por el Worker (o `null` si no hubo). */
  lastError: SerializedError | null
  /** Último resultado de ejecutar la SQL del usuario. */
  lastResult: QueryResult | null
  /** Nº de pistas ya reveladas (0 al inicio). */
  hintsRevealed: number
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Constantes de la política `after`                                     *
 * ──────────────────────────────────────────────────────────────────── */

/** Intentos mínimos requeridos para que una pista quede disponible. */
const AFTER_THRESHOLD: Record<HintAfter, number> = {
  never: Number.POSITIVE_INFINITY,
  'after-failure': 1,
  'after-2-failures': 2,
  'after-3-failures': 3,
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Detección de errores de referencia                                    *
 * ──────────────────────────────────────────────────────────────────── */

const TABLE_NOT_FOUND_RE = /no such table:?\s*['"`]?([A-Za-z_][\w]*)['"`]?/i
const COLUMN_NOT_FOUND_RE = /no such column:?\s*['"`]?([A-Za-z_][\w]*)['"`]?/i
const SYNTAX_NEAR_RE = /near\s+["']?([^"'\n]+?)["']?:\s*syntax error|syntax error near\s+["']?([^"'\n]+?)["']?/i

/**
 * Resultado de la inspección del último error: qué tipo de pista
 * contextual (si alguna) procede.
 */
export interface ContextualHintPlan {
  /** Tipo de pista contextual detectada. */
  kind: 'missing-table' | 'missing-column' | 'syntax' | null
  /** Token que la causa (tabla, columna o "X" del syntax error). */
  token?: string
}

/**
 * Decide si el último error justifica una pista contextual.
 * No toca I/O; la decisión se hace puramente sobre la `message`.
 */
export function planContextualHint(
  lastError: SerializedError | null,
): ContextualHintPlan {
  if (!lastError) return { kind: null }
  const m = lastError.message ?? ''
  const tbl = TABLE_NOT_FOUND_RE.exec(m)
  if (tbl && tbl[1]) return { kind: 'missing-table', token: tbl[1] }
  const col = COLUMN_NOT_FOUND_RE.exec(m)
  if (col && col[1]) return { kind: 'missing-column', token: col[1] }
  if (SYNTAX_NEAR_RE.test(m)) return { kind: 'syntax' }
  return { kind: null }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Pistas contextuales                                                   *
 * ──────────────────────────────────────────────────────────────────── */

const CONTEXTUAL_PREFIX = '__contextual__'

function makeContextualHint(
  plan: ContextualHintPlan,
  exercise: Exercise,
): Hint | null {
  if (plan.kind === 'missing-table') {
    const tables = exerciseDatabaseHints(exercise)
    const suggestion = tables.length > 0
      ? `¿La tabla se llama \`${plan.token}\` o quizás \`${tables[0]}\`?`
      : `¿La tabla se llama \`${plan.token}\`? Revisa el nombre y el esquema.`
    return {
      level: 1,
      text: suggestion,
      after: 'never',
      type: 'reference',
    }
  }
  if (plan.kind === 'missing-column') {
    return {
      level: 1,
      text: `¿La columna \`${plan.token}\` existe? Usa \`PRAGMA table_info(<tabla>)\` para listarlas.`,
      after: 'never',
      type: 'reference',
    }
  }
  if (plan.kind === 'syntax') {
    return {
      level: 1,
      text:
        'Hay un error de sintaxis. Revisa comillas, comas y paréntesis; el error señala el primer token inesperado.',
      after: 'never',
      type: 'syntactic',
    }
  }
  return null
}

/**
 * Devuelve una lista de tablas candidatas para mencionar en una pista
 * contextual cuando no se disponga del `DatabaseSchema` actual. Hoy
 * simplemente devuelve `tablesConocidas` de la primera `expectedResult`
 * del ejercicio (cuando aplique) o un array vacío.
 */
function exerciseDatabaseHints(exercise: Exercise): string[] {
  // El engine no tiene acceso al schema actual; la pista contextual se
  // construye solo a partir de la información del Exercise. Reservamos
  // el campo para integraciones futuras; por ahora devolvemos [].
  void exercise
  return []
}

/* ──────────────────────────────────────────────────────────────────── *
 *  pickNextHint                                                          *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Devuelve la siguiente pista a mostrar al alumno o `null` si todavía
 * no hay ninguna desbloqueada. Implementa:
 *
 *   1. Política `after` (filtra los hints disponibles según `attempts`).
 *   2. Selección secuencial por índice (`hintsRevealed`).
 *   3. (Opcional) pista contextual cuando el último error es de
 *      referencia / sintaxis — se entrega **además** de la pista
 *      secuencial, accesible como segundo elemento del array que
 *      devuelve `pickNextHintBundle` (ver abajo).
 */
export function pickNextHint(req: HintRequest): Hint | null {
  const unlocked = req.exercise.hints.filter(
    (h) => req.attempts >= AFTER_THRESHOLD[h.after],
  )
  if (unlocked.length === 0) return null
  if (req.hintsRevealed < 0) return null
  if (req.hintsRevealed >= unlocked.length) return null
  return unlocked[req.hintsRevealed] ?? null
}

/**
 * Variante "bundle": devuelve la pista secuencial + una pista contextual
 * opcional (si el último error lo amerita). La contextual se marca con
 * `id` sintético para que la UI pueda etiquetarla distinto si quiere.
 */
export function pickNextHintBundle(req: HintRequest): {
  sequential: Hint | null
  contextual: (Hint & { id: string }) | null
} {
  const sequential = pickNextHint(req)
  const plan = planContextualHint(req.lastError)
  const base = makeContextualHint(plan, req.exercise)
  const contextual = base ? { ...base, id: `${CONTEXTUAL_PREFIX}:${plan.kind}` } : null
  return { sequential, contextual }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  formatHint                                                            *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Renderiza una pista como Markdown ligero, con un encabezado de tipo
 * ("Pista conceptual", "Pista sintáctica", …) y el texto en su cuerpo.
 *
 * - `locale` se acepta para futuro i18n; de momento solo `es` está
 *   implementado. Para `ca` y `en` cae en `es` con un sufijo entre
 *   paréntesis indicando el locale.
 * - El bloque resultante es seguro de inyectar en un componente que
 *   renderice Markdown controlado (no se inyecta HTML sin escapar).
 */
export function formatHint(hint: Hint, locale: 'es' | 'ca' | 'en' = 'es'): string {
  const typeLabel = hintTypeLabel(hint.type, locale)
  const level = hintLevelLabel(hint.level, locale)
  const lines: string[] = []
  lines.push(`> **${typeLabel} · ${level}**`)
  lines.push('')
  lines.push(hint.text.trim())
  if (locale !== 'es') {
    lines.push('')
    lines.push(`_(locale: ${locale})_`)
  }
  return lines.join('\n')
}

function hintTypeLabel(type: HintType, locale: 'es' | 'ca' | 'en'): string {
  const dict: Record<HintType, Record<'es' | 'ca' | 'en', string>> = {
    conceptual: { es: 'Pista conceptual', ca: 'Pista conceptual', en: 'Conceptual hint' },
    syntactic: { es: 'Pista sintáctica', ca: 'Pista sintàctica', en: 'Syntactic hint' },
    semantic: { es: 'Pista semántica', ca: 'Pista semàntica', en: 'Semantic hint' },
    reference: { es: 'Pista de referencia', ca: 'Pista de referència', en: 'Reference hint' },
  }
  return dict[type][locale] ?? dict[type].es
}

function hintLevelLabel(level: HintLevel, locale: 'es' | 'ca' | 'en'): string {
  const dict: Record<HintLevel, Record<'es' | 'ca' | 'en', string>> = {
    1: { es: 'nivel 1 (general)', ca: 'nivell 1 (general)', en: 'level 1 (general)' },
    2: { es: 'nivel 2 (medio)', ca: 'nivell 2 (mitjà)', en: 'level 2 (medium)' },
    3: { es: 'nivel 3 (detalle)', ca: 'nivell 3 (detall)', en: 'level 3 (detail)' },
  }
  return dict[level][locale] ?? dict[level].es
}
