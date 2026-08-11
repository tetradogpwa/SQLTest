/**
 * Internationalisation core.
 *
 * MVP scope: three locales (`es`, `en`, `ca`). `es` is the canonical
 * dictionary; `en` and `ca` are maintained as parallel translations.
 * The architecture is the same as the production one — adding more
 * dictionaries is a matter of importing them into `dictionaries`.
 * Pluralisation / lazy loading are out of scope for the MVP and will
 * land in a later phase.
 *
 * Conventions
 * -----------
 *  - Keys are dot-namespaced: `domain.subdomain.subject`
 *  - Missing keys fall back to the key itself (so they are easy to
 *    spot in dev). They never return `undefined`.
 *  - Variable interpolation uses `{name}` placeholders. Unknown
 *    placeholders are left in the output so the dev can see them.
 *  - Locale defaults to `DEFAULT_LOCALE` (Spanish for this MVP).
 *  - The persisted `locale` setting overrides the module default;
 *    the `useTranslation` hook subscribes to it so React re-renders
 *    when the user changes the language in Settings.
 */

import { useCallback, useSyncExternalStore } from 'react'

import { settings } from '../persistence/settings'

export type Locale = 'es' | 'ca' | 'en'

export const DEFAULT_LOCALE: Locale = 'es'

export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = ['es', 'ca', 'en'] as const

export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  es: 'Español',
  ca: 'Català',
  en: 'English',
}

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
  'home.quickLinks': 'Accesos rápidos',
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
  'databases.emptyHint': 'Crea una nueva o importa un archivo .sqlite3 / .db para empezar.',
  'databases.create': 'Crear base de datos',
  'databases.import': 'Importar archivo',
  'databases.search.placeholder': 'Buscar por nombre…',
  'databases.size': 'Tamaño',
  'databases.updated': 'Modificada',
  'databases.origin.bundled': 'Preinstalada',
  'databases.origin.imported': 'Importada',
  'databases.origin.created': 'Creada',
  'databases.capability': 'Almacenamiento',
  'databases.createDialog.title': 'Crear base de datos',
  'databases.createDialog.nameLabel': 'Nombre',
  'databases.createDialog.namePlaceholder': 'mi-proyecto',
  'databases.createDialog.submit': 'Crear',
  'databases.createDialog.cancel': 'Cancelar',
  'databases.createDialog.error.invalidName': 'El nombre no puede estar vacío ni contener caracteres no permitidos.',
  'databases.importDialog.title': 'Importar base de datos',
  'databases.importDialog.dropzone': 'Arrastra un archivo .sqlite3 o .db aquí',
  'databases.importDialog.pickFile': 'o haz clic para seleccionar',
  'databases.importDialog.nameLabel': 'Nombre (opcional)',
  'databases.importDialog.submit': 'Importar',
  'databases.importDialog.error.file': 'Selecciona un archivo válido.',
  'databases.importDialog.error.tooBig': 'El archivo excede el límite permitido.',
  'databases.importDialog.error.failed': 'No se pudo importar la base de datos.',
  'databases.rowActions.ariaLabel': 'Acciones de la base de datos',
  'databases.rowActions.open': 'Abrir en el playground',
  'databases.rowActions.rename': 'Renombrar',
  'databases.rowActions.export': 'Exportar a archivo',
  'databases.rowActions.duplicate': 'Duplicar',
  'databases.rowActions.delete': 'Eliminar',
  'databases.confirmDelete.title': '¿Eliminar base de datos?',
  'databases.confirmDelete.message': 'Esta acción no se puede deshacer. Se eliminarán también todos los snapshots.',
  'databases.confirmDelete.confirm': 'Eliminar',
  'databases.confirmRename.title': 'Renombrar base de datos',
  'databases.confirmRename.confirm': 'Renombrar',

  // Playground enhancements
  'playground.dbSelector.label': 'Base de datos',
  'playground.snapshots.title': 'Snapshots',
  'playground.snapshots.create': 'Crear snapshot',
  'playground.snapshots.empty': 'Aún no has creado snapshots. Crea uno antes de cambios destructivos.',
  'playground.snapshots.restore': 'Restaurar',
  'playground.snapshots.delete': 'Borrar',
  'playground.snapshots.reason.auto': 'Auto',
  'playground.snapshots.reason.manual': 'Manual',
  'playground.snapshots.reason.pre-restore': 'Pre-restauración',
  'playground.snapshots.reason.pre-destructive': 'Pre-destructivo',
  'playground.undo.label': 'Deshacer',
  'playground.undo.title': 'Deshacer último cambio',
  'playground.stats.title': 'Estadísticas',
  'playground.stats.size': 'Tamaño de la DB',
  'playground.stats.queries': 'Consultas ejecutadas',
  'playground.stats.lastError': 'Último error',

  // Settings
  'settings.title': 'Ajustes',
  'settings.subtitle': 'Preferencias generales de la aplicación.',
  'settings.section.appearance': 'Apariencia',
  'settings.section.language': 'Idioma',
  'settings.section.editor': 'Editor',
  'settings.section.data': 'Datos',
  'settings.section.about': 'Acerca de',
  'settings.theme.label': 'Tema',
  'settings.theme.light': 'Claro',
  'settings.theme.dark': 'Oscuro',
  'settings.theme.auto': 'Automático (sistema)',
  'settings.fontSize.label': 'Tamaño de fuente',
  'settings.fontSize.sm': 'Pequeño',
  'settings.fontSize.md': 'Mediano',
  'settings.fontSize.lg': 'Grande',
  'settings.tabSize.label': 'Tamaño de tabulador',
  'settings.tabSize.2': '2 espacios',
  'settings.tabSize.4': '4 espacios',
  'settings.wordWrap.label': 'Ajuste de línea',
  'settings.wordWrap.on': 'Activado',
  'settings.wordWrap.off': 'Desactivado',
  'settings.locale.label': 'Idioma de la interfaz',
  'settings.locale.es': 'Español',
  'settings.locale.ca': 'Català',
  'settings.locale.en': 'Inglés',
  'settings.autoSave.label': 'Guardar borradores automáticamente',
  'settings.reset': 'Restaurar valores por defecto',
  'settings.reset.confirm': '¿Restaurar todos los ajustes a sus valores por defecto?',
  'settings.data.clearProgress': 'Borrar todo el progreso',
  'settings.data.clearProgress.confirm': '¿Borrar todo tu progreso, historial y borradores? Esta acción no se puede deshacer.',
  'settings.data.clearProgress.done': 'Progreso borrado.',
  'settings.data.exportConfig': 'Exportar configuración',
  'settings.data.exportConfig.done': 'Configuración exportada.',
  'settings.about.version': 'Versión',
  'settings.about.build': 'Build',
  'settings.about.builtAt': 'Generado el',
  'settings.about.docs': 'Documentación',
  'settings.about.repo': 'Repositorio',

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
  'home.quickLinks': 'Quick links',
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

const ca: Dictionary = {
  ...es,
  'app.tagline': 'Aprèn SQL al teu navegador, 100% fora de línia.',
  'nav.home': 'Inici',
  'nav.course': 'Curs',
  'nav.lessons': 'Lliçons',
  'nav.playground': 'Playground',
  'nav.databases': 'Bases de dades',
  'nav.settings': 'Configuració',
  'nav.toggleSidebar': 'Mostra / amaga el menú lateral',
  'topbar.saving': 'Desant…',
  'topbar.saved': 'Canvis desats',
  'topbar.workerOnline': 'Worker connectat',
  'topbar.workerOffline': 'Worker sense connexió',
  'common.start': 'Comença',
  'common.continue': 'Continua',
  'common.back': 'Torna',
  'common.next': 'Següent',
  'common.cancel': 'Cancel·la',
  'common.save': 'Desa',
  'common.close': 'Tanca',
  'common.open': 'Obre',
  'common.delete': 'Elimina',
  'common.confirm': 'Confirma',
  'common.loading': 'Carregant…',
  'common.retry': 'Reintenta',
  'common.comingSoon': 'Pròximament',
  'home.welcome': 'Benvingut a SQL Academy',
  'home.subtitle': 'Aprèn SQL pas a pas, amb exercicis interactius i un editor al navegador.',
  'home.openCourse': 'Obre el curs',
  'home.openPlayground': 'Obre el playground',
  'home.manageDatabases': 'Gestiona les bases de dades',
  'home.quickLinks': 'Accessos ràpids',
  'home.progress.title': 'El teu progrés',
  'home.progress.empty': 'Encara no has completat cap exercici. Comença per la primera lliçó.',
  'home.progress.lessonsCompleted': '{done} de {total} lliçons completades',
  'home.progress.percent': '{percent}% completat',
  'course.title': 'Curs de SQL',
  'course.subtitle': '16 nivells per dominar SQL de zero a avançat.',
  'course.levels': 'Nivells',
  'course.lessonsInLevel': '{count} lliçons',
  'lesson.title': 'Lliçó',
  'lesson.firstExercise': 'Ves al primer exercici',
  'exercise.title': 'Exercici',
  'exercise.sqlPlaceholder': 'Escriu la teva consulta aquí…',
  'exercise.run': 'Executa',
  'exercise.check': 'Comprova',
  'exercise.hint': 'Pista',
  'exercise.solution': 'Mostra la solució',
  'playground.title': 'Playground SQL',
  'playground.subtitle': 'Una base de dades SQLite buida per experimentar lliurement.',
  'playground.dbSelector.label': 'Base de dades',
  'playground.snapshots.title': 'Snapshots',
  'playground.snapshots.create': 'Crea un snapshot',
  'playground.snapshots.empty': 'Encara no has creat snapshots. Crea\'n un abans de canvis destructius.',
  'playground.snapshots.restore': 'Restaura',
  'playground.snapshots.delete': 'Elimina',
  'playground.snapshots.reason.manual': 'Manual',
  'playground.snapshots.reason.pre-restore': 'Pre-restauració',
  'playground.snapshots.reason.pre-destructive': 'Pre-destructiu',
  'playground.undo.label': 'Desfés',
  'playground.undo.title': 'Desfés l\'últim canvi',
  'playground.stats.title': 'Estadístiques',
  'playground.stats.size': 'Mida de la DB',
  'playground.stats.queries': 'Consultes executades',
  'playground.stats.lastError': 'Últim error',
  'databases.title': 'Bases de dades',
  'databases.subtitle': 'Importa, exporta i gestiona les teves bases de dades SQLite.',
  'databases.empty': 'Encara no tens bases de dades.',
  'databases.emptyHint': 'Crea una de nova o importa un fitxer .sqlite3 / .db per començar.',
  'databases.create': 'Crea una base de dades',
  'databases.import': 'Importa un fitxer',
  'databases.search.placeholder': 'Cerca pel nom…',
  'databases.size': 'Mida',
  'databases.updated': 'Modificada',
  'databases.origin.bundled': 'Preinstal·lada',
  'databases.origin.imported': 'Importada',
  'databases.origin.created': 'Creada',
  'databases.capability': 'Emmagatzematge',
  'databases.createDialog.title': 'Crea una base de dades',
  'databases.createDialog.nameLabel': 'Nom',
  'databases.createDialog.namePlaceholder': 'el-meu-projecte',
  'databases.createDialog.submit': 'Crea',
  'databases.createDialog.cancel': 'Cancel·la',
  'databases.createDialog.error.invalidName': 'El nom no pot ser buit ni contenir caràcters no permesos.',
  'databases.importDialog.title': 'Importa una base de dades',
  'databases.importDialog.dropzone': 'Arrossega un fitxer .sqlite3 o .db aquí',
  'databases.importDialog.pickFile': 'o fes clic per seleccionar-lo',
  'databases.importDialog.nameLabel': 'Nom (opcional)',
  'databases.importDialog.submit': 'Importa',
  'databases.importDialog.error.file': 'Selecciona un fitxer vàlid.',
  'databases.importDialog.error.tooBig': 'El fitxer excedeix el límit permès.',
  'databases.importDialog.error.failed': 'No s\'ha pogut importar la base de dades.',
  'databases.rowActions.ariaLabel': 'Accions de la base de dades',
  'databases.rowActions.open': 'Obre al playground',
  'databases.rowActions.rename': 'Reanomena',
  'databases.rowActions.export': 'Exporta a fitxer',
  'databases.rowActions.duplicate': 'Duplica',
  'databases.rowActions.delete': 'Elimina',
  'databases.confirmDelete.title': 'Eliminar la base de dades?',
  'databases.confirmDelete.message': 'Aquesta acció no es pot desfer. També s\'eliminaran tots els snapshots.',
  'databases.confirmDelete.confirm': 'Elimina',
  'databases.confirmRename.title': 'Reanomena la base de dades',
  'databases.confirmRename.confirm': 'Reanomena',
  'settings.title': 'Configuració',
  'settings.subtitle': 'Preferències generals de l\'aplicació.',
  'settings.section.appearance': 'Aparença',
  'settings.section.language': 'Idioma',
  'settings.section.editor': 'Editor',
  'settings.section.data': 'Dades',
  'settings.section.about': 'Quant a',
  'settings.theme.label': 'Tema',
  'settings.theme.light': 'Clar',
  'settings.theme.dark': 'Fosc',
  'settings.theme.auto': 'Automàtic (sistema)',
  'settings.fontSize.label': 'Mida de la font',
  'settings.fontSize.sm': 'Petita',
  'settings.fontSize.md': 'Mitjana',
  'settings.fontSize.lg': 'Gran',
  'settings.tabSize.label': 'Mida del tabulador',
  'settings.tabSize.2': '2 espais',
  'settings.tabSize.4': '4 espais',
  'settings.wordWrap.label': 'Ajust de línia',
  'settings.wordWrap.on': 'Activat',
  'settings.wordWrap.off': 'Desactivat',
  'settings.locale.label': 'Idioma de la interfície',
  'settings.locale.es': 'Espanyol',
  'settings.locale.ca': 'Català',
  'settings.locale.en': 'Anglès',
  'settings.autoSave.label': 'Desar esborranys automàticament',
  'settings.reset': 'Restaura els valors per defecte',
  'settings.reset.confirm': 'Vols restaurar tots els ajustos als valors per defecte?',
  'settings.data.clearProgress': 'Esborra tot el progrés',
  'settings.data.clearProgress.confirm': 'Vols esborrar tot el teu progrés, historial i esborranys? Aquesta acció no es pot desfer.',
  'settings.data.clearProgress.done': 'Progrés esborrat.',
  'settings.data.exportConfig': 'Exporta la configuració',
  'settings.data.exportConfig.done': 'Configuració exportada.',
  'settings.about.version': 'Versió',
  'settings.about.build': 'Build',
  'settings.about.builtAt': 'Generat el',
  'settings.about.docs': 'Documentació',
  'settings.about.repo': 'Repositori',
  'sidebar.progress': 'Progrés del curs',
  'sidebar.progress.empty': 'Sense progrés encara.',
  'sidebar.progress.complete': 'Curs complet',
  'notFound.title': 'Pàgina no trobada',
  'notFound.message': 'La pàgina que busques no existeix o ha estat moguda.',
  'notFound.backHome': 'Torna a l\'inici',
  'error.generic': 'S\'ha produït un error inesperat. Torna-ho a provar.',
  'error.themeContext': 'useTheme() s\'ha d\'usar dins d\'un <ThemeProvider>.',
}

const dictionaries: Readonly<Record<Locale, Dictionary>> = { es, ca, en }

/* ------------------------------------------------------------------ *
 *  Locale state                                                      *
 * ------------------------------------------------------------------ */

let currentLocale: Locale = DEFAULT_LOCALE

/**
 * Sync the module-level `currentLocale` from the persisted settings.
 * Called once at app boot by `main.tsx` (or eagerly here on first
 * import) so a user who picked `ca` last session lands in Catalan.
 */
async function hydrateLocaleFromSettings(): Promise<void> {
  try {
    const persisted = await settings.get('locale')
    if (SUPPORTED_LOCALES.includes(persisted) && currentLocale !== persisted) {
      currentLocale = persisted
      // Wake up the React subscribers — they only re-render on
      // `setLocale()` events otherwise.
      emitLocaleChange()
    }
  } catch {
    // IndexedDB may fail in private mode / SSR. Keep the default.
  }
}

// Fire-and-forget; the `useTranslation` hook re-renders on the first
// settings write so the temporary `DEFAULT_LOCALE` flash is invisible
// in practice.
void hydrateLocaleFromSettings()

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
  // Persist so a reload keeps the same locale. We swallow errors:
  // the in-memory change already took effect.
  void settings.set('locale', locale).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn('[i18n] failed to persist locale:', err)
  })
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
 * The hook subscribes to module-level locale changes, so a call to
 * `setLocale()` (or the one triggered by `settings.set('locale', X)`)
 * propagates to every consumer without extra plumbing.
 */
export function useTranslation(): {
  t: (key: string, vars?: InterpolationVars) => string
  locale: Locale
  setLocale: (next: Locale) => void
} {
  const locale = useSyncExternalStore(
    subscribeLocale,
    () => currentLocale,
    getServerSnapshot,
  )

  const persist = useCallback((next: Locale) => {
    setLocale(next)
  }, [])

  const translate = useCallback(
    (key: string, vars?: InterpolationVars) => t(key, locale, vars),
    [locale],
  )

  return { t: translate, locale, setLocale: persist }
}
