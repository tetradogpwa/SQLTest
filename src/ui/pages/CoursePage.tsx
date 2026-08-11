/**
 * Course page — the catalog root.
 *
 * Renders a two-pane layout:
 *
 *   ┌──────────────┬────────────────────────────────────────────────┐
 *   │  Sidebar     │   <Outlet />                                    │
 *   │  (4 levels,  │   (LessonPage / ExercisePage / LevelPage)        │
 *   │   16 lessons,│                                                │
 *   │   96 exercises)                                                │
 *   └──────────────┴────────────────────────────────────────────────┘
 *
 * The sidebar is shared across all child routes; navigating between
 * lessons / exercises keeps the user oriented. The active exercise
 * id is read from the URL (via the child route's `useParams`).
 */
import { Outlet, useNavigate, useParams } from 'react-router-dom'

import { CourseSidebar } from '../components/course/CourseSidebar'
import { useProgress } from '../../hooks/useProgress'
import { loadCourse } from '../../content/loaders'
import styles from './course-page.module.css'

export function CoursePage(): React.ReactNode {
  const navigate = useNavigate()
  const params = useParams<{ exerciseId?: string; lessonId?: string }>()
  const { course, completedExerciseIds, completionByLevel } = useProgress()

  // The active exercise is whichever id appears in the URL. We do
  // NOT read the child route's params; instead, the child route
  // (ExercisePage) re-reads the same id from `useParams`. This keeps
  // the sidebar dumb: it just lights up whatever id we pass.
  const activeExerciseId = params.exerciseId

  // We use the static Spanish course (memoised inside `loadCourse`).
  // The `useProgress` hook also loads the course; both calls hit the
  // same cache, so there's no duplication.
  const _catalog = loadCourse('es')
  void _catalog

  return (
    <div className={styles.shell} data-testid="course-page">
      <CourseSidebar
        course={course}
        activeExerciseId={activeExerciseId}
        completedExerciseIds={completedExerciseIds}
        completionByLevel={completionByLevel}
        onSelectExercise={(id) => navigate(`/course/exercise/${id}`)}
      />
      <main className={styles.main} data-testid="course-main">
        <Outlet />
      </main>
    </div>
  )
}

export default CoursePage
