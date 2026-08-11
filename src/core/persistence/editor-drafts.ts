/**
 * Editor draft store.
 *
 * Persists the in-progress text of every editor (one per `contextType +
 * contextId` pair) so the user does not lose work across reloads. This
 * module only owns the *storage*: the actual debounce lives in the
 * React hook (see `src/hooks/useEditorDraft.ts` in a future POC) which
 * wraps `saveDraft` in a `setTimeout(..., 800)`.
 *
 * Why a separate store for drafts instead of `queryHistory` or
 * `savedQueries`?  Per RESEARCH.md §12.2 the three concepts differ:
 *
 *  - `queryHistory` only persists queries that ran successfully
 *    (auto-managed, 100 per DB LRU).
 *  - `savedQueries` are user-named and user-managed.
 *  - `editorDrafts` is system-managed debounced autosave for whatever
 *    the editor currently contains, including invalid SQL.
 *
 * Each context has at most one row; `saveDraft` is an upsert.
 */

import type { SqlAcademyDB } from './dexie'
import { db as defaultDb } from './dexie'
import type { EditorDraft } from './types'

/** Public context values; `'lesson'` is reserved for the existing schema. */
export type EditorDraftContextType = 'exercise' | 'playground' | 'lesson'

export class EditorDraftStore {
  private readonly db: SqlAcademyDB

  constructor(dbInstance: SqlAcademyDB = defaultDb) {
    this.db = dbInstance
  }

  /**
   * Upsert a draft. The `editorDrafts` table uses an auto-incrementing
   * `id` as its primary key and a *secondary* compound index
   * `[contextType+contextId]`, so a bare `put()` would create a new
   * row on every save. We therefore look up the existing row first
   * and `update()` it in place; on a miss we `add()` a new row.
   *
   * The lookup and the write run inside a `rw` transaction so a
   * concurrent `saveDraft` from another editor instance cannot race
   * and produce a duplicate row.
   */
  async saveDraft(
    contextType: EditorDraftContextType,
    contextId: string,
    content: string,
  ): Promise<void> {
    const updatedAt = Date.now()
    await this.db.transaction('rw', this.db.editorDrafts, async () => {
      const existing = await this.db.editorDrafts
        .where('[contextType+contextId]')
        .equals([contextType, contextId])
        .first()
      if (existing?.id !== undefined) {
        await this.db.editorDrafts.update(existing.id, { content, updatedAt })
      } else {
        await this.db.editorDrafts.add({ contextType, contextId, content, updatedAt })
      }
    })
  }

  /**
   * Load the latest draft for the given context. Returns `null` if no
   * draft has ever been saved — the React hook treats this as "start
   * from an empty editor".
   */
  async loadDraft(
    contextType: EditorDraftContextType,
    contextId: string,
  ): Promise<string | null> {
    const row = await this.db.editorDrafts
      .where('[contextType+contextId]')
      .equals([contextType, contextId])
      .first()
    return row?.content ?? null
  }

  /**
   * Drop a single draft. Called when the user explicitly resets the
   * editor or when the related exercise is marked as completed (the
   * draft is no longer "in progress").
   */
  async deleteDraft(
    contextType: EditorDraftContextType,
    contextId: string,
  ): Promise<void> {
    const row = await this.db.editorDrafts
      .where('[contextType+contextId]')
      .equals([contextType, contextId])
      .first()
    if (row?.id !== undefined) {
      await this.db.editorDrafts.delete(row.id)
    }
  }

  /**
   * Return all drafts of a given `contextType`, newest first. Used by
   * the Playground sidebar to render the "open recent" list and by the
   * "Continue last draft" prompt on first load.
   */
  async getDraftsByContext(
    contextType: EditorDraftContextType,
  ): Promise<EditorDraft[]> {
    return this.db.editorDrafts
      .where('updatedAt')
      .above(0)
      .filter((d) => d.contextType === contextType)
      .reverse()
      .sortBy('updatedAt')
  }

  /**
   * Delete every draft whose `updatedAt` is older than `maxAgeMs`.
   * Returns the number of rows removed so a maintenance task can
   * report it.
   */
  async pruneOlderThan(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs
    const old = await this.db.editorDrafts.where('updatedAt').below(cutoff).primaryKeys()
    if (old.length === 0) return 0
    await this.db.editorDrafts.bulkDelete(old)
    return old.length
  }

  /**
   * Most recently updated draft across all contexts. Used by the
   * "Continue last draft" prompt on app start.
   */
  async getMostRecentDraft(): Promise<EditorDraft | null> {
    const draft = await this.db.editorDrafts.orderBy('updatedAt').last()
    return draft ?? null
  }
}

export const editorDrafts = new EditorDraftStore()
