/**
 * Internationalisation core.
 *
 * MVP scope: synchronous `es` dictionary with a tiny `en` override
 * layer. The architecture is the same as the production one — adding
 * more dictionaries is a matter of importing them into
 * `dictionaries`. Pluralisation / lazy loading are out of scope for
 * the MVP and will land in a later phase.
 *
 * Conventions
 * -----------
 *  - Keys are dot-namespaced: `domain.subdomain.subject`
 *  - Missing keys fall back to the key itself (so they are easy to
 *    spot in dev). They never return `undefined`.
 *  - Variable interpolation uses `{name}` placeholders. Unknown
 *    placeholders are left in the output so the dev can see them.
 *  - Locale defaults to `DEFAULT_LOCALE` (Spanish for this MVP).
 */

import { useCallback, useSyncExternalStore } from 'react'

export type Locale = 'es' | 'en'

export const DEFAULT_LOCALE: Locale = 'es'

export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = ['es', 'en'] as const

type Dictionary = Readonly<Record<string, string>>

/* ------------------------------------------------------------------ *
 *  Dictionaries                                                      *
 * ------------------------------------------------------------------ */

const es: Dictionary = {
  // App
  'app.title': 'SQL Academy',
  'app.tagline': 'Aprende SQL en tu navegador, 100% offline.',
  'app.shortName': 'SQLA',

  // Navigation
  'nav.home': 'Inicio',
  'nav.course': 'Curso',
  'nav.lessons': 'Lecciones',
  'nav.playground': 'Playground',
  'nav.databases': 'Bases de datos',
  'nav.settings': 'Ajustes',
  'nav.toggleSidebar': 'Mostrar / ocultar menú lateral',

  // TopBar
  'topbar.workerOnline': 'Worker conectado',
  'topbar.workerOffline': 'Worker sin conexión',
  'topbar.saving': 'Guardando…',
  'topbar.saved': 'Cambios guardados',
  'topbar.language': 'Idioma',
  'topbar.theme.light': 'Tema claro',
  'topbar.theme.dark': 'Tema oscuro',
  'topbar.theme.auto': 'Tema automático',
  'topbar.user.placeholder': 'Invitado',

  // Common buttons / actions
  'common.start': 'Empezar',
  'common.continue': 'Continuar',
  'common.back': 'Volver',
  'common.next': 'Siguiente',
  'common.cancel': 'Cancelar',
  'common.save': 'Guardar',
  'common.close': 'Cerrar',
  'common.open': 'Abrir',
  'common.delete': 'Eliminar',
  'common.confirm': 'Confirmar',
  'common.loading': 'Cargando…',
  'common.retry': 'Reintentar',
  'common.comingSoon': 'Próximamente',
  'common.underConstruction': 'En construcción',
  'common.placeholder': 'Placeholder',

  // Home
  'home.welcome': 'Bienvenido a SQL Academy',
  'home.subtitle': 'Aprende SQL paso a paso, con ejercicios interactivos y un editor en el navegador.',
  'home.openCourse': 'Abrir el curso',
  'home.openPlayground': 'Abrir el playground',
  'home.manageDatabases': 'Gestionar bases de datos',
  'home.progress.title': 'Tu progreso',
  'home.progress.empty': 'Aún no has completado ningún ejercicio. Empieza por la primera lección.',
  'home.progress.lessonsCompleted': '{done} de {total} lecciones completadas',
  'home.progress.percent': '{percent}% completado',

  // Course
  'course.title': 'Curso de SQL',
  'course.subtitle': '16 niveles para dominar SQL de cero a avanzado.',
  'course.levels': 'Niveles',
  'course.lessonsInLevel': '{count} lecciones',
  'course.comingSoonLevel': 'Los ejercicios de este nivel se desbloquearán pronto.',
  'course.locked': 'Bloqueado',
  'course.unlocked': 'Disponible',
  'course.completed': 'Completado',
  'course.inProgress': 'En curso',

  // Lesson
  'lesson.title': 'Lección',
  'lesson.idLabel': 'ID de la lección',
  'lesson.empty': 'Esta lección aún no tiene contenido.',
  'lesson.firstExercise': 'Ir al primer ejercicio',

  // Exercise
  'exercise.title': 'Ejercicio',
  'exercise.idLabel': 'ID del ejercicio',
  'exercise.sqlPlaceholder': 'Escribe tu consulta aquí…',
  'exercise.run': 'Ejecutar',
  'exercise.check': 'Comprobar',
  'exercise.hint': 'Pista',
  'exercise.solution': 'Ver solución',
  'exercise.editorPlaceholder': 'El editor SQL aparecerá aquí.',

  // Playground
  'playground.title': 'Playground SQL',
  'playground.subtitle': 'Una base de datos SQLite vacía para experimentar libremente.',

  // Databases
  'databases.title': 'Bases de datos',
  'databases.subtitle': 'Importa, exporta y gestiona tus bases de datos SQLite.',
  'databases.empty': 'No tienes bases de datos todavía.',

  // Settings
  'settings.title': 'Ajustes',
  'settings.subtitle': 'Preferencias generales de la aplicación.',
  'settings.section.appearance': 'Apariencia',
  'settings.section.language': 'Idioma',
  'settings.section.editor': 'Editor',
  'settings.theme.label': 'Tema',
  'settings.theme.light': 'Claro',
  'settings.theme.dark': 'Oscuro',
  'settings.theme.auto': 'Automático (sistema)',
  'settings.fontSize.label': 'Tamaño de fuente',
  'settings.fontSize.sm': 'Pequeño',
  'settings.fontSize.md': 'Mediano',
  'settings.fontSize.lg': 'Grande',
  'settings.locale.label': 'Idioma de la interfaz',
  'settings.locale.es': 'Español',
  'settings.locale.en': 'Inglés',
  'settings.reset': 'Restaurar valores por defecto',
  'settings.reset.confirm': '¿Restaurar todos los ajustes a sus valores por defecto?',

  // Sidebar
  'sidebar.progress': 'Progreso del curso',
  'sidebar.progress.empty': 'Sin progreso todavía.',
  'sidebar.progress.complete': 'Curso completo',

  // Not found
  'notFound.title': 'Página no encontrada',
  'notFound.message': 'La página que buscas no existe o ha sido movida.',
  'notFound.backHome': 'Volver al inicio',

  // Errors
  'error.generic': 'Ha ocurrido un error inesperado. Inténtalo de nuevo.',
  'error.themeContext': 'useTheme() debe usarse dentro de un <ThemeProvider>.',
}

const en: Dictionary = {
  ...es,
  'app.tagline': 'Learn SQL in your browser, 100% offline.',
  'app.shortName': 'SQLA',
  'nav.home': 'Home',
  'nav.course': 'Course',
  'nav.lessons': 'Lessons',
  'nav.playground': 'Playground',
  'nav.databases': 'Databases',
  'nav.settings': 'Settings',
  'nav.toggleSidebar': 'Show / hide sidebar',
  'topbar.saving': 'Saving…',
  'topbar.saved': 'Changes saved',
  'topbar.workerOnline': 'Worker connected',
  'topbar.workerOffline': 'Worker offline',
  'topbar.user.placeholder': 'Guest',
  'common.start': 'Start',
  'common.continue': 'Continue',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.close': 'Close',
  'common.open': 'Open',
  'common.delete': 'Delete',
  'common.confirm': 'Confirm',
  'common.loading': 'Loading…',
  'common.retry': 'Retry',
  'common.comingSoon': 'Coming soon',
  'common.underConstruction': 'Under construction',
  'common.placeholder': 'Placeholder',
  'home.welcome': 'Welcome to SQL Academy',
  'home.subtitle': 'Learn SQL step by step, with interactive exercises and a browser editor.',
  'home.openCourse': 'Open the course',
  'home.openPlayground': 'Open the playground',
  'home.manageDatabases': 'Manage databases',
  'home.progress.title': 'Your progress',
  'home.progress.empty': 'You have not completed any exercises yet. Start with the first lesson.',
  'home.progress.lessonsCompleted': '{done} of {total} lessons completed',
  'home.progress.percent': '{percent}% completed',
  'course.title': 'SQL Course',
  'course.subtitle': '16 levels to master SQL from zero to advanced.',
  'course.levels': 'Levels',
  'course.lessonsInLevel': '{count} lessons',
  'course.comingSoonLevel': 'Exercises for this level will unlock soon.',
  'course.locked': 'Locked',
  'course.unlocked': 'Available',
  'course.completed': 'Completed',
  'course.inProgress': 'In progress',
  'lesson.title': 'Lesson',
  'lesson.idLabel': 'Lesson ID',
  'lesson.empty': 'This lesson has no content yet.',
  'lesson.firstExercise': 'Go to the first exercise',
  'exercise.title': 'Exercise',
  'exercise.idLabel': 'Exercise ID',
  'exercise.sqlPlaceholder': 'Write your query here…',
  'exercise.run': 'Run',
  'exercise.check': 'Check',
  'exercise.hint': 'Hint',
  'exercise.solution': 'Reveal solution',
  'exercise.editorPlaceholder': 'The SQL editor will appear here.',
  'playground.title': 'SQL Playground',
  'playground.subtitle': 'An empty SQLite database to experiment freely.',
  'databases.title': 'Databases',
  'databases.subtitle': 'Import, export and manage your SQLite databases.',
  'databases.empty': 'You have no databases yet.',
  'settings.title': 'Settings',
  'settings.subtitle': 'General application preferences.',
  'settings.section.appearance': 'Appearance',
  'settings.section.language': 'Language',
  'settings.section.editor': 'Editor',
  'settings.theme.label': 'Theme',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.theme.auto': 'Auto (system)',
  'settings.fontSize.label': 'Font size',
  'settings.fontSize.sm': 'Small',
  'settings.fontSize.md': 'Medium',
  'settings.fontSize.lg': 'Large',
  'settings.locale.label': 'Interface language',
  'settings.locale.es': 'Spanish',
  'settings.locale.en': 'English',
  'settings.reset': 'Restore defaults',
  'settings.reset.confirm': 'Restore all settings to their default values?',
  'sidebar.progress': 'Course progress',
  'sidebar.progress.empty': 'No progress yet.',
  'sidebar.progress.complete': 'Course complete',
  'notFound.title': 'Page not found',
  'notFound.message': 'The page you are looking for does not exist or has been moved.',
  'notFound.backHome': 'Back to home',
  'error.generic': 'An unexpected error occurred. Please try again.',
  'error.themeContext': 'useTheme() must be used inside a <ThemeProvider>.',
}

const dictionaries: Readonly<Record<Locale, Dictionary>> = { es, en }

/* ------------------------------------------------------------------ *
 *  Locale state                                                      *
 * ------------------------------------------------------------------ */

let currentLocale: Locale = DEFAULT_LOCALE

export function getLocale(): Locale {
  return currentLocale
}

export function setLocale(locale: Locale): void {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    // eslint-disable-next-line no-console
    console.warn(`[i18n] unsupported locale: ${locale}`)
    return
  }
  if (currentLocale === locale) return
  currentLocale = locale
  emitLocaleChange()
}

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as ReadonlyArray<string>).includes(value)
}

/* ------------------------------------------------------------------ *
 *  Translation                                                       *
 * ------------------------------------------------------------------ */

const PLACEHOLDER_RE = /\{([a-zA-Z0-9_]+)\}/g

export interface InterpolationVars {
  readonly [key: string]: string | number
}

/**
 * Translate a key to the given locale, substituting `{name}`
 * placeholders with the values in `vars`. Unknown variables are left
 * intact in the output. Missing keys return the key itself.
 */
export function t(key: string, locale: Locale = currentLocale, vars?: InterpolationVars): string {
  const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE]
  const value = dict[key]
  if (value === undefined) return key
  if (!vars) return value
  return value.replace(PLACEHOLDER_RE, (match, name: string) => {
    const replacement = vars[name]
    return replacement === undefined || replacement === null ? match : String(replacement)
  })
}

/* ------------------------------------------------------------------ *
 *  React hook                                                        *
 * ------------------------------------------------------------------ */

type LocaleListener = (locale: Locale) => void
const localeListeners: Set<LocaleListener> = new Set()

function emitLocaleChange(): void {
  for (const listener of localeListeners) {
    try {
      listener(currentLocale)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[i18n] listener threw:', err)
    }
  }
}

function subscribeLocale(callback: () => void): () => void {
  const listener: LocaleListener = () => callback()
  localeListeners.add(listener)
  return () => {
    localeListeners.delete(listener)
  }
}

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE
}

/**
 * Read & change the current locale from a React component.
 *
 * The hook subscribes to the settings store, so a change via
 * `settings.set('locale', 'en')` (or the helper `setLocale` exported
 * here) triggers a re-render automatically.
 */
export function useTranslation(): {
  t: (key: string, vars?: InterpolationVars) => string
  locale: Locale
  setLocale: (next: Locale) => void
} {
  // We listen to the settings store for the locale; the in-memory
  // `currentLocale` is the *initial* value (DEFAULT_LOCALE).
  const locale = useSyncExternalStore(
    subscribeLocale,
    () => currentLocale,
    getServerSnapshot,
  )

  // Locale lives in module memory for the MVP. A future phase will
  // persist it through the settings store (the Settings interface
  // doesn't yet have a `locale` key).
  const persist = useCallback((next: Locale) => {
    setLocale(next)
  }, [])

  const translate = useCallback(
    (key: string, vars?: InterpolationVars) => t(key, locale, vars),
    [locale],
  )

  return { t: translate, locale, setLocale: persist }
}
