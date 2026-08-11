/**
 * Cargadores del contenido del curso.
 *
 * El contenido vive en módulos TS estáticos (no en `fetch()` ni en
 * IndexedDB). Por eso las funciones de carga son **síncronas** y
 * devuelven directamente los objetos ya construidos.
 *
 * Funciones exportadas:
 *
 *   - `loadCourse(locale)`              → curso completo por locale.
 *   - `loadDatabase(id)`                → una `DatabaseSeed` por id.
 *   - `listLevels(course)`              → atajo sobre `course.levels`.
 *   - `listLessons(level)`              → atajo sobre `level.lessons`.
 *   - `getExercise(course, exerciseId)` → busca un ejercicio por id.
 *   - `getNextExercise(course, id)`     → siguiente ejercicio en orden
 *                                          lineal (nivel → lección → ej.).
 *                                          Devuelve `null` si era el último.
 *
 * Todas las funciones de búsqueda lanzan errores con mensaje en español
 * si no encuentran el id solicitado. Esto permite a la UI distinguir
 * "bug del programador" (id inexistente) de "fin del camino" (`null`).
 *
 * El orden lineal de los ejercicios se define por:
 *
 *   1. `course.levels[i].order`
 *   2. `level.lessons[j].order`
 *   3. `lesson.exercises[k]` (índice natural)
 *
 * Esto es estable y predecible para la UI: "siguiente" siempre va hacia
 * delante en la misma secuencia.
 */

import type {
  Course,
  DatabaseSeed,
  Exercise,
  Level,
  Locale,
  Lesson,
} from './types'
import { COURSE_VERSION } from './types'
import { libraryLevels } from './lessons/library'
import { tiendaLevels } from './lessons/tienda'
import { socialLevels } from './lessons/social'
import { empresaLevels } from './lessons/empresa'
import {
  allDatabaseSeeds,
  databaseSeedsById,
  librarySeed,
  tiendaSeed,
  socialSeed,
  empresaSeed,
} from './databases'

/* ──────────────────────────────────────────────────────────────────── *
 *  Errores                                                              *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Error lanzado cuando se pide un locale que aún no tiene contenido.
 * Hereda de `Error` para que `instanceof Error` siga funcionando en
 * la UI; además expone el `code` para distinguir tipos de fallo.
 */
export class NotImplementedError extends Error {
  readonly code = 'NOT_IMPLEMENTED'
  constructor(message: string) {
    super(message)
    this.name = 'NotImplementedError'
  }
}

/** Error lanzado cuando un id no existe en el catálogo. */
export class ContentNotFoundError extends Error {
  readonly code = 'CONTENT_NOT_FOUND'
  constructor(message: string) {
    super(message)
    this.name = 'ContentNotFoundError'
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Curso canónico en español (v1)                                      *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Construcción memoizada del curso en español. Se calcula la primera
 * vez que se llama y se reutiliza en llamadas posteriores.
 *
 * IMPORTANTE: el curso se construye como una **copia superficial**
 * (`structuredClone`-like) de las constantes, para evitar que un
 * consumidor mutando el objeto del loader afecte a futuras cargas.
 * Como las constantes son `readonly` por convención, el coste es
 * despreciable; usamos un `Object.freeze` superficial.
 */
let _cachedSpanishCourse: Course | null = null

function buildSpanishCourse(): Course {
  if (_cachedSpanishCourse) return _cachedSpanishCourse

  const levels: Level[] = [
    ...libraryLevels,
    ...tiendaLevels,
    ...socialLevels,
    ...empresaLevels,
  ]

  // Validación en tiempo de construcción: si algún nivel no tiene 4
  // lecciones o algún id de lección no es único, fallamos en el arranque
  // de la app, no en mitad de un quiz.
  const lessonIds = new Set<string>()
  for (const level of levels) {
    if (level.lessons.length !== 4) {
      throw new Error(
        `El nivel ${level.id} debe tener 4 lecciones pero tiene ${level.lessons.length}.`,
      )
    }
    for (const lesson of level.lessons) {
      if (lessonIds.has(lesson.id)) {
        throw new Error(`Lesson id duplicado: ${lesson.id}`)
      }
      lessonIds.add(lesson.id)
    }
  }

  const course: Course = {
    id: 'sql-academy-es-v1',
    locale: 'es',
    version: COURSE_VERSION,
    title: 'SQL Academy — Castellano v1',
    description:
      'Curso introductorio de SQL con cuatro bases de datos semilla: una biblioteca, una tienda online, una red social y una empresa consultora. 16 lecciones y 96 ejercicios para aprender SQL de cero a DML completo.',
    levels,
    databases: [librarySeed, tiendaSeed, socialSeed, empresaSeed],
  }

  // Freeze superficial: hace que cualquier mutación accidental en la UI
  // falle en el acto (más seguro que un error diferido).
  for (const lvl of course.levels) {
    for (const lesson of lvl.lessons) {
      Object.freeze(lesson.exercises)
      Object.freeze(lesson)
    }
    Object.freeze(lvl.lessons)
    Object.freeze(lvl)
  }
  Object.freeze(course.levels)
  Object.freeze(course.databases)
  Object.freeze(course)

  _cachedSpanishCourse = course
  return course
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Funciones públicas                                                  *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Carga el curso completo para un locale.
 *
 * - `'es'` → curso v1 en español.
 * - `'ca'` / `'en'` → `NotImplementedError` (se implementarán en 7.x).
 *
 * La función es **síncrona** porque el contenido es estático.
 */
export function loadCourse(locale: Locale): Course {
  switch (locale) {
    case 'es':
      return buildSpanishCourse()
    case 'ca':
      throw new NotImplementedError(
        'El curso en catalán (ca) aún no está disponible. Estamos trabajando en ello.',
      )
    case 'en':
      throw new NotImplementedError(
        'The English course (en) is not available yet. We are working on it.',
      )
    default: {
      // Exhaustividad: si añadimos locales al tipo y olvidamos un case,
      // TypeScript nos avisa aquí.
      const exhaustive: never = locale
      throw new NotImplementedError(`Locale no soportado: ${String(exhaustive)}`)
    }
  }
}

/**
 * Devuelve una `DatabaseSeed` por id. Lanza `ContentNotFoundError` si
 * el id no está en el catálogo.
 */
export function loadDatabase(id: string): DatabaseSeed {
  const seed = databaseSeedsById[id]
  if (!seed) {
    throw new ContentNotFoundError(
      `No existe una base de datos con id "${id}". Conocidas: ${Object.keys(databaseSeedsById).join(', ')}.`,
    )
  }
  return seed
}

/** Devuelve la lista de niveles del curso. Equivalente a `course.levels`. */
export function listLevels(course: Course): readonly Level[] {
  return course.levels
}

/** Devuelve la lista de lecciones de un nivel. */
export function listLessons(level: Level): readonly Lesson[] {
  return level.lessons
}

/**
 * Busca un ejercicio por id. Recorre todos los niveles y lecciones.
 * Lanza `ContentNotFoundError` si no existe.
 */
export function getExercise(course: Course, exerciseId: string): Exercise {
  for (const level of course.levels) {
    for (const lesson of level.lessons) {
      for (const ex of lesson.exercises) {
        if (ex.id === exerciseId) return ex
      }
    }
  }
  throw new ContentNotFoundError(
    `No existe un ejercicio con id "${exerciseId}" en el curso "${course.id}".`,
  )
}

/**
 * Devuelve el ejercicio siguiente al indicado en orden lineal
 * (nivel → lección → ejercicio). Devuelve `null` si era el último
 * (caso natural al final del curso).
 */
export function getNextExercise(course: Course, exerciseId: string): Exercise | null {
  let found = false
  for (const level of course.levels) {
    for (const lesson of level.lessons) {
      for (const ex of lesson.exercises) {
        if (found) return ex
        if (ex.id === exerciseId) found = true
      }
    }
  }
  if (!found) {
    throw new ContentNotFoundError(
      `No existe un ejercicio con id "${exerciseId}" en el curso "${course.id}".`,
    )
  }
  return null
}

/** Devuelve todas las bases de datos semilla del curso. */
export function listDatabases(course: Course): readonly DatabaseSeed[] {
  return course.databases
}

/** Devuelve el total de ejercicios en el curso. Útil para la UI. */
export function countExercises(course: Course): number {
  let n = 0
  for (const level of course.levels) {
    for (const lesson of level.lessons) {
      n += lesson.exercises.length
    }
  }
  return n
}

/** Reinicia el cache del curso (útil para tests). */
export function _resetCourseCacheForTests(): void {
  _cachedSpanishCourse = null
}

/** Expone `allDatabaseSeeds` para tests. */
export const _allDatabaseSeeds = allDatabaseSeeds
