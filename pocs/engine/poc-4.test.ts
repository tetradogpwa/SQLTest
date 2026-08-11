// Vitest wrapper for POC-4.

import { describe, it, expect } from 'vitest'
import { runPoc4 } from './poc-4-worker-recreate.ts'

describe('POC-4: Worker recreation', () => {
  it('survives a worker death and reopens the DB from disk', async () => {
    const result = await runPoc4()
    expect(result.id).toBe('POC-4')

    // Either VIABLE or REQUIERE_CAMBIO_API
    expect(['VIABLE', 'REQUIERE_CAMBIO_API']).toContain(result.verdict)

    // The data-survives check must be OK
    const dataFinding = result.findings.find((f) => f.check.includes('data survives'))
    expect(dataFinding?.result).toBe('OK')

    // The snapshot-accessible check must be OK
    const snapFinding = result.findings.find((f) => f.check.includes('open pre-death snapshot'))
    expect(snapFinding?.result).toBe('OK')

    // The reopen check must be OK
    const reopenFinding = result.findings.find((f) => f.check.includes('worker #2 reopen DB'))
    expect(reopenFinding?.result).toBe('OK')
  }, 60_000)
})
