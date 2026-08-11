/**
 * Unit tests para los 10 strategies (RESEARCH §10.6).
 *
 * Patrón: se mockea el DBAPI con `vi.fn()` que devuelve datos canned.
 * Al menos 3 tests por strategy, total ≥ 30.
 */

import { describe, it, expect, beforeEach } from 'vitest'

import {
  ResultStrategy,
  DatabaseStateStrategy,
  SchemaStrategy,
  RowCountStrategy,
  RowExistsStrategy,
  TableExistsStrategy,
  ConstraintStrategy,
  KeywordUsageStrategy,
  JoinUsageStrategy,
  InvariantStrategy,
  QueryPlanStrategy,
  CustomStrategy,
  type DBApi,
  type ValidationContext,
  type DatabaseSchema,
  type TableInfo,
} from '../../../src/core/exercises'
import { mkApiMock } from '../../helpers/dbapi-mock'

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers                                                              *
 * ──────────────────────────────────────────────────────────────────── */

const emptySchema: DatabaseSchema = { tables: [], views: [], indexes: [], triggers: [] }

function stubTable(name: string): TableInfo {
  return {
    name,
    columns: [],
    primaryKey: [],
    foreignKeys: [],
    uniqueConstraints: [],
    checkConstraints: [],
    rowCountEstimate: 0,
    createSql: '',
  }
}

function mkCtx(overrides: Partial<ValidationContext> = {}): ValidationContext {
  const api: DBApi = mkApiMock()
  return {
    api,
    dbId: 1,
    userSql: 'SELECT 1',
    solutionSql: 'SELECT 1',
    userResult: { ok: true, columns: ['a'], rows: [[1]], executionMs: 0, statementKind: 'select' },
    solutionResult: { ok: true, columns: ['a'], rows: [[1]], executionMs: 0, statementKind: 'select' },
    userSchema: emptySchema,
    solutionSchema: emptySchema,
    capability: 'memory',
    hintsRevealed: 0,
    ...overrides,
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  ResultStrategy                                                       *
 * ──────────────────────────────────────────────────────────────────── */

describe('ResultStrategy', () => {
  let s: ResultStrategy
  beforeEach(() => {
    s = new ResultStrategy()
  })
  it('passa cuando los resultados son iguales', async () => {
    const ctx = mkCtx()
    const r = await s.apply(ctx, { type: 'result', orderMatters: true })
    expect(r.passed).toBe(true)
    expect(r.message).toMatch(/correcto/i)
    expect(r.strategyType).toBe('result')
  })
  it('falla cuando el resultado del usuario es distinto', async () => {
    const ctx = mkCtx({
      userResult: { ok: true, columns: ['a'], rows: [[2]], executionMs: 0, statementKind: 'select' },
    })
    const r = await s.apply(ctx, { type: 'result', orderMatters: true })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/no coincide/i)
  })
  it('reporta error pedagógico si la query del usuario falló', async () => {
    const ctx = mkCtx({
      userResult: {
        ok: false,
        error: { code: 'SQLITE_ERROR', message: 'syntax error', translatedMessage: 'error de sintaxis' },
        executionMs: 0,
        statementKind: 'select',
      },
    })
    const r = await s.apply(ctx, { type: 'result', orderMatters: true })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/no se pudo ejecutar/i)
    expect(r.suggestions).toBeDefined()
  })
  it('acepta alias de columna en el resultado', async () => {
    const ctx = mkCtx({
      userResult: { ok: true, columns: ['full_name'], rows: [['Ana']], executionMs: 0, statementKind: 'select' },
      solutionResult: { ok: true, columns: ['name'], rows: [['Ana']], executionMs: 0, statementKind: 'select' },
    })
    const r = await s.apply(ctx, {
      type: 'result',
      orderMatters: true,
      columnAliases: { name: 'full_name' },
    })
    expect(r.passed).toBe(true)
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  DatabaseStateStrategy                                                *
 * ──────────────────────────────────────────────────────────────────── */

describe('DatabaseStateStrategy', () => {
  let s: DatabaseStateStrategy
  beforeEach(() => {
    s = new DatabaseStateStrategy()
  })
  it('passa si todos los checks devuelven el valor esperado (number)', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: true, columns: ['n'], rows: [[5]], executionMs: 0, statementKind: 'select' }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'dbState',
      description: 'debe haber 5 filas',
      checks: [{ sql: 'SELECT COUNT(*) FROM t', expected: 5 }],
    })
    expect(r.passed).toBe(true)
  })
  it('falla si el conteo no coincide', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: true, columns: ['n'], rows: [[3]], executionMs: 0, statementKind: 'select' }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'dbState',
      description: '5 filas',
      checks: [{ sql: 'SELECT COUNT(*) FROM t', expected: 5 }],
    })
    expect(r.passed).toBe(false)
    expect(r.details).toMatch(/esperaba 5/)
  })
  it('falla si la consulta del check da error', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: false, error: { code: 'X', message: 'boom', translatedMessage: 'boom' }, executionMs: 0, statementKind: 'select' }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'dbState',
      description: 'X',
      checks: [{ sql: 'SELECT bogus', expected: 0 }],
    })
    expect(r.passed).toBe(false)
    expect(r.details).toMatch(/falló/)
  })
  it('compara contra expected boolean', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: true, columns: ['x'], rows: [[1]], executionMs: 0, statementKind: 'select' }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'dbState',
      description: 'boolean',
      checks: [{ sql: 'SELECT 1', expected: true }],
    })
    expect(r.passed).toBe(true)
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  SchemaStrategy                                                       *
 * ──────────────────────────────────────────────────────────────────── */

describe('SchemaStrategy', () => {
  let s: SchemaStrategy
  beforeEach(() => {
    s = new SchemaStrategy()
  })
  const usersTable: TableInfo = {
    name: 'users',
    columns: [
      { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, primaryKeyPosition: 1 },
      { name: 'email', type: 'TEXT', nullable: false, defaultValue: null, primaryKeyPosition: 0 },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    uniqueConstraints: [['email']],
    checkConstraints: [],
    rowCountEstimate: 0,
    createSql: 'CREATE TABLE users (...)',
  }
  it('passa si las columnas coinciden', async () => {
    const api: DBApi = mkApiMock({
      schema: async () => ({ ...emptySchema, tables: [usersTable] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'schema',
      table: 'users',
      expectedColumns: [
        { name: 'id', type: 'INTEGER', nullable: false, primaryKeyPosition: 1 },
        { name: 'email', type: 'TEXT', nullable: false },
      ],
      expectedPrimaryKey: ['id'],
    })
    expect(r.passed).toBe(true)
  })
  it('falla si la tabla no existe', async () => {
    const ctx = mkCtx()
    const r = await s.apply(ctx, {
      type: 'schema',
      table: 'missing',
      expectedColumns: [],
    })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/no existe/i)
  })
  it('falla si faltan columnas', async () => {
    const api: DBApi = mkApiMock({
      schema: async () => ({ ...emptySchema, tables: [usersTable] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'schema',
      table: 'users',
      expectedColumns: [
        { name: 'id', type: 'INTEGER', nullable: false },
        { name: 'email', type: 'TEXT', nullable: false },
        { name: 'name', type: 'TEXT', nullable: true },
      ],
    })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/faltan columnas/i)
  })
  it('falla si la PK no coincide', async () => {
    const api: DBApi = mkApiMock({
      schema: async () => ({ ...emptySchema, tables: [usersTable] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'schema',
      table: 'users',
      expectedColumns: [
        { name: 'id', type: 'INTEGER', nullable: false },
        { name: 'email', type: 'TEXT', nullable: false },
      ],
      expectedPrimaryKey: ['email'],
    })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/clave primaria/i)
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  RowCountStrategy                                                     *
 * ──────────────────────────────────────────────────────────────────── */

describe('RowCountStrategy', () => {
  let s: RowCountStrategy
  beforeEach(() => {
    s = new RowCountStrategy()
  })
  it('passa si el conteo coincide', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: true, columns: ['n'], rows: [[10]], executionMs: 0, statementKind: 'select' }),
      schema: async () => ({ ...emptySchema, tables: [stubTable('t')] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, { type: 'rowCount', table: 't', expected: 10 })
    expect(r.passed).toBe(true)
  })
  it('falla si difiere del expected', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: true, columns: ['n'], rows: [[7]], executionMs: 0, statementKind: 'select' }),
      schema: async () => ({ ...emptySchema, tables: [stubTable('t')] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, { type: 'rowCount', table: 't', expected: 10 })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/esperaba 10/)
  })
  it('respeta la tolerancia', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: true, columns: ['n'], rows: [[12]], executionMs: 0, statementKind: 'select' }),
      schema: async () => ({ ...emptySchema, tables: [stubTable('t')] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, { type: 'rowCount', table: 't', expected: 10, tolerance: 5 })
    expect(r.passed).toBe(true)
  })
  it('falla si la tabla no existe', async () => {
    const ctx = mkCtx()
    const r = await s.apply(ctx, { type: 'rowCount', table: 'nope', expected: 0 })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/no existe/i)
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  RowExistsStrategy                                                    *
 * ──────────────────────────────────────────────────────────────────── */

describe('RowExistsStrategy', () => {
  let s: RowExistsStrategy
  beforeEach(() => {
    s = new RowExistsStrategy()
  })
  it('passa cuando hay al menos 1 fila que cumple', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: true, columns: ['n'], rows: [[1]], executionMs: 0, statementKind: 'select' }),
      schema: async () => ({ ...emptySchema, tables: [stubTable('t')] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, { type: 'rowExists', table: 't', where: 'x = 1' })
    expect(r.passed).toBe(true)
  })
  it('falla cuando no hay matches', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: true, columns: ['n'], rows: [[0]], executionMs: 0, statementKind: 'select' }),
      schema: async () => ({ ...emptySchema, tables: [stubTable('t')] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, { type: 'rowExists', table: 't', where: 'x = 1' })
    expect(r.passed).toBe(false)
  })
  it('respeta minMatches', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: true, columns: ['n'], rows: [[3]], executionMs: 0, statementKind: 'select' }),
      schema: async () => ({ ...emptySchema, tables: [stubTable('t')] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, { type: 'rowExists', table: 't', where: 'x = 1', minMatches: 5 })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/al menos 5/)
  })
  it('falla si la tabla no existe', async () => {
    const ctx = mkCtx()
    const r = await s.apply(ctx, { type: 'rowExists', table: 'nope', where: '1=1' })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/no existe/i)
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  TableExistsStrategy                                                  *
 * ──────────────────────────────────────────────────────────────────── */

describe('TableExistsStrategy', () => {
  let s: TableExistsStrategy
  beforeEach(() => {
    s = new TableExistsStrategy()
  })
  it('passa si la tabla está en el schema', async () => {
    const api: DBApi = mkApiMock({
      schema: async () => ({ ...emptySchema, tables: [stubTable('orders')] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, { type: 'tableExists', table: 'orders' })
    expect(r.passed).toBe(true)
  })
  it('falla si la tabla no está', async () => {
    const api: DBApi = mkApiMock({
      schema: async () => emptySchema,
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, { type: 'tableExists', table: 'nope' })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/no existe/i)
  })
  it('es case-insensitive en el nombre', async () => {
    const api: DBApi = mkApiMock({
      schema: async () => ({ ...emptySchema, tables: [stubTable('Orders')] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, { type: 'tableExists', table: 'orders' })
    expect(r.passed).toBe(true)
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  ConstraintStrategy                                                   *
 * ──────────────────────────────────────────────────────────────────── */

describe('ConstraintStrategy', () => {
  let s: ConstraintStrategy
  beforeEach(() => {
    s = new ConstraintStrategy()
  })
  const usersTable: TableInfo = {
    name: 'users',
    columns: [
      { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, primaryKeyPosition: 1 },
      { name: 'age', type: 'INTEGER', nullable: true, defaultValue: '0', primaryKeyPosition: 0 },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    uniqueConstraints: [],
    checkConstraints: ['age >= 0'],
    rowCountEstimate: 0,
    createSql: '',
  }
  it('verifica NOT NULL', async () => {
    const api: DBApi = mkApiMock({
      schema: async () => ({ ...emptySchema, tables: [usersTable] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'constraint',
      table: 'users',
      column: 'id',
      constraint: 'NOT NULL',
    })
    expect(r.passed).toBe(true)
  })
  it('falla NOT NULL cuando la columna es nullable', async () => {
    const api: DBApi = mkApiMock({
      schema: async () => ({ ...emptySchema, tables: [usersTable] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'constraint',
      table: 'users',
      column: 'age',
      constraint: 'NOT NULL',
    })
    expect(r.passed).toBe(false)
  })
  it('verifica CHECK por expresión normalizada', async () => {
    const api: DBApi = mkApiMock({
      schema: async () => ({ ...emptySchema, tables: [usersTable] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'constraint',
      table: 'users',
      column: 'age',
      constraint: 'CHECK',
      expected: 'AGE >= 0',
    })
    expect(r.passed).toBe(true)
  })
  it('verifica DEFAULT con expected', async () => {
    const api: DBApi = mkApiMock({
      schema: async () => ({ ...emptySchema, tables: [usersTable] }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'constraint',
      table: 'users',
      column: 'age',
      constraint: 'DEFAULT',
      expected: '0',
    })
    expect(r.passed).toBe(true)
  })
  it('falla si la tabla no existe', async () => {
    const ctx = mkCtx()
    const r = await s.apply(ctx, {
      type: 'constraint',
      table: 'nope',
      column: 'x',
      constraint: 'NOT NULL',
    })
    expect(r.passed).toBe(false)
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  KeywordUsageStrategy                                                 *
 * ──────────────────────────────────────────────────────────────────── */

describe('KeywordUsageStrategy', () => {
  let s: KeywordUsageStrategy
  beforeEach(() => {
    s = new KeywordUsageStrategy()
  })
  it('passa con all=true si todas las keywords están', async () => {
    const ctx = mkCtx({ userSql: 'SELECT * FROM t WHERE x = 1' })
    const r = await s.apply(ctx, { type: 'usesKeyword', keywords: ['SELECT', 'WHERE'], all: true })
    expect(r.passed).toBe(true)
  })
  it('falla con all=true si falta una', async () => {
    const ctx = mkCtx({ userSql: 'SELECT * FROM t' })
    const r = await s.apply(ctx, { type: 'usesKeyword', keywords: ['SELECT', 'WHERE'], all: true })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/WHERE/)
  })
  it('passa con all=false si al menos una está', async () => {
    const ctx = mkCtx({ userSql: 'SELECT * FROM a JOIN b ON a.id=b.id' })
    const r = await s.apply(ctx, { type: 'usesKeyword', keywords: ['WHERE', 'JOIN'], all: false })
    expect(r.passed).toBe(true)
  })
  it('es case-insensitive y respeta word boundary', async () => {
    const ctx = mkCtx({ userSql: 'select * from t where x = 1' })
    const r = await s.apply(ctx, { type: 'usesKeyword', keywords: ['SELECT', 'WHERE'] })
    expect(r.passed).toBe(true)
  })
  it('no matchea "ORDER" cuando se busca "OR"', async () => {
    const ctx = mkCtx({ userSql: 'SELECT * FROM t ORDER BY id' })
    const r = await s.apply(ctx, { type: 'usesKeyword', keywords: ['OR'] })
    expect(r.passed).toBe(false)
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  JoinUsageStrategy                                                    *
 * ──────────────────────────────────────────────────────────────────── */

describe('JoinUsageStrategy', () => {
  let s: JoinUsageStrategy
  beforeEach(() => {
    s = new JoinUsageStrategy()
  })
  it('cuenta JOINs implícitos', async () => {
    const ctx = mkCtx({ userSql: 'SELECT * FROM a JOIN b ON a.id = b.id' })
    const r = await s.apply(ctx, { type: 'usesJoin', minJoins: 1 })
    expect(r.passed).toBe(true)
  })
  it('falla si no hay suficientes JOINs', async () => {
    const ctx = mkCtx({ userSql: 'SELECT * FROM a' })
    const r = await s.apply(ctx, { type: 'usesJoin', minJoins: 2 })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/no usa suficientes/i)
  })
  it('respeta joinTypes (solo LEFT)', async () => {
    const ctx = mkCtx({
      userSql: 'SELECT * FROM a INNER JOIN b ON a.id=b.id LEFT JOIN c ON b.id=c.id',
    })
    const r = await s.apply(ctx, { type: 'usesJoin', minJoins: 1, joinTypes: ['LEFT'] })
    expect(r.passed).toBe(true)
  })
  it('respeta maxJoins', async () => {
    const ctx = mkCtx({
      userSql: 'SELECT * FROM a JOIN b ON a.id=b.id JOIN c ON b.id=c.id JOIN d ON c.id=d.id',
    })
    const r = await s.apply(ctx, { type: 'usesJoin', minJoins: 1, maxJoins: 2 })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/demasiados/i)
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  InvariantStrategy                                                    *
 * ──────────────────────────────────────────────────────────────────── */

describe('InvariantStrategy', () => {
  let s: InvariantStrategy
  beforeEach(() => {
    s = new InvariantStrategy()
  })
  it('passa cuando el resultado coincide con la forma esperada', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: true, columns: ['n'], rows: [[0]], executionMs: 0, statementKind: 'select' }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'invariant',
      sql: 'SELECT COUNT(*) FROM users WHERE email IS NULL',
      expectedResult: { columns: ['n'], rows: [[0]] },
      description: 'ningún email nulo',
    })
    expect(r.passed).toBe(true)
  })
  it('falla cuando el número de filas no coincide', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: true, columns: ['n'], rows: [[0], [1]], executionMs: 0, statementKind: 'select' }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'invariant',
      sql: 'SELECT ...',
      expectedResult: { columns: ['n'], rows: [[0]] },
      description: 'X',
    })
    expect(r.passed).toBe(false)
  })
  it('falla si la SQL de la invariante da error', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({ ok: false, error: { code: 'X', message: 'boom', translatedMessage: 'boom' }, executionMs: 0, statementKind: 'select' }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'invariant',
      sql: 'SELECT bogus',
      expectedResult: { columns: ['x'], rows: [] },
      description: 'X',
    })
    expect(r.passed).toBe(false)
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  QueryPlanStrategy                                                    *
 * ──────────────────────────────────────────────────────────────────── */

describe('QueryPlanStrategy', () => {
  let s: QueryPlanStrategy
  beforeEach(() => {
    s = new QueryPlanStrategy()
  })
  it('passa si aparecen los nodos esperados', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({
        ok: true,
        columns: ['id', 'parent', 'notused', 'detail'],
        rows: [[0, 0, 0, 'SEARCH users USING INDEX idx_email (email=?)']],
        executionMs: 0,
        statementKind: 'explain',
      }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'queryPlan',
      expectedNodes: ['SEARCH', 'USING INDEX'],
    })
    expect(r.passed).toBe(true)
  })
  it('falla si no aparece un nodo esperado', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({
        ok: true,
        columns: ['id', 'parent', 'notused', 'detail'],
        rows: [[0, 0, 0, 'SCAN users']],
        executionMs: 0,
        statementKind: 'explain',
      }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'queryPlan',
      expectedNodes: ['SEARCH'],
    })
    expect(r.passed).toBe(false)
    expect(r.details).toMatch(/SEARCH/)
  })
  it('falla si aparece un nodo prohibido', async () => {
    const api: DBApi = mkApiMock({
      exec: async () => ({
        ok: true,
        columns: ['id', 'parent', 'notused', 'detail'],
        rows: [[0, 0, 0, 'SCAN users']],
        executionMs: 0,
        statementKind: 'explain',
      }),
    })
    const ctx = mkCtx({ api })
    const r = await s.apply(ctx, {
      type: 'queryPlan',
      notExpectedNodes: ['SCAN'],
    })
    expect(r.passed).toBe(false)
    expect(r.details).toMatch(/SCAN/)
  })
  it('falla si la validación no tiene nodos definidos', async () => {
    const ctx = mkCtx()
    const r = await s.apply(ctx, { type: 'queryPlan' })
    expect(r.passed).toBe(false)
  })
})

/* ──────────────────────────────────────────────────────────────────── *
 *  CustomStrategy                                                       *
 * ──────────────────────────────────────────────────────────────────── */

describe('CustomStrategy', () => {
  it('falla si el validator no está registrado', async () => {
    const s = new CustomStrategy()
    const ctx = mkCtx()
    const r = await s.apply(ctx, { type: 'custom', validatorId: 'no-such' })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/no hay un validator/i)
  })
  it('ejecuta el validator registrado y le pega strategyType', async () => {
    const s = new CustomStrategy({
      get: () => async () => ({ passed: true, message: 'OK custom' }),
    })
    const ctx = mkCtx()
    const r = await s.apply(ctx, { type: 'custom', validatorId: 'my-id' })
    expect(r.passed).toBe(true)
    expect(r.strategyType).toBe('custom')
  })
  it('atrapa errores del validator', async () => {
    const s = new CustomStrategy({
      get: () => async () => {
        throw new Error('boom')
      },
    })
    const ctx = mkCtx()
    const r = await s.apply(ctx, { type: 'custom', validatorId: 'broken' })
    expect(r.passed).toBe(false)
    expect(r.message).toMatch(/lanzó un error/i)
  })
})
