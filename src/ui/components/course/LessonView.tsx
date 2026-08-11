/**
 * LessonView — single-lesson page.
 *
 * Visual breakdown (top to bottom):
 *
 *   1. Breadcrumb: "Nivel X · Lección Y".
 *   2. Title + description.
 *   3. 3-4 objective bullets in a list.
 *   4. A grid of `ExerciseCard`s. Each card is a button that fires
 *      `onSelectExercise(id)`.
 *
 * The card shows: title, type badge, difficulty stars, prompt
 * (truncated to 2 lines), completion check, "Empezar" / "Repetir"
 * button. The view is **presentational**: the parent supplies the
 * data and the click handler.
 */
import { Check, Play, Repeat } from 'lucide-react'

import type { Exercise, Level, Lesson } from '../../../content/types'
import styles from './LessonView.module.css'

export interface LessonViewProps {
  lesson: Lesson
  level: Level
  completedExerciseIds: Set<string>
  onSelectExercise(exerciseId: string): void
}

const TYPE_LABELS: Record<Exercise['type'], string> = {
  writeQuery: 'Escribir consulta',
  predictResult: 'Predecir resultado',
  findError: 'Encontrar error',
  fixQuery: 'Corregir consulta',
  completeQuery: 'Completar consulta',
  modifyQuery: 'Modificar consulta',
  explore: 'Explorar',
  challenge: 'Reto',
}

function difficultyStars(difficulty: Exercise['difficulty']): string {
  return '★'.repeat(difficulty) + '☆'.repeat(5 - difficulty)
}

function truncatePrompt(prompt: string, maxLen: number = 140): string {
  if (prompt.length <= maxLen) return prompt
  return prompt.slice(0, maxLen).trim() + '…'
}

export function LessonView({
  lesson,
  level,
  completedExerciseIds,
  onSelectExercise,
}: LessonViewProps): React.ReactNode {
  return (
    <article className={styles.view} data-testid="lesson-view">
      <header className={styles.header}>
        <div className={styles.breadcrumb} data-testid="lesson-breadcrumb">
          <span>Nivel {level.order}</span>
          <span aria-hidden="true">·</span>
          <span>{level.title}</span>
          <span aria-hidden="true">·</span>
          <span>Lección {lesson.order}</span>
        </div>
        <h1 className={styles.title} data-testid="lesson-title">
          {lesson.title}
        </h1>
        <p className={styles.description}>{lesson.description}</p>
      </header>

      {lesson.objectives.length > 0 ? (
        <section className={styles.objectivesSection} aria-label="Objetivos de la lección">
          <h2 className={styles.objectivesTitle}>Objetivos</h2>
          <ul className={styles.objectivesList}>
            {lesson.objectives.map((objective, idx) => (
              <li
                key={`obj-${idx}`}
                data-testid={`lesson-objective-${idx}`}
              >
                {objective}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Ejercicios de la lección">
        <h2 className={styles.objectivesTitle} style={{ marginBottom: 'var(--space-3)' }}>
          Ejercicios
        </h2>
        <div className={styles.exerciseList}>
          {lesson.exercises.map((ex) => {
            const isCompleted = completedExerciseIds.has(ex.id)
            return (
              <article
                key={ex.id}
                className={styles.exerciseCard}
                data-testid={`exercise-card-${ex.id}`}
                data-completed={isCompleted ? 'true' : 'false'}
              >
                <header className={styles.exerciseHeader}>
                  <span className={styles.exerciseTitle}>{ex.title}</span>
                  <div className={styles.exerciseMeta}>
                    <span className={styles.typeBadge} data-testid={`exercise-type-${ex.id}`}>
                      {TYPE_LABELS[ex.type] ?? ex.type}
                    </span>
                    {isCompleted ? (
                      <span className={styles.completedBadge} data-testid={`exercise-completed-${ex.id}`}>
                        <Check size={12} aria-hidden="true" /> Completado
                      </span>
                    ) : null}
                  </div>
                </header>
                <p className={styles.prompt}>{truncatePrompt(ex.prompt)}</p>
                <div className={styles.exerciseMeta}>
                  <span
                    className={styles.difficulty}
                    aria-label={`Dificultad ${ex.difficulty} de 5`}
                    data-testid={`exercise-difficulty-${ex.id}`}
                  >
                    {difficultyStars(ex.difficulty)}
                  </span>
                </div>
                <div className={styles.action}>
                  <button
                    type="button"
                    className={styles.startButton}
                    onClick={() => onSelectExercise(ex.id)}
                    data-completed={isCompleted ? 'true' : 'false'}
                    data-testid={`exercise-start-${ex.id}`}
                    aria-label={isCompleted ? `Repetir ${ex.title}` : `Empezar ${ex.title}`}
                  >
                    {isCompleted ? (
                      <>
                        <Repeat size={14} aria-hidden="true" /> Repetir
                      </>
                    ) : (
                      <>
                        <Play size={14} aria-hidden="true" /> Empezar
                      </>
                    )}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </article>
  )
}

export default LessonView
