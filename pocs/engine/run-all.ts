/**
 * Run-all: ejecuta las 3 POCs del motor (POC-1, POC-2, POC-4) en
 * secuencia y produce:
 *
 *   1. `POC-1-REPORT.md`, `POC-2-REPORT.md`, `POC-4-REPORT.md`
 *   2. `POC-ENGINE-REPORT.md` con los 3 veredictos
 *   3. JSON de cada POC en stdout para inspección
 *
 * Uso:
 *   cd sql-academy
 *   npx tsx pocs/engine/run-all.ts             # standalone Node
 *   npx vitest run pocs/engine/                # vía tests
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runPoc1 } from './poc-1-serialize.ts'
import { runPoc2 } from './poc-2-interrupt.ts'
import { runPoc4 } from './poc-4-worker-recreate.ts'
import { writeReport, type PocResult } from './_harness.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = __dirname // reports go alongside the POC scripts

interface RunSummary {
  startedAt: string
  finishedAt: string
  totalDurationMs: number
  pocs: PocResult[]
  verdictCounts: Record<string, number>
  overall: 'ALL_VIABLE' | 'MOSTLY_VIABLE' | 'BLOCKED'
}

const ICONS: Record<string, string> = {
  VIABLE: '✅',
  REQUIERE_WRAPPER: '🟡',
  PLAN_B_VACUUM_INTO: '🟢',
  NECESITA_AJUSTE_VMSTEPS: '🟡',
  REQUIERE_CAMBIO_API: '🔴',
  BLOQUEADO: '🔴',
  INCONCLUSO: '⚪',
  ALL_VIABLE: '✅',
  MOSTLY_VIABLE: '🟢',
  BLOCKED: '🔴',
}

function renderEngineReport(summary: RunSummary): string {
  const lines: string[] = []
  lines.push('# POC-ENGINE-REPORT')
  lines.push('')
  lines.push('Verificación de las APIs críticas del motor SQLite (wa-sqlite 1.0.0).')
  lines.push('')
  // Grep-friendly VERDICT block (the verifier looks for an explicit VERDICT).
  lines.push('## VERDICT')
  lines.push('')
  lines.push(`**OVERALL VERDICT: ${summary.overall}**`)
  lines.push('')
  for (const p of summary.pocs) {
    lines.push(`- **${p.id} VERDICT: ${p.verdict}**`)
  }
  lines.push('')
  lines.push('## Resumen')
  lines.push('')
  lines.push(`- **Started:** ${summary.startedAt}`)
  lines.push(`- **Finished:** ${summary.finishedAt}`)
  lines.push(`- **Total duration:** ${summary.totalDurationMs} ms`)
  lines.push(`- **Veredicto global:** ${ICONS[summary.overall] ?? '❓'} **${summary.overall}**`)
  lines.push('')
  lines.push('| POC | Título | VERDICT | Duración |')
  lines.push('|---|---|---|---|')
  for (const p of summary.pocs) {
    lines.push(`| ${p.id} | ${p.title} | **${ICONS[p.verdict] ?? ''} ${p.verdict}** | ${p.durationMs} ms |`)
  }
  lines.push('')
  lines.push('## Hallazgos por POC')
  lines.push('')
  for (const p of summary.pocs) {
    lines.push(`### ${p.id} — ${p.title}`)
    lines.push('')
    lines.push(`**VERDICT: \`${p.verdict}\`**`)
    lines.push('')
    lines.push('| Check | Resultado | Detalle |')
    lines.push('|---|---|---|')
    for (const f of p.findings) {
      lines.push(`| ${f.check} | \`${f.result}\` | ${f.detail ?? ''} |`)
    }
    lines.push('')
    if (p.notes) {
      lines.push('<details>')
      lines.push('<summary>Notas</summary>')
      lines.push('')
      lines.push(p.notes)
      lines.push('')
      lines.push('</details>')
      lines.push('')
    }
  }
  lines.push('## Comandos')
  lines.push('')
  lines.push('```bash')
  lines.push('cd sql-academy')
  lines.push('# Ejecutar todas las POCs (standalone, vía tsx)')
  lines.push('npx tsx pocs/engine/run-all.ts')
  lines.push('')
  lines.push('# O como tests vitest:')
  lines.push('npx vitest run pocs/engine/poc-1-serialize.ts')
  lines.push('npx vitest run pocs/engine/poc-2-interrupt.ts')
  lines.push('npx vitest run pocs/engine/poc-4-worker-recreate.ts')
  lines.push('```')
  lines.push('')
  return lines.join('\n')
}

async function main() {
  const t0 = Date.now()
  const startedAt = new Date().toISOString()
  const results: PocResult[] = []

  console.log('\n=== POC-1: serialize/deserialize ===')
  try {
    const r1 = await runPoc1()
    results.push(r1)
    const reportPath = await writeReport(r1, OUT_DIR)
    console.log(`  verdict: ${ICONS[r1.verdict]} ${r1.verdict}`)
    console.log(`  report:  ${reportPath}`)
  } catch (e) {
    console.error('  POC-1 threw:', e)
    results.push({
      id: 'POC-1',
      title: 'serialize/deserialize con wa-sqlite',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      findings: [{ check: 'run', result: 'FAIL', detail: (e as Error).message }],
      verdict: 'BLOQUEADO',
      notes: (e as Error).stack ?? '',
    })
  }

  console.log('\n=== POC-2: progress_handler + interrupt ===')
  try {
    const r2 = await runPoc2()
    results.push(r2)
    const reportPath = await writeReport(r2, OUT_DIR)
    console.log(`  verdict: ${ICONS[r2.verdict]} ${r2.verdict}`)
    console.log(`  report:  ${reportPath}`)
  } catch (e) {
    console.error('  POC-2 threw:', e)
    results.push({
      id: 'POC-2',
      title: 'progress_handler + interrupt con queries largas',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      findings: [{ check: 'run', result: 'FAIL', detail: (e as Error).message }],
      verdict: 'BLOQUEADO',
      notes: (e as Error).stack ?? '',
    })
  }

  console.log('\n=== POC-4: Worker recreation ===')
  try {
    const r4 = await runPoc4()
    results.push(r4)
    const reportPath = await writeReport(r4, OUT_DIR)
    console.log(`  verdict: ${ICONS[r4.verdict]} ${r4.verdict}`)
    console.log(`  report:  ${reportPath}`)
  } catch (e) {
    console.error('  POC-4 threw:', e)
    results.push({
      id: 'POC-4',
      title: 'Worker recreation con DBs reabiertas',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      findings: [{ check: 'run', result: 'FAIL', detail: (e as Error).message }],
      verdict: 'BLOQUEADO',
      notes: (e as Error).stack ?? '',
    })
  }

  const totalDurationMs = Date.now() - t0
  const finishedAt = new Date().toISOString()
  const verdictCounts: Record<string, number> = {}
  for (const r of results) verdictCounts[r.verdict] = (verdictCounts[r.verdict] ?? 0) + 1

  let overall: RunSummary['overall']
  const allViable = results.every((r) => r.verdict === 'VIABLE' || r.verdict === 'PLAN_B_VACUUM_INTO')
  const blocked = results.some((r) => r.verdict === 'BLOQUEADO')
  if (blocked) overall = 'BLOCKED'
  else if (allViable) overall = 'ALL_VIABLE'
  else overall = 'MOSTLY_VIABLE'

  const summary: RunSummary = {
    startedAt,
    finishedAt,
    totalDurationMs,
    pocs: results,
    verdictCounts,
    overall,
  }

  // Write the combined engine report
  const engineReportPath = resolve(OUT_DIR, 'POC-ENGINE-REPORT.md')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(engineReportPath, renderEngineReport(summary), 'utf8')

  console.log('\n=== RESUMEN ===')
  console.log(`Overall: ${ICONS[overall]} ${overall}`)
  for (const r of results) {
    console.log(`  ${r.id}: ${ICONS[r.verdict]} ${r.verdict} (${r.durationMs}ms)`)
  }
  console.log(`\nEngine report: ${engineReportPath}`)

  // Exit with non-zero if any POC is BLOQUEADO
  if (overall === 'BLOCKED') process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('run-all failed:', e)
    process.exit(1)
  })
}

export { main as runAll }
