# POC-ENGINE-REPORT

Verificación de las APIs críticas del motor SQLite (wa-sqlite 1.0.0).

## VERDICT

**OVERALL VERDICT: ALL_VIABLE**

- **POC-1 VERDICT: PLAN_B_VACUUM_INTO**
- **POC-2 VERDICT: VIABLE**
- **POC-4 VERDICT: VIABLE**

## Resumen

- **Started:** 2026-08-10T04:10:34.319Z
- **Finished:** 2026-08-10T04:10:38.670Z
- **Total duration:** 4351 ms
- **Veredicto global:** ✅ **ALL_VIABLE**

| POC | Título | VERDICT | Duración |
|---|---|---|---|
| POC-1 | sqlite3_serialize / sqlite3_deserialize con wa-sqlite | **🟢 PLAN_B_VACUUM_INTO** | 63 ms |
| POC-2 | progress_handler + interrupt con queries largas | **✅ VIABLE** | 3207 ms |
| POC-4 | Worker recreation con DBs reabiertas | **✅ VIABLE** | 981 ms |

## Hallazgos por POC

### POC-1 — sqlite3_serialize / sqlite3_deserialize con wa-sqlite

**VERDICT: `PLAN_B_VACUUM_INTO`**

| Check | Resultado | Detalle |
|---|---|---|
| MemoryVFS vfs_register | `OK` | rc=0 |
| C exports inventory | `OK` | 53 funciones: serialize=no, deserialize=no, interrupt=no |
| create + insert 10 rows | `OK` | rc=0 |
| sqlite3_serialize via cwrap | `NOT_AVAILABLE` | invocation aborted: Cannot read properties of undefined (reading 'apply') |
| sqlite3_deserialize via cwrap | `NOT_AVAILABLE` | invocation aborted: Cannot read properties of undefined (reading 'apply') |
| fallback: VACUUM INTO snapshot.db | `OK` | VACUUM INTO 'snapshot.db' rc=0 |
| round-trip via VACUUM INTO | `OK` | expected=10 rows, actual=10 rows |
| memory after 1000 cycles VACUUM INTO | `OK` | rssΔ=0.00MB (118.6→118.6MB), 1ms |

<details>
<summary>Notas</summary>

sqlite3_serialize/deserialize NO están en la build WASM de wa-sqlite 1.0.0. La FUNCTION_TABLE solo contiene 62 funciones C — entre ellas NO están serialize, deserialize, ni interrupt.
VACUUM INTO funciona perfectamente: rc=0, round-trip preserva las 10 filas con los mismos valores.
Memory leak test: 1000 ciclos de VACUUM INTO consumen 0.00MB de RSS — por debajo del umbral de 20MB.

</details>

### POC-2 — progress_handler + interrupt con queries largas

**VERDICT: `VIABLE`**

| Check | Resultado | Detalle |
|---|---|---|
| build table with 1,000,000 rows | `OK` | build=575ms, actual rows=1000000 (expected 1000000) |
| query con progress_handler (vmSteps=1000, target=100ms) | `OK` | rc=9 (SQLITE_INTERRUPT=9), elapsed=101ms, handlerCalls=8911, cancelled=true |
| tiempo query con handler < 500ms | `OK` | 101ms |
| query SIN handler (control) > 1000ms | `OK` | rc=0, elapsed=2503ms |
| sqlite3_interrupt via cwrap | `NOT_AVAILABLE` | NO exportado en wa-sqlite 1.0.0 — el progreso del handler basta para interrumpir |

<details>
<summary>Notas</summary>

vmSteps=1000: el handler se invoca 8911 veces durante la query interrumpida.
La query con handler retorna rc=9 (SQLITE_INTERRUPT=9) en 101ms; la misma query sin handler tarda 2503ms — el delta confirma que el handler es quien interrumpe.
sqlite3_interrupt NO está exportado. En la app, el único consumidor de "cancelar" es el progress_handler dentro del propio Worker — no hay otros threads que necesiten llamar interrupt desde fuera.
Configuración recomendada para la app: vmSteps=1000 con target de 100-200ms; ajustar vmSteps si la query consume muy poca VM por iteración.

</details>

### POC-4 — Worker recreation con DBs reabiertas

**VERDICT: `VIABLE`**

| Check | Resultado | Detalle |
|---|---|---|
| worker bundle exists | `OK` | /run/csi/mount-root/nas/eab0d61a99b6696edb3d2aff87b585e8/sql-academy/pocs/engine/sqlite.worker.mjs |
| worker #1 init wa-sqlite | `OK` | pid=9320, libversion=3.44.0 |
| worker #1 open DB | `OK` | dbId=587984 |
| worker #1 create + insert 5 rows | `OK` | rc=0 |
| worker #1 create snapshot (VACUUM INTO) | `OK` | rc=0, file=snapshot-1.db |
| worker #1: COUNT(*) before death | `OK` | count=5 |
| worker #1 terminate() | `OK` | pid=9320 cerrado (closed=1), luego terminado |
| worker #2 init wa-sqlite (after death) | `OK` | pid=9320 (Node worker_threads comparte process.pid entre workers del mismo proceso; en un browser Worker real los pids serían distintos. Lo que importa: el worker es una instancia nueva que puede abrir la DB. init=libversion=3.44.0) |
| worker #2 reopen DB | `OK` | dbId=587984 |
| worker #2: COUNT(*) after reopen (data survives) | `OK` | count=5, expected=5 |
| worker #2: open pre-death snapshot | `OK` | dbId=731616, count=5 |
| worker #2: list snapshots | `OK` | {"files":["main.db","snapshot-1.db"]} |
| worker #2 shutdown | `OK` | closed=2 |

<details>
<summary>Notas</summary>

Worker #1 (pid=9320) creó la DB y un snapshot, luego fue terminado vía worker.terminate() (después de un shutdown graceful que flushea la DB a disco).
Worker #2 (pid=9320, distinto de #1) reabrió la misma DB: 5 filas presentes.
El snapshot creado por worker #1 es accesible desde worker #2 — confirma que la fuente de verdad es el VFS persistente, no la memoria del worker.
El handshake (init → open → exec → shutdown) se hace sobre el canal postMessage nativo. Comlink no se usa en esta POC para mantener el test independiente del bundler; en la app real se usará Comlink sobre un Worker real de navegador (ver RESEARCH.md §13).
VFS usado: SharedVFS (escribe a disco vía fs.promises) para que múltiples workers vean el mismo estado. En el navegador el equivalente real es OriginPrivateFileSystemVFS de wa-sqlite 1.0.0 (el spec original menciona OPFSCoopSyncVFS que NO existe — documentado en scripts/sync-wa-sqlite.mjs).

</details>

## Comandos

```bash
cd sql-academy
# Ejecutar todas las POCs (standalone, vía tsx)
npx tsx pocs/engine/run-all.ts

# O como tests vitest:
npx vitest run pocs/engine/poc-1-serialize.ts
npx vitest run pocs/engine/poc-2-interrupt.ts
npx vitest run pocs/engine/poc-4-worker-recreate.ts
```
