/**
 * Tests del módulo de estadísticas.
 *
 * Cubre:
 *   - `computeCourseStats` devuelve el resumen global.
 *   - `computeLevelStats` agrega correctamente los ejercicios de un nivel.
 *   - `computeDatabaseStats` parsea correctamente la SQL del seed.
 *   - `listAllExercises` y `listAllLessons` aplanan el árbol.
 *   - `exerciseTypeLabel` devuelve etiquetas en español.
 */

import { describe, expect, it } from 'vitest'
import {
  loadCourse,
  loadDatabase,
  computeCourseStats,
  computeLevelStats,
  computeDatabaseStats,
  listAllExercises,
  listAllLessons,
  exerciseTypeLabel,
} from '../../../src/content'

describe('Stats del curso', () => {
  const course = loadCourse('es')

  it('computeCourseStats devuelve el resumen correcto', () => {
    const stats = computeCourseStats(course)
    expect(stats.courseId).toBe(course.id)
    expect(stats.locale).toBe('es')
    expect(stats.levelCount).toBe(4)
    expect(stats.lessonCount).toBe(16) // 4 niveles × 4 lecciones
    expect(stats.exerciseCount).toBe(112) // 16 × 7
    expect(stats.databaseCount).toBe(4)
  })

  it('la distribución de difficulty suma el total de ejercicios', () => {
    const stats = computeCourseStats(course)
    const sum = Object.values(stats.difficultyDistribution).reduce((a, b) => a + b, 0)
    expect(sum).toBe(stats.exerciseCount)
  })

  it('cada nivel tiene sus propias stats', () => {
    const stats = computeCourseStats(course)
    expect(stats.levels).toHaveLength(4)
    for (const ls of stats.levels) {
      expect(ls.lessonCount).toBe(4)
      expect(ls.exerciseCount).toBe(28) // 4 lecciones × 7 ejercicios
    }
  })

  it('computeLevelStats agrega correctamente', () => {
    const level = course.levels[0]!
    const stats = computeLevelStats(level)
    expect(stats.levelId).toBe(level.id)
    expect(stats.lessonCount).toBe(4)
  })

  it('computeDatabaseStats detecta tablas, FKs, UNIQUE e índices', () => {
    const stats = computeDatabaseStats(loadDatabase('library'))
    expect(stats.id).toBe('library')
    expect(stats.tableCount).toBeGreaterThanOrEqual(4)
    expect(stats.foreignKeyCount).toBeGreaterThan(0)
    expect(stats.uniqueCount).toBeGreaterThan(0)
    expect(stats.indexCount).toBeGreaterThan(0)
    expect(stats.sqlBytes).toBeGreaterThan(1000)
  })

  it('listAllExercises devuelve 112 ejercicios', () => {
    const all = listAllExercises(course)
    expect(all).toHaveLength(112)
  })

  it('listAllLessons devuelve 16 lecciones', () => {
    const all = listAllLessons(course)
    expect(all).toHaveLength(16)
  })

  it('exerciseTypeLabel devuelve etiquetas en español', () => {
    expect(exerciseTypeLabel('writeQuery')).toBe('Escribir query')
    expect(exerciseTypeLabel('completeQuery')).toBe('Completar query')
    expect(exerciseTypeLabel('predictResult')).toBe('Predecir resultado')
    expect(exerciseTypeLabel('findError')).toBe('Encontrar error')
    expect(exerciseTypeLabel('fixQuery')).toBe('Arreglar query')
    expect(exerciseTypeLabel('modifyQuery')).toBe('Modificar query')
    expect(exerciseTypeLabel('explore')).toBe('Explorar')
    expect(exerciseTypeLabel('challenge')).toBe('Reto')
  })
})
