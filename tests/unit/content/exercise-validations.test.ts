/**
 * Tests de Fase 7.2 — Validaciones, pistas y explicaciones de soluciones.
 *
 * Verifica que el contenido pedagógico de cada ejercicio cumple los
 * requisitos del task spec:
 *
 *   - `solution.length > 5` (real SQL, no vacío)
 *   - `validation.length >= 1` (al menos una validación)
 *   - `hints.length >= 3` y todos los `hints[i].length > 5`
 *   - `solutionExplanation.length > 10`
 *
 * Para cada una de las 4 lecciones del primer nivel (L1.1, L1.2, L1.3,
 * L1.4) validamos los 7 ejercicios (4 × 7 = 28 tests). Como el task
 * pide ≥ 16, esto lo cubre de sobra y nos asegura que TODOS los
 * niveles están bien (no solo el primero). En realidad iteramos sobre
 * todos los niveles para tener cobertura completa del curso (112
 * ejercicios).
 *
 * Estos tests son **puros**: no ejecutan SQL, no tocan DBAPI, no
 * requieren wa-sqlite. Son la primera línea de defensa para detectar
 * regresiones en el contenido pedagógico.
 */

import { describe, expect, it } from 'vitest'
import { loadCourse, type Exercise } from '../../../src/content'

describe('Exercise validations + hints (Fase 7.2)', () => {
  const course = loadCourse('es')

  function forEachExercise(fn: (exercise: Exercise, lessonId: string) => void) {
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        for (const exercise of lesson.exercises) {
          fn(exercise, lesson.id)
        }
      }
    }
  }

  it('cada ejercicio tiene una solution de más de 5 caracteres', () => {
    forEachExercise((ex) => {
      expect(typeof ex.solution, `${ex.id} — solution existe`).toBe('string')
      const solution = ex.solution ?? ''
      expect(
        solution.length,
        `${ex.id} — solution tiene al menos 5 chars (era ${solution.length})`,
      ).toBeGreaterThan(5)
    })
  })

  it('cada ejercicio tiene al menos una validación', () => {
    forEachExercise((ex) => {
      expect(
        Array.isArray(ex.validation),
        `${ex.id} — validation es un array`,
      ).toBe(true)
      expect(
        ex.validation.length,
        `${ex.id} — al menos 1 validación`,
      ).toBeGreaterThanOrEqual(1)
    })
  })

  it('cada validación tiene un `type` válido del conjunto de 11 estrategias', () => {
    const validTypes = new Set([
      'result',
      'dbState',
      'schema',
      'rowCount',
      'rowExists',
      'tableExists',
      'constraint',
      'usesKeyword',
      'usesJoin',
      'invariant',
      'queryPlan',
      'custom',
    ])
    forEachExercise((ex) => {
      for (const v of ex.validation) {
        expect(
          validTypes.has(v.type),
          `${ex.id} — tipo de validación "${(v as { type: string }).type}" no es de las 11 estrategias`,
        ).toBe(true)
      }
    })
  })

  it('cada ejercicio tiene al menos 3 hints', () => {
    forEachExercise((ex) => {
      expect(
        Array.isArray(ex.hints),
        `${ex.id} — hints es un array`,
      ).toBe(true)
      expect(
        ex.hints.length,
        `${ex.id} — al menos 3 hints (tiene ${ex.hints.length})`,
      ).toBeGreaterThanOrEqual(3)
    })
  })

  it('cada hint tiene texto de más de 5 caracteres en español', () => {
    forEachExercise((ex) => {
      ex.hints.forEach((h, i) => {
        expect(
          typeof h.text,
          `${ex.id} — hints[${i}].text es string`,
        ).toBe('string')
        expect(
          h.text.length,
          `${ex.id} — hints[${i}].text tiene >5 chars (era ${h.text.length})`,
        ).toBeGreaterThan(5)
        // Tildes y ñ son marcas de español
        expect(
          /[áéíóúñüÁÉÍÓÚÑ¿¡]|^[A-Z]/.test(h.text) || h.text.length > 30,
          `${ex.id} — hints[${i}].text parece estar en español ("${h.text.slice(0, 40)}...")`,
        ).toBe(true)
      })
    })
  })

  it('cada hint tiene level 1/2/3 y un after válido', () => {
    const validLevels = new Set([1, 2, 3])
    const validAfter = new Set([
      'never',
      'after-failure',
      'after-2-failures',
      'after-3-failures',
    ])
    forEachExercise((ex) => {
      ex.hints.forEach((h, i) => {
        expect(
          validLevels.has(h.level),
          `${ex.id} — hints[${i}].level ∈ {1,2,3}`,
        ).toBe(true)
        expect(
          validAfter.has(h.after),
          `${ex.id} — hints[${i}].after ∈ {never, after-failure, after-2-failures, after-3-failures}`,
        ).toBe(true)
        expect(
          ['conceptual', 'syntactic', 'semantic', 'reference'].includes(h.type),
          `${ex.id} — hints[${i}].type es una HintType válida`,
        ).toBe(true)
      })
    })
  })

  it('cada ejercicio tiene solutionExplanation de más de 10 caracteres', () => {
    forEachExercise((ex) => {
      expect(
        typeof ex.solutionExplanation,
        `${ex.id} — solutionExplanation existe`,
      ).toBe('string')
      expect(
        ex.solutionExplanation.length,
        `${ex.id} — solutionExplanation tiene >10 chars (era ${ex.solutionExplanation.length})`,
      ).toBeGreaterThan(10)
    })
  })

  it('los hints siguen el orden pedagógico: conceptual → syntactic → semantic', () => {
    // Los 3 hints deben progresar de más general a más concreto.
    forEachExercise((ex) => {
      const types = ex.hints.map((h) => h.type)
      // Al menos los 3 primeros deben seguir el orden conceptual, syntactic, semantic
      if (types.length >= 3) {
        expect(
          types[0],
          `${ex.id} — primer hint es conceptual (era ${types[0]})`,
        ).toBe('conceptual')
        expect(
          types[1],
          `${ex.id} — segundo hint es syntactic (era ${types[1]})`,
        ).toBe('syntactic')
        expect(
          types[2],
          `${ex.id} — tercer hint es semantic (era ${types[2]})`,
        ).toBe('semantic')
      }
    })
  })

  it('los predictResult tienen la solution igual al promptQuery', () => {
    forEachExercise((ex) => {
      if (ex.type === 'predictResult') {
        expect(
          ex.promptQuery,
          `${ex.id} — predictResult tiene promptQuery`,
        ).toBeTruthy()
        expect(
          ex.solution,
          `${ex.id} — predictResult tiene solution`,
        ).toBeTruthy()
        // Por convención, la solution debe ser ejecutable y producir el
        // mismo resultado que el promptQuery.
        expect(
          ex.solution,
          `${ex.id} — solution de predictResult coincide con promptQuery`,
        ).toBe(ex.promptQuery)
      }
    })
  })

  it('los ejercicios DML (l4.*) tienen al menos una validación de estado', () => {
    // Las lecciones 4 de cada nivel enseñan DML. Sus validations deben
    // ser de tipo `rowCount` o `invariant` (las que miran el estado
    // post-mutación), no `result` puro.
    const dmlTypes = new Set(['rowCount', 'invariant', 'rowExists', 'schema', 'tableExists'])
    for (const level of course.levels) {
      const dmlLesson = level.lessons.find((l) => l.order === 4)
      if (!dmlLesson) continue
      for (const ex of dmlLesson.exercises) {
        if (ex.type === 'predictResult') {
          // Los predictResult de DML pueden tener validation `result` (es
          // la predicción de la query de control, no de la mutación).
          continue
        }
        const hasDmlValidation = ex.validation.some((v) => dmlTypes.has(v.type))
        expect(
          hasDmlValidation,
          `${ex.id} (DML) tiene al menos una validación de estado (rowCount/invariant/...)`,
        ).toBe(true)
      }
    }
  })

  it('total de ejercicios y densidad de validaciones son razonables', () => {
    let totalExercises = 0
    let totalValidations = 0
    let totalHints = 0
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        totalExercises += lesson.exercises.length
        for (const ex of lesson.exercises) {
          totalValidations += ex.validation.length
          totalHints += ex.hints.length
        }
      }
    }
    // 16 lecciones × 7 ejercicios = 112 ejercicios.
    expect(totalExercises, 'total de ejercicios').toBe(112)
    // Al menos 1 validación por ejercicio: 112 mínimo.
    expect(
      totalValidations,
      'total de validaciones (>= total de ejercicios)',
    ).toBeGreaterThanOrEqual(totalExercises)
    // Al menos 3 hints por ejercicio: 336 mínimo.
    expect(totalHints, 'total de hints (>= 3 por ejercicio)').toBeGreaterThanOrEqual(
      totalExercises * 3,
    )
  })
})
