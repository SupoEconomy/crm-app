/**
 * Gestor General — cuentas madre, perfiles, clientes y recordatorios de vencimiento.
 * Sirve para streaming, gimnasio, alquiler de bots, planes, etc.
 */
import { randomBytes } from 'crypto'
import { computeTypingMs, computeReadMs } from './auto-reply.js'
import { fillMessageTemplate, stripCredentialVars } from './reminder-template.js'

export { fillMessageTemplate } from './reminder-template.js'

export const ACCOUNT_MANAGER_DEFAULTS = {
  enabled: true,
  minTypingSec: 5,
  maxTypingSec: 12,
  minReadSec: 2,
  maxReadSec: 6,
  defaultRemindDays: 1,
  defaultRemindTime: '10:00',
  defaultRemindMsg:
    'Hola {{nombre}} 👋\nTe escribo para recordarte que tu alquiler de *{{perfil}}* ({{cuenta}}) vence el *{{vence}}*.\nSi querés renovar, respondé este mensaje.',
  mothers: [],
  clients: [],
  rentals: [],
}

export const CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'gym', label: 'Gimnasio / local' },
  { id: 'bot', label: 'Bot / panel' },
  { id: 'software', label: 'Software / SaaS' },
  { id: 'other', label: 'Otro' },
]

export function newId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
}

export function sanitizeText(v, max = 500) {
  return String(v ?? '').trim().slice(0, max)
}

export function sanitizePhone(raw = '') {
  return String(raw || '').replace(/\D/g, '').slice(0, 18)
}

export function parseDateInput(raw) {
  // YYYY-MM-DD or full ISO
  const s = String(raw || '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T12:00:00')
    return Number.isNaN(d.getTime()) ? null : d.getTime()
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

export function formatDateDisplay(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function toDateInputValue(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeProfile(raw = {}) {
  if (!raw || typeof raw !== 'object') return null
  const id = sanitizeText(raw.id, 48) || newId('prf')
  return {
    id,
    name: sanitizeText(raw.name, 80) || 'Perfil',
    user: sanitizeText(raw.user, 120),
    pass: sanitizeText(raw.pass, 120),
    pin: sanitizeText(raw.pin, 40),
    email: sanitizeText(raw.email, 120),
    extraId: sanitizeText(raw.extraId, 80),
    notes: sanitizeText(raw.notes, 500),
    status: ['available', 'rented', 'blocked'].includes(raw.status) ? raw.status : 'available',
  }
}

function normalizeMother(raw = {}) {
  if (!raw || typeof raw !== 'object') return null
  const id = sanitizeText(raw.id, 48) || newId('mom')
  const cat = CATEGORIES.some((c) => c.id === raw.category) ? raw.category : 'general'
  const profiles = Array.isArray(raw.profiles)
    ? raw.profiles.map(normalizeProfile).filter(Boolean)
    : []
  return {
    id,
    name: sanitizeText(raw.name, 100) || 'Cuenta madre',
    category: cat,
    motherUser: sanitizeText(raw.motherUser, 120),
    motherPass: sanitizeText(raw.motherPass, 120),
    motherEmail: sanitizeText(raw.motherEmail, 120),
    motherId: sanitizeText(raw.motherId, 80),
    notes: sanitizeText(raw.notes, 800),
    profiles,
    createdAt: Number(raw.createdAt) || Date.now(),
  }
}

function normalizeClient(raw = {}) {
  if (!raw || typeof raw !== 'object') return null
  const id = sanitizeText(raw.id, 48) || newId('cli')
  const whatsapp = sanitizePhone(raw.whatsapp)
  return {
    id,
    name: sanitizeText(raw.name, 100) || 'Cliente',
    whatsapp,
    email: sanitizeText(raw.email, 120),
    notes: sanitizeText(raw.notes, 800),
    createdAt: Number(raw.createdAt) || Date.now(),
  }
}

function normalizeRental(raw = {}) {
  if (!raw || typeof raw !== 'object') return null
  const id = sanitizeText(raw.id, 48) || newId('rnt')
  let remindDays = parseInt(raw.remindDaysBefore, 10)
  if (!Number.isFinite(remindDays)) remindDays = 1
  remindDays = Math.max(0, Math.min(30, remindDays))
  let remindTime = String(raw.remindTime || '10:00').trim()
  if (!/^\d{1,2}:\d{2}$/.test(remindTime)) remindTime = '10:00'
  const [hh, mm] = remindTime.split(':').map((n) => parseInt(n, 10))
  const h = Math.max(0, Math.min(23, hh || 0))
  const m = Math.max(0, Math.min(59, mm || 0))
  remindTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

  const startAt = Number(raw.startAt) || null
  const expiresAt = Number(raw.expiresAt) || null
  const status = ['active', 'expired', 'cancelled'].includes(raw.status)
    ? raw.status
    : (expiresAt && expiresAt < Date.now() ? 'expired' : 'active')

  return {
    id,
    clientId: sanitizeText(raw.clientId, 48),
    motherId: sanitizeText(raw.motherId, 48),
    profileId: sanitizeText(raw.profileId, 48),
    planLabel: sanitizeText(raw.planLabel, 80),
    startAt,
    expiresAt,
    remindEnabled: raw.remindEnabled !== false,
    remindDaysBefore: remindDays,
    remindTime,
    remindMessage: sanitizeText(raw.remindMessage, 2000),
    includeCredentials: !!raw.includeCredentials,
    lastRemindDay: sanitizeText(raw.lastRemindDay, 16), // YYYY-MM-DD
    lastExpireNotifyDay: sanitizeText(raw.lastExpireNotifyDay, 16),
    status,
    createdAt: Number(raw.createdAt) || Date.now(),
  }
}

export function normalizeAccountManager(raw = {}) {
  const mothers = Array.isArray(raw.mothers)
    ? raw.mothers.map(normalizeMother).filter(Boolean)
    : []
  const clients = Array.isArray(raw.clients)
    ? raw.clients.map(normalizeClient).filter(Boolean)
    : []
  const rentals = Array.isArray(raw.rentals)
    ? raw.rentals.map(normalizeRental).filter(Boolean)
    : []

  let minTyping = parseInt(raw.minTypingSec, 10)
  let maxTyping = parseInt(raw.maxTypingSec, 10)
  let minRead = parseInt(raw.minReadSec, 10)
  let maxRead = parseInt(raw.maxReadSec, 10)
  if (!Number.isFinite(minTyping)) minTyping = 5
  if (!Number.isFinite(maxTyping)) maxTyping = 12
  if (!Number.isFinite(minRead)) minRead = 2
  if (!Number.isFinite(maxRead)) maxRead = 6
  minTyping = Math.max(3, Math.min(60, minTyping))
  maxTyping = Math.max(minTyping, Math.min(90, maxTyping))
  minRead = Math.max(0, Math.min(30, minRead))
  maxRead = Math.max(minRead, Math.min(60, maxRead))

  let defaultRemindDays = parseInt(raw.defaultRemindDays, 10)
  if (!Number.isFinite(defaultRemindDays)) defaultRemindDays = 1
  defaultRemindDays = Math.max(0, Math.min(30, defaultRemindDays))

  let defaultRemindTime = String(raw.defaultRemindTime || '10:00').trim()
  if (!/^\d{1,2}:\d{2}$/.test(defaultRemindTime)) defaultRemindTime = '10:00'

  return {
    enabled: raw.enabled !== false,
    minTypingSec: minTyping,
    maxTypingSec: maxTyping,
    minReadSec: minRead,
    maxReadSec: maxRead,
    defaultRemindDays,
    defaultRemindTime,
    defaultRemindMsg: sanitizeText(raw.defaultRemindMsg, 2000)
      || ACCOUNT_MANAGER_DEFAULTS.defaultRemindMsg,
    mothers,
    clients,
    rentals,
  }
}

export function ensureAccountManager(db) {
  if (!db?.data) return normalizeAccountManager({})
  db.data.accountManager = normalizeAccountManager(db.data.accountManager || {})
  return db.data.accountManager
}

export function getMother(cfg, id) {
  return (cfg.mothers || []).find((m) => m.id === id) || null
}

export function getClient(cfg, id) {
  return (cfg.clients || []).find((c) => c.id === id) || null
}

export function getProfile(mother, profileId) {
  if (!mother) return null
  return (mother.profiles || []).find((p) => p.id === profileId) || null
}

export function rentalStatusLabel(r) {
  if (!r) return '—'
  if (r.status === 'cancelled') return 'Cancelado'
  if (r.status === 'expired' || (r.expiresAt && r.expiresAt < Date.now())) return 'Vencido'
  return 'Activo'
}

export function isRentalActive(r) {
  if (!r || r.status === 'cancelled') return false
  if (r.expiresAt && r.expiresAt < Date.now()) return false
  return r.status === 'active'
}

/** Recalcula status rented de perfiles según alquileres activos. */
export function syncProfileRentalStatus(cfg) {
  const rented = new Set()
  for (const r of cfg.rentals || []) {
    if (isRentalActive(r) && r.profileId) rented.add(r.profileId)
  }
  for (const m of cfg.mothers || []) {
    for (const p of m.profiles || []) {
      if (p.status === 'blocked') continue
      p.status = rented.has(p.id) ? 'rented' : 'available'
    }
  }
  return cfg
}

export function buildRentalContext(cfg, rental) {
  const client = getClient(cfg, rental.clientId) || {}
  const mother = getMother(cfg, rental.motherId) || {}
  const profile = getProfile(mother, rental.profileId) || {}
  const correoPerfil = profile.email || client.email || ''
  const usuarioPerfil = profile.user || ''
  return {
    nombre: client.name || '',
    whatsapp: client.whatsapp || '',
    perfil: profile.name || '',
    cuenta: mother.name || '',
    inicio: formatDateDisplay(rental.startAt),
    vence: formatDateDisplay(rental.expiresAt),
    plan: rental.planLabel || '',
    user: usuarioPerfil,
    usuario: usuarioPerfil,
    pass: profile.pass || '',
    contraseña: profile.pass || '',
    contrasena: profile.pass || '',
    clave: profile.pass || '',
    pin: profile.pin || '',
    email: correoPerfil,
    correo: correoPerfil,
    correo_cuenta: mother.motherEmail || '',
    usuario_cuenta: mother.motherUser || '',
    motherEmail: mother.motherEmail || '',
    motherUser: mother.motherUser || '',
    id_perfil: profile.extraId || '',
    extraId: profile.extraId || '',
  }
}

/**
 * ¿Debe enviarse recordatorio ahora?
 * - remindEnabled
 * - día = vence - remindDaysBefore (fecha local)
 * - hora actual >= remindTime
 * - no enviado ese día (lastRemindDay)
 */
export function shouldSendRemindToday(rental, now = new Date()) {
  if (!rental?.remindEnabled || !rental.expiresAt) return false
  if (rental.status === 'cancelled') return false
  if (!rental.clientId) return false

  const expires = new Date(rental.expiresAt)
  if (Number.isNaN(expires.getTime())) return false

  // Día del aviso: expires - N days (misma hora base del día local)
  const days = Math.max(0, parseInt(rental.remindDaysBefore, 10) || 0)
  const remindDay = new Date(expires)
  remindDay.setHours(12, 0, 0, 0)
  remindDay.setDate(remindDay.getDate() - days)

  const today = new Date(now)
  today.setHours(12, 0, 0, 0)

  if (today.getTime() !== remindDay.getTime()) return false

  const dayKey = toDateInputValue(today.getTime())
  if (rental.lastRemindDay === dayKey) return false

  const [hh, mm] = String(rental.remindTime || '10:00').split(':').map((n) => parseInt(n, 10))
  const targetMin = (hh || 0) * 60 + (mm || 0)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return nowMin >= targetMin
}

export function daysUntilExpiry(rental, now = Date.now()) {
  if (!rental?.expiresAt) return null
  return Math.ceil((rental.expiresAt - now) / 86400000)
}

export { computeTypingMs, computeReadMs }
