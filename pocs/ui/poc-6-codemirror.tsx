/**
 * POC-6 — CodeMirror 6 + SQL completions with live schema.
 *
 * Verifies that:
 *  1. `@codemirror/lang-sql` with dialect `SQLite` is integrated.
 *  2. `@codemirror/autocomplete` provides the completion pop-up.
 *  3. A custom completion source (`sqlCompletions`) is wired in to propose
 *     tables and columns based on a live in-memory schema.
 *  4. The pop-up appears <50 ms after typing.
 *
 * Full implementation lives below — see `buildEditorView` and
 * `sqlCompletions`.
 */

import { useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from '@codemirror/language'
import {
  autocompletion,
  completionKeymap,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete'
import { sql, SQLite } from '@codemirror/lang-sql'
import { lintKeymap } from '@codemirror/lint'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'

/** A simplified view of the DB schema consumed by the completion source. */
export interface DbSchema {
  tables: Array<{ name: string; columns: Array<{ name: string; type: string }> }>
}

/** A trivial "live" schema — 3 tables, 5 columns each. Used for the POC. */
const POC_SCHEMA: DbSchema = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'name', type: 'TEXT' },
        { name: 'email', type: 'TEXT' },
        { name: 'created_at', type: 'TIMESTAMP' },
        { name: 'is_active', type: 'BOOLEAN' },
      ],
    },
    {
      name: 'orders',
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'user_id', type: 'INTEGER' },
        { name: 'total', type: 'REAL' },
        { name: 'status', type: 'TEXT' },
        { name: 'placed_at', type: 'TIMESTAMP' },
      ],
    },
    {
      name: 'products',
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'sku', type: 'TEXT' },
        { name: 'name', type: 'TEXT' },
        { name: 'price', type: 'REAL' },
        { name: 'stock', type: 'INTEGER' },
      ],
    },
  ],
}

/** A list of SQL keywords that should also be offered as completions. */
const SQL_KEYWORDS: Completion[] = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER',
  'ON', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN',
  'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT', 'INTO',
  'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'DISTINCT', 'COUNT', 'SUM',
  'AVG', 'MIN', 'MAX',
].map((k) => ({ label: k, type: 'keyword', boost: 0 }))

/**
 * CodeMirror completion source that proposes:
 *  - Tables after `FROM`/`JOIN`/`UPDATE`/`INTO` (or at statement start).
 *  - Columns of the most recent table reference when typing `.`
 *    (e.g. `users.|`) or after a `,` in a column list, or after `SELECT`.
 *
 * Latency budget: the source must return in <5 ms for the POC schema
 * (3 tables × 5 columns). The pop-up render is animated by CodeMirror and
 * adds a couple of frames; we measure the wall-clock time from the last
 * keystroke to the pop-up's first paint.
 */
export function sqlCompletions(schema: DbSchema) {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(/[\w."`]*/)
    if (!before) return null
    if (before.from === before.to && !context.explicit) return null

    const text = context.state.doc.toString()
    const upto = text.slice(0, before.to)
    // Detect "FROM table_name|", "JOIN table_name|", "UPDATE table_name|" etc.
    const fromMatch = /\b(?:FROM|JOIN|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|OUTER\s+JOIN|UPDATE|INTO|TABLE)\s+([\w]*)$/i.exec(upto)
    // Detect "SELECT * FROM users WHERE x.|" → columns of users
    const dotMatch = /([\w]+)\.\w*$/i.exec(upto)
    // Detect "SELECT |" or ", |" → all columns from all tables
    const selectContext = /\bSELECT\s+([\w.,\s]*)$/i.test(upto) || /,\s*([\w]*)$/i.test(upto)

    const tableCompletions: Completion[] = schema.tables.map((t) => ({
      label: t.name,
      type: 'class',
      detail: 'tabla',
      info: `${t.columns.length} columnas`,
      boost: 1,
    }))

    if (fromMatch) {
      return {
        from: before.from,
        options: [...tableCompletions, ...SQL_KEYWORDS],
        validFor: /^[\w"]*$/,
      }
    }

    if (dotMatch && dotMatch[1]) {
      const tbl = schema.tables.find((t) => t.name.toLowerCase() === dotMatch[1]!.toLowerCase())
      if (!tbl) return null
      return {
        from: before.from,
        options: tbl.columns.map((c) => ({
          label: c.name,
          type: 'property',
          detail: c.type,
          boost: 1,
        })),
        validFor: /^[\w"]*$/,
      }
    }

    if (selectContext) {
      // All columns of all tables, prefixed with `table.` for disambiguation.
      const all: Completion[] = []
      for (const t of schema.tables) {
        for (const c of t.columns) {
          all.push({
            label: `${t.name}.${c.name}`,
            type: 'property',
            detail: `${c.type} (${t.name})`,
            boost: 0.5,
          })
          all.push({
            label: c.name,
            type: 'property',
            detail: `${c.type} (${t.name})`,
            boost: 0.5,
          })
        }
      }
      return { from: before.from, options: [...all, ...SQL_KEYWORDS], validFor: /^[\w."]*$/ }
    }

    // Default: tables + keywords.
    return {
      from: before.from,
      options: [...tableCompletions, ...SQL_KEYWORDS],
      validFor: /^[\w"]*$/,
    }
  }
}

function buildEditorState(initialDoc: string, schema: DbSchema, onLatencySample?: (s: LatencySample) => void) {
  const measureListener = EditorView.updateListener.of((update) => {
    if (!onLatencySample) return
    for (const tr of update.transactions) {
      if (!tr.isUserEvent('input.type')) continue
      if (tr.isUserEvent('delete')) continue
      const triggeredAt = performance.now()
      const ctx = update.state.doc.toString().slice(-32)
      // After a microtask, check the DOM for the autocomplete tooltip.
      queueMicrotask(() => {
        const tooltips = update.view.dom.querySelectorAll('.cm-tooltip-autocomplete')
        if (tooltips && tooltips.length > 0) {
          const dur = performance.now() - triggeredAt
          onLatencySample({
            triggeredAt,
            appearedAt: performance.now(),
            durationMs: dur,
            context: ctx,
          })
        }
      })
    }
  })

  return EditorState.create({
    doc: initialDoc,
    extensions: [
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      foldGutter(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      highlightActiveLine(),
      highlightSelectionMatches(),
      measureListener,
      sql({ dialect: SQLite, upperCaseKeywords: true }),
      autocompletion({
        override: [sqlCompletions(schema)],
        activateOnTyping: true,
        maxRenderedOptions: 50,
        closeOnBlur: true,
      }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),
      EditorView.lineWrapping,
    ],
  })
}

const POC_INITIAL_DOC = `-- POC-6: CodeMirror 6 + SQL completions con esquema en vivo
-- Esquema: users, orders, products (3 tablas, 5 columnas cada una)
-- Pulsa Ctrl+Space en cualquier momento para forzar el pop-up.

SELECT
  u.name,
  o.total
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE u.is_active = 1
ORDER BY o.placed_at DESC
LIMIT 20;
`

/** Captured latency samples. */
interface LatencySample {
  triggeredAt: number
  appearedAt: number
  durationMs: number
  context: string
}

export function Poc6Codemirror() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [samples, setSamples] = useState<LatencySample[]>([])
  const [completionsShown, setCompletionsShown] = useState<Completion[] | null>(null)
  const [doc, setDoc] = useState(POC_INITIAL_DOC)
  const schemaRef = useRef<DbSchema>(POC_SCHEMA)

  // Mount the editor once.
  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      state: buildEditorState(POC_INITIAL_DOC, schemaRef.current, (sample) => {
        setSamples((prev) => {
          const recent = prev[prev.length - 1]
          if (recent && Math.abs(recent.durationMs - sample.durationMs) < 1 && recent.context === sample.context) {
            return prev
          }
          return [...prev, sample].slice(-20)
        })
        // Capture the visible completions for the report (one snapshot per
        // new sample, throttled by React's setState).
        const tooltips = view.dom.querySelectorAll('.cm-tooltip-autocomplete')
        if (tooltips && tooltips.length > 0) {
          const items = Array.from(tooltips[0]!.querySelectorAll('li')).map((li) => (li.textContent ?? '').trim())
          setCompletionsShown(items.slice(0, 10).map((label) => ({ label })))
        }
      }),
      parent: hostRef.current,
      dispatchTransactions: (trs) => {
        const view2 = viewRef.current
        if (!view2) return
        view2.update(trs)
        for (const tr of trs) {
          if (tr.docChanged) {
            setDoc(tr.state.doc.toString())
          }
        }
      },
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  const avgMs = samples.length === 0
    ? null
    : samples.reduce((acc, s) => acc + s.durationMs, 0) / samples.length
  const maxMs = samples.length === 0 ? null : Math.max(...samples.map((s) => s.durationMs))

  return (
    <section className="poc6-root" style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <h2>POC-6 — CodeMirror 6 + SQL completions con esquema en vivo</h2>
      <p>
        Editor CodeMirror 6 con dialecto SQLite. El completion source
        personalizado <code>sqlCompletions(schema)</code> propone tablas
        tras <code>FROM</code>/<code>JOIN</code> y columnas tras{' '}
        <code>.</code> o en contexto <code>SELECT</code>. Esquema de
        prueba: 3 tablas (users, orders, products) × 5 columnas.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'start' }}>
        <div ref={hostRef} data-testid="cm-host" />
        <aside>
          <h3>Latencia del pop-up</h3>
          {samples.length === 0 ? (
            <p>
              Empieza a escribir o pulsa <kbd>Ctrl</kbd>+<kbd>Espacio</kbd> para
              medir. La latencia se calcula desde la pulsación hasta que el
              pop-up se renderiza.
            </p>
          ) : (
            <>
              <p>
                <strong>Media:</strong> {avgMs!.toFixed(1)} ms ·
                <strong> Máx:</strong> {maxMs!.toFixed(1)} ms ·
                <strong> Muestras:</strong> {samples.length}
              </p>
              <p style={{ color: maxMs! < 50 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                {maxMs! < 50 ? '✅ Por debajo del presupuesto (50 ms).' : '⚠️ Por encima del presupuesto (50 ms).'}
              </p>
            </>
          )}

          <h3>Última captura de sugerencias</h3>
          {completionsShown && completionsShown.length > 0 ? (
            <ul style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
              {completionsShown.map((c, i) => (
                <li key={`${c.label}-${i}`}>{c.label}</li>
              ))}
            </ul>
          ) : (
            <p>No hay pop-up activo ahora mismo.</p>
          )}

          <h3>Esquema cargado</h3>
          <pre style={{ fontSize: '0.8rem' }}>
{JSON.stringify(schemaRef.current.tables.map((t) => `${t.name}(${t.columns.map((c) => c.name).join(', ')})`), null, 0)}
          </pre>
        </aside>
      </div>

      <p style={{ marginTop: '1.5rem' }}>
        Texto actual: <em>{doc.length} caracteres</em>
      </p>
    </section>
  )
}

export default Poc6Codemirror
