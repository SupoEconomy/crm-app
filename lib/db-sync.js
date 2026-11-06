

export async function safeDbWrite(db, { destructive = false } = {}) {
  if (!db?.data) return false
  if (db._corrupt && !destructive) {
    console.error('[PROTECCIÓN-DB] Escritura omitida: DB marcada como corrupta')
    return false
  }
  if (destructive && db.adapter?.allowDestructiveWrite) {
    db.adapter.allowDestructiveWrite()
  }
  try {
    return await db.write()
  } finally {
    db.adapter?.resetDestructiveWrite?.()
  }
}

export async function safeGruposWrite(gruposDB, { destructive = false } = {}) {
  if (!gruposDB?.data) return false
  if (gruposDB._corrupt && !destructive) {
    console.error('[PROTECCIÓN-DB] Escritura omitida: grupos.json corrupto')
    return false
  }
  return safeDbWrite(gruposDB, { destructive })
}


export async function safeDbReload(db, defaults = {}) {
  if (db._corrupt) return false
  try {
    const fresh = await db.adapter.read()
    if (fresh == null) {
      console.error('[PROTECCIÓN-DB] Recarga omitida: lectura fallida, memoria intacta')
      return false
    }
    db.data = { ...defaults, ...fresh }
    db._corrupt = false
    return true
  } catch (e) {
    console.error('[PROTECCIÓN-DB] Recarga omitida:', e.message)
    return false
  }
}
