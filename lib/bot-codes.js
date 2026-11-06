/**
 * Bot Códigos — alias/números por bot; IMAP global (panel maestro → Config Email).
 */
import { randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { ImapFlow } from 'imapflow'

const GLOBAL_MAIL_PATH = path.join(process.cwd(), 'storage', 'databases', 'bot-codes-mail.json')

/** Tiempos humanos globales para /code (panel maestro → Config Email). */
export const CODE_RESPONSE_TIMING_DEFAULTS = {
  minReadSec: 2,
  maxReadSec: 5,
  minTypingSec: 3,
  maxTypingSec: 8,
}

export const BOT_CODES_DEFAULTS = {
  domain: 'nexcodea.com',
  catchAll: true,
  settings: {
    enabled: true,
    commandsEnabled: true,
    defaultAccessDays: 30,
  },
  mailboxes: [
    {
      id: 'streaming',
      label: 'Streaming',
      email: 'cuentas-streaming@nexcodea.com',
      password: '',
      imapHost: 'mail.spacemail.com',
      imapPort: 993,
      smtpHost: 'mail.spacemail.com',
      smtpPort: 465,
      notes: 'IMAP global (panel maestro → Configuración → Email)',
      provider: 'spacemail',
    },
  ],
  aliases: [],
}

export const STREAMING_SERVICES = [
  { id: 'netflix', label: 'Netflix', match: /netflix/i },
  { id: 'disney', label: 'Disney+', match: /disney|disneyplus|disney\+/i },
  { id: 'max', label: 'Max / HBO', match: /\bmax\b|hbo\s*max|hbomax|warner/i },
  { id: 'paramount', label: 'Paramount+', match: /paramount/i },
  { id: 'crunchyroll', label: 'Crunchyroll', match: /crunchyroll/i },
  { id: 'vix', label: 'Vix', match: /\bvix\b/i },
  { id: 'plex', label: 'Plex', match: /\bplex\b/i },
  { id: 'dgo', label: 'DGO', match: /\bdgo\b|directv\s*go|directvgo/i },
  { id: 'pluto', label: 'Pluto TV', match: /pluto/i },
  { id: 'prime', label: 'Prime Video', match: /prime\s*video|amazon\s*prime|\bamazon\b/i },
  { id: 'spotify', label: 'Spotify', match: /spotify/i },
  { id: 'youtube', label: 'YouTube', match: /youtube|youtu\.be/i },
  { id: 'apple', label: 'Apple TV+', match: /apple\s*tv|itunes/i },
  { id: 'other', label: 'Otro', match: null },
]

/** Presets IMAP/SMTP (mismo formulario para todos). */
export const MAIL_PROVIDERS = [
  {
    id: 'spacemail',
    label: 'Spaceship Spacemail',
    imapHost: 'mail.spacemail.com',
    imapPort: 993,
    smtpHost: 'mail.spacemail.com',
    smtpPort: 465,
  },
  {
    id: 'gmail',
    label: 'Gmail',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
  },
  {
    id: 'outlook',
    label: 'Outlook / Hotmail',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
  },
  {
    id: 'custom',
    label: 'Otro proveedor (manual)',
    imapHost: '',
    imapPort: 993,
    smtpHost: '',
    smtpPort: 465,
  },
]

export function newId(prefix = 'bc') {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
}

export function sanitizeText(v, max = 200) {
  return String(v ?? '').trim().slice(0, max)
}

function sanitizeMailbox(raw = {}, fallback = {}) {
  const id = sanitizeText(raw.id || fallback.id, 32) || newId('mb')
  let email = sanitizeText(raw.email || fallback.email, 120).toLowerCase()
  const imapPort = parseInt(raw.imapPort ?? fallback.imapPort ?? 993, 10)
  const smtpPort = parseInt(raw.smtpPort ?? fallback.smtpPort ?? 465, 10)
  const provider = sanitizeText(raw.provider || fallback.provider || 'spacemail', 32) || 'spacemail'
  return {
    id,
    label: sanitizeText(raw.label || fallback.label || id, 40) || id,
    email,
    password: String(raw.password ?? fallback.password ?? ''),
    imapHost: sanitizeText(raw.imapHost || fallback.imapHost || 'mail.spacemail.com', 80) || 'mail.spacemail.com',
    imapPort: Number.isFinite(imapPort) ? imapPort : 993,
    smtpHost: sanitizeText(raw.smtpHost || fallback.smtpHost || 'mail.spacemail.com', 80) || 'mail.spacemail.com',
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : 465,
    notes: sanitizeText(raw.notes || fallback.notes || '', 200),
    provider,
  }
}

export function normalizePhoneDigits(input) {
  return String(input || '').replace(/\D/g, '')
}

function sanitizePhoneEntry(raw = {}, defaultDays = 30) {
  if (!raw || typeof raw !== 'object') return null
  const number = normalizePhoneDigits(raw.number || raw.phone || raw.whatsapp)
  if (number.length < 8 || number.length > 15) return null
  const days = Math.max(1, Math.min(3650, parseInt(raw.accessDays ?? defaultDays, 10) || defaultDays))
  let expiresAt = Number(raw.expiresAt) || 0
  const createdAt = Number(raw.createdAt) || Date.now()
  if (!expiresAt) {
    expiresAt = createdAt + days * 86400000
  }
  return {
    id: sanitizeText(raw.id, 48) || newId('ph'),
    number,
    name: sanitizeText(raw.name, 60),
    accessDays: days,
    createdAt,
    expiresAt,
  }
}

function sanitizeAlias(raw = {}, domain = 'nexcodea.com', defaultDays = 30) {
  if (!raw || typeof raw !== 'object') return null
  let local = sanitizeText(raw.localPart || raw.alias || '', 64).toLowerCase()
  local = local.replace(/@.*$/, '').replace(/[^a-z0-9._+-]/g, '')
  if (!local) return null
  const service = STREAMING_SERVICES.some((s) => s.id === raw.service) ? raw.service : 'other'
  const phones = Array.isArray(raw.phones)
    ? raw.phones.map((p) => sanitizePhoneEntry(p, defaultDays)).filter(Boolean)
    : []
  // dedupe by number (keep newest expiry)
  const byNum = new Map()
  for (const p of phones) {
    const prev = byNum.get(p.number)
    if (!prev || p.expiresAt > prev.expiresAt) byNum.set(p.number, p)
  }
  return {
    id: sanitizeText(raw.id, 48) || newId('als'),
    localPart: local,
    email: `${local}@${domain}`,
    mailboxId: 'streaming',
    service,
    notes: sanitizeText(raw.notes, 200),
    spacemailOk: true,
    phones: [...byNum.values()],
    createdAt: Number(raw.createdAt) || Date.now(),
  }
}

function sanitizeSettings(raw = {}) {
  const days = parseInt(raw.defaultAccessDays ?? BOT_CODES_DEFAULTS.settings.defaultAccessDays, 10)
  return {
    enabled: raw.enabled !== false && raw.enabled !== '0',
    commandsEnabled: raw.commandsEnabled !== false && raw.commandsEnabled !== '0',
    defaultAccessDays: Number.isFinite(days) ? Math.max(1, Math.min(3650, days)) : 30,
  }
}

export function normalizeBotCodes(raw = {}) {
  const domain =
    sanitizeText(raw.domain || BOT_CODES_DEFAULTS.domain, 80).toLowerCase().replace(/^@/, '') ||
    'nexcodea.com'

  const settings = sanitizeSettings(raw.settings || {})

  const def = BOT_CODES_DEFAULTS.mailboxes[0]
  const rawList = Array.isArray(raw.mailboxes) ? raw.mailboxes : []
  const rawMb =
    rawList.find((m) => m?.id === 'streaming') ||
    rawList.find((m) => String(m?.email || '').toLowerCase().includes('cuentas-streaming')) ||
    rawList[0] ||
    {}

  const merged = sanitizeMailbox(
    {
      ...def,
      ...rawMb,
      id: 'streaming',
      email: rawMb.email || def.email,
      // Cada bot guarda su password en su database.json (no se comparte entre sub-bots)
      password: rawList.length ? String(rawMb.password ?? '') : String(def.password || ''),
      provider: rawMb.provider || def.provider || 'spacemail',
    },
    def
  )

  const aliases = Array.isArray(raw.aliases)
    ? raw.aliases.map((a) => sanitizeAlias(a, domain, settings.defaultAccessDays)).filter(Boolean)
    : []

  return {
    domain,
    catchAll: raw.catchAll !== false,
    settings,
    mailboxes: [merged],
    aliases,
  }
}

export function ensureBotCodes(db) {
  if (!db?.data) return normalizeBotCodes({})
  // Dominio efectivo = global (si existe)
  const globalMail = getGlobalMailConfig()
  const raw = { ...(db.data.botCodes || {}) }
  if (globalMail.domain) raw.domain = globalMail.domain
  // Mailbox efectivo siempre desde global (no se edita por bot)
  raw.mailboxes = [globalMail.mailbox]
  db.data.botCodes = normalizeBotCodes(raw)
  return db.data.botCodes
}

export function sanitizeResponseTiming(raw = {}) {
  const d = CODE_RESPONSE_TIMING_DEFAULTS
  let minReadSec = Math.max(0, Math.min(60, parseInt(raw.minReadSec, 10)))
  if (!Number.isFinite(minReadSec)) minReadSec = d.minReadSec
  let maxReadSec = Math.max(0, Math.min(90, parseInt(raw.maxReadSec, 10)))
  if (!Number.isFinite(maxReadSec)) maxReadSec = d.maxReadSec
  let minTypingSec = Math.max(1, Math.min(60, parseInt(raw.minTypingSec, 10)))
  if (!Number.isFinite(minTypingSec)) minTypingSec = d.minTypingSec
  let maxTypingSec = Math.max(1, Math.min(120, parseInt(raw.maxTypingSec, 10)))
  if (!Number.isFinite(maxTypingSec)) maxTypingSec = d.maxTypingSec
  if (maxReadSec < minReadSec) maxReadSec = minReadSec
  if (maxTypingSec < minTypingSec) maxTypingSec = minTypingSec
  return { minReadSec, maxReadSec, minTypingSec, maxTypingSec }
}

/** Segundos aleatorios en rango [min, max] → ms. */
export function computeCodeReadMs(timing) {
  const t = sanitizeResponseTiming(timing || {})
  const span = Math.max(0, t.maxReadSec - t.minReadSec)
  return Math.floor((t.minReadSec + Math.random() * (span + 0.001)) * 1000)
}

export function computeCodeTypingMs(timing, text = '') {
  const t = sanitizeResponseTiming(timing || {})
  const minMs = t.minTypingSec * 1000
  const maxMs = t.maxTypingSec * 1000
  const lenBonus = Math.min(String(text || '').length * 25, 2500)
  const span = Math.max(0, maxMs - minMs)
  const jitter = Math.floor(Math.random() * (span + 1))
  return Math.min(maxMs + 1500, Math.max(minMs, minMs + lenBonus * 0.4 + jitter))
}

/** Lectura del correo IMAP global (panel maestro). */
export function getGlobalMailConfig() {
  const def = BOT_CODES_DEFAULTS.mailboxes[0]
  let raw = null
  try {
    if (existsSync(GLOBAL_MAIL_PATH)) {
      raw = JSON.parse(readFileSync(GLOBAL_MAIL_PATH, 'utf8'))
    }
  } catch (e) {
    console.error('[BOT-CODIGOS] Error leyendo mail global:', e.message)
  }
  const domain =
    sanitizeText(raw?.domain || BOT_CODES_DEFAULTS.domain, 80).toLowerCase().replace(/^@/, '') ||
    'nexcodea.com'
  const mailbox = sanitizeMailbox(
    {
      ...def,
      ...(raw?.mailbox || {}),
      id: 'streaming',
    },
    def
  )
  return {
    domain,
    catchAll: raw?.catchAll !== false,
    mailbox,
    responseTiming: sanitizeResponseTiming(raw?.responseTiming || {}),
  }
}

/** Guarda IMAP global (solo maestro). */
export function saveGlobalMailConfig(fields = {}) {
  const current = getGlobalMailConfig()
  const nextMailbox = sanitizeMailbox(
    {
      ...current.mailbox,
      ...(fields.mailbox || {}),
      id: 'streaming',
      // password vacío en fields = no pisar
      password:
        fields.mailbox && Object.prototype.hasOwnProperty.call(fields.mailbox, 'password')
          ? fields.mailbox.password !== ''
            ? fields.mailbox.password
            : current.mailbox.password
          : current.mailbox.password,
    },
    current.mailbox
  )
  const domain =
    sanitizeText(fields.domain != null ? fields.domain : current.domain, 80)
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9.-]/g, '') || current.domain

  const next = {
    domain,
    catchAll: fields.catchAll != null ? !!fields.catchAll : current.catchAll,
    mailbox: nextMailbox,
    responseTiming: sanitizeResponseTiming(
      fields.responseTiming != null ? fields.responseTiming : current.responseTiming
    ),
  }
  mkdirSync(path.dirname(GLOBAL_MAIL_PATH), { recursive: true })
  writeFileSync(GLOBAL_MAIL_PATH, JSON.stringify(next, null, 2), 'utf8')
  return next
}

export function getMailbox(cfg, id) {
  // Preferir siempre el global
  const global = getGlobalMailConfig().mailbox
  if (!id || id === 'streaming' || id === global.id) return global
  return (cfg.mailboxes || []).find((m) => m.id === id) || global
}

/** Mailbox listo para IMAP (global). */
export function getEffectiveMailbox(_cfg) {
  return getGlobalMailConfig().mailbox
}

export function getEffectiveDomain(cfg) {
  return getGlobalMailConfig().domain || cfg?.domain || BOT_CODES_DEFAULTS.domain
}

/** Solo correos dirigidos a alias de ESTE bot (Juan ≠ Julio). */
export function filterMessagesForBotAliases(messages = [], cfg = {}) {
  const aliases = cfg.aliases || []
  if (!aliases.length) return []
  const emails = new Set(aliases.map((a) => String(a.email || '').toLowerCase()).filter(Boolean))
  const locals = new Set(aliases.map((a) => String(a.localPart || '').toLowerCase()).filter(Boolean))
  return (messages || []).filter((m) => {
    const toList = (m.to || []).map((t) => String(t).toLowerCase())
    return toList.some(
      (t) => emails.has(t) || [...locals].some((l) => t === `${l}@${cfg.domain}` || t.startsWith(`${l}@`))
    )
  })
}

export function detectService(text = '') {
  const s = String(text || '')
  for (const svc of STREAMING_SERVICES) {
    if (svc.id === 'other' || !svc.match) continue
    if (svc.match.test(s)) return svc.id
  }
  return 'other'
}

export function serviceLabel(id) {
  return STREAMING_SERVICES.find((s) => s.id === id)?.label || id || 'Otro'
}

function decodeQuotedPrintable(input = '') {
  const src = String(input || '').replace(/=\r?\n/g, '')
  const bytes = []
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '=' && /^[0-9A-F]{2}$/i.test(src.slice(i + 1, i + 3))) {
      bytes.push(parseInt(src.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      bytes.push(src.charCodeAt(i) & 0xff)
    }
  }
  try {
    return Buffer.from(bytes).toString('utf8')
  } catch {
    return String.fromCharCode(...bytes)
  }
}

function decodeBase64Safe(input = '') {
  try {
    return Buffer.from(String(input).replace(/\s+/g, ''), 'base64').toString('utf8')
  } catch {
    return ''
  }
}

/** HTML de correo → texto legible (sin CSS/JS). */
export function htmlToText(html = '') {
  let s = String(html || '')
  s = s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(title|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/@font-face\s*\{[\s\S]*?\}/gi, ' ')
    .replace(/@media[^{]*\{[\s\S]*?\}\s*\}/gi, ' ')

  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article)>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')

  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&zwnj;|&zwj;|&#8203;|&#x200[bc];/gi, '')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n)
      return Number.isFinite(code) ? String.fromCharCode(code) : ''
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&copy;/gi, '©')

  return s
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripHtml(html = '') {
  return htmlToText(html)
}

function isLikelyCssJunk(code = '') {
  const c = String(code).toUpperCase()
  // hex colors / css tokens
  if (/^[0-9A-F]{3}$|^[0-9A-F]{6}$|^[0-9A-F]{8}$/.test(c) && /[A-F]/.test(c)) return true
  if (/^(FFF|000|FFF{3}|000000|FFFFFF|F9F9F9|202124|252526|707070|111111|222222)$/i.test(c)) return true
  if (/^(HTTP|HTTPS|WWW|EMAIL|HTML|UTF|FROM|SUBJECT|STYLE|FONT|COLOR|WIDTH|HEIGHT|PX|RGB|RGBA)$/i.test(c)) {
    return true
  }
  // years / zip-like noise
  if (/^20[2-3]\d$/.test(c)) return true
  // OTP real siempre tiene dígitos (nunca solo letras)
  if (!/\d/.test(c)) return true
  // solo letras+pocos dígitos tipo "DISNEY" no aplica; ya filtrado arriba
  return false
}

function scoreCodeCandidate(code, haystack, index) {
  const c = String(code)
  let score = 0
  const before = haystack.slice(Math.max(0, index - 160), index).toLowerCase()
  const after = haystack.slice(index, Math.min(haystack.length, index + c.length + 60)).toLowerCase()
  const ctx = before + after

  if (/(passcode|one-time|otp|c[oó]digo|codigo|verification|verify the|pin\b|clave|security code|access code)/i.test(ctx)) {
    score += 50
  }
  if (/^\d{6}$/.test(c)) score += 40
  else if (/^\d{4,8}$/.test(c)) score += 18
  else if (/^[A-Z0-9]*\d[A-Z0-9]*$/i.test(c) && c.length >= 6) score += 8

  if (/(expire|expir|minutes|minutos|account|cuenta)/i.test(ctx)) score += 10
  if (/(privacy|street|burbank|lima|copyright|subscriber|font-size|webkit|padding|margin|help center)/i.test(ctx)) {
    score -= 35
  }
  if (isLikelyCssJunk(c)) score -= 100
  return score
}

/** Extrae códigos / OTP típicos de streaming (prioriza passcode real, no CSS). */
export function extractCodes(text = '') {
  // Compacta saltos para acercar "passcode" al número
  const raw = htmlToText(String(text || ''))
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!raw) return []

  const scored = new Map()

  const consider = (code, index) => {
    let c = String(code || '').trim().toUpperCase().replace(/\s+/g, '-')
    if (!c || c.length < 4 || c.length > 12) return
    if (!/\d/.test(c)) return
    if (isLikelyCssJunk(c)) return
    const score = scoreCodeCandidate(c, raw, index)
    if (score < 20) return
    const prev = scored.get(c)
    if (!prev || score > prev) scored.set(c, score)
  }

  // "passcode .... 926285" (hasta 220 chars de holgura)
  const labeled =
    /(?:one[-\s]?time\s+)?(?:passcode|password|otp|pin|c[oó]digo|codigo|clave|verification(?:\s+code)?|security\s+code|access\s+code)[\s\S]{0,220}?([A-Z0-9]{4,10})\b/gi
  let m
  while ((m = labeled.exec(raw)) !== null) {
    if (/\d/.test(m[1])) consider(m[1], m.index + m[0].lastIndexOf(m[1]))
  }

  // OTP suelto de 6 dígitos
  const six = /\b(\d{6})\b/g
  while ((m = six.exec(raw)) !== null) consider(m[1], m.index)

  // 4-8 dígitos (menos peso; score filtra)
  const nums = /\b(\d{4,8})\b/g
  while ((m = nums.exec(raw)) !== null) consider(m[1], m.index)

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([code]) => code)
}

function addressesFrom(envelopeField) {
  if (!envelopeField) return []
  const list = Array.isArray(envelopeField) ? envelopeField : [envelopeField]
  return list
    .map((a) => {
      if (!a) return ''
      if (typeof a === 'string') return a.toLowerCase()
      const mailbox = a.mailbox || a.user || ''
      const host = a.host || a.domain || ''
      if (mailbox && host) return `${mailbox}@${host}`.toLowerCase()
      return String(a.address || a.email || '').toLowerCase()
    })
    .filter(Boolean)
}

/** Extrae texto legible desde un .eml / source MIME crudo. */
export function extractReadableBody(rawSource = '') {
  const raw = Buffer.isBuffer(rawSource)
    ? rawSource.toString('utf8')
    : String(rawSource || '')
  if (!raw) return ''

  const parts = []
  const pushDecoded = (content, encoding = '', type = '') => {
    let body = String(content || '')
    const enc = String(encoding || '').toLowerCase()
    if (enc.includes('base64')) body = decodeBase64Safe(body)
    else if (enc.includes('quoted-printable') || /=[0-9A-F]{2}/i.test(body)) body = decodeQuotedPrintable(body)

    if (/html/i.test(type) || /<\/?(html|body|table|div)\b/i.test(body)) {
      body = htmlToText(body)
    } else {
      body = body.replace(/\r\n/g, '\n').trim()
    }
    body = body.trim()
    if (body) parts.push({ type: /html/i.test(type) ? 'html' : 'text', body })
  }

  // Multipart
  const boundaryMatch = raw.match(/boundary="?([^"\s;]+)"?/i)
  if (boundaryMatch) {
    const boundary = boundaryMatch[1]
    const chunks = raw.split(new RegExp(`(?:\\r?\\n)--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?`))
    for (const chunk of chunks) {
      if (!/content-type:/i.test(chunk)) continue
      const sep = chunk.search(/\r?\n\r?\n/)
      if (sep < 0) continue
      const headers = chunk.slice(0, sep)
      const content = chunk.slice(sep).replace(/^\r?\n\r?\n/, '')
      const type = headers.match(/Content-Type:\s*([^\s;]+)/i)?.[1] || ''
      const encoding = headers.match(/Content-Transfer-Encoding:\s*([^\s;]+)/i)?.[1] || ''
      if (!/text\/(plain|html)/i.test(type)) continue
      pushDecoded(content, encoding, type)
    }
  } else {
    // Single-part (típico Disney+ HTML QP)
    const sep = raw.search(/\r?\n\r?\n/)
    const headers = sep >= 0 ? raw.slice(0, sep) : ''
    const content = sep >= 0 ? raw.slice(sep).replace(/^\r?\n\r?\n/, '') : raw
    const type = headers.match(/Content-Type:\s*([^\s;]+)/i)?.[1] || 'text/html'
    const encoding = headers.match(/Content-Transfer-Encoding:\s*([^\s;]+)/i)?.[1] || ''
    pushDecoded(content, encoding, type)
  }

  if (!parts.length) {
    // Último recurso: limpiar todo el source
    return htmlToText(decodeQuotedPrintable(raw)).slice(0, 6000)
  }

  const plain = parts.find((p) => p.type === 'text')
  const html = parts.find((p) => p.type === 'html')
  // Preferir texto plano si es útil; si no, HTML limpio
  if (plain && plain.body.length >= 40) return plain.body.slice(0, 6000)
  if (html) return html.body.slice(0, 6000)
  return parts[0].body.slice(0, 6000)
}

/**
 * Lee últimos mensajes de un buzón vía IMAP (Spacemail).
 */
export async function fetchMailboxMessages(mailbox, { limit = 40, sinceDays = 14 } = {}) {
  if (!mailbox?.email || !mailbox?.password) {
    throw new Error('Falta email o contraseña del buzón')
  }

  const client = new ImapFlow({
    host: mailbox.imapHost || 'mail.spacemail.com',
    port: mailbox.imapPort || 993,
    secure: true,
    auth: {
      user: mailbox.email,
      pass: mailbox.password,
    },
    logger: false,
    tls: { rejectUnauthorized: true },
  })

  const messages = []
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const total = client.mailbox?.exists || 0
      if (total === 0) return []

      const fromSeq = Math.max(1, total - limit + 1)
      const range = `${fromSeq}:*`

      for await (const msg of client.fetch(range, {
        uid: true,
        envelope: true,
        source: true,
        flags: true,
      })) {
        const env = msg.envelope || {}
        const subject = String(env.subject || '(sin asunto)')
        const from = addressesFrom(env.from).join(', ')
        const to = [
          ...addressesFrom(env.to),
          ...addressesFrom(env.cc),
          ...addressesFrom(env.bcc),
        ]
        const date = env.date ? new Date(env.date).getTime() : Date.now()

        let bodyText = ''
        try {
          if (msg.source) bodyText = extractReadableBody(msg.source)
        } catch { /* ignore */ }

        const blob = `${subject}\n${from}\n${bodyText}`
        const service = detectService(blob)
        const codes = extractCodes(`${subject}\n${bodyText}`)

        // Preview: primeras líneas útiles (no vacías)
        const previewLine =
          bodyText
            .split(/\n+/)
            .map((l) => l.trim())
            .filter((l) => l && !/^&/.test(l) && l.length > 8)
            .slice(0, 3)
            .join(' · ') || subject

        messages.push({
          uid: msg.uid,
          mailboxId: mailbox.id,
          mailboxEmail: mailbox.email,
          subject,
          from,
          to,
          date,
          preview: previewLine.slice(0, 280),
          body: (bodyText || '').slice(0, 4000),
          service,
          codes,
          unseen: !(msg.flags && msg.flags.has('\\Seen')),
        })
      }
    } finally {
      lock.release()
    }
  } finally {
    try {
      await client.logout()
    } catch {
      try { client.close() } catch { /* ignore */ }
    }
  }

  const minTs = Date.now() - sinceDays * 86400000
  return messages
    .filter((m) => !m.date || m.date >= minTs)
    .sort((a, b) => (b.date || 0) - (a.date || 0))
}

export async function testMailboxConnection(mailbox) {
  const client = new ImapFlow({
    host: mailbox.imapHost || 'mail.spacemail.com',
    port: mailbox.imapPort || 993,
    secure: true,
    auth: { user: mailbox.email, pass: mailbox.password },
    logger: false,
  })
  try {
    await client.connect()
    const status = await client.status('INBOX', { messages: true, unseen: true })
    await client.logout()
    return {
      ok: true,
      messages: status.messages || 0,
      unseen: status.unseen || 0,
    }
  } catch (e) {
    try { client.close() } catch { /* ignore */ }
    return { ok: false, error: e.message || String(e) }
  }
}

export async function fetchAllInboxes(cfg, opts = {}) {
  const out = []
  const errors = []
  const mb = getEffectiveMailbox(cfg)
  if (!mb?.password) {
    errors.push({ mailboxId: 'streaming', error: 'Correo global sin contraseña (Configuración maestro → Email)' })
    return { messages: out, errors }
  }
  try {
    const msgs = await fetchMailboxMessages(mb, opts)
    out.push(...msgs)
  } catch (e) {
    errors.push({ mailboxId: mb.id || 'streaming', error: e.message || String(e) })
  }
  out.sort((a, b) => (b.date || 0) - (a.date || 0))
  return { messages: out, errors }
}

export function formatMailDate(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('es-PE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function formatExpiryDate(ts) {
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

export function resolvePlatform(input = '') {
  const s = String(input || '').trim().toLowerCase()
  if (!s) return ''
  const direct = STREAMING_SERVICES.find((x) => x.id === s)
  if (direct) return direct.id
  for (const svc of STREAMING_SERVICES) {
    if (svc.id === 'other') continue
    if (svc.label.toLowerCase() === s) return svc.id
    if (svc.match && svc.match.test(s)) return svc.id
  }
  if (/hbo/.test(s)) return 'max'
  if (/disney/.test(s)) return 'disney'
  if (/netflix|nflx/.test(s)) return 'netflix'
  return s.replace(/\s+/g, '') || 'other'
}

export function findAliasByEmail(cfg, emailOrLocal = '') {
  let raw = String(emailOrLocal || '').trim().toLowerCase()
  if (!raw) return null
  raw = raw.replace(/^<|>$/g, '')
  const domain = getEffectiveDomain(cfg)
  let local = raw
  let email = raw
  if (raw.includes('@')) {
    const [l, d] = raw.split('@')
    local = l
    email = `${l}@${d || domain}`
  } else {
    email = `${local}@${domain}`
  }
  return (
    (cfg.aliases || []).find(
      (a) => a.email === email || a.localPart === local || a.email === raw
    ) || null
  )
}

export function getPhoneOnAlias(alias, phoneDigits) {
  const dig = normalizePhoneDigits(phoneDigits)
  if (!dig || !alias) return null
  return (alias.phones || []).find((p) => p.number === dig) || null
}

export function isPhoneAccessActive(entry) {
  if (!entry) return false
  if (!entry.expiresAt) return true
  return Number(entry.expiresAt) > Date.now()
}

export function phoneHasAnyActiveAccess(cfg, phoneDigits) {
  const dig = normalizePhoneDigits(phoneDigits)
  if (!dig) return false
  for (const a of cfg.aliases || []) {
    const p = getPhoneOnAlias(a, dig)
    if (p && isPhoneAccessActive(p)) return true
  }
  return false
}

/**
 * Busca OTP para un número autorizado en un alias.
 * unauthorized / expired / alias missing → silent.
 */
export async function lookupCodeForRequest(cfg, { phone, email, platform } = {}) {
  const settings = cfg.settings || sanitizeSettings({})
  if (!settings.enabled || !settings.commandsEnabled) {
    return { ok: false, silent: true, reason: 'disabled' }
  }

  const dig = normalizePhoneDigits(phone)
  if (!dig) return { ok: false, silent: true, reason: 'no_phone' }

  const alias = findAliasByEmail(cfg, email)
  if (!alias) return { ok: false, silent: true, reason: 'alias_not_found' }

  const access = getPhoneOnAlias(alias, dig)
  if (!access) return { ok: false, silent: true, reason: 'unauthorized' }
  if (!isPhoneAccessActive(access)) return { ok: false, silent: true, reason: 'expired' }

  const platformId = resolvePlatform(platform)
  // El alias está atado a una plataforma: /code ...|disney no vale si el alias es netflix
  if (
    platformId &&
    alias.service &&
    alias.service !== 'other' &&
    platformId !== 'other' &&
    platformId !== alias.service
  ) {
    return { ok: false, silent: true, reason: 'platform_mismatch' }
  }

  const mailbox = getEffectiveMailbox(cfg)
  if (!mailbox?.password) {
    return { ok: false, silent: false, reason: 'mailbox_not_ready', error: 'Correo global sin contraseña (panel maestro → Email)' }
  }

  let messages = []
  try {
    messages = await fetchMailboxMessages(mailbox, { limit: 35, sinceDays: 5 })
  } catch (e) {
    return { ok: false, silent: false, reason: 'imap_error', error: e.message || String(e) }
  }

  const emailLow = alias.email.toLowerCase()
  const localLow = alias.localPart.toLowerCase()

  const matched = messages.filter((m) => {
    const toList = (m.to || []).map((t) => String(t).toLowerCase())
    const toOk = toList.some(
      (t) => t === emailLow || t.includes(emailLow) || t.startsWith(`${localLow}@`)
    )
    if (!toOk) return false
    if (!platformId || platformId === 'other') return (m.codes || []).length > 0
    const svc =
      m.service === platformId ||
      detectService(`${m.subject}\n${m.from}\n${m.body || ''}`) === platformId
    return svc && (m.codes || []).length > 0
  })

  let pool = matched
  if (!pool.length) {
    pool = messages.filter((m) => {
      const blob = `${m.subject}\n${(m.to || []).join(' ')}\n${m.preview || ''}`.toLowerCase()
      if (!blob.includes(localLow) && !blob.includes(emailLow)) return false
      if (!(m.codes || []).length) return false
      if (!platformId || platformId === 'other') return true
      return m.service === platformId || detectService(blob) === platformId
    })
  }

  if (!pool.length) {
    return {
      ok: true,
      found: false,
      alias: { email: alias.email, service: alias.service },
      platform: platformId || alias.service,
      codes: [],
      message: null,
    }
  }

  const best = pool[0]
  return {
    ok: true,
    found: true,
    alias: { email: alias.email, service: alias.service },
    platform: best.service || platformId || alias.service,
    codes: best.codes || [],
    message: {
      subject: best.subject,
      from: best.from,
      to: best.to,
      date: best.date,
      preview: best.preview,
    },
  }
}

export function parseCodeCommandText(text = '') {
  const raw = String(text || '').trim()
  if (!raw) return { email: '', platform: '' }
  let email = ''
  let platform = ''
  if (raw.includes('|')) {
    const [a, b] = raw.split('|')
    email = String(a || '').trim()
    platform = String(b || '').trim()
  } else {
    const parts = raw.split(/\s+/).filter(Boolean)
    email = parts[0] || ''
    platform = parts.slice(1).join(' ')
  }
  return { email, platform }
}

export const CODE_COMMAND_HELP =
  'Ejemplo:\n/code disney44@nexcodea.com|disney\n/codigo netflix-juan@nexcodea.com|netflix\n\nFormato: /code correo|plataforma'
