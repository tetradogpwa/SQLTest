#!/usr/bin/env node
/**
 * Sync the wa-sqlite WASM from `node_modules/wa-sqlite/dist/` into `public/`
 * so that vite-plugin-pwa's `injectManifest` strategy can precache it via
 * the `includeAssets` / `globPatterns` config.
 *
 * The WASM is shipped in two flavours by wa-sqlite:
 *  - `wa-sqlite.wasm`           — sync API (AccessHandlePoolVFS / COOP+COEP)
 *  - `wa-sqlite-async.wasm`     — async API (OriginPrivateFileSystemVFS)
 *
 * The "spec" name `OPFSCoopSyncVFS` mentioned in RESEARCH.md does not exist
 * in wa-sqlite 1.0.0; the equivalent is `AccessHandlePoolVFS` (sync) or
 * `OriginPrivateFileSystemVFS` (async). For the no-COOP/COEP path we use the
 * async WASM, but both are copied so the dev can pick either at runtime.
 *
 * Idempotent: skips copy if the source and destination hashes match.
 *
 * Run via: `npm run sync:wasm` (also wired as `prebuild`).
 */

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const srcDir = resolve(root, 'node_modules/wa-sqlite/dist')
const dstDir = resolve(root, 'public')

/** @type {Array<{ src: string; dst: string }>} */
const targets = [
  { src: 'wa-sqlite.wasm', dst: 'wa-sqlite.wasm' },
  { src: 'wa-sqlite-async.wasm', dst: 'wa-sqlite-async.wasm' },
]

async function sha256(path) {
  const buf = await readFile(path)
  return createHash('sha256').update(buf).digest('hex')
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

let copied = 0
let skipped = 0

await mkdir(dstDir, { recursive: true })

for (const { src, dst } of targets) {
  const srcPath = join(srcDir, src)
  const dstPath = join(dstDir, dst)

  if (!(await exists(srcPath))) {
    console.warn(`[sync:wasm] skip: source not found ${srcPath}`)
    continue
  }

  if (await exists(dstPath)) {
    const [srcHash, dstHash] = await Promise.all([sha256(srcPath), sha256(dstPath)])
    if (srcHash === dstHash) {
      console.log(`[sync:wasm] unchanged: ${dst}`)
      skipped += 1
      continue
    }
  }

  await copyFile(srcPath, dstPath)
  const size = (await stat(dstPath)).size
  console.log(`[sync:wasm] copied: ${dst} (${(size / 1024).toFixed(1)} KB)`)
  copied += 1
}

console.log(`[sync:wasm] done — copied=${copied} skipped=${skipped}`)
