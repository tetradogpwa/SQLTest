/**
 * Re-exports de tipos del directorio `databases/`.
 *
 * Los tipos viven en `src/content/types.ts` (el módulo canónico). Este
 * archivo existe para que el contenido de `databases/` sea navegable
 * por sí solo sin necesidad de importar desde el padre.
 */

export type { DatabaseSeed } from '../types'
