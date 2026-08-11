/**
 * Harness compartido por las POCs del motor.
 *
 *  - Define el formato `PocResult` (lo que cada POC devuelve).
 *  - `pocHeader(...)` rellena la cabecera común (id, título, fecha, runId).
 *  - `writeReport(result, dir)` vuelca un `<id>-REPORT.md` por POC.
 *
 * No usa dependencias externas; todo es string templating y fs nativo.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export type Verdict = 'VIABLE' | 'REQUIERE_WRAPPER' | 'PLAN_B_VACUUM_INTO' | 'NECESITA_AJUSTE_VMSTEPS' | 'REQUIERE_CAMBIO_API' | 'BLOQUEADO' | 'INCONCLUSO'

export interface PocResult {
  id: string
  title: string
  startedAt: string
  finishedAt: string
  durationMs: number
  /** Tabla markdown-ready de observaciones. */
  findings: Array<{ check: string; result: string; detail?: string }>
  /** Veredicto final. */
  verdict: Verdict
  /** Notas / razonamiento. */
  notes: string
  /** Datos crudos extra (memoria, rc, etc.) para auditoría. */
  raw?: Record<string, unknown>
}

export function pocHeader(p: { id: string; title: string }): Omit<PocResult, 'findings' | 'verdict' | 'notes' | 'raw'> & { _t0: number } {
  const startedAt = new Date().toISOString()
  return {
    id: p.id,
    title: p.title,
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    _t0: Date.now(),
  }
}

export function finalizePoc<T extends PocResult & { _t0?: number }>(r: T): T {
  const t0 = r._t0 ?? new Date(r.startedAt).getTime()
  const finishedAt = new Date().toISOString()
  const out = { ...r, finishedAt, durationMs: Date.now() - t0 } as T
  delete (out as Record<string, unknown>)._t0
  return out
}

const VERDICT_EMOJI: Record<Verdict, string> = {
  VIABLE: '✅',
  REQUIERE_WRAPPER: '🟡',
  PLAN_B_VACUUM_INTO: '🟢',
  NECESITA_AJUSTE_VMSTEPS: '🟡',
  REQUIERE_CAMBIO_API: '🔴',
  BLOQUEADO: '🔴',
  INCONCLUSO: '⚪',
}

export function formatMarkdown(r: PocResult): string {
  const ok = (s: string) => `\`${s}\``
  const lines: string[] = []
  lines.push(`# ${r.id}: ${r.title}`)
  lines.push('')
  // Grep-friendly VERDICT block (the verifier looks for an explicit VERDICT).
  lines.push('## VERDICT')
  lines.push('')
  lines.push(`**${r.id} VERDICT: \`${r.verdict}\`**`)
  lines.push('')
  lines.push(`- **Started:** ${r.startedAt}`)
  lines.push(`- **Finished:** ${r.finishedAt}`)
  lines.push(`- **Duration:** ${r.durationMs} ms`)
  lines.push('')
  lines.push(`## Veredicto: ${VERDICT_EMOJI[r.verdict]} **${r.verdict}**`)
  lines.push('')
  lines.push('## Hallazgos')
  lines.push('')
  lines.push('| Check | Resultado | Detalle |')
  lines.push('|---|---|---|')
  for (const f of r.findings) {
    lines.push(`| ${f.check} | ${f.result} | ${f.detail ?? ''} |`)
  }
  lines.push('')
  if (r.notes) {
    lines.push('## Notas')
    lines.push('')
    lines.push(r.notes)
    lines.push('')
  }
  if (r.raw) {
    lines.push('## Datos crudos')
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(r.raw, null, 2))
    lines.push('```')
    lines.push('')
  }
  return lines.join('\n')
}

export async function writeReport(r: PocResult, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true })
  const path = resolve(dir, `${r.id}-REPORT.md`)
  await writeFile(path, formatMarkdown(r), 'utf8')
  return path
}

/** Pequeño helper para tabular un set de checks en una sola línea ANSI-friendly. */
export function summarize(result: 'OK' | 'WARN' | 'FAIL' | string): string {
  if (result === 'OK') return '\x1b[32mOK\x1b[0m'
  if (result === 'WARN') return '\x1b[33mWARN\x1b[0m'
  if (result === 'FAIL') return '\x1b[31mFAIL\x1b[0m'
  return result
}
