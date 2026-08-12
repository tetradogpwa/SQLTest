/**
 * Modal logic service.
 *
 * Pure-TS functions that the database modals (`CreateDatabaseDialog`,
 * `ImportDatabaseDialog`, the rename / delete inline dialogs in
 * `DatabasesPage`) call when they need a decision about the user's
 * input. Everything that used to live inline in the components
 * (name derivation, "should we use the override or default to the
 * file name?", ...) is here.
 *
 * The service is **stateless** + **I/O-free** + **i18n-free**: it
 * returns i18n keys + display strings; the component feeds them
 * through `t()`. The only side effect is the pure-JS derivation of
 * "what name to display", which is fully deterministic.
 *
 * Validation functions live in `userDatabasesService` (this folder);
 * re-exports the one the modals need.
 */
import {
  sanitizeImportedDisplayName,
  validateDatabaseName,
  validateImportFile,
} from './userDatabasesService'

/* ------------------------------------------------------------------ *
 *  Display-name derivation (import flow)                               *
 * ------------------------------------------------------------------ */

export interface DeriveDisplayNameInput {
  /** The file the user picked. */
  file: File
  /**
   * The current value of the optional override input. When the user
   * has typed something, we use it; otherwise we default to the
   * file name.
   */
  override: string
}

/**
 * Resolve the display name the import dialog should show in its
 * text field:
 *
 *  - If `override` is non-empty (after trim), return it as-is.
 *  - Otherwise, default to the file name without its SQLite
 *    extension (`foo.db` → `foo`).
 *
 * The function is pure: the same input always produces the same
 * output. The dialog calls it on every `onChange` of the override
 * field to decide whether to update the input's value (only when
 * the user hasn't typed anything yet).
 */
export function deriveImportDisplayName(input: DeriveDisplayNameInput): string {
  const trimmed = input.override.trim()
  if (trimmed.length > 0) return input.override
  return sanitizeImportedDisplayName(input.file.name)
}

/**
 * Decide whether the override input should be auto-populated
 * with the file's default name. The dialog uses this on the
 * "file picked" event to only set the default when the field
 * is still empty (so we don't overwrite a name the user already
 * typed for a previous file).
 */
export function shouldAutoFillDisplayName(currentOverride: string): boolean {
  return currentOverride.trim().length === 0
}

/* ------------------------------------------------------------------ *
 *  Validation re-exports                                                *
 * ------------------------------------------------------------------ */

/**
 * Re-export so the modals can import every "modal logic" they need
 * from one module. The underlying implementation lives in
 * `userDatabasesService` because the rename / create / import
 * flows all share the same rule.
 */
export { validateDatabaseName, validateImportFile, sanitizeImportedDisplayName }

/* ------------------------------------------------------------------ *
 *  Submit orchestration                                                 *
 * ------------------------------------------------------------------ */

/**
 * What the modals pass to their `onSubmit` callback. The dialog
 * keeps a `useState<SubmitState>` and the parent's submit handler
 * is the orchestrator; this type just gives the dialog a single
 * shape to return.
 */
export interface CreateSubmit {
  kind: 'create'
  name: string
}

export interface ImportSubmit {
  kind: 'import'
  file: File
  displayName: string
}

export interface RenameSubmit {
  kind: 'rename'
  id: string
  newName: string
}

export interface DeleteSubmit {
  kind: 'delete'
  id: string
}

export type DatabaseSubmit = CreateSubmit | ImportSubmit | RenameSubmit | DeleteSubmit

/**
 * Validate a submit payload *before* the dialog calls its
 * `onSubmit` callback. The function returns either the
 * `validation` result (with the i18n key on failure) or the
 * (unchanged) payload on success.
 *
 * The hook side already does its own validation via the service,
 * but the dialog calls this so it can show a `setError` on the
 * dialog itself before the parent even gets the payload.
 */
export function validateSubmit(
  payload: DatabaseSubmit,
): { ok: true; payload: DatabaseSubmit } | { ok: false; key: string } {
  switch (payload.kind) {
    case 'create':
    case 'rename': {
      const r = validateDatabaseName(payload.kind === 'create' ? payload.name : payload.newName)
      return r.ok
        ? { ok: true, payload }
        : { ok: false, key: r.key }
    }
    case 'import':
      // The import flow does heavier validation (size, extension)
      // — delegated to `validateImportFile` via
      // `userDatabasesService`. The dialog still calls it directly
      // because it has the `File` object; the submit hook is not
      // involved at the on-pick stage.
      return { ok: true, payload }
    case 'delete':
      // Deleting has no user-facing validation — the confirm
      // dialog is the only gate.
      return { ok: true, payload }
    default: {
      // Exhaustiveness check — the `never` assignment surfaces a
      // TS error if a new `DatabaseSubmit` variant is added without
      // a case here. At runtime the `default` arm is unreachable
      // for any well-typed input, but we throw anyway so a future
      // bug (e.g. someone casts around the type system) is loud
      // instead of silent.
      const exhaustive: never = payload
      throw new Error(
        `Unknown DatabaseSubmit kind: ${JSON.stringify(exhaustive)}`,
      )
    }
  }
}
