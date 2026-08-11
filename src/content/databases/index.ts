/**
 * Barrel del directorio `databases/`.
 *
 * Re-exporta los 4 `DatabaseSeed` y los tipos asociados. Mantener un
 * único punto de entrada simplifica los loaders y la import path de la
 * app.
 */

import { librarySeed } from './library'
import { tiendaSeed } from './tienda'
import { socialSeed } from './social'
import { empresaSeed } from './empresa'

import type { DatabaseSeed } from '../types'

export { librarySeed, tiendaSeed, socialSeed, empresaSeed }
export type { DatabaseSeed }

/** Lista canónica de las 4 bases de datos semilla del curso. */
export const allDatabaseSeeds: readonly DatabaseSeed[] = [
  librarySeed,
  tiendaSeed,
  socialSeed,
  empresaSeed,
] as const

/** Mapa id → seed para lookups O(1). */
export const databaseSeedsById: Readonly<Record<string, DatabaseSeed>> = {
  [librarySeed.id]: librarySeed,
  [tiendaSeed.id]: tiendaSeed,
  [socialSeed.id]: socialSeed,
  [empresaSeed.id]: empresaSeed,
} as const
