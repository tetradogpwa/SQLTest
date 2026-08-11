// POC-4 SharedVFS: persiste los archivos del MemoryVFS en un directorio
// de disco, de modo que dos workers distintos (en el mismo proceso o
// en procesos distintos) vean el mismo estado.
//
// Se usa SOLO en el test runner de Node (donde el navegador no tiene
// acceso a `fs`). En el navegador el equivalente es
// `OriginPrivateFileSystemVFS` de wa-sqlite (ver RESEARCH.md §3.1).

import * as VFS from 'wa-sqlite/src/VFS.js'
import { readFile, writeFile, mkdir, unlink, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

const BLOCK_SIZE = 4096

export class SharedVFS extends VFS.Base {
  name = 'shared'
  rootDir

  /** Map of open files, keyed by sqlite3_file pointer. */
  mapIdToFile = new Map()
  /** Map of file metadata (size + data), keyed by filename. */
  cache = new Map()

  constructor(rootDir) {
    super()
    this.rootDir = rootDir
  }

  filePath(name) {
    return join(this.rootDir, name.replace(/\.\./g, '_'))
  }

  async load(name) {
    if (this.cache.has(name)) return this.cache.get(name)
    const filePath = this.filePath(name)
    if (!existsSync(filePath)) {
      const file = { name, size: 0, data: new ArrayBuffer(0) }
      this.cache.set(name, file)
      return file
    }
    const buf = await readFile(filePath)
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const file = { name, size: buf.byteLength, data }
    this.cache.set(name, file)
    return file
  }

  async flush(name) {
    const file = this.cache.get(name)
    if (!file) return
    const filePath = this.filePath(name)
    try {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, Buffer.from(file.data, 0, file.size))
    } catch (e) {
      // Re-throw so the caller can see the failure.
      throw e
    }
  }

  xOpen(name, fileId, flags, pOutFlags) {
    const self = this
    return this.handleAsync(async () => {
      if (name === null) name = `null_${fileId}`
      try {
        const file = await self.load(name)
        const create = (flags & VFS.SQLITE_OPEN_CREATE) !== 0
        if (!file && create) {
          const newFile = { name, size: 0, data: new ArrayBuffer(0) }
          self.cache.set(name, newFile)
        }
        self.mapIdToFile.set(fileId, { name, flags })
        pOutFlags.setInt32(0, flags, true)
        return VFS.SQLITE_OK
      } catch {
        return VFS.SQLITE_CANTOPEN
      }
    })
  }

  xClose(fileId) {
    const self = this
    return this.handleAsync(async () => {
      const entry = self.mapIdToFile.get(fileId)
      if (!entry) return VFS.SQLITE_OK
      self.mapIdToFile.delete(fileId)
      await self.flush(entry.name)
      if (entry.flags & VFS.SQLITE_OPEN_DELETEONCLOSE) {
        const filePath = self.filePath(entry.name)
        if (existsSync(filePath)) await unlink(filePath)
        self.cache.delete(entry.name)
      }
      return VFS.SQLITE_OK
    })
  }

  xRead(fileId, pData, iOffset) {
    const self = this
    return this.handleAsync(async () => {
      const entry = self.mapIdToFile.get(fileId)
      if (!entry) return VFS.SQLITE_IOERR
      const file = await self.load(entry.name)
      const bgn = Math.min(iOffset, file.size)
      const end = Math.min(iOffset + pData.byteLength, file.size)
      const nBytes = end - bgn
      if (nBytes) {
        pData.set(new Uint8Array(file.data, bgn, nBytes))
      }
      if (nBytes < pData.byteLength) {
        pData.fill(0, nBytes)
        return VFS.SQLITE_IOERR_SHORT_READ
      }
      return VFS.SQLITE_OK
    })
  }

  xWrite(fileId, pData, iOffset) {
    const self = this
    return this.handleAsync(async () => {
      const entry = self.mapIdToFile.get(fileId)
      if (!entry) return VFS.SQLITE_IOERR
      const file = await self.load(entry.name)
      if (iOffset + pData.byteLength > file.data.byteLength) {
        const newSize = Math.max(iOffset + pData.byteLength, 2 * file.data.byteLength)
        const data = new ArrayBuffer(newSize)
        new Uint8Array(data).set(new Uint8Array(file.data, 0, file.size))
        file.data = data
      }
      new Uint8Array(file.data, iOffset, pData.byteLength).set(pData)
      file.size = Math.max(file.size, iOffset + pData.byteLength)
      self.cache.set(entry.name, file)
      return VFS.SQLITE_OK
    })
  }

  xTruncate(fileId, iSize) {
    const self = this
    return this.handleAsync(async () => {
      const entry = self.mapIdToFile.get(fileId)
      if (!entry) return VFS.SQLITE_IOERR
      const file = await self.load(entry.name)
      file.size = Math.min(file.size, iSize)
      return VFS.SQLITE_OK
    })
  }

  xFileSize(fileId, pSize64) {
    const self = this
    return this.handleAsync(async () => {
      const entry = self.mapIdToFile.get(fileId)
      if (!entry) return VFS.SQLITE_IOERR
      const file = await self.load(entry.name)
      pSize64.setBigInt64(0, BigInt(file.size), true)
      return VFS.SQLITE_OK
    })
  }

  xDelete(name, syncDir) {
    const self = this
    return this.handleAsync(async () => {
      const filePath = self.filePath(name)
      if (existsSync(filePath)) await unlink(filePath)
      self.cache.delete(name)
      return VFS.SQLITE_OK
    })
  }

  xAccess(name, flags, pResOut) {
    const self = this
    return this.handleAsync(async () => {
      const filePath = self.filePath(name)
      const ok = existsSync(filePath)
      pResOut.setInt32(0, ok ? 1 : 0, true)
      return VFS.SQLITE_OK
    })
  }

  async close() {
    // Flush all open files
    for (const entry of this.mapIdToFile.values()) {
      await this.flush(entry.name)
    }
    this.mapIdToFile.clear()
  }

  /** List all *.db files in the VFS root. */
  async listFiles() {
    if (!existsSync(this.rootDir)) return []
    const all = await readdir(this.rootDir, { recursive: true })
    return all.filter((f) => f.endsWith('.db'))
  }
}
