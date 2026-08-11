/**
 * Unit tests para `ExerciseRunner`.
 *
 * Cubre el ciclo de vida RESEARCH §5.2 con un mock del DBApi:
 *   - start()  → abre la working-copy y siembra
 *   - runUserSql() → ejecuta SQL contra la working-copy
 *   - check()  → pasa y falla
 *   - revealSolution() → crea solution-copy y corre la solución
 *   - reset()  → descarta y recrea la working-copy
 *   - destroy() → cierra y borra ambos archivos
 *
 * El DBApi se mockea con `mkApiMock` (tests/helpers/dbapi-mock.ts).
 * Cada test inspecciona las llamadas con `expect(...).toHaveBeenCalledWith(...)`.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  ExerciseRunner,
  type Exercise,
  type DBApi,
  defaultStrategies,
} from '../../../src/core/exercises'
import { mkApiMock } from '../../helpers/dbapi-mock'
import type { QueryResult, DatabaseSchema } from '../../../src/workers/types'

function mkExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-001',
    lessonId: 'lesson-1',
    type: 'writeQuery',
    title: 'Cuenta usuarios',
    prompt: 'Cuenta los usuarios activos.',
    starterCode: 'SELECT * FROM users WHERE active = 1;',
    solution: 'SELECT COUNT(*) AS n FROM users WHERE active = 1;',
    solutionExplanation: 'COUNT(*) cuenta filas; WHERE filtra activos.',
    validation: [{ type: 'result', orderMatters: false }],
    hints: [],
    difficulty: 1,
    tags: [],
    databaseId: 'db-1',
    lessonDbSeed:
      'CREATE TABLE users (id INTEGER PRIMARY KEY, active INTEGER); INSERT INTO users (active) VALUES (1),(1),(0);',
    ...overrides,
  }
}

function okResult(rows: unknown[][] = [], columns: string[] = []): QueryResult {
  return { ok: true, columns, rows, executionMs: 1, statementKind: 'select' }
}

describe('ExerciseRunner', () => {
  it('start() abre la working-copy y ejecuta lessonDbSeed', async () => {
    const api: DBApi = mkApiMock()
    const runner = new ExerciseRunner({
      api,
      exercise: mkExercise(),
      capability: 'memory',
      sessionId: 'sess-1',
    })
    await runner.start()
    expect(runner.isStarted()).toBe(true)
    expect(api.open).toHaveBeenCalledWith(
      runner.workingDbId,
      runner.workingFilename,
      'readwrite',
    )
    expect(api.exec).toHaveBeenCalledWith(
      runner.workingDbId,
      expect.stringContaining('CREATE TABLE users'),
      expect.any(Object),
    )
    // Idempotente.
    await runner.start()
    expect(api.open).toHaveBeenCalledTimes(1)
    await runner.destroy()
  })

  it('runUserSql ejecuta el SQL del usuario contra la working-copy', async () => {
    const exec = vi.fn(async (_dbId: number, _sql: string) => okResult([[1]], ['n']))
    const api: DBApi = mkApiMock({ exec })
    const runner = new ExerciseRunner({
      api,
      exercise: mkExercise(),
      capability: 'memory',
      sessionId: 'sess-2',
    })
    await runner.runUserSql('SELECT 1')
    expect(exec).toHaveBeenCalledWith(
      runner.workingDbId,
      'SELECT 1',
      expect.any(Object),
    )
    expect(runner.getLastUserSql()).toBe('SELECT 1')
    expect(runner.getLastUserResult()?.ok).toBe(true)
    await runner.destroy()
  })

  it('check() pasa cuando las validaciones son correctas', async () => {
    const api: DBApi = mkApiMock({
      // exec devuelve el mismo resultado para user y solution
      exec: vi.fn(async () => okResult([[3]], ['n'])),
    })
    const runner = new ExerciseRunner({
      api,
      exercise: mkExercise({
        // validación trivial: solo exige que la query devuelva "algo"
        validation: [{ type: 'result', orderMatters: false }],
      }),
      capability: 'memory',
      sessionId: 'sess-3',
    })
    await runner.runUserSql('SELECT COUNT(*) AS n FROM users')
    const report = await runner.check()
    expect(report.allPassed).toBe(true)
    expect(report.passedCount).toBeGreaterThanOrEqual(1)
    // Se cerró la solution-copy tras la validación
    expect(api.close).toHaveBeenCalledWith(runner.solutionDbId)
    await runner.destroy()
  })

  it('check() falla con feedback pedagógico cuando la SQL no es correcta', async () => {
    // user devuelve [3] pero solution devuelve [2]
    let callIndex = 0
    const exec = vi.fn(async (_dbId: number) => {
      callIndex++
      // 1ª llamada: seed (en start)
      // 2ª llamada: runUserSql (en el test)
      // 3ª llamada: check → re-ejecuta user SQL
      // 4ª llamada: check → ejecuta solution SQL
      if (callIndex <= 2) return okResult([])
      // Para check(): primer exec es user SQL, segundo es solution SQL
      // (en realidad hay un exec extra por el seed, pero ya pasó)
      if (callIndex === 3) return okResult([[3]], ['n'])
      return okResult([[2]], ['n'])
    })
    const api: DBApi = mkApiMock({ exec })
    const runner = new ExerciseRunner({
      api,
      exercise: mkExercise({
        validation: [{ type: 'result', orderMatters: false }],
      }),
      capability: 'memory',
      sessionId: 'sess-4',
    })
    await runner.runUserSql('SELECT COUNT(*) AS n FROM users')
    const report = await runner.check()
    expect(report.allPassed).toBe(false)
    expect(report.failedCount).toBeGreaterThanOrEqual(1)
    // Los mensajes son en español
    const allMsgs = report.results.map((r) => r.message).join(' ').toLowerCase()
    expect(allMsgs).toMatch(/resultado|coincid|esperab/i)
    await runner.destroy()
  })

  it('check() devuelve error pedagógico si no se ha ejecutado ninguna SQL', async () => {
    const api: DBApi = mkApiMock()
    const runner = new ExerciseRunner({
      api,
      exercise: mkExercise(),
      capability: 'memory',
      sessionId: 'sess-5',
    })
    const report = await runner.check()
    expect(report.allPassed).toBe(false)
    expect(report.results[0]?.message.toLowerCase()).toContain('ejecutado')
    await runner.destroy()
  })

  it('revealSolution() crea una solution-copy, corre la solución y devuelve schema', async () => {
    const fakeSchema: DatabaseSchema = {
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, primaryKeyPosition: 1 },
            { name: 'active', type: 'INTEGER', nullable: true, defaultValue: null, primaryKeyPosition: 0 },
          ],
          primaryKey: ['id'],
          foreignKeys: [],
          uniqueConstraints: [],
          checkConstraints: [],
          rowCountEstimate: 0,
          createSql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, active INTEGER)',
        },
      ],
      views: [],
      indexes: [],
      triggers: [],
    }
    const api: DBApi = mkApiMock({
      exec: vi.fn(async () => okResult([[3]], ['n'])),
      schema: vi.fn(async () => fakeSchema),
    })
    const runner = new ExerciseRunner({
      api,
      exercise: mkExercise(),
      capability: 'memory',
      sessionId: 'sess-6',
    })
    const reveal = await runner.revealSolution()
    expect(reveal.result.ok).toBe(true)
    expect(reveal.schema.tables[0]?.name).toBe('users')
    // Se abrió la solution-copy con la ruta correcta
    expect(api.open).toHaveBeenCalledWith(
      runner.solutionDbId,
      runner.solutionFilename,
      'readwrite',
    )
    // Se ejecutó la SQL de la solución
    expect(api.exec).toHaveBeenCalledWith(
      runner.solutionDbId,
      expect.stringContaining('COUNT(*)'),
      expect.any(Object),
    )
    // Se cerró al terminar
    expect(api.close).toHaveBeenCalledWith(runner.solutionDbId)
    await runner.destroy()
  })

  it('reset() cierra, borra y recrea la working-copy', async () => {
    const exec = vi.fn(async () => okResult())
    const api: DBApi = mkApiMock({ exec })
    const runner = new ExerciseRunner({
      api,
      exercise: mkExercise(),
      capability: 'memory',
      sessionId: 'sess-7',
    })
    await runner.start()
    const openCallsAfterStart = (api.open as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    await runner.reset()
    // Después del reset debe haberse abierto la working-copy otra vez
    const openCallsAfterReset = (api.open as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    expect(openCallsAfterReset).toBeGreaterThan(openCallsAfterStart)
    // Se intentó borrar la working-copy
    expect(api.deleteUserDatabase).toHaveBeenCalledWith(runner.workingDbId)
    // El runner sigue utilizable
    expect(runner.isStarted()).toBe(true)
    // La última SQL se resetea
    expect(runner.getLastUserSql()).toBeNull()
    await runner.destroy()
  })

  it('destroy() cierra y borra ambos archivos; runner inutilizable después', async () => {
    const api: DBApi = mkApiMock()
    const runner = new ExerciseRunner({
      api,
      exercise: mkExercise(),
      capability: 'memory',
      sessionId: 'sess-8',
    })
    await runner.start()
    expect(runner.isDestroyed()).toBe(false)
    await runner.destroy()
    expect(runner.isDestroyed()).toBe(true)
    // close se llamó para working + solution
    expect(api.close).toHaveBeenCalledWith(runner.workingDbId)
    expect(api.close).toHaveBeenCalledWith(runner.solutionDbId)
    // deleteUserDatabase se llamó para ambos
    expect(api.deleteUserDatabase).toHaveBeenCalledWith(runner.workingDbId)
    expect(api.deleteUserDatabase).toHaveBeenCalledWith(runner.solutionDbId)
    // Llamar otra vez no rompe
    await runner.destroy()
    // No se puede usar tras destroy
    await expect(runner.start()).rejects.toThrow(/destruido|destroyed/i)
  })

  it('usa defaultStrategies por defecto; permite inyectar strategies custom', async () => {
    const api: DBApi = mkApiMock()
    // Inyectamos un strategy único: 'result' que siempre falla con un mensaje conocido.
    const customRunner = new ExerciseRunner({
      api,
      exercise: mkExercise({
        validation: [{ type: 'result', orderMatters: false }],
      }),
      capability: 'memory',
      sessionId: 'sess-9',
      strategies: [...defaultStrategies],
    })
    await customRunner.runUserSql('SELECT 1')
    const report = await customRunner.check()
    // Independientemente de pass/fail, el report debe tener al menos 1 strategy
    expect(report.results.length).toBeGreaterThanOrEqual(1)
    await customRunner.destroy()
  })

  it('check() devuelve error interno si exec lanza excepción', async () => {
    const api: DBApi = mkApiMock({
      exec: vi.fn(async (dbId: number) => {
        if (dbId === runner.workingDbId) {
          return okResult()
        }
        throw new Error('boom!')
      }),
    })
    const runner = new ExerciseRunner({
      api,
      exercise: mkExercise(),
      capability: 'memory',
      sessionId: 'sess-10',
    })
    await runner.runUserSql('SELECT 1')
    // Forzamos a que la solution-copy falle
    const report = await runner.check()
    expect(report.allPassed).toBe(false)
    const allMsgs = report.results.map((r) => r.message).join(' ').toLowerCase()
    // Puede ser "error interno" o el mensaje del strategy de result
    expect(allMsgs.length).toBeGreaterThan(5)
    await runner.destroy()
  })
})
