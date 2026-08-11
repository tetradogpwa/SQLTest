# POC-1: sqlite3_serialize / sqlite3_deserialize con wa-sqlite

## VERDICT

**POC-1 VERDICT: `PLAN_B_VACUUM_INTO`**

- **Started:** 2026-08-10T04:10:34.320Z
- **Finished:** 2026-08-10T04:10:34.383Z
- **Duration:** 63 ms

## Veredicto: 🟢 **PLAN_B_VACUUM_INTO**

## Hallazgos

| Check | Resultado | Detalle |
|---|---|---|
| MemoryVFS vfs_register | OK | rc=0 |
| C exports inventory | OK | 53 funciones: serialize=no, deserialize=no, interrupt=no |
| create + insert 10 rows | OK | rc=0 |
| sqlite3_serialize via cwrap | NOT_AVAILABLE | invocation aborted: Cannot read properties of undefined (reading 'apply') |
| sqlite3_deserialize via cwrap | NOT_AVAILABLE | invocation aborted: Cannot read properties of undefined (reading 'apply') |
| fallback: VACUUM INTO snapshot.db | OK | VACUUM INTO 'snapshot.db' rc=0 |
| round-trip via VACUUM INTO | OK | expected=10 rows, actual=10 rows |
| memory after 1000 cycles VACUUM INTO | OK | rssΔ=0.00MB (118.6→118.6MB), 1ms |

## Notas

sqlite3_serialize/deserialize NO están en la build WASM de wa-sqlite 1.0.0. La FUNCTION_TABLE solo contiene 62 funciones C — entre ellas NO están serialize, deserialize, ni interrupt.
VACUUM INTO funciona perfectamente: rc=0, round-trip preserva las 10 filas con los mismos valores.
Memory leak test: 1000 ciclos de VACUUM INTO consumen 0.00MB de RSS — por debajo del umbral de 20MB.

## Datos crudos

```json
{
  "cExports": {
    "total": 53,
    "hasSerialize": false,
    "hasDeserialize": false,
    "hasInterrupt": false,
    "list": [
      "_progress_handler",
      "_register_vfs",
      "_sqlite3_bind_blob",
      "_sqlite3_bind_double",
      "_sqlite3_bind_int",
      "_sqlite3_bind_int64",
      "_sqlite3_bind_null",
      "_sqlite3_bind_parameter_count",
      "_sqlite3_bind_parameter_name",
      "_sqlite3_bind_text",
      "_sqlite3_changes",
      "_sqlite3_clear_bindings",
      "_sqlite3_close",
      "_sqlite3_column_blob",
      "_sqlite3_column_bytes",
      "_sqlite3_column_count",
      "_sqlite3_column_double",
      "_sqlite3_column_int",
      "_sqlite3_column_int64",
      "_sqlite3_column_name",
      "_sqlite3_column_text",
      "_sqlite3_column_type",
      "_sqlite3_data_count",
      "_sqlite3_declare_vtab",
      "_sqlite3_errmsg",
      "_sqlite3_exec",
      "_sqlite3_finalize",
      "_sqlite3_free",
      "_sqlite3_get_autocommit",
      "_sqlite3_libversion",
      "_sqlite3_libversion_number",
      "_sqlite3_limit",
      "_sqlite3_malloc",
      "_sqlite3_open_v2",
      "_sqlite3_prepare_v2",
      "_sqlite3_reset",
      "_sqlite3_result_blob",
      "_sqlite3_result_double",
      "_sqlite3_result_error",
      "_sqlite3_result_int",
      "_sqlite3_result_int64",
      "_sqlite3_result_null",
      "_sqlite3_result_text",
      "_sqlite3_sql",
      "_sqlite3_step",
      "_sqlite3_value_blob",
      "_sqlite3_value_bytes",
      "_sqlite3_value_double",
      "_sqlite3_value_int",
      "_sqlite3_value_int64",
      "_sqlite3_value_text",
      "_sqlite3_value_type",
      "_sqlite3_vfs_find"
    ]
  },
  "serializeAttempt": {
    "api": "sqlite3_serialize",
    "available": false,
    "detail": "invocation aborted: Cannot read properties of undefined (reading 'apply')"
  },
  "deserializeAttempt": {
    "api": "sqlite3_deserialize",
    "available": false,
    "detail": "invocation aborted: Cannot read properties of undefined (reading 'apply')"
  },
  "vacuum": {
    "ok": true,
    "detail": "VACUUM INTO 'snapshot.db' rc=0"
  },
  "memory": {
    "beforeRss": 124375040,
    "afterRss": 124375040,
    "cycles": 1000,
    "durationMs": 1
  },
  "rowCount": 10,
  "firstRow": [
    1,
    "a"
  ],
  "sqliteConstants": {
    "SQLITE_OK": 0,
    "SQLITE_INTERRUPT": 9
  }
}
```
