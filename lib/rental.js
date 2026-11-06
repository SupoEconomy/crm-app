import { existsSync, readFileSync } from 'fs'
import path from 'path'

export const RENTAL_OPTIONS = [
  { value: '1h', label: '1 hora', ms: 60 * 60 * 1000 },
  { value: '1d', label: '1 día', ms: 24 * 60 * 60 * 1000 },
  { value: '3d', label: '3 días', ms: 3 * 24 * 60 * 60 * 1000 },
  { value: '1w', label: '1 semana', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: '2w', label: '2 semanas', ms: 14 * 24 * 60 * 60 * 1000 },
  { value: '1m', label: '1 mes', ms: 30 * 24 * 60 * 60 * 1000 },
]

export const RENTAL_UNIT_LABELS = {
  min: 'minuto(s)',
  h: 'hora(s)',
  d: 'día(s)',
  w: 'semana(s)',
  mo: 'mes(es)',
  m: 'mes(es)',
}

export function isInfiniteRental(data = {}) {
  return !!(data.rentalInfinite || data.rentalDuration === 'infinite')
}

export function parseRentalDuration(input) {
  if (!input || input === 'infinite') return null
  const preset = RENTAL_OPTIONS.find(o => o.value === String(input).trim())
  if (preset) return preset.ms

  const str = String(input).trim().toLowerCase()
  let match = str.match(/^(\d+)min$/)
  if (match) return parseInt(match[1], 10) * 60 * 1000

  match = str.match(/^(\d+)(h|d|w|mo|m)$/i)
  if (!match) return null
  const amount = parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  const multipliers = {
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    m: 30 * 24 * 60 * 60 * 1000,
    mo: 30 * 24 * 60 * 60 * 1000,
  }
  return amount * multipliers[unit]
}


export function parseRentalFromBody(body = {}, fieldPrefix = '') {
  const p = fieldPrefix
  const mode = body[`${p}rental_mode`] || body.rental_mode || 'preset'
  const infiniteFlag = body[`${p}rental_infinite`] === '1' || body.rental_infinite === '1'

  if (mode === 'infinite' || infiniteFlag) {
    return { type: 'infinite', value: 'infinite' }
  }

  if (mode === 'custom') {
    const amount = parseInt(body[`${p}rental_amount`] ?? body.rental_amount, 10)
    const unit = ((body[`${p}rental_unit`] ?? body.rental_unit) || 'd').toLowerCase()
    if (!amount || amount < 1) return null
    const value = `${amount}${unit}`
    const ms = parseRentalDuration(value)
    if (!ms) return null
    return { type: 'custom', value, ms }
  }

  const duration = body[`${p}rental_duration`] ?? body.rental_duration ?? body.extend_duration
  if (!duration) return null
  const ms = parseRentalDuration(duration)
  if (!ms) return null
  return { type: 'preset', value: duration, ms }
}

export function computeExpiresAt(durationMs, fromTs = Date.now()) {
  return fromTs + durationMs
}

export function buildInfiniteRentalFields(fromTs = Date.now()) {
  return {
    rentedAt: fromTs,
    rentalDuration: 'infinite',
    rentalInfinite: true,
    expiresAt: null,
    paused: false,
    rentalStatus: 'active',
  }
}

export function resolveRentalStatus(data = {}) {
  if (isInfiniteRental(data)) {
    if (data.rentalStatus === 'paused' && data.paused) return 'paused'
    if (data.paused) return 'paused'
    return 'active'
  }
  if (data.rentalStatus === 'paused' && data.paused) return 'paused'
  if (data.expiresAt && Date.now() > data.expiresAt) return 'expired'
  if (data.paused) return 'paused'
  return data.rentalStatus || 'active'
}

export function isRentalBlocked(data = {}) {
  const status = resolveRentalStatus(data)
  return status === 'expired' || status === 'paused'
}

export function formatDateTime(ts, data = {}) {
  if (isInfiniteRental(data)) return 'Tiempo infinito'
  if (!ts) return 'Sin límite'
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRemaining(ms, data = {}) {
  if (isInfiniteRental(data)) return 'Sin vencimiento'
  if (ms <= 0) return 'Vencido'
  const h = Math.floor(ms / (60 * 60 * 1000))
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ${h % 24}h restantes`
  if (h > 0) return `${h}h restantes`
  const m = Math.ceil(ms / (60 * 1000))
  return `${m} min restantes`
}

/**
 * Devuelve el tiempo restante desglosado en semanas, días, horas y minutos.
 * Pensado para mostrarse como valor principal (sin la palabra "restantes").
 * Ej: "2 semanas 3 días", "5 días 6 h", "3 h 20 min", "45 min".
 */
export function formatRemainingLong(ms, data = {}) {
  if (isInfiniteRental(data)) return 'Tiempo infinito'
  if (ms <= 0) return 'Vencido'

  const totalMin = Math.floor(ms / (60 * 1000))
  const totalH = Math.floor(totalMin / 60)
  const totalD = Math.floor(totalH / 24)

  const weeks = Math.floor(totalD / 7)
  const days = totalD % 7
  const hours = totalH % 24
  const mins = totalMin % 60

  const parts = []
  if (weeks > 0) parts.push(`${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`)
  if (days > 0) parts.push(`${days} ${days === 1 ? 'día' : 'días'}`)
  // Solo mostramos horas/minutos cuando aportan precisión (poco tiempo restante).
  if (weeks === 0 && hours > 0) parts.push(`${hours} h`)
  if (weeks === 0 && days === 0 && mins > 0) parts.push(`${mins} min`)

  return parts.length ? parts.join(' ') : 'Menos de 1 min'
}

export function getRentalLabel(value, data = {}) {
  if (isInfiniteRental(data) || value === 'infinite') return 'Tiempo infinito'
  const preset = RENTAL_OPTIONS.find(o => o.value === value)
  if (preset) return preset.label
  const match = String(value || '').match(/^(\d+)(min|h|d|w|mo|m)$/i)
  if (match) {
    return `${match[1]} ${RENTAL_UNIT_LABELS[match[2].toLowerCase()] || match[2]}`
  }
  return value || '—'
}

export function readRentalFromLink(linkPath) {
  if (!existsSync(linkPath)) return {}
  try {
    return JSON.parse(readFileSync(linkPath, 'utf8'))
  } catch {
    return {}
  }
}

export function buildRentalFields(durationValue, fromTs = Date.now()) {
  if (durationValue === 'infinite') return buildInfiniteRentalFields(fromTs)
  const ms = parseRentalDuration(durationValue)
  if (!ms) return {}
  return {
    rentedAt: fromTs,
    rentalDuration: durationValue,
    rentalInfinite: false,
    expiresAt: computeExpiresAt(ms, fromTs),
    paused: false,
    rentalStatus: 'active',
  }
}

export function buildRentalFromParsed(parsed, fromTs = Date.now()) {
  if (!parsed) return {}
  if (parsed.type === 'infinite') return buildInfiniteRentalFields(fromTs)
  return buildRentalFields(parsed.value, fromTs)
}

export function extendRentalFields(current = {}, durationValue, fromTs = Date.now()) {
  if (durationValue === 'infinite') {
    return {
      ...buildInfiniteRentalFields(fromTs),
      rentedAt: current.rentedAt || fromTs,
      lastRenewedAt: fromTs,
    }
  }
  const ms = parseRentalDuration(durationValue)
  if (!ms) return null
  // Si el plan sigue activo, SOLO se suma tiempo a expiresAt.
  // No cambiar rentalDuration (texto "Plan" del panel): el canje no es un plan nuevo.
  const isActiveExtend = !isInfiniteRental(current)
    && current.expiresAt
    && current.expiresAt > fromTs
    && resolveRentalStatus(current) === 'active'
  const base = isActiveExtend ? current.expiresAt : fromTs
  const keepPlan = isActiveExtend
    && current.rentalDuration
    && current.rentalDuration !== 'infinite'
  return {
    rentedAt: current.rentedAt || fromTs,
    rentalDuration: keepPlan ? current.rentalDuration : durationValue,
    rentalInfinite: false,
    expiresAt: base + ms,
    paused: false,
    rentalStatus: 'active',
    lastRenewedAt: fromTs,
  }
}


export function replaceRentalFields(current = {}, parsed, fromTs = Date.now()) {
  if (!parsed) return null
  if (parsed.type === 'infinite') {
    return {
      ...buildInfiniteRentalFields(fromTs),
      rentedAt: current.rentedAt || fromTs,
      lastRenewedAt: fromTs,
    }
  }
  const ms = parsed.ms ?? parseRentalDuration(parsed.value)
  if (!ms) return null
  return {
    rentedAt: current.rentedAt || fromTs,
    rentalDuration: parsed.value,
    rentalInfinite: false,
    expiresAt: fromTs + ms,
    paused: false,
    rentalStatus: 'active',
    lastRenewedAt: fromTs,
  }
}

export function applyRentalChange(sub, parsed, fromTs = Date.now()) {
  if (!parsed) return false
  const fields = parsed.type === 'infinite'
    ? { ...buildInfiniteRentalFields(fromTs), rentedAt: sub.rentedAt || fromTs, lastRenewedAt: fromTs }
    : extendRentalFields(sub, parsed.value, fromTs)
  if (!fields) return false
  Object.assign(sub, fields)
  delete sub.expiredAt
  return true
}

export async function syncRentalToLink(userDir, subbotData, fs) {
  const linkFile = path.join(userDir, 'link.json')
  let link = {}
  if (existsSync(linkFile)) {
    try {
      link = JSON.parse(readFileSync(linkFile, 'utf8'))
    } catch { /* keep empty */ }
  }
  link.name = subbotData.name ?? link.name
  link.port = subbotData.port ?? link.port
  link.panelUser = subbotData.panelUser ?? link.panelUser
  link.panelPass = subbotData.panelPass ?? link.panelPass

  if (isInfiniteRental(subbotData)) {
    link.rentalInfinite = true
    link.rentalDuration = 'infinite'
    link.expiresAt = null
    delete link.expiredAt
  } else {
    link.rentalInfinite = false
    if (subbotData.expiresAt != null) link.expiresAt = subbotData.expiresAt
    if (subbotData.rentalDuration != null) link.rentalDuration = subbotData.rentalDuration
  }

  if (subbotData.rentedAt != null) link.rentedAt = subbotData.rentedAt
  link.paused = !!subbotData.paused
  link.rentalStatus = subbotData.rentalStatus || resolveRentalStatus(subbotData)
  if (subbotData.lastRenewedAt != null) link.lastRenewedAt = subbotData.lastRenewedAt
  await fs.writeFile(linkFile, JSON.stringify(link, null, 2))
}

export async function pauseSubBotCampaigns(userDir, fs) {
  const dbPath = path.join(userDir, 'database.json')
  if (!existsSync(dbPath)) return
  let raw
  try {
    raw = JSON.parse(readFileSync(dbPath, 'utf8'))
  } catch {
    return
  }
  for (const key of Object.keys(raw.campaigns || {})) {
    raw.campaigns[key].enabled = false
  }
  for (const gid of Object.keys(raw.publicaciones || {})) {
    if (raw.publicaciones[gid]) raw.publicaciones[gid].enabled = false
  }
  await fs.writeFile(dbPath, JSON.stringify(raw, null, 2))
}

export async function applySubBotRentalBlock(number, db, fs, safeDbWrite, reason = 'expired') {
  const sub = db.data.subbots?.[number]
  if (!sub) return

  sub.rentalStatus = reason === 'paused' ? 'paused' : 'expired'
  sub.paused = true
  if (reason === 'expired') sub.expiredAt = Date.now()

  const userDir = path.join(process.cwd(), 'usuarios', number)
  await syncRentalToLink(userDir, sub, fs)
  await pauseSubBotCampaigns(userDir, fs)
  await safeDbWrite(db)

  if (global.activeSubBots?.has(number)) {
    const child = global.activeSubBots.get(number)
    if (child && typeof child.kill === 'function') child.kill('SIGTERM')
    global.activeSubBots.delete(number)
  }
  if (sub) sub.status = reason === 'paused' ? 'paused' : 'expired'
}

export async function renewSubBotRental(number, parsedOrValue, db, fs, safeDbWrite) {
  const sub = db.data.subbots?.[number]
  if (!sub) return false
  const parsed = typeof parsedOrValue === 'string'
    ? (parsedOrValue === 'infinite' ? { type: 'infinite', value: 'infinite' } : { type: 'preset', value: parsedOrValue })
    : parsedOrValue
  if (!applyRentalChange(sub, parsed)) return false
  sub.paused = false
  sub.rentalStatus = 'active'
  delete sub.expiredAt

  const userDir = path.join(process.cwd(), 'usuarios', number)
  await syncRentalToLink(userDir, sub, fs)
  await safeDbWrite(db)
  return true
}

export function mergeSubbotRentalFromLink(subbot, linkData) {
  if (!linkData) return subbot
  const merged = { ...subbot }
  for (const key of ['expiresAt', 'rentedAt', 'rentalDuration', 'paused', 'rentalStatus', 'lastRenewedAt', 'rentalInfinite']) {
    if (linkData[key] != null) merged[key] = linkData[key]
  }
  if (linkData.rentalInfinite) merged.rentalInfinite = true
  merged.rentalStatus = resolveRentalStatus(merged)
  return merged
}
