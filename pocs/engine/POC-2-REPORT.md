# POC-2: progress_handler + interrupt con queries largas

## VERDICT

**POC-2 VERDICT: `VIABLE`**

- **Started:** 2026-08-10T04:10:34.463Z
- **Finished:** 2026-08-10T04:10:37.670Z
- **Duration:** 3207 ms

## Veredicto: ✅ **VIABLE**

## Hallazgos

| Check | Resultado | Detalle |
|---|---|---|
| build table with 1,000,000 rows | OK | build=575ms, actual rows=1000000 (expected 1000000) |
| query con progress_handler (vmSteps=1000, target=100ms) | OK | rc=9 (SQLITE_INTERRUPT=9), elapsed=101ms, handlerCalls=8911, cancelled=true |
| tiempo query con handler < 500ms | OK | 101ms |
| query SIN handler (control) > 1000ms | OK | rc=0, elapsed=2503ms |
| sqlite3_interrupt via cwrap | NOT_AVAILABLE | NO exportado en wa-sqlite 1.0.0 — el progreso del handler basta para interrumpir |

## Notas

vmSteps=1000: el handler se invoca 8911 veces durante la query interrumpida.
La query con handler retorna rc=9 (SQLITE_INTERRUPT=9) en 101ms; la misma query sin handler tarda 2503ms — el delta confirma que el handler es quien interrumpe.
sqlite3_interrupt NO está exportado. En la app, el único consumidor de "cancelar" es el progress_handler dentro del propio Worker — no hay otros threads que necesiten llamar interrupt desde fuera.
Configuración recomendada para la app: vmSteps=1000 con target de 100-200ms; ajustar vmSteps si la query consume muy poca VM por iteración.

## Datos crudos

```json
{
  "params": {
    "handlerTimeoutMs": 100,
    "vmSteps": 1000,
    "rowCount": 1000000,
    "controlMinMs": 1000
  },
  "withHandler": {
    "rc": 9,
    "elapsedMs": 101,
    "handlerCalls": 8911,
    "cancelled": true
  },
  "control": {
    "rc": 0,
    "elapsedMs": 2503
  },
  "interruptAvailable": false,
  "constants": {
    "SQLITE_OK": 0,
    "SQLITE_INTERRUPT": 9
  }
}
```
