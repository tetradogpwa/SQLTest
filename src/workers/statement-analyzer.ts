/**
 * SQL statement classifier for the QueryGuard.
 *
 * Implements RESEARCH.md §6.2-§6.4: a regex-based classifier that produces
 * a risk profile for every statement in a (possibly multi-statement) SQL
 * string. The output drives the Worker's auto-snapshot policy and the
 * Main Thread's pre-execution UI.
 *
 * Design constraints (taken from the POC findings and the spec):
 *   - The classifier is pure (no SQLite calls). Impact estimation that
 *     needs `EXPLAIN QUERY PLAN` or `COUNT(*)` is split out into the
 *     separate `estimateAffectedRatio` function so it can be tested in
 *     isolation against a real DB.
 *   - Multi-statement SQL is split on `;` while respecting
 *     `BEGIN…END` blocks (used by triggers) and string literals. The
 *     split is intentionally simple — we err on the side of under-
 *     splitting (e.g. a `;` inside a string will glue statements), but
 *     SQLite itself parses each statement on its own so a too-long
 *     statement will simply fail with a syntax error and be reported as
 *     such by the ErrorTranslator.
 *   - All rules are applied in order; the first match wins. This keeps
 *     the priority obvious (DROP before UPDATE before SELECT).
 */

import type { AnalyzedStatement, EstimatedImpact, RiskLevel } from './types'

/* ──────────────────────────────────────────────────────────────────── *
 *  Public type re-exports                                               *
 * ──────────────────────────────────────────────────────────────────── */

export type StatementKind =
  | 'select'
  | 'insert'
  | 'update'
  | 'delete'
  | 'create'
  | 'drop'
  | 'alter'
  | 'replace'
  | 'truncate' // not in SQLite — surfaces as DELETE FROM without WHERE
  | 'pragma'
  | 'transaction'
  | 'explain'
  | 'vacuum' // used by the snapshot / export managers
  | 'attach' | 'detach'
  | 'reindex' | 'analyze'
  | 'other'

/* ──────────────────────────────────────────────────────────────────── *
 *  Statement splitting                                                  *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Split a (possibly multi-statement) SQL string into individual statements.
 *
 * The split respects:
 *   - String literals `'...'` and `"..."` (with `''` and `""` escapes).
 *   - `slash-star ... star-slash` and `-- ...` line comments.
 *   - `BEGIN...END` blocks (typical of triggers) so the inner `;` is not
 *     treated as a statement boundary.
 *
 * Empty fragments are dropped.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = []
  let buf = ''
  let i = 0
  let inSingle = false
  let inDouble = false
  let inLineComment = false
  let inBlockComment = false
  let beginDepth = 0

  const pushBuf = () => {
    const trimmed = buf.trim()
    if (trimmed.length > 0) out.push(trimmed)
    buf = ''
  }

  while (i < sql.length) {
    const ch = sql[i]!
    const next = sql[i + 1]

    if (inLineComment) {
      buf += ch
      if (ch === '\n') inLineComment = false
      i++
      continue
    }
    if (inBlockComment) {
      buf += ch
      if (ch === '*' && next === '/') {
        buf += '/'
        i += 2
        inBlockComment = false
        continue
      }
      i++
      continue
    }
    if (inSingle) {
      buf += ch
      if (ch === "'" && next === "'") {
        buf += "'"
        i += 2
        continue
      }
      if (ch === "'") inSingle = false
      i++
      continue
    }
    if (inDouble) {
      buf += ch
      if (ch === '"' && next === '"') {
        buf += '"'
        i += 2
        continue
      }
      if (ch === '"') inDouble = false
      i++
      continue
    }

    if (ch === '-' && next === '-') {
      inLineComment = true
      buf += '--'
      i += 2
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      buf += '/*'
      i += 2
      continue
    }
    if (ch === "'") {
      inSingle = true
      buf += ch
      i++
      continue
    }
    if (ch === '"') {
      inDouble = true
      buf += ch
      i++
      continue
    }

    // BEGIN…END block tracking. We only track depth changes; the
    // string content inside is captured as-is above.
    if (/^begin\b/i.test(sql.slice(i, i + 5))) {
      beginDepth++
    }
    if (beginDepth > 0 && /^end\b/i.test(sql.slice(i, i + 3))) {
      beginDepth--
    }

    if (ch === ';' && beginDepth === 0) {
      pushBuf()
      i++
      continue
    }

    buf += ch
    i++
  }

  pushBuf()
  return out
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Per-statement classification                                         *
 * ──────────────────────────────────────────────────────────────────── */

interface BaseRule {
  /** Head regex; only used for matching, not capture. */
  matchHead: RegExp
  kind: StatementKind
  risk: RiskLevel
  requiresCheckpoint: boolean
  warning?: string
  /** Optional heuristic to detect WHERE-less writes. */
  detectDestructive?: (sql: string) => boolean
}

const RULES: BaseRule[] = [
  {
    matchHead: /^\s*select\b/i,
    kind: 'select',
    risk: 'safe',
    requiresCheckpoint: false,
  },
  {
    matchHead: /^\s*with\b/i, // CTEs that resolve to a SELECT
    kind: 'select',
    risk: 'safe',
    requiresCheckpoint: false,
  },
  {
    matchHead: /^\s*explain\b/i,
    kind: 'explain',
    risk: 'safe',
    requiresCheckpoint: false,
  },
  {
    matchHead: /^\s*pragma\b/i,
    kind: 'pragma',
    risk: 'safe',
    requiresCheckpoint: false,
  },
  {
    matchHead: /^\s*vacuum\b/i,
    kind: 'vacuum',
    risk: 'safe',
    requiresCheckpoint: false,
  },
  {
    matchHead: /^\s*begin\b|^\s*commit\b|^\s*rollback\b|^\s*end\b|^\s*savepoint\b|^\s*release\b/i,
    kind: 'transaction',
    risk: 'safe',
    requiresCheckpoint: false,
  },
  {
    matchHead: /^\s*create\b/i,
    kind: 'create',
    risk: 'safe',
    requiresCheckpoint: false,
    warning: 'CREATE no es destructivo, pero modifica el esquema.',
  },
  {
    matchHead: /^\s*drop\b/i,
    kind: 'drop',
    risk: 'destructive',
    requiresCheckpoint: true,
    warning: 'DROP elimina permanentemente el objeto.',
  },
  {
    matchHead: /^\s*alter\s+table\b/i,
    kind: 'alter',
    risk: 'destructive',
    requiresCheckpoint: true,
    warning: 'ALTER TABLE es destructivo: crea un snapshot antes de continuar.',
  },
  {
    matchHead: /^\s*reindex\b/i,
    kind: 'reindex',
    risk: 'safe',
    requiresCheckpoint: false,
  },
  {
    matchHead: /^\s*analyze\b/i,
    kind: 'analyze',
    risk: 'safe',
    requiresCheckpoint: false,
  },
  {
    matchHead: /^\s*attach\b/i,
    kind: 'attach',
    risk: 'caution',
    requiresCheckpoint: false,
    warning: 'ATTACH abre otra base de datos en esta conexión.',
  },
  {
    matchHead: /^\s*detach\b/i,
    kind: 'detach',
    risk: 'safe',
    requiresCheckpoint: false,
  },
  {
    matchHead: /^\s*replace\s+into\b/i,
    kind: 'replace',
    risk: 'caution',
    requiresCheckpoint: true,
    warning: 'REPLACE puede borrar filas existentes; revisa antes de continuar.',
  },
  {
    matchHead: /^\s*insert\s+or\s+replace\s+into\b/i,
    kind: 'replace',
    risk: 'caution',
    requiresCheckpoint: true,
    warning: 'REPLACE puede borrar filas existentes; revisa antes de continuar.',
  },
  {
    matchHead: /^\s*insert\s+into\b/i,
    kind: 'insert',
    risk: 'safe',
    requiresCheckpoint: false,
    warning: 'INSERT … SELECT masivo (>100 filas) merece un checkpoint.',
  },
  {
    matchHead: /^\s*update\s+/i,
    kind: 'update',
    risk: 'safe',
    requiresCheckpoint: false,
    detectDestructive: (sql) => !hasWhereClause(sql),
  },
  {
    matchHead: /^\s*delete\s+from\s+/i,
    kind: 'delete',
    risk: 'safe',
    requiresCheckpoint: false,
    detectDestructive: (sql) => !hasWhereClause(sql),
  },
  {
    matchHead: /^\s*truncate\b/i,
    kind: 'truncate',
    risk: 'destructive',
    requiresCheckpoint: true,
    warning: 'TRUNCATE no existe en SQLite; se detecta como DELETE FROM sin WHERE.',
  },
]

function hasWhereClause(sql: string): boolean {
  // Naive: looks for an unquoted WHERE that is not inside a paren. The
  // analyser is best-effort; an underestimate is safe (it will require
  // a checkpoint when one may not be strictly needed).
  const lower = sql.toLowerCase()
  let i = 0
  let inSingle = false
  let inDouble = false
  let parenDepth = 0
  while (i < lower.length) {
    const ch = lower[i]!
    const next = lower[i + 1]
    if (inSingle) {
      if (ch === "'" && next === "'") { i += 2; continue }
      if (ch === "'") inSingle = false
      i++; continue
    }
    if (inDouble) {
      if (ch === '"' && next === '"') { i += 2; continue }
      if (ch === '"') inDouble = false
      i++; continue
    }
    if (ch === "'") { inSingle = true; i++; continue }
    if (ch === '"') { inDouble = true; i++; continue }
    if (ch === '(') { parenDepth++; i++; continue }
    if (ch === ')') { parenDepth = Math.max(0, parenDepth - 1); i++; continue }
    if (parenDepth === 0 && ch === 'w' && lower.slice(i, i + 5) === 'where') {
      // Make sure it's a word boundary
      const before = i === 0 ? ' ' : lower[i - 1]!
      const after = lower[i + 5] ?? ' '
      if (!/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after)) {
        return true
      }
    }
    i++
  }
  return false
}

function extractObjects(sql: string): string[] {
  // Pull the first identifier that follows `FROM`, `INTO`, `UPDATE` or
  // `TABLE`. Good enough for the snapshot policy.
  const out: string[] = []
  const re = /(?:from|into|update|table|view|index|trigger)\s+["'`]?([A-Za-z_][A-Za-z0-9_]*)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql))) {
    const name = m[1]
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

function classifyOne(stmt: string): AnalyzedStatement {
  const sql = stmt.trim()
  const head = sql
  const warnings: string[] = []
  const objects = extractObjects(sql)

  for (const rule of RULES) {
    if (!rule.matchHead.test(head)) continue

    let risk: RiskLevel = rule.risk
    let requiresCheckpoint = rule.requiresCheckpoint
    if (rule.warning) warnings.push(rule.warning)

    if (rule.detectDestructive) {
      const destructive = rule.detectDestructive(sql)
      if (destructive) {
        risk = 'destructive'
        requiresCheckpoint = true
        warnings.push(
          rule.kind === 'update'
            ? 'UPDATE sin WHERE modifica TODAS las filas.'
            : rule.kind === 'delete'
              ? 'DELETE sin WHERE elimina TODAS las filas.'
              : 'Operación masiva sin WHERE.',
        )
      }
    }

    // Special-case: DROP COLUMN is the only truly destructive ALTER form.
    if (rule.kind === 'alter' && !/drop\s+column\b/i.test(sql)) {
      // e.g. ALTER TABLE … ADD COLUMN or RENAME — still a structural
      // change but recoverable. Keep destructive risk but no extra hint.
      warnings.push('ALTER modifica el esquema de la tabla.')
    }

    return {
      kind: rule.kind,
      risk,
      requiresCheckpoint,
      warnings,
      objects: objects.length > 0 ? objects : undefined,
    }
  }

  return {
    kind: 'other',
    risk: 'safe',
    requiresCheckpoint: false,
    warnings: ['Tipo de sentencia no reconocido: se ejecuta sin garantías adicionales.'],
    objects: objects.length > 0 ? objects : undefined,
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Public API                                                           *
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Classify every statement in `sql`. Returns one entry per statement.
 */
export function analyze(sql: string): AnalyzedStatement[] {
  return splitStatements(sql).map(classifyOne)
}

/** Convenience: classify a single statement. */
export function analyzeOne(stmt: string): AnalyzedStatement {
  return classifyOne(stmt)
}

/**
 * Map an estimated ratio to a coarse impact bucket. Mirrors §6.4 thresholds.
 */
export function ratioToImpact(ratio: number | undefined): EstimatedImpact {
  if (ratio === undefined) return 'medium'
  if (ratio >= 0.5) return 'large'
  if (ratio >= 0.1) return 'medium'
  return 'small'
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Affected-ratio estimation (RESEARCH §6.4)                           *
 * ──────────────────────────────────────────────────────────────────── */

/** Minimal subset of the SQLiteAPI needed by `estimateAffectedRatio`. */
export interface SQLiteForEstimate {
  exec(sql: string): Promise<number>
  execWithParams(sql: string, params?: unknown[]): Promise<{
    rows: unknown[][]
    columns: string[]
  }>
  errmsg(db: number): string
}

/**
 * Three-level estimation of the fraction of rows a DML statement affects.
 *
 *   Level 0 (free): no `WHERE` → ratio is `1.0`.
 *   Level 1 (cheap): `EXPLAIN QUERY PLAN` → full SCAN implies `0.6`,
 *                    index SEARCH implies `0.1`.
 *   Level 2 (expensive): `SELECT COUNT(*) WHERE …` when the target table
 *                    has <10 000 rows. Otherwise the conservative `0.5`
 *                    default is used.
 *
 * The signature only requires the small subset of the SQLiteAPI we use,
 * so the function is trivially mockable in unit tests.
 */
export async function estimateAffectedRatio(
  sql: string,
  api: SQLiteForEstimate,
  _db: number,
): Promise<number> {
  // Level 0 — no WHERE → everything.
  if (!hasWhereClause(sql)) return 1.0

  // Extract the first table the statement references; `UPDATE` and
  // `DELETE FROM` both put the table name right after the keyword.
  const tableMatch = sql.match(
    /\b(?:from|update|into|table)\s+["'`]?([A-Za-z_][A-Za-z0-9_]*)/i,
  )
  const table = tableMatch?.[1]

  // Level 1 — EXPLAIN QUERY PLAN.
  try {
    const plan = await api.execWithParams(
      `EXPLAIN QUERY PLAN ${sql}`,
    )
    const text = plan.rows.map((r) => String(r[3] ?? '')).join('\n').toUpperCase()
    if (/SCAN\s+\S+/i.test(text) && !/USING\s+INDEX/i.test(text)) {
      return 0.6
    }
    if (/USING\s+(?:INDEX|ROWID|INTEGER PRIMARY KEY|PRIMARY KEY)/i.test(text)) {
      return 0.1
    }
  } catch {
    // EXPLAIN failed — fall through to default.
  }

  // Level 2 — COUNT(*) for small tables.
  if (table) {
    try {
      const count = await api.execWithParams(
        `SELECT (SELECT COUNT(*) FROM "${table.replace(/"/g, '""')}") AS n, ` +
          `(SELECT COUNT(*) FROM "${table.replace(/"/g, '""')}" WHERE ` +
          // Strip the leading keyword so we can use the WHERE portion.
          // For UPDATE / DELETE the WHERE clause is what we want.
          extractWhereClause(sql) +
          ') AS m',
      )
      const total = Number(count.rows[0]?.[0] ?? 0)
      const matched = Number(count.rows[0]?.[1] ?? 0)
      if (Number.isFinite(total) && total > 0 && total < 10_000) {
        return Math.max(0, Math.min(1, matched / total))
      }
    } catch {
      // ignore — fall through
    }
  }

  // Default — conservative medium.
  return 0.5
}

function extractWhereClause(sql: string): string {
  // Take the substring after the first unquoted WHERE at paren-depth 0.
  const lower = sql.toLowerCase()
  let i = 0
  let inSingle = false
  let inDouble = false
  let parenDepth = 0
  while (i < lower.length) {
    const ch = lower[i]!
    const next = lower[i + 1]
    if (inSingle) {
      if (ch === "'" && next === "'") { i += 2; continue }
      if (ch === "'") inSingle = false
      i++; continue
    }
    if (inDouble) {
      if (ch === '"' && next === '"') { i += 2; continue }
      if (ch === '"') inDouble = false
      i++; continue
    }
    if (ch === "'") { inSingle = true; i++; continue }
    if (ch === '"') { inDouble = true; i++; continue }
    if (ch === '(') { parenDepth++; i++; continue }
    if (ch === ')') { parenDepth = Math.max(0, parenDepth - 1); i++; continue }
    if (parenDepth === 0 && ch === 'w' && lower.slice(i, i + 5) === 'where') {
      const before = i === 0 ? ' ' : lower[i - 1]!
      const after = lower[i + 5] ?? ' '
      if (!/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after)) {
        // Take the rest of the string up to `;` or end.
        let j = i + 5
        let d = 0
        while (j < sql.length) {
          const c = sql[j]!
          if (c === '(') d++
          else if (c === ')') d = Math.max(0, d - 1)
          else if (c === ';' && d === 0) break
          j++
        }
        return sql.slice(i + 5, j).trim() || '1=1'
      }
    }
    i++
  }
  // No WHERE — this branch shouldn't be reached because Level 0 returns
  // early, but stay safe.
  return '1=1'
}
