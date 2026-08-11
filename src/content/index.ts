/**
 * Barrel principal del contenido del curso.
 *
 * Re-exporta todo el contenido (tipos, bases de datos, niveles/lecciones,
 * loaders) desde un único punto de entrada. Los consumidores deberían
 * importar desde aquí, no desde los subdirectorios.
 *
 * Ejemplo:
 *
 *   import { loadCourse, listLevels, getExercise } from '@/content'
 *   const course = loadCourse('es')
 *   const lesson = getExercise(course, 'L1.1-e1')
 */

// Tipos
export * from './types'

// Bases de datos
export {
  librarySeed,
  tiendaSeed,
  socialSeed,
  empresaSeed,
  allDatabaseSeeds,
  databaseSeedsById,
} from './databases'

// Niveles y lecciones
export { libraryLevels } from './lessons/library'
export { tiendaLevels } from './lessons/tienda'
export { socialLevels } from './lessons/social'
export { empresaLevels } from './lessons/empresa'

// Loaders y errores
export {
  loadCourse,
  loadDatabase,
  listLevels,
  listLessons,
  listDatabases,
  countExercises,
  getExercise,
  getNextExercise,
  NotImplementedError,
  ContentNotFoundError,
  _resetCourseCacheForTests,
  _allDatabaseSeeds,
} from './loaders'

// Glosario
export { glossary, glossaryByTerm, lookupGlossary } from './glossary'
export type { GlossaryEntry } from './glossary'

// Guía de estudio
export { studyGuide, getLevelGuide, getLessonGuide } from './study-guide'
export type { LevelGuide, LessonGuide, ExerciseTip } from './study-guide'

// Estadísticas
export {
  computeCourseStats,
  computeLevelStats,
  computeDatabaseStats,
  listAllExercises,
  listAllLessons,
  exerciseTypeLabel,
} from './stats'
export type {
  CourseStats,
  LevelStats,
  DatabaseStats,
  ExerciseTypeStats,
} from './stats'
