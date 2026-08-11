/**
 * SqlEditor — CodeMirror 6 wrapper for the playground.
 *
 * Provides a fully-featured SQL editor with:
 *
 *  - SQLite syntax highlighting via `@codemirror/lang-sql`.
 *  - Schema-aware autocomplete via {@link makeSqlCompletions}.
 *  - Search/replace (`Ctrl+F`), undo/redo history, auto-indent.
 *  - `Ctrl+Enter` (or `Cmd+Enter` on macOS) to invoke `onExecute`.
 *  - `Ctrl+/` to toggle line comments.
 *  - Theme: `oneDark` when the dark flag is true; otherwise the
 *    default light theme driven by CSS variables.
 *  - Optional "selection-only" mode: when the user has selected text
 *    and `runSelectionOnly` is `true`, the editor only sends the
 *    selected range to `onExecute`.
 *
 * Props
 * -----
 *  - `value`, `onChange` — controlled document.
 *  - `onExecute` — invoked with the SQL to run. If omitted, the
 *    `Ctrl+Enter` keymap is a no-op (useful for read-only viewers).
 *  - `schemaContext` — the live database schema, used by the
 *    completion source. When `null`, only keywords are suggested.
 *  - `runSelectionOnly` — default `false`. Set to `true` to require a
 *    selection before `onExecute` does anything.
 *  - `readOnly`, `placeholder` — passthrough.
 *  - `fontSize` — pixel font size for the editor surface.
 *  - `dark` — whether to render the dark theme. Defaults to `false`.
 *  - `height` — CSS length. Defaults to `320px`.
 */
import { useEffect, useMemo, useRef } from 'react'
import CodeMirror, {
  EditorView,
  type ReactCodeMirrorRef,
  type Extension,
} from '@uiw/react-codemirror'
import { sql, SQLite } from '@codemirror/lang-sql'
import {
  EditorView as CMEditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view'
import {
  history,
  defaultKeymap,
  historyKeymap,
  toggleComment,
} from '@codemirror/commands'
import {
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search'
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete'
import { lintKeymap } from '@codemirror/lint'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState } from '@codemirror/state'

import { makeSqlCompletions } from './sql-completions'
import type { DatabaseSchema } from '../../../workers/types'
import styles from './editor.module.css'

export interface SqlEditorProps {
  value: string
  onChange: (next: string) => void
  /** Called with the SQL to execute. Receives the *selection* if there is one. */
  onExecute?: (sql: string) => void | Promise<void>
  /** Schema used to power autocomplete. */
  schemaContext?: DatabaseSchema | null
  /** Only execute the current selection. Default `false`. */
  runSelectionOnly?: boolean
  readOnly?: boolean
  placeholder?: string
  /** Pixel font size for the editor surface. */
  fontSize?: number
  /** Render the dark theme. Defaults to `false` (light). */
  dark?: boolean
  /** CSS height of the editor. */
  height?: string
  /** A11y label for the editor region. */
  ariaLabel?: string
  /** Optional id for the host element (used by the parent for focus mgmt). */
  id?: string
  /** Test hook. Receives the underlying `EditorView`. */
  onReady?: (view: EditorView) => void
}

/**
 * Resolve the current SQL to execute: selection if present (and we're
 * in selection mode), otherwise the whole document.
 */
function resolveSql(
  view: CMEditorView,
  runSelectionOnly: boolean,
  docValue: string,
): string {
  const sel = view.state.selection.main
  if (runSelectionOnly && !sel.empty) {
    return view.state.doc.sliceString(sel.from, sel.to)
  }
  return docValue
}

const baseLightTheme = EditorView.theme(
  {
    '&': {
      fontSize: '14px',
      height: '100%',
      backgroundColor: 'var(--color-bg-elevated)',
      color: 'var(--color-text)',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
      lineHeight: '1.55',
    },
    '.cm-content': {
      caretColor: 'var(--color-primary)',
      padding: '8px 0',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-primary)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--color-primary-soft)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--color-bg)',
      color: 'var(--color-text-muted)',
      border: 'none',
    },
    '.cm-activeLineGutter, .cm-activeLine': {
      backgroundColor: 'var(--color-surface)',
    },
    '.cm-tooltip-autocomplete > ul': {
      fontFamily: 'var(--font-mono, monospace)',
      maxHeight: '320px',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'var(--color-primary-soft)',
      color: 'var(--color-text)',
    },
  },
  { dark: false },
)

export function SqlEditor({
  value,
  onChange,
  onExecute,
  schemaContext = null,
  runSelectionOnly = false,
  readOnly = false,
  placeholder,
  fontSize = 14,
  dark = false,
  height = '320px',
  ariaLabel = 'Editor SQL',
  id,
  onReady,
}: SqlEditorProps): React.ReactNode {
  const ref = useRef<ReactCodeMirrorRef | null>(null)

  const extensions = useMemo<Extension[]>(() => {
    const execute = onExecute
      ? (view: CMEditorView): boolean => {
          const sql = resolveSql(view, runSelectionOnly, value)
          if (!sql.trim()) return false
          void Promise.resolve(onExecute(sql)).catch(() => undefined)
          return true
        }
      : null

    const keymaps: Array<import('@codemirror/view').KeyBinding> = [
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      { key: 'Mod-/', run: toggleComment, preventDefault: true },
      ...(execute
        ? [
            {
              key: 'Mod-Enter',
              run: execute,
              preventDefault: true,
            },
          ]
        : []),
    ]

    const list: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      history(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      sql({ dialect: SQLite, upperCaseKeywords: false }),
      autocompletion({
        override: [makeSqlCompletions(schemaContext ?? null)],
        activateOnTyping: true,
        maxRenderedOptions: 50,
        closeOnBlur: true,
        defaultKeymap: true,
      }),
      keymap.of(keymaps as Parameters<typeof keymap.of>[0] as ReadonlyArray<import('@codemirror/view').KeyBinding>),
      EditorView.lineWrapping,
      baseLightTheme,
      EditorView.theme(
        {
          '&': { fontSize: `${fontSize}px` },
        },
        { dark: false },
      ),
    ]

    if (dark) {
      list.push(oneDark)
    }
    return list
  }, [schemaContext, onExecute, runSelectionOnly, value, fontSize, dark])

  // Bubble the live `EditorView` up via `onReady`.
  useEffect(() => {
    const view = ref.current?.view
    if (view && onReady) onReady(view)
  }, [onReady, value])

  return (
    <div
      className={styles.editor}
      data-testid="sql-editor"
      data-placeholder={placeholder}
      style={{ height }}
      id={id}
    >
      <CodeMirror
        ref={ref}
        value={value}
        onChange={onChange}
        extensions={extensions}
        editable={!readOnly}
        readOnly={readOnly}
        theme="none"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          foldGutter: true,
          autocompletion: false, // we provide our own
          highlightActiveLineGutter: true,
          bracketMatching: true,
          closeBrackets: true,
        }}
        aria-label={ariaLabel}
      />
    </div>
  )
}

export default SqlEditor
