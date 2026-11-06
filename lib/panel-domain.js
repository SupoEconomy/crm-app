/**
 * Acceso público de paneles en UN SOLO PUERTO (el del maestro).
 * Formato: http(s)://IP-o-dominio:{puertoMaestro}/{id5}-{nombre}/
 * Cada sub-bot sigue independiente (su propia carpeta/datos). El maestro
 * reenvía por path a un puerto interno solo en 127.0.0.1 (no público).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, chmodSync } from 'fs'
import path from 'path'
import http from 'http'
import { platform } from 'process'

const CONFIG_PATH = path.join(process.cwd(), 'storage', 'databases', 'panel-domain.json')
const USUARIOS_DIR = path.join(process.cwd(), 'usuarios')

const DEFAULTS = {
  enabled: false,
  domain: '',
  protocol: 'https',
  masterPath: 'whis-sunkovv-z',
  landingEnabled: true,
  /** WhatsApp público (vacío = no se muestra). Solo dígitos o con + */
  contact: '',
  /** Precios visibles en landing (soles). Editables desde el maestro. */
  plans: {
    week1: { label: '1 semana', price: '' },
    week2: { label: '2 semanas', price: '' },
    month1: { label: '1 mes', price: '' },
    month2: { label: '2 meses', price: '' },
  },
  currency: 'S/',
}

const PLAN_KEYS = ['week1', 'week2', 'month1', 'month2']

function sanitizePlanPrice(raw) {
  const s = String(raw ?? '').trim().slice(0, 24)
  // permite "25", "25.00", "25 soles", vacío
  return s
}

function sanitizePlans(raw = {}) {
  const out = {}
  const defaults = DEFAULTS.plans
  for (const key of PLAN_KEYS) {
    const base = defaults[key] || { label: key, price: '' }
    const src = raw && typeof raw[key] === 'object' ? raw[key] : {}
    out[key] = {
      label: String(src.label != null ? src.label : base.label).trim().slice(0, 40) || base.label,
      price: sanitizePlanPrice(src.price != null ? src.price : base.price),
    }
  }
  return out
}

// slug → { number, port, name, panelSlug, panelId }
let _slugCache = new Map()
let _cacheAt = 0
const CACHE_MS = 3000

export function getDomainConfig() {
  const cfg = { ...DEFAULTS, plans: { ...DEFAULTS.plans } }
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
      if (raw && typeof raw === 'object') {
        if (typeof raw.enabled === 'boolean') cfg.enabled = raw.enabled
        if (raw.domain != null) cfg.domain = String(raw.domain).trim()
        if (raw.protocol === 'http' || raw.protocol === 'https') cfg.protocol = raw.protocol
        if (raw.masterPath != null) cfg.masterPath = String(raw.masterPath)
        if (typeof raw.landingEnabled === 'boolean') cfg.landingEnabled = raw.landingEnabled
        if (raw.contact != null) cfg.contact = String(raw.contact).trim().slice(0, 40)
        if (raw.whatsapp != null && !cfg.contact) cfg.contact = String(raw.whatsapp).trim().slice(0, 40)
        if (raw.currency != null) cfg.currency = String(raw.currency).trim().slice(0, 8) || 'S/'
        if (raw.plans) cfg.plans = raw.plans
      }
    }
  } catch (e) {
    console.error('[PANEL-DOMAIN] Error leyendo config:', e.message)
  }
  return sanitizeConfig(cfg)
}

/** Segmentos reservados que no se pueden usar como ruta maestra ni slug de sub-bot. */
const RESERVED_PATHS = new Set([
  'login', 'do-login', 'logout', 'status', 'api', 'images', 'branding-logo',
  'panel-master', 'admin', 'www', 'static', 'assets', 'favicon.ico',
  'update-panel-domain', 'create-user', 'spam-time-advisor-js',
])

/**
 * Normaliza ruta secreta del maestro: solo a-z 0-9 _ -
 * Min 4, max 48. Si queda vacía → default.
 */
export function sanitizeMasterPath(raw, fallback = DEFAULTS.masterPath) {
  let s = String(raw || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
  s = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  if (s.length < 4) s = String(fallback || 'whis-sunkovv-z').toLowerCase()
  // No permitir IDs de sub-bot (#####-nombre)
  if (/^\d{5}-/i.test(s)) s = `m-${s}`.slice(0, 48)
  if (RESERVED_PATHS.has(s)) s = `x-${s}`.slice(0, 48)
  return s
}

function sanitizeConfig(cfg) {
  let domain = String(cfg.domain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
  domain = domain.split('/')[0]
  const masterPath = sanitizeMasterPath(cfg.masterPath, DEFAULTS.masterPath)
  // Contacto WhatsApp: solo limpia, sin forzar número por defecto
  let contact = String(cfg.contact || '').trim().slice(0, 40)
  return {
    enabled: !!(cfg.enabled && domain),
    domain,
    protocol: cfg.protocol === 'http' ? 'http' : 'https',
    masterPath,
    landingEnabled: cfg.landingEnabled !== false,
    contact,
    currency: String(cfg.currency || 'S/').trim().slice(0, 8) || 'S/',
    plans: sanitizePlans(cfg.plans),
  }
}

export function saveDomainConfig(fields = {}) {
  const current = getDomainConfig()
  let plans = current.plans
  if (fields.plans && typeof fields.plans === 'object') {
    plans = sanitizePlans({ ...current.plans, ...fields.plans })
  }
  // Atajos desde el form: plan_week1_price, plan_week1_label, etc.
  if (fields.planPrices || fields.planLabels) {
    const merged = { ...current.plans }
    for (const key of PLAN_KEYS) {
      merged[key] = {
        label: fields.planLabels?.[key] != null ? fields.planLabels[key] : merged[key].label,
        price: fields.planPrices?.[key] != null ? fields.planPrices[key] : merged[key].price,
      }
    }
    plans = sanitizePlans(merged)
  }

  const next = sanitizeConfig({
    enabled: fields.enabled != null ? !!fields.enabled : current.enabled,
    domain: fields.domain != null ? fields.domain : current.domain,
    protocol: fields.protocol || current.protocol,
    masterPath: fields.masterPath != null ? fields.masterPath : current.masterPath,
    landingEnabled: fields.landingEnabled != null ? !!fields.landingEnabled : current.landingEnabled,
    contact: fields.contact != null ? fields.contact : current.contact,
    currency: fields.currency != null ? fields.currency : current.currency,
    plans,
  })
  if (fields.enabled === false) next.enabled = false
  if (fields.enabled === true && next.domain) next.enabled = true

  mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8')
  invalidateSlugCache()
  return next
}

/** WhatsApp solo dígitos (para wa.me). */
export function whatsappDigits(contact) {
  return String(contact || '').replace(/\D/g, '')
}

export function isDomainModeActive() {
  const c = getDomainConfig()
  return c.enabled && !!c.domain
}

/** Prefijo del panel maestro: /whis-sunkovv-z  (siempre con slash inicial, sin trailing salvo uso interno) */
export function getMasterPanelBase() {
  const c = getDomainConfig()
  const seg = sanitizeMasterPath(c.masterPath)
  return `/${seg}`
}

export function isLandingEnabled() {
  return getDomainConfig().landingEnabled !== false
}

/** URL completa del panel maestro (login/inicio). */
export function getMasterPanelEntryUrl() {
  const conf = getDomainConfig()
  const base = getMasterPanelBase()
  if (conf.enabled && conf.domain) {
    return `${conf.protocol}://${conf.domain}${base}/`
  }
  return base + '/'
}

export function getPublicOrigin() {
  const c = getDomainConfig()
  if (!c.enabled || !c.domain) return null
  return `${c.protocol}://${c.domain}`
}

/** Nombre → slug seguro (amigable en URL). */
export function slugifyName(name) {
  const s = String(name || 'bot')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return s || 'bot'
}

export function generatePanelId(usedIds = new Set()) {
  for (let i = 0; i < 80; i++) {
    const id = String(Math.floor(10000 + Math.random() * 90000))
    if (!usedIds.has(id)) return id
  }
  return String(Date.now()).slice(-5)
}

export function buildPanelSlug(panelId, name) {
  const id = String(panelId || '').replace(/\D/g, '').slice(0, 5).padStart(5, '0')
  return `${id}-${slugifyName(name)}`
}

/** ¿Coincide con id5-nombre? */
export function isPanelSlugPath(segment) {
  return /^\d{5}-[a-z0-9][a-z0-9_-]{0,40}$/i.test(String(segment || ''))
}

/**
 * Asegura panelId + panelSlug en un objeto link/subbot.
 * @returns {{ panelId, panelSlug, changed }}
 */
export function ensurePanelSlugFields(data = {}, { name, usedIds } = {}) {
  const out = { ...data }
  let changed = false
  const nm = name || out.name || 'bot'

  let panelId = String(out.panelId || '').replace(/\D/g, '')
  if (panelId.length !== 5) {
    panelId = generatePanelId(usedIds || collectUsedPanelIds())
    out.panelId = panelId
    changed = true
  } else {
    out.panelId = panelId
  }

  const slug = buildPanelSlug(out.panelId, nm)
  if (out.panelSlug !== slug) {
    out.panelSlug = slug
    changed = true
  }
  return { ...out, changed }
}

export function collectUsedPanelIds() {
  const ids = new Set()
  try {
    if (!existsSync(USUARIOS_DIR)) return ids
    for (const folder of readdirSync(USUARIOS_DIR)) {
      const linkPath = path.join(USUARIOS_DIR, folder, 'link.json')
      if (!existsSync(linkPath)) continue
      try {
        const link = JSON.parse(readFileSync(linkPath, 'utf8'))
        const id = String(link.panelId || '').replace(/\D/g, '')
        if (id.length === 5) ids.add(id)
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return ids
}

/**
 * Persiste panelId/slug en link.json (y devuelve el slug final).
 */
export async function ensureLinkPanelSlug(userDir, { name, port } = {}, fsAsync = null) {
  const linkFile = path.join(userDir, 'link.json')
  let link = {}
  try {
    if (existsSync(linkFile)) {
      link = JSON.parse(readFileSync(linkFile, 'utf8'))
    }
  } catch {
    link = {}
  }
  if (name) link.name = name
  if (port) link.port = port

  const fixed = ensurePanelSlugFields(link, { name: link.name })
  const { changed, ...clean } = fixed
  delete clean.changed

  if (changed || !existsSync(linkFile)) {
    if (fsAsync?.writeFile) {
      await fsAsync.writeFile(linkFile, JSON.stringify(clean, null, 2))
    } else {
      writeFileSync(linkFile, JSON.stringify(clean, null, 2), 'utf8')
    }
    invalidateSlugCache()
  }
  return clean
}

export function invalidateSlugCache() {
  _slugCache = new Map()
  _cacheAt = 0
}

/**
 * Canal interno del panel de un sub-bot (sin puerto TCP extra).
 * Linux/Pterodactyl: archivo .sock  ·  Windows: named pipe.
 */
export function getSubbotSocketPath(number) {
  const n = String(number || '').replace(/\D/g, '')
  if (!n) return null
  if (platform === 'win32') {
    return `\\\\.\\pipe\\botspam-panel-${n}`
  }
  return path.join(process.cwd(), 'usuarios', n, 'panel.sock')
}

/** Quita un .sock viejo para poder volver a escuchar (Unix). */
export function prepareSubbotSocket(number) {
  const sock = getSubbotSocketPath(number)
  if (!sock) return sock
  if (platform === 'win32') return sock
  try {
    mkdirSync(path.dirname(sock), { recursive: true })
  } catch { /* ignore */ }
  try {
    if (existsSync(sock)) unlinkSync(sock)
  } catch { /* ignore */ }
  return sock
}

export function markSubbotSocketReady(number) {
  const sock = getSubbotSocketPath(number)
  if (!sock || platform === 'win32') return
  try {
    chmodSync(sock, 0o600)
  } catch { /* ignore */ }
}

/**
 * Mapa slug → { number, port, socketPath, name, panelSlug, panelId }
 * Se refresca cada pocos segundos.
 */
export function getSlugRegistry(force = false) {
  const now = Date.now()
  if (!force && _slugCache.size >= 0 && now - _cacheAt < CACHE_MS && _cacheAt > 0) {
    return _slugCache
  }
  const map = new Map()
  try {
    if (!existsSync(USUARIOS_DIR)) {
      _slugCache = map
      _cacheAt = now
      return map
    }
    for (const folder of readdirSync(USUARIOS_DIR)) {
      const dir = path.join(USUARIOS_DIR, folder)
      try {
        if (!statSync(dir).isDirectory()) continue
      } catch {
        continue
      }
      const linkPath = path.join(dir, 'link.json')
      if (!existsSync(linkPath)) continue
      try {
        let link = JSON.parse(readFileSync(linkPath, 'utf8'))
        const fixed = ensurePanelSlugFields(link, { name: link.name })
        if (fixed.changed) {
          const { changed, ...clean } = fixed
          writeFileSync(linkPath, JSON.stringify(clean, null, 2), 'utf8')
          link = clean
        } else {
          link = fixed
          delete link.changed
        }
        if (!link.panelSlug) continue
        const port = parseInt(link.port, 10) || 0
        map.set(String(link.panelSlug).toLowerCase(), {
          number: folder,
          port,
          socketPath: getSubbotSocketPath(folder),
          name: link.name || folder,
          panelSlug: link.panelSlug,
          panelId: link.panelId,
        })
      } catch { /* ignore */ }
    }
  } catch (e) {
    console.error('[PANEL-DOMAIN] Error registry:', e.message)
  }
  _slugCache = map
  _cacheAt = now
  return map
}

export function resolveSlug(slug) {
  if (!slug) return null
  const reg = getSlugRegistry()
  return reg.get(String(slug).toLowerCase()) || null
}

/**
 * URL pública de entrada al panel de un sub-bot.
 * Siempre por path /id-nombre/ en el puerto del maestro (IP o dominio).
 * `port` interno ya no se expone.
 */
export function buildSubbotPanelUrl({ panelSlug, publicIP, masterPort } = {}) {
  const slug = String(panelSlug || '').replace(/^\/+|\/+$/g, '')
  if (!slug) return ''
  const origin = getPublicOrigin()
  if (origin) return `${origin}/${slug}/`
  const ip = publicIP || '127.0.0.1'
  const p = parseInt(masterPort, 10)
  if (p > 0) return `http://${ip}:${p}/${slug}/`
  return `/${slug}/`
}

/** Extrae el primer segmento de path si es un slug de panel. */
export function extractSlugFromUrl(urlPath) {
  const p = String(urlPath || '')
  const m = p.match(/^\/(\d{5}-[a-z0-9][a-z0-9_-]{0,40})(\/|$|\?)/i)
  if (!m) return null
  return m[1]
}

/**
 * Prefija un path absoluto con /slug (sin duplicar si ya lo tiene).
 */
function withSlugPrefix(absPath, slugPrefix) {
  const prefix = `/${String(slugPrefix || '').replace(/^\/+|\/+$/g, '')}`
  if (!absPath || typeof absPath !== 'string') return absPath
  if (!absPath.startsWith('/')) return absPath
  if (absPath.startsWith('//')) return absPath // protocolo-relativo

  const pathOnly = absPath.split(/[?#]/)[0] || '/'
  const lowerPath = pathOnly.toLowerCase()
  const lowerPref = prefix.toLowerCase()
  if (lowerPath === lowerPref || lowerPath.startsWith(lowerPref + '/')) {
    return absPath
  }
  // Evita /slug + /slug/... si llegó una ruta ya con el prefijo en otra capitalización
  return prefix + absPath
}

/**
 * Quita uno o más prefijos /id5-nombre del path (case-insensitive).
 * Sirve cuando un enlace quedó con doble prefijo por rewrite fallido.
 */
function stripSlugFromUrl(urlPath, slugPrefix) {
  let rest = String(urlPath || '/')
  if (!rest.startsWith('/')) rest = `/${rest}`

  const tryStrip = (prefix) => {
    const pref = `/${String(prefix || '').replace(/^\/+|\/+$/g, '')}`
    if (pref === '/') return false
    const lower = rest.toLowerCase()
    const pLower = pref.toLowerCase()
    if (lower === pLower) {
      rest = '/'
      return true
    }
    if (lower.startsWith(pLower + '?') || lower.startsWith(pLower + '#')) {
      rest = rest.slice(pref.length)
      if (!rest.startsWith('/') && !rest.startsWith('?') && !rest.startsWith('#')) rest = `/${rest}`
      if (rest.startsWith('?') || rest.startsWith('#')) rest = `/${rest}`
      return true
    }
    if (lower.startsWith(pLower + '/')) {
      rest = rest.slice(pref.length) || '/'
      if (!rest.startsWith('/')) rest = `/${rest}`
      return true
    }
    return false
  }

  // Hasta 3: slug esperado + posibles dobles prefijos /#####-name/
  for (let i = 0; i < 3; i++) {
    let changed = false
    if (slugPrefix && tryStrip(slugPrefix)) changed = true
    else {
      const m = rest.match(/^\/(\d{5}-[a-z0-9][a-z0-9_-]{0,40})(?=\/|\?|#|$)/i)
      if (m && tryStrip(m[1])) changed = true
    }
    if (!changed) break
  }
  if (!rest.startsWith('/')) rest = `/${rest}`
  return rest || '/'
}

/**
 * Reescribe Location / Set-Cookie / HTML para que el prefijo /slug quede invisible al puerto.
 */
function rewriteLocation(loc, slugPrefix, publicHost) {
  if (!loc) return loc
  const prefix = `/${String(slugPrefix || '').replace(/^\/+|\/+$/g, '')}`
  try {
    if (loc.startsWith('http://') || loc.startsWith('https://')) {
      const u = new URL(loc)
      const hostOnly = String(publicHost || '').split(':')[0].toLowerCase()
      const locHost = String(u.hostname || '').toLowerCase()
      // Redirects al loopback, al dominio o a la IPv4 con la que entró el cliente
      if (
        locHost === '127.0.0.1' ||
        locHost === 'localhost' ||
        locHost === '::1' ||
        (hostOnly && locHost === hostOnly)
      ) {
        return withSlugPrefix((u.pathname || '/') + u.search + u.hash, prefix)
      }
      return loc
    }
    if (loc.startsWith('/')) {
      return withSlugPrefix(loc, prefix)
    }
  } catch { /* ignore */ }
  return loc
}

function rewriteSetCookie(cookie, slugPrefix) {
  if (!cookie || typeof cookie !== 'string') return cookie
  const prefix = `/${String(slugPrefix || '').replace(/^\/+|\/+$/g, '')}`
  if (/;\s*path=/i.test(cookie)) {
    return cookie.replace(/;\s*path=([^;]*)/i, (full, pathVal) => {
      const p = String(pathVal || '/').trim() || '/'
      const lower = p.toLowerCase()
      const prefLower = prefix.toLowerCase()
      if (lower === prefLower || lower.startsWith(prefLower + '/')) {
        return `; Path=${p}`
      }
      if (p === '/') return `; Path=${prefix}/`
      if (p.startsWith('/')) return `; Path=${prefix}${p}`
      return `; Path=${prefix}/`
    })
  }
  return `${cookie}; Path=${prefix}/`
}

/**
 * Reescribe paths absolutos en HTML/JS inyectando el prefijo público del panel.
 * No duplica si el path ya empieza por el slug.
 */
function rewriteHtmlBody(body, slugPrefix) {
  if (!body || !slugPrefix) return body
  const prefix = `/${String(slugPrefix).replace(/^\/+|\/+$/g, '')}`
  if (prefix === '/') return body

  let s = String(body)
  const rewriteAbs = (pathWithLeadingSlash) => withSlugPrefix(pathWithLeadingSlash, prefix)

  // href="/x" action="/x" src="/x"  (no // externos; no duplica /slug/)
  s = s.replace(/(href|action|src)=(["'])(\/(?!\/)[^"'>\s]*)/gi, (full, attr, q, p) => {
    return `${attr}=${q}${rewriteAbs(p)}`
  })

  // url(/x) en css inline
  s = s.replace(/url\((["']?)(\/(?!\/)[^)"'\s]*)/gi, (full, q, p) => {
    return `url(${q}${rewriteAbs(p)}`
  })

  // fetch('/…')
  s = s.replace(/(fetch\s*\(\s*)(["'`])(\/(?!\/)[^"'`]*?)\2/g, (full, head, q, p) => {
    return `${head}${q}${rewriteAbs(p)}${q}`
  })

  // location = '/…' | location.href | window.location | window.location.href
  // Un solo patrón (antes se aplicaban dos y DUPLICABAN el slug en los botones onclick).
  s = s.replace(
    /((?:window\.)?location(?:\.href)?\s*=\s*)(["'`])(\/(?!\/)[^"'`]*?)\2/g,
    (full, head, q, p) => `${head}${q}${rewriteAbs(p)}${q}`
  )

  // location.assign('/…') / location.replace('/…')
  s = s.replace(
    /((?:window\.)?location\.(?:assign|replace)\s*\(\s*)(["'`])(\/(?!\/)[^"'`]*?)\2/g,
    (full, head, q, p) => `${head}${q}${rewriteAbs(p)}${q}`
  )

  // form.action = '/…'  (createElement + submit: Borrar todo, delete-pub, nueva carpeta…)
  // Sin esto el POST va a /delete-all-pubs sin el prefijo secreto/slug → "Not found"
  s = s.replace(
    /(\.action\s*=\s*)(["'`])(\/(?!\/)[^"'`]*?)\2/g,
    (full, head, q, p) => `${head}${q}${rewriteAbs(p)}${q}`
  )

  return s
}

/** Export para el middleware de ruta secreta del maestro. */
export function rewriteHtmlForBasePath(body, basePath) {
  return rewriteHtmlBody(body, basePath)
}

/**
 * Middleware: landing en / y panel maestro solo bajo /ruta-secreta/
 * Los sub-bots /#####-nombre/ se manejan antes (proxy de path, IP o dominio).
 */
export function createMasterGateMiddleware({ isSubBot = false, renderLanding } = {}) {
  return function masterGateMiddleware(req, res, next) {
    if (isSubBot) return next()

    const conf = getDomainConfig()
    if (conf.landingEnabled === false) return next()

    const base = getMasterPanelBase() // /whis-sunkovv-z
    const url = req.url || '/'
    const pathOnly = (req.path || url.split('?')[0] || '/').replace(/\/+$/, '') || '/'

    // Assets / rutas públicas sin prefijo
    const publicNoPrefix = ['/branding-logo', '/favicon.ico', '/landing-demo']
    if (publicNoPrefix.some((p) => pathOnly === p || pathOnly.startsWith(p + '/'))) {
      return next()
    }

    // Landing en raíz
    if (pathOnly === '/' || pathOnly === '') {
      if (typeof renderLanding === 'function') {
        return renderLanding(req, res)
      }
      return res.type('html').send('<h1>Bot Spam Ultra</h1>')
    }

    // Panel secreto: /ruta-secreta o /ruta-secreta/...
    if (pathOnly === base || pathOnly.startsWith(base + '/')) {
      // Stripear prefijo para que el resto de Express vea /login, /, etc.
      let rest = url
      if (rest === base || rest.startsWith(base + '?')) {
        rest = '/' + (rest.includes('?') ? rest.slice(rest.indexOf('?')) : '')
      } else if (rest.startsWith(base + '/')) {
        rest = rest.slice(base.length) || '/'
      }
      req.url = rest
      // Ajustar req.path de forma compatible no es necesario en Express si solo usamos req.url

      // Redirects relativos a la base
      const originalRedirect = res.redirect.bind(res)
      res.redirect = function redirectWithBase(arg1, arg2) {
        let status = 302
        let loc = arg1
        if (typeof arg1 === 'number') {
          status = arg1
          loc = arg2
        }
        if (typeof loc === 'string' && loc.startsWith('/')) {
          loc = withSlugPrefix(loc, base)
        }
        return originalRedirect(status, loc)
      }

      // res.send reescribe HTML (forms, href, fetch)
      const originalSend = res.send.bind(res)
      res.send = function sendWithBase(body) {
        if (typeof body === 'string' && /<html|<!DOCTYPE/i.test(body)) {
          body = rewriteHtmlBody(body, base)
        }
        return originalSend(body)
      }

      // Cookies: path bajo la ruta secreta
      const originalCookie = res.cookie.bind(res)
      res.cookie = function cookieWithPath(name, value, options = {}) {
        const opts = { ...options }
        if (!opts.path || opts.path === '/') {
          opts.path = base + '/'
        }
        return originalCookie(name, value, opts)
      }
      const originalClearCookie = res.clearCookie.bind(res)
      res.clearCookie = function clearCookieWithPath(name, options = {}) {
        const opts = { ...options }
        if (!opts.path || opts.path === '/') {
          opts.path = base + '/'
        }
        return originalClearCookie(name, opts)
      }

      res.locals.masterBase = base
      return next()
    }

    // Si es un slug de sub-bot ya lo resolvió el proxy anterior.
    // Cualquier otra ruta “de panel” sin secreto → landing (no revelar estructura)
    if (typeof renderLanding === 'function' && req.method === 'GET') {
      return renderLanding(req, res)
    }
    return res.status(404).type('html').send('Not found')
  }
}

/**
 * Proxy HTTP path → panel interno del sub-bot (socket local, sin puerto extra).
 * req llega a maestro como /slug/resto...
 */
export function proxySubbotRequest(req, res, { port, slug, number, socketPath } = {}) {
  const slugPrefix = `/${String(slug).replace(/^\/+|\/+$/g, '')}`
  const rest = stripSlugFromUrl(req.url || '/', slugPrefix)

  const conf = getDomainConfig()
  const incomingHost = String(req.headers.host || conf.domain || '').trim()
  const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  const proto = xfProto || (req.socket?.encrypted ? 'https' : (conf.enabled ? conf.protocol : 'http'))
  const headers = { ...req.headers }
  const sock = socketPath || (number ? getSubbotSocketPath(number) : null)
  headers.host = sock ? 'localhost' : `127.0.0.1:${port || 0}`
  headers['x-forwarded-host'] = incomingHost
  headers['x-forwarded-proto'] = proto
  headers['x-forwarded-prefix'] = slugPrefix
  headers['x-forwarded-for'] = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
  headers['accept-encoding'] = 'identity'
  delete headers['content-length']

  const options = sock
    ? { socketPath: sock, path: rest, method: req.method, headers, timeout: 120000 }
    : { hostname: '127.0.0.1', port, path: rest, method: req.method, headers, timeout: 120000 }

  const proxyReq = http.request(options, (proxyRes) => {
    const outHeaders = { ...proxyRes.headers }
    if (outHeaders.location) {
      outHeaders.location = rewriteLocation(outHeaders.location, slugPrefix, incomingHost || conf.domain)
    }
    const cookies = proxyRes.headers['set-cookie']
    if (cookies) {
      const list = Array.isArray(cookies) ? cookies : [cookies]
      outHeaders['set-cookie'] = list.map((c) => rewriteSetCookie(c, slugPrefix))
    }

    const ctype = String(proxyRes.headers['content-type'] || '')
    const shouldRewrite =
      /text\/html|application\/javascript|text\/javascript|text\/css/i.test(ctype)

    if (!shouldRewrite) {
      res.writeHead(proxyRes.statusCode || 502, outHeaders)
      proxyRes.pipe(res)
      return
    }

    const chunks = []
    proxyRes.on('data', (c) => chunks.push(c))
    proxyRes.on('end', () => {
      let buf = Buffer.concat(chunks)
      let text = buf.toString('utf8')
      if (/html|javascript|css/i.test(ctype)) {
        text = rewriteHtmlBody(text, slugPrefix)
        buf = Buffer.from(text, 'utf8')
      }
      delete outHeaders['content-length']
      outHeaders['content-length'] = Buffer.byteLength(buf)
      res.writeHead(proxyRes.statusCode || 200, outHeaders)
      res.end(buf)
    })
  })

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).type('html').send(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0b0f14;color:#e2e8f0;padding:40px;text-align:center">
        <h2>Panel no disponible</h2>
        <p style="color:#94a3b8">Este cliente está conectado a WhatsApp, pero su panel web aún no está listo.<br>Esperá unos segundos o pulsá Reiniciar en el maestro.</p>
        <p style="font-size:0.8rem;color:#64748b">${String(err.message || err)}</p>
        </body></html>`
      )
    }
  })

  proxyReq.on('timeout', () => {
    proxyReq.destroy()
    if (!res.headersSent) res.status(504).send('Timeout del panel')
  })

  req.pipe(proxyReq)
}

/** Middleware Express: enruta /id5-nombre/... al panel interno del sub-bot (IP o dominio). */
export function createDomainProxyMiddleware({ isSubBot = false } = {}) {
  return function domainProxyMiddleware(req, res, next) {
    if (isSubBot) {
      const raw = req.url || '/'
      const slugInPath = extractSlugFromUrl(raw)
      const xf = req.headers['x-forwarded-prefix']
      if (slugInPath || xf) {
        let cleaned = raw
        if (xf) cleaned = stripSlugFromUrl(cleaned, xf)
        if (slugInPath) cleaned = stripSlugFromUrl(cleaned, `/${slugInPath}`)
        cleaned = stripSlugFromUrl(cleaned, slugInPath ? `/${slugInPath}` : '')
        if (cleaned !== raw) req.url = cleaned
      }
      return next()
    }

    const slug = extractSlugFromUrl(req.url || req.path || '')
    if (!slug) return next()

    const target = resolveSlug(slug)
    if (!target?.number && !target?.socketPath) {
      return res.status(404).type('html').send(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0b0f14;color:#e2e8f0;padding:40px;text-align:center">
        <h2>Ruta no encontrada</h2>
        <p style="color:#94a3b8">No hay un sub-bot asignado a <code>/${slug}/</code></p>
        </body></html>`
      )
    }

    return proxySubbotRequest(req, res, {
      port: target.port,
      slug: target.panelSlug || slug,
      number: target.number,
      socketPath: target.socketPath,
    })
  }
}
