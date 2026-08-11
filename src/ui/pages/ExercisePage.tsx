/**
 * Exercise page.
 *
 * Resolves the `:exerciseId` URL param, looks up the exercise + its
 * lesson + level + database seed, and renders `<ExerciseView>`. Shows
 * a 404 if the id is not in the catalog.
 *
 * The `useExercise` hook inside the view needs a Worker api and a
 * storage capability; both come from `useDatabase()`. The view itself
 * handles the "worker not ready" state, so this page just routes.
 */
import { Link, useParams } from 'react-router-dom'

import { ExerciseView } from '../components/course/ExerciseView'
import { loadCourse, loadDatabase } from '../../content/loaders'
import { ContentNotFoundError } from '../../content/loaders'
import pageStyles from './page.module.css'

export function ExercisePage(): React.ReactNode {
  const { exerciseId } = useParams<{ exerciseId: string }>()

  if (!exerciseId) {
    return <NotFoundView message="Identificador de ejercicio ausente." />
  }

  const course = loadCourse('es')

  // Find the exercise and its parent lesson/level.
  let resolved: {
    exercise: (typeof course.levels)[number]['lessons'][number]['exercises'][number]
    level: (typeof course.levels)[number]
    lesson: (typeof course.levels)[number]['lessons'][number]
  } | null = null
  try {
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        for (const ex of lesson.exercises) {
          if (ex.id === exerciseId) {
            resolved = { exercise: ex, level, lesson }
            break
          }
        }
        if (resolved) break
      }
      if (resolved) break
    }
  } catch (e) {
    if (e instanceof ContentNotFoundError) {
      return <NotFoundView message={e.message} />
    }
    throw e
  }
  if (!resolved) {
    return <NotFoundView message={`No existe el ejercicio con id "${exerciseId}".`} />
  }

  // Load the database seed. `loadDatabase` throws if the id is unknown.
  let database
  try {
    database = loadDatabase(resolved.exercise.databaseId)
  } catch (e) {
    if (e instanceof ContentNotFoundError) {
      return (
        <NotFoundView
          message={`La base de datos "${resolved.exercise.databaseId}" no está disponible para el ejercicio "${exerciseId}".`}
        />
      )
    }
    throw e
  }

  return (
    <div data-testid="exercise-page">
      <ExerciseView
        exercise={resolved.exercise}
        level={resolved.level}
        lesson={resolved.lesson}
        database={database}
      />
    </div>
  )
}

// Small helper kept here (private) for the type annotation above.
function NotFoundView({ message }: { message: string }): React.ReactNode {
  return (
    <div className={pageStyles.page} data-testid="exercise-page" data-not-found="true">
      <header className={pageStyles.pageHeader}>
        <h1>Ejercicio no encontrado</h1>
        <p>{message}</p>
      </header>
      <p>
        <Link to="/course" className={pageStyles.button}>
          Volver al curso
        </Link>
      </p>
    </div>
  )
}

export default ExercisePage
