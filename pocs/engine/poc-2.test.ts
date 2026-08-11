// Vitest wrapper for POC-2.

import { describe, it, expect } from 'vitest'
import { runPoc2 } from './poc-2-interrupt.ts'

describe('POC-2: progress_handler + interrupt', () => {
  it('interrupts a long query within 500ms and returns SQLITE_INTERRUPT', async () => {
    const result = await runPoc2()
    expect(result.id).toBe('POC-2')
    expect(['VIABLE', 'NECESITA_AJUSTE_VMSTEPS', 'REQUIERE_CAMBIO_API']).toContain(result.verdict)

    // The "query con progress_handler" finding must say rc=9 (SQLITE_INTERRUPT)
    const handlerFinding = result.findings.find((f) => f.check.includes('query con progress_handler'))
    expect(handlerFinding).toBeDefined()
    expect(handlerFinding?.result).toBe('OK')

    // The "tiempo query con handler < 500ms" finding must be OK
    const timeFinding = result.findings.find((f) => f.check.includes('tiempo query con handler'))
    expect(timeFinding).toBeDefined()
    expect(timeFinding?.result).toBe('OK')
  }, 60_000)
})
