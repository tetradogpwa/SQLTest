/**
 * Estadísticas del curso.
 *
 * Funciones que calculan y devuelven estadísticas agregadas sobre el
 * curso: número de ejercicios por tipo, número de lecciones por nivel,
 * distribución de dificultad, etc.
 *
 * Útil para la UI (página "acerca del curso", dashboards de progreso,
 * etc.) y para los tests que validan la forma del curso.
 */

import type { Course, DatabaseSeed, Exercise, ExerciseType, Level, Lesson } from './types'

/** Estadísticas de un tipo de ejercicio. */
export interface ExerciseTypeStats {
  type: ExerciseType
  count: number
}

/** Estadísticas por nivel. */
export interface LevelStats {
  levelId: string
  title: string
  databaseId: string
  lessonCount: number
  exerciseCount: number
  exerciseTypes: ExerciseTypeStats[]
}

/** Estadísticas por base de datos. */
export interface DatabaseStats {
  id: string
  name: string
  description: string
  /** Nº aproximado de tablas (CREATE TABLE). */
  tableCount: number
  /** Nº aproximado de filas (suma de los INSERT VALUES en cada fila). */
  rowCount: number
  /** Nº de FOREIGN KEY declaradas. */
  foreignKeyCount: number
  /** Nº de UNIQUE constraints declaradas (en CREATE TABLE). */
  uniqueCount: number
  /** Nº de índices secundarios. */
  indexCount: number
  /** Tamaño aproximado del SQL en bytes. */
  sqlBytes: number
}

/** Resumen global del curso. */
export interface CourseStats {
  courseId: string
  locale: string
  levelCount: number
  lessonCount: number
  exerciseCount: number
  databaseCount: number
  exerciseTypes: ExerciseTypeStats[]
  levels: LevelStats[]
  databases: DatabaseStats[]
  /** Distribución de difficulty (1-5). */
  difficultyDistribution: Record<1 | 2 | 3 | 4 | 5, number>
  /** Número total de objetivos de aprendizaje. */
  totalObjectives: number
}

/** Cuenta cuántos `CREATE TABLE` aparecen en un SQL. */
function countCreates(sql: string): number {
  const matches = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?/gi)
  return matches?.length ?? 0
}

/** Cuenta el número aproximado de filas de INSERTs. */
function countInsertRows(sql: string): number {
  // Estrategia: contar los VALUES(...) y sumar los items dentro.
  let total = 0
  const re = /INSERT\s+(?:OR\s+IGNORE\s+)?INTO[^;]*VALUES\s*([\s\S]*?);/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    const valuesBlock = m[1] ?? ''
    // Cada tupla empieza con `(`. Contamos `(` a nivel top-level.
    let depth = 0
    let tuples = 0
    let inString = false
    for (let i = 0; i < valuesBlock.length; i++) {
      const ch = valuesBlock[i]
      if (ch === "'" && valuesBlock[i - 1] !== '\\') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (ch === '(') {
        if (depth === 0) tuples++
        depth++
      } else if (ch === ')') {
        depth--
      }
    }
    total += tuples
  }
  return total
}

/** Cuenta FOREIGN KEY declaradas. */
function countForeignKeys(sql: string): number {
  const matches = sql.match(/FOREIGN\s+KEY/gi)
  return matches?.length ?? 0
}

/** Cuenta UNIQUE constraints (palabra clave). */
function countUniques(sql: string): number {
  // La palabra UNIQUE puede aparecer:
  //  - en column constraint: `email TEXT NOT NULL UNIQUE` (sin paréntesis)
  //  - en table constraint: `UNIQUE(col1, col2)` (con paréntesis)
  // Sumamos ambos casos.
  const inParens = sql.match(/\bUNIQUE\s*\(/gi)?.length ?? 0
  const asColumnConstraint = sql.match(/\bUNIQUE\b(?!\s*\()/gi)?.length ?? 0
  return inParens + asColumnConstraint
}

/** Cuenta índices secundarios (CREATE INDEX). */
function countIndexes(sql: string): number {
  const matches = sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX/gi)
  return matches?.length ?? 0
}

/** Calcula las estadísticas de una base de datos. */
export function computeDatabaseStats(db: DatabaseSeed): DatabaseStats {
  return {
    id: db.id,
    name: db.name,
    description: db.description,
    tableCount: countCreates(db.sql),
    rowCount: countInsertRows(db.sql),
    foreignKeyCount: countForeignKeys(db.sql),
    uniqueCount: countUniques(db.sql),
    indexCount: countIndexes(db.sql),
    sqlBytes: db.sql.length,
  }
}

/** Calcula las estadísticas de un nivel. */
export function computeLevelStats(level: Level): LevelStats {
  const typeMap = new Map<ExerciseType, number>()
  let total = 0
  for (const lesson of level.lessons) {
    for (const ex of lesson.exercises) {
      total++
      typeMap.set(ex.type, (typeMap.get(ex.type) ?? 0) + 1)
    }
  }
  return {
    levelId: level.id,
    title: level.title,
    databaseId: level.databaseId,
    lessonCount: level.lessons.length,
    exerciseCount: total,
    exerciseTypes: Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  }
}

/** Calcula el resumen global de un curso. */
export function computeCourseStats(course: Course): CourseStats {
  const typeMap = new Map<ExerciseType, number>()
  const diffMap: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let total = 0
  let objectives = 0

  for (const level of course.levels) {
    for (const lesson of level.lessons) {
      objectives += lesson.objectives.length
      for (const ex of lesson.exercises) {
        total++
        typeMap.set(ex.type, (typeMap.get(ex.type) ?? 0) + 1)
        diffMap[ex.difficulty]++
      }
    }
  }

  return {
    courseId: course.id,
    locale: course.locale,
    levelCount: course.levels.length,
    lessonCount: course.levels.reduce((acc, l) => acc + l.lessons.length, 0),
    exerciseCount: total,
    databaseCount: course.databases.length,
    exerciseTypes: Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    levels: course.levels.map(computeLevelStats),
    databases: course.databases.map(computeDatabaseStats),
    difficultyDistribution: diffMap,
    totalObjectives: objectives,
  }
}

/** Devuelve todos los ejercicios del curso en una lista plana. */
export function listAllExercises(course: Course): readonly Exercise[] {
  const out: Exercise[] = []
  for (const level of course.levels) {
    for (const lesson of level.lessons) {
      out.push(...lesson.exercises)
    }
  }
  return out
}

/** Devuelve todas las lecciones del curso en una lista plana. */
export function listAllLessons(course: Course): readonly Lesson[] {
  const out: Lesson[] = []
  for (const level of course.levels) {
    out.push(...level.lessons)
  }
  return out
}

/** Versión humana del tipo de ejercicio (en español). */
export function exerciseTypeLabel(type: ExerciseType): string {
  const map: Record<ExerciseType, string> = {
    writeQuery: 'Escribir query',
    predictResult: 'Predecir resultado',
    findError: 'Encontrar error',
    completeQuery: 'Completar query',
    fixQuery: 'Arreglar query',
    modifyQuery: 'Modificar query',
    explore: 'Explorar',
    challenge: 'Reto',
  }
  return map[type]
}
