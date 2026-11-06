import path from 'path'
import { existsSync, mkdirSync, writeFileSync, copyFileSync, renameSync, readFileSync } from 'fs'
import fs from 'fs/promises'
import { JSONFile } from 'lowdb'
import { wouldMassWipe } from './db-guard.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Adaptador lowdb: escritura atómica, backup .bak, lock de archivo,
 * cola de escritura y protección anti-borrado masivo.
 */
export class AtomicJSONFile {
  constructor(filename, { kind = 'generic' } = {}) {
    this.filename = path.resolve(filename)
    this.kind = kind
    this.adapter = new JSONFile(this.filename)
    this.writeLock = Promise.resolve()
    this.backupPath = `${this.filename}.bak`
    this.tmpPath = `${this.filename}.tmp`
    this.lockPath = `${this.filename}.lock`
    this.readFailed = false
    this.allowWipe = false
  }

  allowDestructiveWrite() {
    this.allowWipe = true
  }

  resetDestructiveWrite() {
    this.allowWipe = false
  }

  async read() {
    this.readFailed = false
    const fileExists = existsSync(this.filename)

    try {
      const data = await this.adapter.read()
      if (data == null && fileExists) {
        throw new Error('archivo existente vacío o ilegible')
      }
      return data
    } catch (e) {
      const restored = await this._readBackup()
      if (restored != null) {
        console.error(
          `[ERROR-DB] JSON corrupto en ${this.filename}: ${e.message}. Restaurado desde backup.`
        )
        await this._atomicWrite(JSON.stringify(restored, null, 2), { skipGuard: true })
        return restored
      }

      if (fileExists) {
        this.readFailed = true
        console.error(
          `[ERROR-DB] JSON corrupto en ${this.filename}: ${e.message}. NO se escribirá hasta restaurar backup.`
        )
      } else {
        console.error(
          `[ERROR-DB] ${this.filename} no existe. Se usarán defaults en memoria (sin escribir aún).`
        )
      }
      return null
    }
  }

  async _readBackup() {
    if (!existsSync(this.backupPath)) return null
    try {
      const raw = await fs.readFile(this.backupPath, 'utf-8')
      if (!raw.trim()) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  _readExistingDataSync() {
    if (!existsSync(this.filename)) return null
    try {
      const raw = readFileSync(this.filename, 'utf-8')
      if (!raw.trim()) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  async _readExistingData() {
    if (!existsSync(this.filename)) return null
    try {
      const raw = await fs.readFile(this.filename, 'utf-8')
      if (!raw.trim()) return null
      return JSON.parse(raw)
    } catch {
      return this._readBackup()
    }
  }

  async _shouldBlockWrite(data) {
    if (this.allowWipe) return null
    if (this.readFailed) {
      return 'archivo corrupto sin backup válido'
    }

    const existing = await this._readExistingData()
    const backup = await this._readBackup()
    const baseline = existing ?? backup

    if (baseline) {
      const reason = wouldMassWipe(data, baseline, this.kind)
      if (reason) return reason
    }

    return null
  }

  _shouldBlockWriteSync(data) {
    if (this.allowWipe) return null
    if (this.readFailed) {
      return 'archivo corrupto sin backup válido'
    }

    const existing = this._readExistingDataSync()
    const backup = existsSync(this.backupPath)
      ? (() => {
          try {
            const raw = readFileSync(this.backupPath, 'utf-8')
            return raw.trim() ? JSON.parse(raw) : null
          } catch {
            return null
          }
        })()
      : null
    const baseline = existing ?? backup

    if (baseline) {
      const reason = wouldMassWipe(data, baseline, this.kind)
      if (reason) return reason
    }

    return null
  }

  async _acquireLock() {
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await fs.writeFile(this.lockPath, `${process.pid}:${Date.now()}`, { flag: 'wx' })
        return
      } catch {
        try {
          const stat = await fs.stat(this.lockPath)
          if (Date.now() - stat.mtimeMs > 15000) {
            await fs.unlink(this.lockPath).catch(() => {})
          }
        } catch {}
        await sleep(100)
      }
    }
    throw new Error(`No se pudo obtener lock para ${this.filename}`)
  }

  async _releaseLock() {
    await fs.unlink(this.lockPath).catch(() => {})
  }

  async write(data) {
  
    this.writeLock = this.writeLock
      .then(async () => {
        const blockReason = await this._shouldBlockWrite(data)
        if (blockReason) {
          console.error(`[PROTECCIÓN-DB] Escritura bloqueada en ${this.filename}: ${blockReason}`)
          return false
        }
        const json = JSON.stringify(data, null, 2)
        return await this._atomicWrite(json)
      })
      .catch((e) => {
        console.error(`[ERROR-DB] Error en cola de escritura para ${this.filename}:`, e.message)
        return false
      })
    return this.writeLock
  }

  async _atomicWrite(json, { skipGuard = false } = {}) {
    if (!skipGuard && !this.allowWipe) {
      try {
        const parsed = JSON.parse(json)
        const blockReason = await this._shouldBlockWrite(parsed)
        if (blockReason) {
          console.error(`[PROTECCIÓN-DB] Escritura bloqueada en ${this.filename}: ${blockReason}`)
          return false
        }
      } catch {}
    }

    await this._acquireLock()
    try {
      const dirname = path.dirname(this.filename)
      if (!existsSync(dirname)) mkdirSync(dirname, { recursive: true })
      if (existsSync(this.filename)) {
        try {
          await fs.copyFile(this.filename, this.backupPath)
        } catch {}
      }
      await fs.writeFile(this.tmpPath, json, 'utf-8')
      await fs.rename(this.tmpPath, this.filename)
      this.readFailed = false
      return true
    } finally {
      await this._releaseLock()
    }
  }

  writeSync(data) {
    const blockReason = this._shouldBlockWriteSync(data)
    if (blockReason) {
      console.error(`[PROTECCIÓN-DB] Escritura sync bloqueada en ${this.filename}: ${blockReason}`)
      return false
    }

    const json = JSON.stringify(data, null, 2)
    const dirname = path.dirname(this.filename)
    if (!existsSync(dirname)) mkdirSync(dirname, { recursive: true })
    if (existsSync(this.filename)) {
      try {
        copyFileSync(this.filename, this.backupPath)
      } catch {}
    }
    writeFileSync(this.tmpPath, json, 'utf-8')
    renameSync(this.tmpPath, this.filename)
    this.readFailed = false
    return true
  }
}
