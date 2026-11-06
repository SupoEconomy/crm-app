import { randomBytes } from 'crypto'
import { parseTimeToMinutes, isWithinSpamSchedule, formatTime12h } from './spam-schedule.js'

export const AUTO_REPLY_DEFAULTS = {
  enabled: false,
  minTypingSec: 5,
  maxTypingSec: 12,
  minReadSec: 2,
  maxReadSec: 6,
  folders: [],
  rules: [],
  blacklist: [],
  riskAccepted: false,
  hours: {
    enabled: false,
    start: '05:00',
    stop: '23:00',
    text: '',
    image: null,
    imageType: null,
    limitMode: 'free',
    maxPerContact: 2,
  },
  antiSpam: {
    enabled: false,
    maxMessages: 4,
    windowSec: 3,
    text: 'Intentaste jugar con las respuestas automáticas. Serás agregado a la lista de ignorados.',
    image: null,
    imageType: null,
  },
}

/** ID interno para stats del mensaje fuera de horario */
export const HOURS_STATS_ID = '__hours__'

export const AUTO_REPLY_DISCLAIMER =
  'Esta función viene desactivada por defecto. Al activarla, tú decides cómo usarla y asumes la responsabilidad de su uso en tu cuenta.'

export function normalizeHours(raw = {}) {
  const start = parseTimeToMinutes(raw.start) != null ? String(raw.start).trim() : '05:00'
  const stop = parseTimeToMinutes(raw.stop) != null ? String(raw.stop).trim() : '23:00'
  const limitMode = raw.limitMode === 'max' ? 'max' : 'free'
  let maxPerContact = parseInt(raw.maxPerContact, 10)
  if (!Number.isFinite(maxPerContact)) maxPerContact = 2
  maxPerContact = Math.max(1, Math.min(500, maxPerContact))
  return {
    enabled: !!raw.enabled,
    start,
    stop,
    text: String(raw.text || '').slice(0, 4000),
    image: raw.image ? String(raw.image) : null,
    imageType: raw.imageType === 'video' ? 'video' : (raw.image ? 'image' : null),
    limitMode,
    maxPerContact,
  }
}

export function normalizeAntiSpam(raw = {}) {
  let maxMessages = parseInt(raw.maxMessages, 10)
  if (!Number.isFinite(maxMessages)) maxMessages = 4
  maxMessages = Math.max(2, Math.min(50, maxMessages))
  let windowSec = parseInt(raw.windowSec, 10)
  if (!Number.isFinite(windowSec)) windowSec = 3
  windowSec = Math.max(1, Math.min(60, windowSec))
  return {
    enabled: !!raw.enabled,
    maxMessages,
    windowSec,
    text: String(raw.text || AUTO_REPLY_DEFAULTS.antiSpam.text).slice(0, 4000),
    image: raw.image ? String(raw.image) : null,
    imageType: raw.imageType === 'video' ? 'video' : (raw.image ? 'image' : null),
  }
}

export function normalizeAutoReplyConfig(raw = {}) {
  const folders = Array.isArray(raw.folders)
    ? raw.folders.map(normalizeFolder).filter(Boolean)
    : []
  const folderIds = new Set(folders.map((f) => f.id))

  const cfg = {
    enabled: !!raw.enabled,
    minTypingSec: Math.max(5, Math.min(60, parseInt(raw.minTypingSec, 10) || AUTO_REPLY_DEFAULTS.minTypingSec)),
    maxTypingSec: Math.max(5, Math.min(120, parseInt(raw.maxTypingSec, 10) || AUTO_REPLY_DEFAULTS.maxTypingSec)),
    minReadSec: Math.max(1, Math.min(30, parseInt(raw.minReadSec, 10) || AUTO_REPLY_DEFAULTS.minReadSec)),
    maxReadSec: Math.max(1, Math.min(60, parseInt(raw.maxReadSec, 10) || AUTO_REPLY_DEFAULTS.maxReadSec)),
    folders,
    rules: Array.isArray(raw.rules)
      ? raw.rules.map((r) => normalizeRule(r, folderIds)).filter(Boolean)
      : [],
    blacklist: Array.isArray(raw.blacklist)
      ? raw.blacklist.map(normalizeBlacklistEntry).filter(Boolean)
      : [],
    stats: normalizeStats(raw.stats),
    riskAccepted: !!raw.riskAccepted,
    hours: normalizeHours(raw.hours || {}),
    antiSpam: normalizeAntiSpam(raw.antiSpam || {}),
  }
  if (cfg.maxTypingSec < cfg.minTypingSec) cfg.maxTypingSec = cfg.minTypingSec
  if (cfg.maxReadSec < cfg.minReadSec) cfg.maxReadSec = cfg.minReadSec
  if (cfg.enabled) cfg.riskAccepted = true
  return cfg
}

export function ensureAutoReplyConfig(db) {
  if (!db?.data) {
    return {
      ...AUTO_REPLY_DEFAULTS,
      hours: { ...AUTO_REPLY_DEFAULTS.hours },
      antiSpam: { ...AUTO_REPLY_DEFAULTS.antiSpam },
      blacklist: [],
      stats: {},
    }
  }
  const normalized = normalizeAutoReplyConfig(db.data.autoReply || {})
  const cur = db.data.autoReply
  // Reutilizar el mismo objeto raíz: si se reemplaza en cada ensure(),
  // un handler que espera typing (varios segundos) muta una copia vieja
  // y el panel / persistencia ven blacklist vacía.
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) {
    db.data.autoReply = normalized
    return db.data.autoReply
  }
  Object.assign(cur, normalized)
  return cur
}

function normalizeStats(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [ruleId, byChat] of Object.entries(raw)) {
    if (!byChat || typeof byChat !== 'object') continue
    if ('day' in byChat && 'count' in byChat) continue
    out[ruleId] = {}
    for (const [chatId, row] of Object.entries(byChat)) {
      if (!row || typeof row !== 'object') continue
      out[ruleId][chatId] = {
        day: String(row.day || ''),
        count: Math.max(0, parseInt(row.count, 10) || 0),
      }
    }
  }
  return out
}

function normalizeFolder(folder) {
  if (!folder || typeof folder !== 'object') return null
  const name = String(folder.name || '').trim().slice(0, 60)
  if (!name && !folder.id) return null
  return {
    id: String(folder.id || newFolderId()),
    name: name || 'Carpeta',
    order: Math.max(0, parseInt(folder.order, 10) || 0),
  }
}

/** Solo dígitos del número (quita +, espacios, guiones). */
export function normalizePhoneDigits(input) {
  return String(input || '').replace(/\D/g, '')
}

function normalizeBlacklistEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const ids = new Set()
  const number = normalizePhoneDigits(entry.number)
  if (number.length >= 8) ids.add(number)
  const rawIds = Array.isArray(entry.ids) ? entry.ids : []
  for (const x of rawIds) {
    const d = normalizePhoneDigits(x) || digitsFromJid(x)
    if (d.length >= 8) ids.add(d)
  }
  if (entry.lid) {
    const d = digitsFromJid(entry.lid) || normalizePhoneDigits(entry.lid)
    if (d.length >= 8) ids.add(d)
  }
  if (!ids.size) return null
  const primary = number.length >= 8 ? number : [...ids][0]
  const name = String(entry.name || '').trim().slice(0, 60) || 'Sin nombre'
  return {
    id: String(entry.id || newBlacklistId()),
    number: primary,
    ids: [...ids],
    name,
  }
}

export function newBlacklistId() {
  return 'bl_' + randomBytes(5).toString('hex')
}

/** Extrae dígitos útiles de un JID (@s.whatsapp.net / device). */
export function digitsFromJid(jid = '') {
  const user = String(jid || '').split('@')[0] || ''
  const noDevice = user.split(':')[0] || ''
  return normalizePhoneDigits(noDevice)
}

/**
 * ¿Este chat está en lista negra?
 * Compara número PN y también IDs @lid guardados (Baileys 7).
 */
export function isBlacklisted(cfg, ...jids) {
  const list = cfg?.blacklist || []
  if (!list.length) return null
  const candidates = [...new Set(
    jids.map((j) => digitsFromJid(j) || normalizePhoneDigits(j)).filter((d) => d.length >= 8),
  )]
  if (!candidates.length) return null

  for (const entry of list) {
    const pool = (entry.ids && entry.ids.length) ? entry.ids : [entry.number]
    for (const n of pool) {
      if (!n || n.length < 8) continue
      for (const dig of candidates) {
        if (dig === n || dig.endsWith(n) || n.endsWith(dig)) return entry
      }
    }
  }
  return null
}

export function formatBlacklistNumber(number) {
  const d = normalizePhoneDigits(number)
  if (d.length <= 4) return d
  return `+${d}`
}

function normalizeRule(rule, folderIds = null) {
  if (!rule || typeof rule !== 'object') return null
  const keywords = parseKeywords(rule.keywords)
  if (!keywords.length && !rule.id) return null

  const limitMode = rule.limitMode === 'max' ? 'max' : 'free'
  let maxPerContact = parseInt(rule.maxPerContact, 10)
  if (!Number.isFinite(maxPerContact)) maxPerContact = 4
  maxPerContact = Math.max(1, Math.min(500, maxPerContact))

  let folderId = rule.folderId ? String(rule.folderId) : null
  if (folderId && folderIds && !folderIds.has(folderId)) folderId = null

  return {
    id: String(rule.id || newRuleId()),
    enabled: rule.enabled !== false,
    name: String(rule.name || 'Respuesta').trim().slice(0, 80) || 'Respuesta',
    keywords,
    text: String(rule.text || '').slice(0, 4000),
    image: rule.image ? String(rule.image) : null,
    imageType: rule.imageType === 'video' ? 'video' : (rule.image ? 'image' : null),
    limitMode,
    maxPerContact,
    folderId,
    isFinal: !!rule.isFinal,
  }
}

export function newRuleId() {
  return randomBytes(6).toString('hex')
}

export function newFolderId() {
  return 'f_' + randomBytes(5).toString('hex')
}

export function parseKeywords(input) {
  if (Array.isArray(input)) {
    return [...new Set(input.map((k) => String(k || '').trim().toLowerCase()).filter(Boolean))].slice(0, 40)
  }
  return [...new Set(String(input || '')
    .split(/[,;\n]+/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean))].slice(0, 40)
}

export function textMatchesKeywords(text, keywords = []) {
  const hay = String(text || '').toLowerCase().trim()
  if (!hay || !keywords.length) return false
  return keywords.some((kw) => {
    const k = String(kw || '').toLowerCase().trim()
    if (!k) return false
    // Menú numérico ("1","2","3"): SOLO si el mensaje es exactamente eso.
    // Evita que "2" dispare ante precios, fechas, captions, etc.
    if (/^\d{1,3}$/.test(k)) return hay === k
    try {
      const re = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegExp(k)}(?:$|[^\\p{L}\\p{N}_])`, 'iu')
      if (re.test(hay)) return true
    } catch (_) { /* ignore */ }
    // Fallback solo para frases ≥4 chars (nunca substring suelto de 1-3)
    return k.length >= 4 && hay.includes(k)
  })
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** ¿Estamos dentro del horario de atención? Si hours no está activo → siempre true. */
export function isWithinAttentionHours(cfg, date = new Date()) {
  const h = cfg?.hours
  if (!h?.enabled) return true
  return isWithinSpamSchedule(h.start, h.stop, date)
}

export function hasHoursMessage(cfg) {
  const h = cfg?.hours
  return !!(h && (h.text || h.image))
}

export function isHoursLimitReached(cfg, chatId, date = new Date()) {
  const h = cfg?.hours
  if (!h || h.limitMode !== 'max') return false
  const max = Math.max(1, parseInt(h.maxPerContact, 10) || 1)
  return getRuleChatReplyCount(cfg, HOURS_STATS_ID, chatId, date) >= max
}

/** Pseudo-regla para enviar el mensaje fuera de horario (usa typing global). */
export function getHoursReplyPayload(cfg) {
  const h = cfg?.hours
  if (!h) return null
  return {
    id: HOURS_STATS_ID,
    name: 'Fuera de horario',
    text: h.text || '',
    image: h.image,
    imageType: h.imageType,
    limitMode: h.limitMode,
    maxPerContact: h.maxPerContact,
  }
}

export function formatHoursLabel(cfg) {
  const h = cfg?.hours
  if (!h?.enabled) return 'Horario desactivado'
  return `${formatTime12h(h.start)} – ${formatTime12h(h.stop)}`
}

export function isRuleLimitReached(cfg, rule, chatId, date = new Date()) {
  if (!rule || rule.limitMode !== 'max') return false
  const max = Math.max(1, parseInt(rule.maxPerContact, 10) || 1)
  return getRuleChatReplyCount(cfg, rule.id, chatId, date) >= max
}

/** Coincide keyword (sin mirar límite ni horario). */
export function findKeywordHit(cfg, text) {
  if (!cfg?.enabled || !cfg.rules?.length) return null
  for (const rule of cfg.rules) {
    if (!rule.enabled) continue
    if (!rule.keywords?.length) continue
    if (!rule.text && !rule.image) continue
    if (textMatchesKeywords(text, rule.keywords)) return rule
  }
  return null
}

export function findMatchingRule(cfg, text, chatId = null) {
  if (!cfg?.enabled || !cfg.rules?.length) return null
  for (const rule of cfg.rules) {
    if (!rule.enabled) continue
    if (!rule.keywords?.length) continue
    if (!rule.text && !rule.image) continue
    if (!textMatchesKeywords(text, rule.keywords)) continue
    if (chatId && isRuleLimitReached(cfg, rule, chatId)) continue
    return rule
  }
  return null
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getRuleChatReplyCount(cfg, ruleId, chatId, date = new Date()) {
  const day = todayKey(date)
  const row = cfg.stats?.[ruleId]?.[chatId]
  if (!row || row.day !== day) return 0
  return parseInt(row.count, 10) || 0
}

export function getChatReplyCount() {
  return 0
}

export function bumpRuleChatReplyCount(cfg, ruleId, chatId, date = new Date()) {
  const day = todayKey(date)
  cfg.stats ||= {}
  cfg.stats[ruleId] ||= {}
  const row = cfg.stats[ruleId][chatId]
  if (!row || row.day !== day) {
    cfg.stats[ruleId][chatId] = { day, count: 1 }
  } else {
    row.count = (parseInt(row.count, 10) || 0) + 1
  }
  return cfg.stats[ruleId][chatId].count
}

export function bumpChatReplyCount() {
  return 0
}

export function computeTypingMs(cfg, text = '') {
  const minSec = Math.max(5, cfg?.minTypingSec || 5)
  const maxSec = Math.max(minSec, cfg?.maxTypingSec || minSec)
  const minMs = minSec * 1000
  const maxMs = maxSec * 1000
  const lenBonus = Math.min(String(text || '').length * 35, 4000)
  const base = minMs + lenBonus
  const jitter = Math.floor(Math.random() * Math.max(500, maxMs - minMs))
  return Math.min(maxMs + 2000, Math.max(minMs, base + jitter - Math.min(lenBonus, maxMs - minMs)))
}

/** Tiempo de “leer” antes de escribir (simulación humana). */
export function computeReadMs(cfg) {
  const minSec = Math.max(1, cfg?.minReadSec || 2)
  const maxSec = Math.max(minSec, cfg?.maxReadSec || minSec)
  return Math.floor((minSec + Math.random() * (maxSec - minSec + 0.001)) * 1000)
}

export function getAntiSpamPayload(cfg) {
  const a = cfg?.antiSpam
  if (!a) return null
  return {
    id: '__antispam__',
    name: 'Anti-spam',
    text: a.text || '',
    image: a.image,
    imageType: a.imageType,
    limitMode: 'free',
  }
}

export function hasAntiSpamMessage(cfg) {
  const a = cfg?.antiSpam
  return !!(a && (a.text || a.image))
}

/**
 * Agrega a lista negra por número y/o JIDs (@lid + @s.whatsapp.net).
 * Si ya existe, fusiona los IDs (importante para LID).
 */
export function addBlacklistEntry(cfg, { number, name = 'Anti-spam', jids = [] } = {}) {
  const ids = new Set()
  const dig = normalizePhoneDigits(number)
  if (dig.length >= 8) ids.add(dig)
  for (const j of jids || []) {
    const d = digitsFromJid(j) || normalizePhoneDigits(j)
    if (d.length >= 8) ids.add(d)
  }
  if (!ids.size) return false

  cfg.blacklist ||= []
  const overlap = (e) => {
    const pool = (e.ids && e.ids.length) ? e.ids : [e.number]
    return [...ids].some((id) =>
      pool.some((n) => n && (n === id || n.endsWith(id) || id.endsWith(n))),
    )
  }
  const existing = cfg.blacklist.find(overlap)
  if (existing) {
    existing.ids = [...new Set([...(existing.ids || [existing.number]), ...ids].filter((x) => x && x.length >= 8))]
    if (dig.length >= 8 && (!existing.number || existing.number.length < dig.length)) {
      existing.number = dig
    }
    if (name) existing.name = String(name).trim().slice(0, 60) || existing.name
    return true
  }

  const primary = dig.length >= 8 ? dig : [...ids][0]
  cfg.blacklist.push({
    id: newBlacklistId(),
    number: primary,
    ids: [...ids],
    name: String(name || 'Anti-spam').trim().slice(0, 60) || 'Anti-spam',
  })
  return true
}

/** Quita de lista negra por JID/número. */
export function removeBlacklistByJids(cfg, ...jids) {
  cfg.blacklist ||= []
  const candidates = [...new Set(
    jids.flatMap((j) => {
      const d = digitsFromJid(j) || normalizePhoneDigits(j)
      return d.length >= 8 ? [d] : []
    }),
  )]
  if (!candidates.length) return false
  const before = cfg.blacklist.length
  cfg.blacklist = cfg.blacklist.filter((e) => {
    const pool = (e.ids && e.ids.length) ? e.ids : [e.number]
    return !candidates.some((dig) =>
      pool.some((n) => n && (dig === n || dig.endsWith(n) || n.endsWith(dig))),
    )
  })
  return cfg.blacklist.length < before
}

/** Mejor candidato de número desde varios JIDs (prioriza @s.whatsapp.net). */
export function pickBestPhoneDigits(...jids) {
  const scored = []
  for (const jid of jids) {
    const s = String(jid || '')
    const dig = digitsFromJid(s)
    if (dig.length < 8) continue
    const score = s.includes('@s.whatsapp.net') ? 2 : 1
    scored.push({ dig, score })
  }
  scored.sort((a, b) => b.score - a.score || b.dig.length - a.dig.length)
  return scored[0]?.dig || ''
}

export function formatRuleLimitLabel(rule) {
  if (!rule || rule.limitMode !== 'max') return 'Libre'
  const n = Math.max(1, parseInt(rule.maxPerContact, 10) || 1)
  return `Máx. ${n}/contacto/día`
}

export function groupRulesByFolder(cfg) {
  const folders = [...(cfg.folders || [])].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  const rules = cfg.rules || []
  const byFolder = new Map()
  for (const f of folders) byFolder.set(f.id, [])
  const ungrouped = []

  for (const r of rules) {
    if (r.folderId && byFolder.has(r.folderId)) byFolder.get(r.folderId).push(r)
    else ungrouped.push(r)
  }

  return {
    folders: folders.map((f) => ({ folder: f, rules: byFolder.get(f.id) || [] })),
    ungrouped,
  }
}
