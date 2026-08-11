/**
 * Tipos de contenido del curso (Fase 7.1).
 *
 * Este módulo define el esquema "de fuera" del curso: niveles, lecciones,
 * ejercicios, bases de datos semilla. Es complementario (no duplicado) del
 * esquema "de dentro" del motor de ejercicios en
 * `src/core/exercises/types.ts`, que define la forma de un `Exercise`
 * concreto (sus `Validation[]`, su `solution`, sus `Hint[]`).
 *
 *   - `core/exercises/types.ts` → **cómo validar** un ejercicio
 *   - `content/types.ts`         → **cómo organizar** el curso
 *
 * La regla de oro: `Exercise` (de core) se **re-exporta** desde aquí para
 * que un consumidor del curso pueda hacer `import type { Exercise, Course }
 * from '@/content'`.
 *
 * Toda la documentación y todos los literales en español.
 */

/* ──────────────────────────────────────────────────────────────────── *
 *  Identidad                                                            *
 * ──────────────────────────────────────────────────────────────────── */

/** Versión del esquema del curso. Se incrementa cuando se rompe
 *  compatibilidad con cursos anteriores (cambio de IDs, nuevos campos
 *  obligatorios, etc.). */
export const COURSE_VERSION = '1.0.0' as const

/** Localidades soportadas por la app. */
export type Locale = 'es' | 'ca' | 'en'

/* ──────────────────────────────────────────────────────────────────── *
 *  Base de datos semilla                                                *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Una base de datos lista para sembrar en la working-copy del alumno.
 *
 * El `sql` debe ser **idempotente** (CREATE TABLE IF NOT EXISTS, INSERT OR
 * IGNORE, etc.) porque el motor puede re-ejecutarlo si la working-copy
 * está vacía o si el usuario pulsa "Reiniciar".
 */
export interface DatabaseSeed {
  /** Identificador estable; coincide con `Exercise.databaseId`. */
  id: string
  /** Nombre humano (en la locale del curso). */
  name: string
  /** Descripción de una línea (qué datos contiene, qué enseñan). */
  description: string
  /** SQL completo: DDL + INSERTs. Idempotente. */
  sql: string
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección                                                              *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Una lección agrupa ejercicios que enseñan un concepto SQL. Vive dentro
 * de un nivel y comparte la base de datos del nivel.
 */
export interface Lesson {
  /** ID único dentro del curso (ej. `L1.1`). */
  id: string
  /** Posición dentro del nivel (1-based para mostrar al usuario). */
  order: number
  /** Título corto y accionable (ej. "SELECT básico"). */
  title: string
  /** Descripción de 1-2 frases (qué aprenderá el alumno). */
  description: string
  /** 3-4 objetivos de aprendizaje redactados en infinitivo. */
  objectives: string[]
  /** Ejercicios de la lección (5-7). */
  exercises: import('./types').Exercise[]
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Nivel                                                                *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Un nivel agrupa lecciones alrededor de una base de datos semilla.
 * Pensado para que un curso se cargue de forma incremental: el alumno
 * desbloquea un nivel, ve su base de datos y resuelve sus 4 lecciones.
 */
export interface Level {
  /** ID único dentro del curso (ej. `L1`). */
  id: string
  /** Posición dentro del curso (1-based). */
  order: number
  /** Título del nivel (ej. "Biblioteca Municipal"). */
  title: string
  /** Descripción de 1-2 frases. */
  description: string
  /** Referencia a la `DatabaseSeed.id` que usa este nivel. */
  databaseId: string
  /** Lecciones del nivel (típicamente 4). */
  lessons: Lesson[]
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Curso                                                                *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Curso completo: una colección de niveles + las bases de datos que
 * necesita. Es lo que carga la app al inicio.
 */
export interface Course {
  /** Identificador estable; usar para `localStorage` y telemetría. */
  id: string
  /** Locale del contenido. */
  locale: Locale
  /** Versión del esquema (debe coincidir con `COURSE_VERSION`). */
  version: string
  /** Título visible (ej. "SQL Academy — Castellano v1"). */
  title: string
  /** Descripción de 1-2 frases. */
  description: string
  /** Niveles del curso en orden. */
  levels: Level[]
  /** Bases de datos semilla (normalmente 1 por nivel, pero la estructura
   *  permite reusar una misma DB en varios niveles si se quiere). */
  databases: DatabaseSeed[]
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Re-export del tipo Exercise                                          *
 * ──────────────────────────────────────────────────────────────────── *
 *                                                                        *
 *  Esto es lo que mantiene el principio de "una sola fuente de verdad":  *
 *  `Exercise` (y todos sus tipos auxiliares) viven en                    *
 *  `core/exercises/types.ts`. Aquí solo lo re-exportamos para que        *
 *  `Lesson.exercises: Exercise[]` y `Course` se puedan importar desde    *
 *  un único punto (`@/content`).                                         *
 *                                                                        *
 * ──────────────────────────────────────────────────────────────────── */

export type { Exercise, ExerciseType, Hint, HintAfter, HintType, HintLevel } from '../core/exercises/types'
