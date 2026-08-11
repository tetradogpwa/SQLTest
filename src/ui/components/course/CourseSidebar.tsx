/**
 * CourseSidebar — left-rail navigation for the course.
 *
 * Renders the catalog as a 3-level tree:
 *
 *   Nivel → Lección → Ejercicio
 *
 * Each exercise row is a button that calls `onSelectExercise(id)`.
 * Completed exercises get a green check; the active exercise is
 * highlighted with the primary-soft background. The whole sidebar
 * scrolls vertically (the page itself stays put), with a sticky
 * header for the course title.
 *
 * The component is **presentational** — it doesn't know how the
 * course is loaded. The parent (CoursePage) passes the `Course` and
 * the completion state. This keeps the sidebar trivially testable
 * with a static fixture.
 */
import { useMemo } from 'react'
import { Check } from 'lucide-react'

import type { Course } from '../../../content/types'
import type { LevelCompletion } from '../../../hooks/useProgress'
import { ProgressBar } from './ProgressBar'
import styles from './CourseSidebar.module.css'

export interface CourseSidebarProps {
  /** The full course to render. */
  course: Course
  /** Id of the currently active exercise (highlighted). Optional. */
  activeExerciseId?: string
  /** Click handler for an exercise row. */
  onSelectExercise(exerciseId: string): void
  /** Set of completed exercise ids. */
  completedExerciseIds: Set<string>
  /**
   * Optional pre-computed `Map<levelId, LevelCompletion>` from
   * `useProgress().completionByLevel`. When omitted, the sidebar
   * computes it on the fly (cheaper for the test path, which doesn't
   * have a live Dexie).
   */
  completionByLevel?: Map<string, LevelCompletion>
}

export function CourseSidebar({
  course,
  activeExerciseId,
  onSelectExercise,
  completedExerciseIds,
  completionByLevel,
}: CourseSidebarProps): React.ReactNode {
  // Build the per-level completion map if the parent didn't supply
  // one. This is the same algorithm as `useProgress` but kept inline
  // so the component remains useful in isolation (e.g. for tests).
  const localCompletion = useMemo<Map<string, LevelCompletion>>(() => {
    if (completionByLevel) return completionByLevel
    const out = new Map<string, LevelCompletion>()
    for (const level of course.levels) {
      let total = 0
      let done = 0
      for (const lesson of level.lessons) {
        total += lesson.exercises.length
        for (const ex of lesson.exercises) {
          if (completedExerciseIds.has(ex.id)) done += 1
        }
      }
      out.set(level.id, {
        done,
        total,
        pct: total === 0 ? 0 : done / total,
      })
    }
    return out
  }, [course, completedExerciseIds, completionByLevel])

  return (
    <aside
      className={styles.sidebar}
      data-testid="course-sidebar"
      aria-label="Navegación del curso"
    >
      <header className={styles.header}>
        <span className={styles.headerTitle}>{course.title}</span>
        <span className={styles.headerSubtitle}>
          {course.levels.length} niveles · {course.description.split('. ')[0] ?? ''}
        </span>
      </header>
      <div className={styles.scrollArea}>
        {course.levels.length === 0 ? (
          <p className={styles.empty}>El curso aún no tiene niveles.</p>
        ) : (
          course.levels.map((level) => {
            const completion = localCompletion.get(level.id) ?? { done: 0, total: 0, pct: 0 }
            return (
              <section
                key={level.id}
                className={styles.level}
                data-testid={`level-${level.id}`}
                aria-label={`Nivel ${level.order}: ${level.title}`}
              >
                <header className={styles.levelHeader}>
                  <span className={styles.levelNumber} aria-hidden="true">
                    {level.order}
                  </span>
                  <span className={styles.levelTitle}>{level.title}</span>
                </header>
                <div
                  className={styles.levelProgressBar}
                  data-testid={`level-progress-${level.id}`}
                >
                  <ProgressBar
                    done={completion.done}
                    total={completion.total}
                    label={`${completion.done} / ${completion.total} ejercicios`}
                    ariaLabel={`Progreso del nivel ${level.title}`}
                  />
                </div>
                {level.lessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className={styles.lesson}
                    data-testid={`lesson-${lesson.id}`}
                  >
                    <span className={styles.lessonTitle}>{lesson.title}</span>
                    <ul className={styles.exerciseList}>
                      {lesson.exercises.map((ex) => {
                        const isCompleted = completedExerciseIds.has(ex.id)
                        const isActive = activeExerciseId === ex.id
                        return (
                          <li key={ex.id}>
                            <button
                              type="button"
                              className={styles.exercise}
                              data-testid={`exercise-${ex.id}`}
                              data-active={isActive ? 'true' : 'false'}
                              data-completed={isCompleted ? 'true' : 'false'}
                              onClick={() => onSelectExercise(ex.id)}
                              aria-current={isActive ? 'page' : undefined}
                              aria-label={`Ejercicio ${ex.title}${isCompleted ? ' (completado)' : ''}`}
                            >
                              <span
                                className={styles.exerciseCheck}
                                data-completed={isCompleted ? 'true' : 'false'}
                                aria-hidden="true"
                              >
                                {isCompleted ? <Check size={14} /> : null}
                              </span>
                              <span className={styles.exerciseTitle}>{ex.title}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </section>
            )
          })
        )}
      </div>
    </aside>
  )
}

export default CourseSidebar
