/**
 * Lesson page.
 *
 * Resolves the `:lessonId` URL param, looks up the lesson + level +
 * exercises, renders `<LessonView>`. Shows a 404 if the id is not in
 * the catalog.
 *
 * The sidebar lives on the parent `CoursePage` route, so this page
 * is just the lesson content.
 */
import { Link, useNavigate, useParams } from 'react-router-dom'

import { LessonView } from '../components/course/LessonView'
import { loadCourse } from '../../content/loaders'
import { useProgress } from '../../hooks/useProgress'
import { ContentNotFoundError } from '../../content/loaders'
import pageStyles from './page.module.css'

export function LessonPage(): React.ReactNode {
  const { lessonId } = useParams<{ lessonId: string }>()
  const { completedExerciseIds } = useProgress()
  const navigate = useNavigate()

  if (!lessonId) {
    return <NotFoundView message="Identificador de lección ausente." />
  }

  const course = loadCourse('es')
  let resolved: {
    lesson: (typeof course.levels)[number]['lessons'][number]
    level: (typeof course.levels)[number]
  } | null = null
  try {
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        if (lesson.id === lessonId) {
          resolved = { lesson, level }
          break
        }
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
    return <NotFoundView message={`No existe la lección con id "${lessonId}".`} />
  }

  return (
    <div data-testid="lesson-page">
      <LessonView
        lesson={resolved.lesson}
        level={resolved.level}
        completedExerciseIds={completedExerciseIds}
        onSelectExercise={(id) => navigate(`/course/exercise/${id}`)}
      />
    </div>
  )
}

function NotFoundView({ message }: { message: string }): React.ReactNode {
  return (
    <div className={pageStyles.page} data-testid="lesson-page" data-not-found="true">
      <header className={pageStyles.pageHeader}>
        <h1>Lección no encontrada</h1>
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

export default LessonPage
