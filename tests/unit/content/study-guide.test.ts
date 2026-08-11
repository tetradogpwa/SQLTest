/**
 * Tests de la guía de estudio.
 *
 * Verifica:
 *   - Existe guía para los 4 niveles.
 *   - Cada nivel tiene guía para sus 4 lecciones.
 *   - Las lecciones de la guía coinciden con las del curso.
 *   - Cada LessonGuide tiene summary, concepts y pitfalls no vacíos.
 *   - Las funciones getLevelGuide / getLessonGuide funcionan.
 */

import { describe, expect, it } from 'vitest'
import {
  studyGuide,
  getLevelGuide,
  getLessonGuide,
  loadCourse,
} from '../../../src/content'

describe('Guía de estudio', () => {
  const course = loadCourse('es')

  it('tiene guía para los 4 niveles del curso', () => {
    const levelIds = course.levels.map((l) => l.id)
    for (const id of levelIds) {
      expect(studyGuide[id], `falta guía para ${id}`).toBeDefined()
    }
  })

  it('cada nivel tiene guía para sus 4 lecciones', () => {
    for (const level of course.levels) {
      const guide = studyGuide[level.id]
      expect(guide, `guía de ${level.id}`).toBeDefined()
      for (const lesson of level.lessons) {
        expect(
          guide?.lessons[lesson.id],
          `falta guía para lección ${lesson.id}`,
        ).toBeDefined()
      }
    }
  })

  it('cada LessonGuide tiene summary, concepts (>= 2) y pitfalls (>= 1) no vacíos', () => {
    for (const level of course.levels) {
      const guide = studyGuide[level.id]
      expect(guide).toBeDefined()
      for (const lesson of level.lessons) {
        const lg = guide!.lessons[lesson.id]!
        expect(lg.summary.length, `summary de ${lesson.id}`).toBeGreaterThan(0)
        expect(lg.concepts.length, `concepts de ${lesson.id}`).toBeGreaterThanOrEqual(2)
        expect(lg.pitfalls.length, `pitfalls de ${lesson.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('getLevelGuide y getLessonGuide funcionan', () => {
    expect(getLevelGuide('L1')?.summary.length).toBeGreaterThan(0)
    expect(getLessonGuide('L1', 'L1.1')?.summary.length).toBeGreaterThan(0)
    expect(getLevelGuide('L99')).toBeUndefined()
    expect(getLessonGuide('L1', 'L99.9')).toBeUndefined()
  })
})
