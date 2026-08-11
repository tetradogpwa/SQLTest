/**
 * Storage capability detection — stub.
 *
 * The full 3-level detection (OPFS sync → OPFS async → IndexedDB → in-memory)
 * is described in RESEARCH.md §2.1 and will be implemented in POC-1, which
 * needs the Worker handshake to actually verify `createSyncAccessHandle`.
 *
 * This stub returns `'opfs-sync'` so the rest of the app can be wired
 * against a single StorageCapability type today.
 *
 * NEVER call this from the Worker — it must run on the Main Thread because
 * `navigator.storage` and `indexedDB` are the only globals available in
 * both contexts, and the worker capability is what the handshake reports.
 */

export type StorageCapability = 'opfs-sync' | 'opfs-async' | 'idb' | 'memory'

/**
 * Stubbed capability detector. See RESEARCH.md §2.1.
 */
export async function detectStorageCapability(): Promise<StorageCapability> {
  // TODO(POC-1): replace with the real 3-level detection:
  //   1. Ping the worker for `opfsSync` support (requires createSyncAccessHandle).
  //   2. Fall back to OPFS async / IDBBatchAtomicVFS if only IndexedDB is available.
  //   3. Last resort: in-memory SQLite, no persistence.
  return 'opfs-sync'
}
