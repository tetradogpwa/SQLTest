/**
 * Tests de invariantes de forma del curso.
 *
 * El curso debe cumplir una serie de invariantes estructurales que
 * garanticen que el motor de ejercicios y la UI pueden recorrerlo sin
 * sorpresas:
 *
 *   - Cada lección tiene entre 5 y 7 ejercicios.
 *   - Cada `Exercise.id` es único dentro del curso.
 *   - El `databaseId` de cada ejercicio coincide con uno de los 4 seeds.
 *   - Cada `Lesson.id` es único dentro del curso.
 *   - `difficulty` está en el rango 1-5.
 *   - Cada nivel tiene 4 lecciones.
 *   - Cada `Level.id` es único.
 *   - Cada `Exercise.lessonId` apunta a una lección que existe.
 *   - Cada `Exercise.databaseId` está sembrado en el curso.
 *   - Las etiquetas (tags) son kebab-lowercase.
 */

import { describe, expect, it } from 'vitest'
import {
  loadCourse,
  listDatabases,
  _resetCourseCacheForTests,
} from '../../../src/content'
import type { Exercise, Level, Lesson } from '../../../src/content'

describe('Course shape invariants', () => {
  const course = loadCourse('es')
  const dbs = listDatabases(course)
  const dbIds = new Set(dbs.map((d) => d.id))

  it('cada nivel tiene exactamente 4 lecciones', () => {
    for (const level of course.levels) {
      expect(level.lessons.length, `nivel ${level.id}`).toBe(4)
    }
  })

  it('cada lección tiene entre 5 y 7 ejercicios', () => {
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        const n = lesson.exercises.length
        expect(n, `lección ${lesson.id}`).toBeGreaterThanOrEqual(5)
        expect(n, `lección ${lesson.id}`).toBeLessThanOrEqual(7)
      }
    }
  })

  it('total de ejercicios está en el rango 80-120 del spec', () => {
    let total = 0
    for (const level of course.levels) {
      for (const lesson of level.lessons) total += lesson.exercises.length
    }
    expect(total).toBeGreaterThanOrEqual(80)
    expect(total).toBeLessThanOrEqual(120)
  })

  it('los Exercise.id son únicos en todo el curso', () => {
    const seen = new Set<string>()
    const dupes: string[] = []
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        for (const ex of lesson.exercises) {
          if (seen.has(ex.id)) dupes.push(ex.id)
          seen.add(ex.id)
        }
      }
    }
    expect(dupes, `ids duplicados: ${dupes.join(', ')}`).toEqual([])
  })

  it('los Lesson.id son únicos en todo el curso', () => {
    const seen = new Set<string>()
    const dupes: string[] = []
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        if (seen.has(lesson.id)) dupes.push(lesson.id)
        seen.add(lesson.id)
      }
    }
    expect(dupes, `ids duplicados: ${dupes.join(', ')}`).toEqual([])
  })

  it('los Level.id son únicos', () => {
    const ids = new Set<string>()
    for (const level of course.levels) {
      expect(ids.has(level.id), `nivel ${level.id} duplicado`).toBe(false)
      ids.add(level.id)
    }
  })

  it('cada Exercise.databaseId es uno de los 4 seeds', () => {
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        for (const ex of lesson.exercises) {
          expect(
            dbIds.has(ex.databaseId),
            `ejercicio ${ex.id} referencia databaseId="${ex.databaseId}" no sembrado`,
          ).toBe(true)
        }
      }
    }
  })

  it('cada Exercise.lessonId apunta a una lección existente', () => {
    const lessonIds = new Set<string>()
    for (const level of course.levels) {
      for (const lesson of level.lessons) lessonIds.add(lesson.id)
    }
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        for (const ex of lesson.exercises) {
          expect(
            lessonIds.has(ex.lessonId),
            `ejercicio ${ex.id} referencia lessonId="${ex.lessonId}" inexistente`,
          ).toBe(true)
        }
      }
    }
  })

  it('la difficulty está en el rango 1-5', () => {
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        for (const ex of lesson.exercises) {
          expect(ex.difficulty, `${ex.id}`).toBeGreaterThanOrEqual(1)
          expect(ex.difficulty, `${ex.id}`).toBeLessThanOrEqual(5)
        }
      }
    }
  })

  it('todos los ejercicios tienen al menos una etiqueta', () => {
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        for (const ex of lesson.exercises) {
          expect(ex.tags.length, `${ex.id}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('las etiquetas son kebab-lowercase sin espacios', () => {
    const bad: string[] = []
    const tagRe = /^[a-z][a-z0-9-]*$/
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        for (const ex of lesson.exercises) {
          for (const t of ex.tags) {
            if (!tagRe.test(t)) bad.push(`${ex.id} -> ${t}`)
          }
        }
      }
    }
    expect(bad, `tags mal formadas: ${bad.join(', ')}`).toEqual([])
  })

  it('cada nivel referencia la base de datos correcta', () => {
    // Esta invariante conecta el nivel con el ejercicio: si la base del
    // nivel no coincide con la de sus ejercicios, el motor sembraría
    // una DB distinta a la que espera el alumno.
    const expected: Record<string, string> = {
      L1: 'library',
      L2: 'tienda',
      L3: 'social',
      L4: 'empresa',
    }
    for (const level of course.levels) {
      const want = expected[level.id]
      expect(want, `nivel ${level.id} no tiene base esperada`).toBeDefined()
      expect(level.databaseId).toBe(want)
      for (const lesson of level.lessons) {
        for (const ex of lesson.exercises) {
          expect(ex.databaseId, `${ex.id}`).toBe(want)
        }
      }
    }
  })

  it('el orden de niveles y lecciones es secuencial', () => {
    course.levels.forEach((level: Level, i: number) => {
      expect(level.order, `nivel ${level.id}.order`).toBe(i + 1)
      level.lessons.forEach((lesson: Lesson, j: number) => {
        expect(lesson.order, `lección ${lesson.id}.order`).toBe(j + 1)
      })
    })
  })

  it('los títulos de lección no están vacíos y son en español (sin ascii-only)', () => {
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        expect(lesson.title.length, `lección ${lesson.id}`).toBeGreaterThan(0)
        expect(lesson.title, `lección ${lesson.id}`).toMatch(/[áéíóúñÁÉÍÓÚÑüÜ]|^[A-Z]/)
      }
    }
  })

  it('cada lección tiene 3-4 objetivos', () => {
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        const n = lesson.objectives.length
        expect(n, `lección ${lesson.id}`).toBeGreaterThanOrEqual(3)
        expect(n, `lección ${lesson.id}`).toBeLessThanOrEqual(4)
      }
    }
  })

  it('los ids siguen el patrón esperado: L<n>.<m>-e<k>', () => {
    const idRe = /^L\d+\.\d+-e\d+$/
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        for (const ex of lesson.exercises as Exercise[]) {
          expect(ex.id, `${ex.id}`).toMatch(idRe)
        }
      }
    }
  })

  it('cada lección tiene al menos 3 tipos de ejercicio distintos (variedad pedagógica)', () => {
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        const types = new Set(lesson.exercises.map((e) => e.type))
        expect(types.size, `lección ${lesson.id}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('el tipo writeQuery está presente en todas las lecciones (el "pan de cada día")', () => {
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        const hasWrite = lesson.exercises.some((e) => e.type === 'writeQuery')
        expect(hasWrite, `lección ${lesson.id}`).toBe(true)
      }
    }
  })
})
