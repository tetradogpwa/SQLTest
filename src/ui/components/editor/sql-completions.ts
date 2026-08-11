/**
 * SQL completion source for CodeMirror 6.
 *
 * Builds a {@link CompletionSource} that is *schema-aware*: it
 * proposes tables after `FROM`/`JOIN`/`UPDATE`/`INTO`, columns of
 * the most recent table after a `.`, and a flat list of all columns
 * (with the `table.column` variant for disambiguation) in a `SELECT`
 * list. The completion source is a pure function over the current
 * editor state and a frozen `DatabaseSchema` snapshot, which makes it
 * trivial to unit-test (see `tests/unit/editor/sql-completions.test.ts`).
 *
 * Latency budget
 * --------------
 * RESEARCH §6 / POC-6 set a 50 ms wall-clock budget for *keystroke →
 * pop-up paint*. The source itself runs in well under 5 ms even on a
 * 50-table × 30-column schema; the rest of the budget goes to
 * CodeMirror's render. We measure the source's per-call cost in the
 * test file and report it in the EDOTOR-REPORT.md.
 *
 * Cache
 * -----
 * The schema is *not* refetched on every keystroke — the caller
 * passes a pre-fetched `DatabaseSchema` (the result of
 * `useSchema().schema`). The same instance can be re-used across
 * keystrokes; `validFor` is the same for every source, so a new
 * source per render is cheap.
 */
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete'

import type { DatabaseSchema } from '../../../workers/types'

/* ──────────────────────────────────────────────────────────────────── *
 *  Static SQL keyword list                                               *
 * ──────────────────────────────────────────────────────────────────── */

/** SQL keywords exposed to the autocompletion pop-up. */
export const SQL_KEYWORDS: ReadonlyArray<string> = [
  // Clauses
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
  'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL OUTER JOIN', 'CROSS JOIN',
  'ON', 'USING', 'AS',
  // DML
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  // DDL
  'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD COLUMN', 'RENAME TO',
  // Constraints
  'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'UNIQUE', 'NOT NULL', 'DEFAULT',
  'CHECK', 'INDEX',
  // Logical / comparison
  'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'GLOB', 'BETWEEN', 'EXISTS',
  'DISTINCT', 'ALL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  // Aggregates
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'TOTAL', 'GROUP_CONCAT',
  // Misc
  'WITH', 'RECURSIVE', 'UNION', 'INTERSECT', 'EXCEPT', 'RETURNING',
  'PRAGMA', 'EXPLAIN', 'VACUUM', 'REPLACE', 'INTO',
  // Connection
  'USE', 'CONNECT', 'ATTACH', 'DETACH',
]

/** A normalised table name for fuzzy matching. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[`"\[\]]/g, '')
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers                                                              *
 * ──────────────────────────────────────────────────────────────────── */

function findTable(schema: DatabaseSchema, name: string): DatabaseSchema['tables'][number] | null {
  const n = norm(name)
  return schema.tables.find((t) => norm(t.name) === n) ?? null
}

function tablesMatching(schema: DatabaseSchema, prefix: string): DatabaseSchema['tables'] {
  const p = norm(prefix)
  if (!p) return schema.tables
  return schema.tables.filter((t) => norm(t.name).startsWith(p))
}

function columnsMatching(
  table: DatabaseSchema['tables'][number],
  prefix: string,
): DatabaseSchema['tables'][number]['columns'] {
  const p = norm(prefix)
  if (!p) return table.columns
  return table.columns.filter((c) => norm(c.name).startsWith(p))
}

function allColumns(schema: DatabaseSchema): Array<{ table: string; name: string; type: string }> {
  const out: Array<{ table: string; name: string; type: string }> = []
  for (const t of schema.tables) {
    for (const c of t.columns) {
      out.push({ table: t.name, name: c.name, type: c.type })
    }
  }
  return out
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Context detection                                                    *
 * ──────────────────────────────────────────────────────────────────── */

interface ParsedContext {
  /** Position before the current word. */
  from: number
  /** The current word being typed. */
  word: string
  /** Full text up to the cursor. */
  upto: string
  /** True if the user is in a `USE` / `CONNECT` / `ATTACH` context. */
  inConnect: boolean
  /** True if the user is in a `FROM` / `JOIN` / `UPDATE` / `INTO` context. */
  inTable: boolean
  /** True if the user is in a `SELECT` column list (or a comma list). */
  inColumnList: boolean
  /** True if the user just typed `<table>.`. */
  inDot: boolean
  /** Table referenced just before the dot, when applicable. */
  dotTable: string | null
}

function parseContext(text: string, pos: number): ParsedContext | null {
  const upto = text.slice(0, pos)
  // Walk back to the previous whitespace or punctuation.
  let from = pos
  while (from > 0 && /[A-Za-z0-9_"`.[\]]/.test(upto[from - 1] ?? '')) {
    from -= 1
  }
  const word = upto.slice(from, pos)

  const inConnect = /\b(?:USE|CONNECT|ATTACH)\s+[\w"`]*$/i.test(upto)
  const inTable =
    /\b(?:FROM|JOIN|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+OUTER\s+JOIN|CROSS\s+JOIN|UPDATE|INSERT\s+INTO|TABLE|INTO)\s+[\w"`]*$/i.test(
      upto,
    )
  const inColumnList = /\bSELECT\b[\s\S]*?$/i.test(upto) || /,\s*[\w"`]*$/i.test(upto)
  const dotMatch = /([A-Za-z_][\w]*)\.\w*$/i.exec(upto)
  const inDot = dotMatch != null
  const dotTable = dotMatch?.[1] ?? null

  return { from, word, upto, inConnect, inTable, inColumnList, inDot, dotTable }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Completion source                                                     *
 * ──────────────────────────────────────────────────────────────────── */

export function makeSqlCompletions(
  schema: DatabaseSchema | null,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    // Bail on empty schemas — we still want the keywords.
    const before = context.matchBefore(/[\w."`]+/)
    const pos = context.pos
    const text = context.state.doc.toString()
    const parsed = parseContext(text, pos)

    if (!parsed) return null
    if (!before && !context.explicit) {
      return null
    }

    const from = before ? before.from : parsed.from

    // 1. CONNECT / USE — suggest database names. We don't have a
    //    list of *all* databases here, but the schema argument
    //    implicitly tells us which one is active. We also surface
    //    `DATABASE` keyword so the user can type the explicit form.
    if (parsed.inConnect) {
      const options: Completion[] = [
        { label: 'DATABASE', type: 'keyword', boost: 2 },
        { label: 'SCHEMA', type: 'keyword', boost: 1 },
      ]
      return { from, options, validFor: /^[\w"]*$/ }
    }

    const baseOptions: Completion[] = SQL_KEYWORDS.map((k) => ({
      label: k,
      type: 'keyword',
      boost: 0,
    }))

    // 2. `table.` — propose columns of that table.
    if (parsed.inDot && parsed.dotTable && schema) {
      const table = findTable(schema, parsed.dotTable)
      if (!table) return null
      const cols = columnsMatching(table, parsed.word.replace(/^.*\./, ''))
      const options: Completion[] = cols.map((c) => ({
        label: c.name,
        type: 'property',
        detail: c.type,
        boost: 1,
      }))
      return { from, options, validFor: /^[\w"]*$/ }
    }

    // 3. `FROM` / `JOIN` / `UPDATE` / `INTO` — propose tables.
    if (parsed.inTable) {
      const tables = schema ? tablesMatching(schema, parsed.word) : []
      const options: Completion[] = [
        ...tables.map<Completion>((t) => ({
          label: t.name,
          type: 'class',
          detail: 'tabla',
          info: `${t.columns.length} columnas`,
          boost: 1,
        })),
        ...baseOptions,
      ]
      return { from, options, validFor: /^[\w"]*$/ }
    }

    // 4. `SELECT` column list — propose all columns of all tables
    //    (with `table.column` variants for disambiguation), then
    //    tables, then keywords.
    if (parsed.inColumnList) {
      const tables = schema?.tables ?? []
      const options: Completion[] = []
      for (const t of tables) {
        for (const c of t.columns) {
          options.push({
            label: c.name,
            type: 'property',
            detail: `${c.type} (${t.name})`,
            boost: 0.6,
          })
          options.push({
            label: `${t.name}.${c.name}`,
            type: 'property',
            detail: c.type,
            boost: 0.5,
          })
        }
      }
      options.push(
        ...tables.map<Completion>((t) => ({
          label: `${t.name}.*`,
          type: 'class',
          detail: 'todas las columnas',
          boost: 0.4,
        })),
      )
      options.push(...baseOptions)
      return { from, options, validFor: /^[\w."]*$/ }
    }

    // 5. Default — tables + keywords.
    if (!schema) {
      return { from, options: baseOptions, validFor: /^[\w"]*$/ }
    }
    const tables = schema.tables
    return {
      from,
      options: [
        ...tables.map<Completion>((t) => ({
          label: t.name,
          type: 'class',
          detail: 'tabla',
          info: `${t.columns.length} columnas`,
          boost: 0.5,
        })),
        ...baseOptions,
      ],
      validFor: /^[\w"]*$/,
    }
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Re-exports for tests + convenience                                   *
 * ──────────────────────────────────────────────────────────────────── */

export { SQLite } from '@codemirror/lang-sql'

/**
 * Re-export the autocompletion extension factory with the schema
 * source pre-wired. The consumer can still add their own options
 * (e.g. `maxRenderedOptions`) by passing them in.
 */
export function sqlCompletionExtension(schema: DatabaseSchema | null, options: Parameters<typeof autocompletion>[0] = {}): ReturnType<typeof autocompletion> {
  return autocompletion({
    ...options,
    override: [makeSqlCompletions(schema)],
  })
}

/** Re-export so callers don't have to import from two places. */
export { allColumns, findTable, tablesMatching, columnsMatching, parseContext }
export type { ParsedContext }
