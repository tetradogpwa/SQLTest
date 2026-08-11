/**
 * Level page — placeholder for the "all lessons in a level" view.
 *
 * Renders the level's lessons as a list of cards linking to the
 * lesson page. The sidebar already shows the same data; this page
 * is a wider-card view that emphasises the level header.
 */
import { Link, useParams } from 'react-router-dom'
import { BookOpen } from 'lucide-react'

import { loadCourse } from '../../content/loaders'
import { ContentNotFoundError } from '../../content/loaders'
import pageStyles from './page.module.css'

export function LevelPage(): React.ReactNode {
  const { levelId } = useParams<{ levelId: string }>()

  if (!levelId) {
    return <NotFoundView message="Identificador de nivel ausente." />
  }

  const course = loadCourse('es')
  const level = course.levels.find((l) => l.id === levelId)
  if (!level) {
    return <NotFoundView message={`No existe el nivel con id "${levelId}".`} />
  }

  return (
    <div className={pageStyles.page} data-testid="level-page">
      <header className={pageStyles.pageHeader}>
        <h1>
          <BookOpen size={22} aria-hidden="true" style={{ verticalAlign: 'middle' }} />{' '}
          Nivel {level.order}: {level.title}
        </h1>
        <p>{level.description}</p>
      </header>
      <section aria-label="Lecciones del nivel">
        <ul className={pageStyles.lessonList}>
          {level.lessons.map((lesson) => (
            <li
              key={lesson.id}
              className={pageStyles.lessonListItem}
              data-lesson-id={lesson.id}
            >
              <div>
                <div className={pageStyles.lessonTitle}>
                  Lección {lesson.order}: {lesson.title}
                </div>
                <div className={pageStyles.lessonMeta}>{lesson.description}</div>
              </div>
              <Link
                to={`/course/lesson/${lesson.id}`}
                className={pageStyles.button}
              >
                Abrir lección
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function NotFoundView({ message }: { message: string }): React.ReactNode {
  return (
    <div className={pageStyles.page} data-testid="level-page-not-found">
      <header className={pageStyles.pageHeader}>
        <h1>Nivel no encontrado</h1>
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

export default LevelPage

// Keep the import non-removed (we use it in error paths).
void ContentNotFoundError
