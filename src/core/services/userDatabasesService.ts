/**
 * User databases service.
 *
 * The pure-TS layer between `useUserDatabases` (the React hook) and
 * the Worker + Dexie. Every business decision lives here:
 *
 *  - Name validation + sanitisation (length, charset, traversal).
 *  - Slug → Dexie `id` mapping (the `<randomSuffix>` ensures the
 *    row id is unique even when the user imports two files with
 *    the same display name).
 *  - `Database` row construction from the Worker's `{dbId, sizeBytes}`
 *    response.
 *  - `Uint8Array` → `Blob` conversion for the export flow.
 *  - Error normalisation: every value the service receives as a
 *    `catch` argument — `Error`, `string`, `null`, `undefined`,
 *    `WorkerDBAPI`-shaped object — becomes a user-facing Spanish
 *    string. The hook can then drop the result straight into
 *    `setError(msg)` without further branching.
 *
 * The service is intentionally framework-free: no React, no DOM,
 * no globals (`Date.now()` and `Math.random()` are injected so the
 * tests are deterministic). Every entry point returns either a
 * plain value or throws a typed `Error` subclass; the hook is
 * responsible for the `useState` plumbing around them.
 *
 * **What this module does NOT do**:
 *  - I/O. The Worker call lives in the hook because Comlink + the
 *    fake-IDB shim are not testable in pure vitest.
 *  - State. The hook owns `useState` + `useLiveQuery`.
 *  - Internationalisation. The service returns i18n keys (e.g.
 *    `'databases.createDialog.error.invalidName'`); the hook
 *    passes them through `t()` to get the user-facing string.
 */
import type { Database } from '../persistence'

/* ------------------------------------------------------------------ *
 *  Constants                                                           *
 * ------------------------------------------------------------------ */

/** Maximum display-name length (matches the worker's contract). */
export const MAX_NAME_LENGTH = 64

/**
 * Characters allowed in a database display name. Letters, digits,
 * spaces, dot, dash, underscore. Unicode letters/digits are also
 * accepted (Spanish/Catalan/Cyrillic names). No path separators,
 * no control characters.
 */
const NAME_PATTERN = /^[\p{L}\p{N} ._-]+$/u

/**
 * Slug for the Dexie row id. Strips the `.db`/`.sqlite3`/`.s3db`
 * extension, replaces forbidden characters with `-`, collapses
 * repeated `-`, trims, and lowercases. The slug is then suffixed
 * with a 6-char random base36 to keep it unique.
 */
const FORBIDDEN_SLUG_CHARS = /[^A-Za-z0-9._-]+/g
const COLLAPSE_DASH = /-+/g
const TRIM_DASH = /^-+|-+$/g

/* ------------------------------------------------------------------ *
 *  Result types                                                         *
 * ------------------------------------------------------------------ */

/**
 * Discriminated union for the validation result. The `key` is an
 * i18n key — the hook turns it into a localised string via `t()`.
 */
export type NameValidation =
  | { ok: true; trimmed: string }
  | { ok: false; key: 'databases.createDialog.error.invalidName' }

/**
 * The result of `toErrorMessage`. The hook passes `message` to
 * `setError(msg)` directly. The `kind` is informational — used by
 * future tests / telemetry to bucket errors.
 */
export interface ErrorMessage {
  message: string
  kind: 'worker' | 'generic' | 'empty' | 'unknown'
}

/* ------------------------------------------------------------------ *
 *  Validation + sanitisation                                            *
 * ------------------------------------------------------------------ */

/**
 * Validate a raw user input (from the create dialog). Trims and
 * returns the cleaned name on success. On failure returns an i18n
 * key the caller can pass to `t()`.
 */
export function validateDatabaseName(raw: string): NameValidation {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: false, key: 'databases.createDialog.error.invalidName' }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { ok: false, key: 'databases.createDialog.error.invalidName' }
  }
  if (!NAME_PATTERN.test(trimmed)) {
    return { ok: false, key: 'databases.createDialog.error.invalidName' }
  }
  return { ok: true, trimmed }
}

/* ------------------------------------------------------------------ *
 *  Slug → Dexie id                                                      *
 * ------------------------------------------------------------------ */

/**
 * Convert an `File` (or its name) to a slug suitable for the
 * Dexie `databases` row id. The slug:
 *
 *  - Drops the `.db`, `.sqlite3`, `.s3db`, `.sqlite` extension.
 *  - Replaces every forbidden character with `-`.
 *  - Collapses repeated `-` and trims leading/trailing ones.
 *  - Lowercases.
 *  - Falls back to `'db'` when the name is empty after the
 *    strip (e.g. a file called `.db`).
 *  - Truncates to 48 chars (the suffix adds 7 more, total < 56
 *    so the id stays well under Dexie's 1 000-char key limit).
 *
 * The `randomId` injection lets tests assert the suffix without
 * coupling to `Math.random()`.
 */
export function fileToId(name: string, randomId: () => string = defaultRandomId): string {
  // `String.prototype.split` always returns a non-empty array
  // (an empty string yields `['']`, never `[]`), so `pop()` is
  // guaranteed to return a string. The non-null assertion makes
  // the intent explicit and the branch `?? ''` is dead code.
  const trimmed = name.split(/[\\/]/).pop() ?? ''
  const base = trimmed.replace(/\.(sqlite3?|s3db|db)$/i, '')
  const slug = base
    .replace(FORBIDDEN_SLUG_CHARS, '-')
    .replace(COLLAPSE_DASH, '-')
    .replace(TRIM_DASH, '')
    .toLowerCase()
  const safe = slug.length > 0 ? slug.slice(0, 48) : 'db'
  const suffix = randomId().slice(0, 6) || 'rand00'
  return `${safe}-${suffix}`
}

function defaultRandomId(): string {
  return Math.random().toString(36).slice(2, 8)
}

/* ------------------------------------------------------------------ *
 *  Database row construction                                            *
 * ------------------------------------------------------------------ */

export interface CreateRowInput {
  /** The numeric dbId the Worker allocated. */
  dbId: number
  /** The display name, already validated. */
  name: string
  /** The size in bytes, as reported by the Worker. */
  sizeBytes: number
  /** The origin of the row — see `DatabaseOrigin`. */
  origin: Database['origin']
  /** Injectable clock for tests. */
  now?: () => number
}

/**
 * Build the `Database` row that the hook will `add` to Dexie.
 * The `id` is derived from `dbId` (`db-<n>`) so that the Worker's
 * numeric id and the Dexie string id are 1:1 correlated — that
 * is what `useUserDatabases.exportFile` / `delete` rely on.
 */
export function createDatabaseRow(input: CreateRowInput): Database {
  const now = (input.now ?? (() => Date.now()))()
  return {
    id: `db-${input.dbId}`,
    name: input.name,
    createdAt: now,
    updatedAt: now,
    sizeBytes: input.sizeBytes,
    origin: input.origin,
  }
}

/* ------------------------------------------------------------------ *
 *  Export: bytes → Blob                                                  *
 * ------------------------------------------------------------------ */

export interface ExportBlobInput {
  /** The raw bytes returned by the Worker's `export()`. */
  bytes: Uint8Array
  /** The display name; used to derive the filename. */
  name: string
  /**
   * Override the mime type. Defaults to
   * `application/x-sqlite3` (the value the existing code uses
   * — kept for compatibility with the existing browser tests).
   */
  mimeType?: string
}

export interface ExportBlob {
  blob: Blob
  filename: string
}

/**
 * Build a downloadable `Blob` for the export flow. The filename
 * is `<sanitized name>.sqlite3` so users can re-import the
 * downloaded file directly.
 */
export function toExportBlob(input: ExportBlobInput): ExportBlob {
  const safeName = sanitizeNameForFilename(input.name)
  const filename = `${safeName}.sqlite3`
  // Copy into a fresh Uint8Array so the Blob does not alias the
  // caller's buffer (which is a Comlink proxy in production).
  const copy = new Uint8Array(input.bytes.byteLength)
  copy.set(input.bytes)
  const blob = new Blob([copy], {
    type: input.mimeType ?? 'application/x-sqlite3',
  })
  return { blob, filename }
}

/**
 * Strip every character that is not safe in a download filename
 * across Windows / macOS / Linux. We keep unicode letters/digits
 * so the user sees their actual name, just without path hazards.
 */
function sanitizeNameForFilename(name: string): string {
  // `String.prototype.split` always returns a non-empty array, so
  // `pop()` is guaranteed to return a string. The `?? ''` is
  // defensive only.
  const trimmed = name.split(/[\\/]/).pop() ?? ''
  const cleaned = trimmed
    .replace(/[<>:"|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .trim()
  // After the strip above, a name like `'   '` becomes `___` (only
  // whitespace replaced, trim only removes leading/trailing
  // whitespace). We also strip leading / trailing underscores so
  // the fallback kicks in.
  const final = cleaned.replace(/^_+|_+$/g, '')
  return final.length > 0 ? final.slice(0, 100) : 'database'
}

/* ------------------------------------------------------------------ *
 *  Error normalisation                                                  *
 * ------------------------------------------------------------------ */

/**
 * The Worker can throw across Comlink as anything: an `Error`
 * subclass, a plain `Error`, a `string` (rare but possible), a
 * structured-clone-safe plain object, `null`, `undefined`. The
 * hook stores whatever this function returns in
 * `setError(message)`, so it must always return a non-empty
 * string.
 *
 * The mapping is deliberately defensive — every branch returns
 * a string. The test suite feeds the function every flavour of
 * input it might encounter in production (and a few more) and
 * asserts on the output.
 */
export function toErrorMessage(err: unknown): ErrorMessage {
  if (err === null || err === undefined) {
    return { message: '', kind: 'empty' }
  }
  if (typeof err === 'string') {
    return { message: err, kind: 'worker' }
  }
  if (err instanceof Error) {
    // Common: `Error` or one of our typed subclasses (ImportError,
    // InvalidSqliteFileError, etc.). They all carry a meaningful
    // `.message`; we forward it as-is.
    return { message: err.message || 'Error desconocido', kind: 'worker' }
  }
  if (typeof err === 'object') {
    // Comlink serialises custom errors as plain objects. The
    // Worker side uses `toSerializedError` which produces
    // `{ code, message, ... }`. Pick the most informative field.
    const obj = err as { message?: unknown; code?: unknown; name?: unknown }
    if (typeof obj.message === 'string' && obj.message.length > 0) {
      return { message: obj.message, kind: 'worker' }
    }
    if (typeof obj.code === 'string' && obj.code.length > 0) {
      return { message: obj.code, kind: 'worker' }
    }
    if (typeof obj.name === 'string' && obj.name.length > 0) {
      return { message: obj.name, kind: 'worker' }
    }
    return { message: 'Error desconocido', kind: 'unknown' }
  }
  return { message: 'Error desconocido', kind: 'unknown' }
}

/* ------------------------------------------------------------------ *
 *  Pipeline composition (the layer the hook calls)                     *
 * ------------------------------------------------------------------ */

export interface CreateDatabaseArgs {
  /** The name as typed by the user. */
  name: string
  /**
   * Hook to actually create the file. The hook injects this so
   * the service stays I/O-free and testable.
   */
  callWorker: (name: string) => Promise<{ dbId: number; sizeBytes: number }>
  /** Injectable clock for deterministic row timestamps. */
  now?: () => number
}

/**
 * Validate → call worker → build row. Returns the Dexie row the
 * hook should persist. Throws on validation failure or worker
 * error (the hook turns the throw into a `setError(msg)`).
 */
export async function createDatabase(args: CreateDatabaseArgs): Promise<Database> {
  const validation = validateDatabaseName(args.name)
  if (!validation.ok) {
    throw new DatabaseValidationError(validation.key)
  }
  const { dbId, sizeBytes } = await args.callWorker(validation.trimmed)
  return createDatabaseRow({
    dbId,
    name: validation.trimmed,
    sizeBytes,
    origin: 'created',
    ...(args.now ? { now: args.now } : {}),
  })
}

export interface ImportDatabaseArgs {
  /** The picked `File`. */
  file: File
  /** Optional display name override. */
  displayName?: string
  /**
   * Hook to actually import the file. The service passes the
   * sanitised display name + the bytes. The hook injects this
   * so the service stays I/O-free.
   */
  callWorker: (bytes: Uint8Array, sanitizedName: string) => Promise<{ dbId: number; sizeBytes: number }>
  /** Injectable clock for deterministic row timestamps. */
  now?: () => number
}

/**
 * Validate file + name → call worker → build row. Returns the
 * Dexie row the hook should persist. Throws on:
 *  - empty / oversized file (`ImportValidationError`)
 *  - worker rejection (the worker throws → service re-throws as
 *    `WorkerError`; the hook turns it into a `setError`).
 */
export async function importDatabase(args: ImportDatabaseArgs): Promise<Database> {
  const fileValidation = validateImportFile(args.file)
  if (!fileValidation.ok) {
    throw new ImportValidationError(fileValidation.key)
  }
  // The display name is the user-typed override (trimmed) or
  // the filename without its extension. We never feed the raw
  // filename into the worker because the worker only accepts a
  // sanitised stem.
  const displayName = (args.displayName ?? '').trim() || args.file.name
  const sanitized = sanitizeImportedDisplayName(displayName)
  // `Uint8Array.from(file)` reads the whole file into memory.
  // The import dialog enforces the size cap (100 MB) so this is
  // bounded.
  const bytes = new Uint8Array(await args.file.arrayBuffer())
  const { dbId, sizeBytes } = await args.callWorker(bytes, sanitized)
  return createDatabaseRow({
    dbId,
    name: sanitized,
    sizeBytes,
    origin: 'imported',
    ...(args.now ? { now: args.now } : {}),
  })
}

/* ------------------------------------------------------------------ *
 *  Import-time validation                                               *
 * ------------------------------------------------------------------ */

/** 100 MB — the same cap the import dialog enforces. */
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024

const ACCEPTED_EXTENSIONS = ['db', 'sqlite', 'sqlite3', 's3db'] as const

type ImportFileValidation =
  | { ok: true }
  | { ok: false; key: 'databases.importDialog.error.file' | 'databases.importDialog.error.tooBig' }

/**
 * Validate a picked file. The dialog calls this with the raw
 * `File` from the input. Returns an i18n key on rejection.
 */
export function validateImportFile(file: File | null | undefined): ImportFileValidation {
  if (!file) return { ok: false, key: 'databases.importDialog.error.file' }
  if (file.size === 0) {
    return { ok: false, key: 'databases.importDialog.error.file' }
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return { ok: false, key: 'databases.importDialog.error.tooBig' }
  }
  // `String.prototype.split` always returns a non-empty array.
  // `pop()` returns `''` for the empty case; the `?? ''` is
  // defensive only.
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (!ACCEPTED_EXTENSIONS.includes(ext as (typeof ACCEPTED_EXTENSIONS)[number])) {
    return { ok: false, key: 'databases.importDialog.error.file' }
  }
  return { ok: true }
}

/**
 * Sanitise a display name for the worker. The worker only accepts
 * a 64-char stem of `[A-Za-z0-9._-]`; we apply the same rules
 * here so the Main Thread and the Worker agree on the name.
 *
 * We deliberately do **not** strip path separators: the
 * `File.name` attribute never contains a slash, and the
 * `displayName` prop comes from a UI input that already routes
 * through our `validateDatabaseName` (which rejects separators).
 * Stripping them here would silently drop the prefix part of
 * e.g. `foo/bar.db` and produce surprising results.
 */
export function sanitizeImportedDisplayName(name: string): string {
  const stem = name.replace(/\.(sqlite3?|s3db|db)$/i, '')
  const cleaned = stem
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    // Strip leading / trailing underscores AND leading dots so
    // a name like `....db` collapses to `imported` instead of
    // `....`.
    .replace(/^[._]+|[._]+$/g, '')
  return cleaned.length > 0 ? cleaned.slice(0, MAX_NAME_LENGTH) : 'imported'
}

/* ------------------------------------------------------------------ *
 *  Error classes (the typed throws the service uses)                    *
 * ------------------------------------------------------------------ */

/**
 * The service raises specific error classes for each failure
 * mode so the hook can branch on `instanceof` if it ever needs
 * to (today the hook just converts the message to a string,
 * but the type information is here for future telemetry).
 */
export class DatabaseValidationError extends Error {
  readonly key: string
  constructor(key: string) {
    super(key)
    this.name = 'DatabaseValidationError'
    this.key = key
  }
}

export class ImportValidationError extends Error {
  readonly key: string
  constructor(key: string) {
    super(key)
    this.name = 'ImportValidationError'
    this.key = key
  }
}
