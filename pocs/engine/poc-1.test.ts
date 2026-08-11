// Vitest wrapper for POC-1.
// `poc-1-serialize.ts` exports `runPoc1()` which we invoke here so
// vitest can report pass/fail. The detailed report is in
// `POC-1-REPORT.md` next to this file.

import { describe, it, expect } from 'vitest'
import { runPoc1 } from './poc-1-serialize.ts'

describe('POC-1: serialize/deserialize', () => {
  it('runs and produces a verdict', async () => {
    const result = await runPoc1()
    expect(result.id).toBe('POC-1')
    expect(['VIABLE', 'PLAN_B_VACUUM_INTO', 'REQUIERE_WRAPPER']).toContain(result.verdict)
    expect(result.findings.length).toBeGreaterThan(0)
    // At least the cwrap attempts must have completed (failed or not)
    const hasSerialize = result.findings.some((f) => f.check.includes('sqlite3_serialize'))
    const hasDeserialize = result.findings.some((f) => f.check.includes('sqlite3_deserialize'))
    const hasVacuum = result.findings.some((f) => f.check.includes('VACUUM INTO'))
    expect(hasSerialize).toBe(true)
    expect(hasDeserialize).toBe(true)
    expect(hasVacuum).toBe(true)
  }, 60_000)
})
