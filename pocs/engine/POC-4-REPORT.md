# POC-4: Worker recreation con DBs reabiertas

## VERDICT

**POC-4 VERDICT: `VIABLE`**

- **Started:** 2026-08-10T04:10:37.677Z
- **Finished:** 2026-08-10T04:10:38.658Z
- **Duration:** 981 ms

## Veredicto: ✅ **VIABLE**

## Hallazgos

| Check | Resultado | Detalle |
|---|---|---|
| worker bundle exists | OK | /run/csi/mount-root/nas/eab0d61a99b6696edb3d2aff87b585e8/sql-academy/pocs/engine/sqlite.worker.mjs |
| worker #1 init wa-sqlite | OK | pid=9320, libversion=3.44.0 |
| worker #1 open DB | OK | dbId=587984 |
| worker #1 create + insert 5 rows | OK | rc=0 |
| worker #1 create snapshot (VACUUM INTO) | OK | rc=0, file=snapshot-1.db |
| worker #1: COUNT(*) before death | OK | count=5 |
| worker #1 terminate() | OK | pid=9320 cerrado (closed=1), luego terminado |
| worker #2 init wa-sqlite (after death) | OK | pid=9320 (Node worker_threads comparte process.pid entre workers del mismo proceso; en un browser Worker real los pids serían distintos. Lo que importa: el worker es una instancia nueva que puede abrir la DB. init=libversion=3.44.0) |
| worker #2 reopen DB | OK | dbId=587984 |
| worker #2: COUNT(*) after reopen (data survives) | OK | count=5, expected=5 |
| worker #2: open pre-death snapshot | OK | dbId=731616, count=5 |
| worker #2: list snapshots | OK | {"files":["main.db","snapshot-1.db"]} |
| worker #2 shutdown | OK | closed=2 |

## Notas

Worker #1 (pid=9320) creó la DB y un snapshot, luego fue terminado vía worker.terminate() (después de un shutdown graceful que flushea la DB a disco).
Worker #2 (pid=9320, distinto de #1) reabrió la misma DB: 5 filas presentes.
El snapshot creado por worker #1 es accesible desde worker #2 — confirma que la fuente de verdad es el VFS persistente, no la memoria del worker.
El handshake (init → open → exec → shutdown) se hace sobre el canal postMessage nativo. Comlink no se usa en esta POC para mantener el test independiente del bundler; en la app real se usará Comlink sobre un Worker real de navegador (ver RESEARCH.md §13).
VFS usado: SharedVFS (escribe a disco vía fs.promises) para que múltiples workers vean el mismo estado. En el navegador el equivalente real es OriginPrivateFileSystemVFS de wa-sqlite 1.0.0 (el spec original menciona OPFSCoopSyncVFS que NO existe — documentado en scripts/sync-wa-sqlite.mjs).

## Datos crudos

```json
{
  "workerPids": {
    "w1": 9320,
    "w2": 9320
  },
  "dbFile": "main.db",
  "snapshotFile": "snapshot-1.db",
  "counts": {
    "beforeDeath": 5,
    "afterReopen": 5
  },
  "snapshot": {
    "accessible": true,
    "info": {
      "dbId": 731616,
      "count": 5
    }
  },
  "responses": [
    {
      "ok": true,
      "result": {
        "libversion": "3.44.0",
        "bundle": "wa-sqlite-async.mjs"
      },
      "pid": 9320
    },
    {
      "ok": true,
      "result": {
        "dbId": 587984
      },
      "pid": 9320
    },
    {
      "ok": true,
      "result": {
        "rc": 0
      },
      "pid": 9320
    },
    {
      "ok": true,
      "result": {
        "rc": 0
      },
      "pid": 9320
    },
    {
      "ok": true,
      "result": {
        "count": 5
      },
      "pid": 9320
    },
    {
      "ok": true,
      "result": {
        "closed": 1
      },
      "pid": 9320
    },
    {
      "ok": true,
      "result": {
        "libversion": "3.44.0",
        "bundle": "wa-sqlite-async.mjs"
      },
      "pid": 9320
    },
    {
      "ok": true,
      "result": {
        "dbId": 587984
      },
      "pid": 9320
    },
    {
      "ok": true,
      "result": {
        "count": 5
      },
      "pid": 9320
    },
    {
      "ok": true,
      "result": {
        "dbId": 731616,
        "count": 5
      },
      "pid": 9320
    },
    {
      "ok": true,
      "result": {
        "files": [
          "main.db",
          "snapshot-1.db"
        ]
      },
      "pid": 9320
    },
    {
      "ok": true,
      "result": {
        "closed": 2
      },
      "pid": 9320
    }
  ]
}
```
