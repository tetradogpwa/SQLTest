/**
 * Tests de los loaders del contenido.
 *
 * Cubre:
 *   - `loadCourse('es')` devuelve un curso bien formado.
 *   - `loadCourse('ca' | 'en')` lanza `NotImplementedError`.
 *   - `loadDatabase(id)` resuelve los 4 seeds conocidos.
 *   - `loadDatabase('nope')` lanza `ContentNotFoundError`.
 *   - `listLevels` y `listLessons` devuelven las listas correctas.
 *   - `getExercise` resuelve un id existente.
 *   - `getExercise` con id inexistente lanza `ContentNotFoundError`.
 *   - `getNextExercise` devuelve el siguiente en orden lineal.
 *   - `getNextExercise` en el último ejercicio devuelve `null`.
 *   - `countExercises` cuadra con 4 niveles × 4 lecciones × 6 ejercicios = 96.
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  loadCourse,
  loadDatabase,
  listLevels,
  listLessons,
  listDatabases,
  getExercise,
  getNextExercise,
  countExercises,
  NotImplementedError,
  ContentNotFoundError,
  _resetCourseCacheForTests,
} from '../../../src/content'

describe('loadCourse', () => {
  afterEach(() => {
    _resetCourseCacheForTests()
  })

  it('devuelve el curso en español con la estructura esperada', () => {
    const course = loadCourse('es')
    expect(course.locale).toBe('es')
    expect(course.levels).toHaveLength(4)
    expect(course.databases).toHaveLength(4)
    expect(course.id).toBe('sql-academy-es-v1')
    expect(course.title.length).toBeGreaterThan(0)
  })

  it('lanza NotImplementedError para catalán', () => {
    expect(() => loadCourse('ca')).toThrow(NotImplementedError)
  })

  it('lanza NotImplementedError para inglés', () => {
    expect(() => loadCourse('en')).toThrow(NotImplementedError)
  })

  it('memoriza el curso: dos llamadas devuelven la misma referencia', () => {
    const a = loadCourse('es')
    const b = loadCourse('es')
    expect(a).toBe(b)
  })
})

describe('loadDatabase', () => {
  it('resuelve los 4 seeds conocidos', () => {
    expect(loadDatabase('library').id).toBe('library')
    expect(loadDatabase('tienda').id).toBe('tienda')
    expect(loadDatabase('social').id).toBe('social')
    expect(loadDatabase('empresa').id).toBe('empresa')
  })

  it('lanza ContentNotFoundError con un id desconocido', () => {
    expect(() => loadDatabase('no-existe')).toThrow(ContentNotFoundError)
  })
})

describe('listLevels / listLessons', () => {
  it('listLevels devuelve los 4 niveles en orden', () => {
    const course = loadCourse('es')
    const levels = listLevels(course)
    expect(levels.map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'L4'])
  })

  it('listLessons devuelve las 4 lecciones de un nivel', () => {
    const course = loadCourse('es')
    const level = course.levels[0]!
    const lessons = listLessons(level)
    expect(lessons).toHaveLength(4)
    expect(lessons.map((l) => l.id)).toEqual(['L1.1', 'L1.2', 'L1.3', 'L1.4'])
  })
})

describe('getExercise', () => {
  it('encuentra un ejercicio existente', () => {
    const course = loadCourse('es')
    const ex = getExercise(course, 'L1.1-e1')
    expect(ex.id).toBe('L1.1-e1')
    expect(ex.lessonId).toBe('L1.1')
    expect(ex.databaseId).toBe('library')
  })

  it('lanza ContentNotFoundError con un id inexistente', () => {
    const course = loadCourse('es')
    expect(() => getExercise(course, 'L1.1-e99')).toThrow(ContentNotFoundError)
  })
})

describe('getNextExercise', () => {
  it('devuelve el siguiente ejercicio en orden lineal', () => {
    const course = loadCourse('es')
    const next = getNextExercise(course, 'L1.1-e1')
    expect(next).not.toBeNull()
    expect(next?.id).toBe('L1.1-e2')
  })

  it('cruza al siguiente lección cuando se agota la actual', () => {
    const course = loadCourse('es')
    const next = getNextExercise(course, 'L1.1-e7')
    expect(next?.id).toBe('L1.2-e1')
  })

  it('cruza al siguiente nivel cuando se agotan las lecciones', () => {
    const course = loadCourse('es')
    const next = getNextExercise(course, 'L1.4-e7')
    expect(next?.id).toBe('L2.1-e1')
  })

  it('devuelve null cuando el ejercicio es el último del curso', () => {
    const course = loadCourse('es')
    // L4.4-e7 es el último ejercicio (nivel 4, lección 4, ejercicio 7)
    const next = getNextExercise(course, 'L4.4-e7')
    expect(next).toBeNull()
  })

  it('lanza ContentNotFoundError con un id inexistente', () => {
    const course = loadCourse('es')
    expect(() => getNextExercise(course, 'no-existe')).toThrow(ContentNotFoundError)
  })
})

describe('listDatabases y countExercises', () => {
  it('listDatabases devuelve los 4 seeds', () => {
    const course = loadCourse('es')
    const dbs = listDatabases(course)
    expect(dbs.map((d) => d.id)).toEqual(['library', 'tienda', 'social', 'empresa'])
  })

  it('countExercises devuelve 112 (4 niveles × 4 lecciones × 7 ejercicios)', () => {
    const course = loadCourse('es')
    expect(countExercises(course)).toBe(112)
  })
})
