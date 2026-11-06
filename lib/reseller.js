/**
 * Panel revendedor — un sub-bot puede gestionar sus propios sub-bots con límites.
 * Solo el maestro real otorga acceso; el revendedor no puede dar panel principal
 * salvo que el maestro active "poder completo (100%)".
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import {
  buildRentalFromParsed,
  parseRentalFromBody,
  resolveRentalStatus,
  syncRentalToLink,
} from './rental.js'
import { ensureLinkPanelSlug, invalidateSlugCache } from './panel-domain.js'

export const MASTER_DB_PATH = path.join(process.cwd(), 'storage', 'databases', 'database.json')

export function normalizeResellerPanel(raw = {}) {
  const maxSubbots = parseInt(raw.maxSubbots, 10)
  return {
    enabled: !!raw.enabled,
    maxSubbots: Number.isFinite(maxSubbots) ? Math.max(0, Math.min(500, maxSubbots)) : 0,
    canGrantMaster: !!raw.canGrantMaster,
    label: String(raw.label || '').trim().slice(0, 80),
    enabledAt: raw.enabledAt || null,
  }
}

export function getResellerPanel(sub = {}) {
  return normalizeResellerPanel(sub.resellerPanel || {})
}

export function readMasterSubbotsSync() {
  try {
    if (!existsSync(MASTER_DB_PATH)) return {}
    const raw = JSON.parse(readFileSync(MASTER_DB_PATH, 'utf8'))
    return raw?.subbots && typeof raw.subbots === 'object' ? raw.subbots : {}
  } catch {
    return {}
  }
}

export async function mutateMasterSubbots(mutator) {
  let data = {}
  try {
    if (existsSync(MASTER_DB_PATH)) {
      data = JSON.parse(readFileSync(MASTER_DB_PATH, 'utf8')) || {}
    }
  } catch {
    data = {}
  }
  if (!data.subbots || typeof data.subbots !== 'object') data.subbots = {}
  const result = await mutator(data.subbots, data)
  mkdirSync(path.dirname(MASTER_DB_PATH), { recursive: true })
  writeFileSync(MASTER_DB_PATH, JSON.stringify(data, null, 2), 'utf8')
  if (typeof process.send === 'function' && process.connected) {
    try {
      process.send({ type: 'reseller_db_changed' })
    } catch { /* ignore */ }
  }
  return result
}

export function listResellerChildren(subbots, parentNumber) {
  const p = String(parentNumber || '')
  return Object.entries(subbots || {}).filter(([, s]) => String(s?.parentReseller || '') === p)
}

export function countResellerChildren(subbots, parentNumber) {
  return listResellerChildren(subbots, parentNumber).length
}

export function canResellerCreateChild(subbots, parentNumber) {
  const parent = subbots?.[parentNumber]
  const rp = getResellerPanel(parent)
  if (!rp.enabled) return { ok: false, reason: 'Panel revendedor no activo para esta cuenta.' }
  const used = countResellerChildren(subbots, parentNumber)
  if (rp.maxSubbots > 0 && used >= rp.maxSubbots) {
    return { ok: false, reason: `Límite alcanzado (${used}/${rp.maxSubbots} sub-bots).` }
  }
  return { ok: true, used, max: rp.maxSubbots }
}

export function resellerCanGrantMaster(subbots, parentNumber) {
  return getResellerPanel(subbots?.[parentNumber]).canGrantMaster
}

export function readResellerPanelFromLink(number) {
  try {
    const linkFile = path.join(process.cwd(), 'usuarios', String(number), 'link.json')
    if (!existsSync(linkFile)) return normalizeResellerPanel()
    const link = JSON.parse(readFileSync(linkFile, 'utf8'))
    return normalizeResellerPanel(link.resellerPanel || {})
  } catch {
    return normalizeResellerPanel()
  }
}

export async function syncResellerPanelToLink(userDir, resellerPanel, fs) {
  const linkFile = path.join(userDir, 'link.json')
  let link = {}
  try {
    if (existsSync(linkFile)) link = JSON.parse(readFileSync(linkFile, 'utf8')) || {}
  } catch { /* ignore */ }
  link.resellerPanel = normalizeResellerPanel(resellerPanel)
  await fs.writeFile(linkFile, JSON.stringify(link, null, 2))
}

export function generateUniquePort(subbots = {}, masterPort = 0) {
  const usedPorts = Object.values(subbots)
    .map((s) => parseInt(s.port, 10))
    .filter((p) => Number.isFinite(p))
  if (masterPort) usedPorts.push(parseInt(masterPort, 10))
  let newPort
  let attempts = 0
  do {
    newPort = Math.floor(Math.random() * (9999 - 1000 + 1)) + 1000
    attempts++
  } while (usedPorts.includes(newPort) && attempts < 100)
  return newPort
}

/**
 * Crea un sub-bot en la DB maestra (maestro o revendedor).
 */
export async function createSubbotEntry({
  subbots,
  number,
  user,
  pass,
  name,
  rentalParsed,
  parentReseller = null,
  fs,
  masterPort = 0,
}) {
  const cleanNumber = String(number || '').replace(/\D/g, '')
  if (!cleanNumber) return { ok: false, error: 'Número inválido' }
  if (!user || !pass) return { ok: false, error: 'Usuario y contraseña requeridos' }
  if (subbots[cleanNumber]) return { ok: false, error: 'Ese número ya existe' }

  const port = generateUniquePort(subbots, masterPort)
  const rentalFields = buildRentalFromParsed(rentalParsed)
  const entry = {
    name: name || 'Sub-Bot',
    number: cleanNumber,
    port,
    status: 'pairing',
    pairingCode: null,
    panelUser: String(user).trim(),
    panelPass: String(pass).trim(),
    createdAt: Date.now(),
    parentReseller: parentReseller || null,
    resellerPanel: normalizeResellerPanel(),
    ...rentalFields,
  }
  subbots[cleanNumber] = entry

  const userDir = path.join(process.cwd(), 'usuarios', cleanNumber)
  if (!existsSync(userDir)) {
    await fs.mkdir(userDir, { recursive: true })
  }
  await syncRentalToLink(userDir, entry, fs)
  const linkWithSlug = await ensureLinkPanelSlug(userDir, { name: entry.name, port }, fs)
  entry.panelId = linkWithSlug.panelId
  entry.panelSlug = linkWithSlug.panelSlug
  invalidateSlugCache()

  return { ok: true, number: cleanNumber, port, entry }
}

export function requestSubbotSpawn(number, port, name) {
  if (typeof global.spawnSubBot === 'function') {
    return global.spawnSubBot(number, port, name)
  }
  if (typeof process.send === 'function' && process.connected) {
    process.send({ type: 'reseller_spawn_subbot', number, port, name })
    return Promise.resolve({ success: true, via: 'ipc' })
  }
  return Promise.resolve({ success: false, reason: 'no_spawn' })
}

export async function saveResellerConfigForSubbot(db, number, fields, fs) {
  const sub = db?.data?.subbots?.[number]
  if (!sub) return { ok: false, error: 'Sub-bot no encontrado' }

  const prev = getResellerPanel(sub)
  const enabled = fields.enabled === true || fields.enabled === '1'
  const next = normalizeResellerPanel({
    enabled,
    maxSubbots: fields.maxSubbots,
    canGrantMaster: fields.canGrantMaster === true || fields.canGrantMaster === '1',
    label: fields.label,
    enabledAt: enabled ? prev.enabledAt || Date.now() : null,
  })

  // Si desactiva revendedor, los hijos siguen existiendo pero el padre pierde acceso al panel
  sub.resellerPanel = next
  db.data.subbots[number] = sub

  const userDir = path.join(process.cwd(), 'usuarios', number)
  await syncResellerPanelToLink(userDir, next, fs)
  return { ok: true, config: next }
}

export async function saveChildResellerConfig(db, actorNumber, childNumber, fields, fs) {
  const subbots = db?.data?.subbots || {}
  if (!resellerCanGrantMaster(subbots, actorNumber)) {
    return { ok: false, error: 'No tenés permiso para dar panel revendedor a otros.' }
  }
  const child = subbots[childNumber]
  if (!child || String(child.parentReseller || '') !== String(actorNumber)) {
    return { ok: false, error: 'Ese sub-bot no es tuyo.' }
  }
  return saveResellerConfigForSubbot(db, childNumber, fields, fs)
}
