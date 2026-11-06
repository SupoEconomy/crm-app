import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import path from 'path'

const LINKS_DIR = path.join(process.cwd(), 'storage', 'databases')
const LINKS_FILE = path.join(LINKS_DIR, 'group-links.json')
const AVATAR_DIR = path.join(LINKS_DIR, 'group-link-avatars')
const MAX_LINKS = 150
const MAX_OWN_LINKS = 80

/** Rutas del store: maestro (null) o sub-bot (número). */
export function resolveLinksStore(owner = null) {
  if (owner) {
    const base = path.join(process.cwd(), 'usuarios', String(owner))
    if (!existsSync(base)) mkdirSync(base, { recursive: true })
    return {
      file: path.join(base, 'group-links.json'),
      avatarDir: path.join(base, 'group-link-avatars'),
      owner: String(owner),
      max: MAX_OWN_LINKS,
    }
  }
  return { file: LINKS_FILE, avatarDir: AVATAR_DIR, owner: null, max: MAX_LINKS }
}

export function avatarPathForCode(code, owner = null) {
  const clean = extractInviteCode(code) || String(code || '').trim()
  if (!clean || /[^A-Za-z0-9_-]/.test(clean)) return null
  const { avatarDir } = resolveLinksStore(owner)
  const base = path.join(avatarDir, clean)
  for (const ext of ['.jpg', '.png', '.webp']) {
    const p = base + ext
    if (existsSync(p)) return p
  }
  return base + '.jpg'
}

export function hasCachedAvatar(code, owner = null) {
  const clean = extractInviteCode(code) || String(code || '').trim()
  if (!clean || /[^A-Za-z0-9_-]/.test(clean)) return false
  const { avatarDir } = resolveLinksStore(owner)
  const base = path.join(avatarDir, clean)
  return ['.jpg', '.png', '.webp'].some((ext) => existsSync(base + ext))
}

export function deleteCachedAvatar(code, owner = null) {
  try {
    const clean = extractInviteCode(code) || String(code || '').trim()
    if (!clean) return
    const { avatarDir } = resolveLinksStore(owner)
    const base = path.join(avatarDir, clean)
    for (const ext of ['.jpg', '.png', '.webp']) {
      const p = base + ext
      if (existsSync(p)) unlinkSync(p)
    }
  } catch {}
}

export async function fetchAndCacheGroupAvatar(conn, code, groupJid, owner = null) {
  const clean = extractInviteCode(code) || String(code || '').trim()
  if (!clean) return false
  const { avatarDir } = resolveLinksStore(owner)

  if (groupJid && conn && typeof conn.profilePictureUrl === 'function') {
    try {
      const pp = await conn.profilePictureUrl(groupJid, 'preview').catch(() =>
        conn.profilePictureUrl(groupJid, 'image').catch(() => null)
      )
      if (pp && (await downloadAvatarToCache(clean, pp, avatarDir))) return true
    } catch {}
  }

  try {
    const ogUrl = await fetchInviteOgImage(clean)
    if (ogUrl && (await downloadAvatarToCache(clean, ogUrl, avatarDir))) return true
  } catch {}

  return false
}

async function fetchInviteOgImage(code) {
  const clean = extractInviteCode(code) || String(code || '').trim()
  if (!clean) return null
  const pageUrl = inviteUrlFromCode(clean)
  const res = await fetch(pageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  })
  if (!res.ok) return null
  const html = await res.text()
  const m =
    html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i) ||
    html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i)
  if (!m?.[1]) return null
  let url = m[1]
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&quot;/g, '"')
    .trim()
  // Ignorar placeholders genéricos de WhatsApp sin foto real
  if (!url || /whatsapp\.com\/img\/|static\.whatsapp/i.test(url)) return null
  if (!/^https?:\/\//i.test(url)) return null
  return url
}

async function downloadAvatarToCache(code, url, avatarDir = AVATAR_DIR) {
  const clean = extractInviteCode(code) || String(code || '').trim()
  if (!clean || !url) return false
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: 'https://chat.whatsapp.com/',
      },
    })
    if (!res.ok) return false
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length < 80) return false
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8
    const isPng = buf[0] === 0x89 && buf[1] === 0x50
    const isWebp = buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF'
    if (!isJpeg && !isPng && !isWebp) return false
    if (!existsSync(avatarDir)) mkdirSync(avatarDir, { recursive: true })
    const ext = isPng ? '.png' : isWebp ? '.webp' : '.jpg'
    const base = path.join(avatarDir, clean)
    for (const e of ['.jpg', '.png', '.webp']) {
      const p = base + e
      if (existsSync(p) && e !== ext) {
        try { unlinkSync(p) } catch {}
      }
    }
    writeFileSync(base + ext, buf)
    if (ext !== '.jpg') writeFileSync(base + '.jpg', buf)
    return true
  } catch {
    return false
  }
}

export function extractInviteCode(input = '') {
  const raw = String(input || '').trim()
  if (!raw) return ''
  const m = raw.match(/(?:chat\.whatsapp\.com\/(?:invite\/)?|whatsapp\.com\/chat\/)([A-Za-z0-9_-]{8,})/i)
  if (m) return m[1]
  if (/^[A-Za-z0-9_-]{8,}$/.test(raw)) return raw
  return ''
}

export function inviteUrlFromCode(code) {
  return `https://chat.whatsapp.com/${code}`
}

function ensureStore(owner = null) {
  const store = resolveLinksStore(owner)
  const dir = path.dirname(store.file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (!existsSync(store.file)) {
    writeFileSync(store.file, JSON.stringify({ links: [] }, null, 2), 'utf8')
  }
  return store
}

export function readGroupLinks(owner = null) {
  try {
    const store = ensureStore(owner)
    const raw = JSON.parse(readFileSync(store.file, 'utf8'))
    const links = Array.isArray(raw?.links)
      ? raw.links.map(normalizeLink).filter(Boolean).map((l) => ({
          ...l,
          hasAvatar: hasCachedAvatar(l.code, owner),
        }))
      : []
    return { links }
  } catch {
    return { links: [] }
  }
}

export function writeGroupLinks(data, owner = null) {
  const store = ensureStore(owner)
  const links = Array.isArray(data?.links) ? data.links.map(normalizeLink).filter(Boolean) : []
  writeFileSync(store.file, JSON.stringify({ links }, null, 2), 'utf8')
  return { links }
}

function newLinkId() {
  return 'gl_' + randomBytes(5).toString('hex')
}

export function normalizeLink(entry) {
  if (!entry || typeof entry !== 'object') return null
  const code = extractInviteCode(entry.code || entry.url || '')
  if (!code) return null
  let status = ['alive', 'dead', 'unknown'].includes(entry.status) ? entry.status : 'unknown'
  const error = entry.error ? String(entry.error).slice(0, 200) : null
  // Errores típicos de invite inválido/expirado → muerto
  if (status !== 'alive' && error && isDeadInviteError(error)) {
    status = 'dead'
  }
  return {
    id: String(entry.id || newLinkId()),
    code,
    url: inviteUrlFromCode(code),
    subject: String(entry.subject || '').slice(0, 120),
    size: Math.max(0, parseInt(entry.size, 10) || 0),
    joinApprovalMode: !!entry.joinApprovalMode,
    status,
    error,
    groupJid: entry.groupJid ? String(entry.groupJid) : null,
    hasAvatar: entry.hasAvatar === true,
    enabled: entry.enabled !== false,
    note: String(entry.note || '').slice(0, 80),
    addedAt: Number(entry.addedAt) || Date.now(),
    checkedAt: Number(entry.checkedAt) || 0,
  }
}

/** Links que los clientes/sub-bots pueden ver (activos y no muertos). */
export function linksForClients(links = []) {
  return (links || []).filter((l) => l && l.enabled !== false && l.status !== 'dead')
}

export function isDeadInviteError(msg = '') {
  return /bad-request|404|410|not-authorized|forbidden|item-not-found|gone|expired|invalid|conflict|no longer|revoked|does not exist/i.test(String(msg || ''))
}

export function parseLinksInput(text = '') {
  const lines = String(text || '').split(/[\n,;\s]+/).map((s) => s.trim()).filter(Boolean)
  const codes = []
  const seen = new Set()
  for (const line of lines) {
    const code = extractInviteCode(line)
    if (!code || seen.has(code)) continue
    seen.add(code)
    codes.push(code)
  }
  return codes
}

export function addGroupLinks(codes = [], owner = null) {
  const storeMeta = resolveLinksStore(owner)
  const store = readGroupLinks(owner)
  const existing = new Set(store.links.map((l) => l.code))
  const added = []
  for (const code of codes) {
    if (existing.has(code)) continue
    if (store.links.length >= storeMeta.max) break
    const row = normalizeLink({
      id: newLinkId(),
      code,
      status: 'unknown',
      addedAt: Date.now(),
    })
    if (!row) continue
    store.links.push(row)
    existing.add(code)
    added.push(row)
  }
  writeGroupLinks(store, owner)
  return { added, total: store.links.length, max: storeMeta.max }
}

export function removeGroupLink(id, owner = null) {
  const store = readGroupLinks(owner)
  const row = store.links.find((l) => l.id === id)
  const before = store.links.length
  store.links = store.links.filter((l) => l.id !== id)
  writeGroupLinks(store, owner)
  if (row?.code) deleteCachedAvatar(row.code, owner)
  return before !== store.links.length
}

export function setGroupLinkEnabled(id, enabled, owner = null) {
  const store = readGroupLinks(owner)
  const row = store.links.find((l) => l.id === id)
  if (!row) return false
  row.enabled = !!enabled
  writeGroupLinks(store, owner)
  return true
}

export function updateGroupLink(id, patch = {}, owner = null) {
  const store = readGroupLinks(owner)
  const idx = store.links.findIndex((l) => l.id === id)
  if (idx < 0) return null
  store.links[idx] = normalizeLink({ ...store.links[idx], ...patch, id })
  writeGroupLinks(store, owner)
  return store.links[idx]
}

/**
 * Consulta info del invite con Baileys (groupGetInviteInfo).
 * No requiere estar dentro del grupo.
 */
export async function probeInviteWithConn(conn, code, { owner = null } = {}) {
  const clean = extractInviteCode(code)
  if (!clean) {
    return { ok: false, status: 'dead', error: 'Link inválido' }
  }
  if (!conn || typeof conn.groupGetInviteInfo !== 'function') {
    return { ok: false, status: 'unknown', error: 'Bot sin conexión WhatsApp' }
  }
  try {
    const info = await conn.groupGetInviteInfo(clean)
    const groupJid = info?.id || null
    let hasAvatar = false
    if (groupJid || clean) {
      hasAvatar = await fetchAndCacheGroupAvatar(conn, clean, groupJid, owner)
    }
    return {
      ok: true,
      status: 'alive',
      error: null,
      subject: info?.subject || '',
      size: Number(info?.size) || (info?.participants?.length || 0),
      joinApprovalMode: !!info?.joinApprovalMode,
      groupJid,
      hasAvatar: hasAvatar || hasCachedAvatar(clean, owner),
      checkedAt: Date.now(),
    }
  } catch (e) {
    const msg = e?.message || String(e)
    const dead = isDeadInviteError(msg)
    return {
      ok: false,
      status: dead ? 'dead' : 'unknown',
      error: dead ? 'Link muerto o inválido' : msg.slice(0, 200),
      checkedAt: Date.now(),
    }
  }
}

export async function refreshAllGroupLinks(conn, { onlyUnknown = false, probeFn = null, owner = null } = {}) {
  const store = readGroupLinks(owner)
  const pending = store.links.filter((row) => {
    if (!row.enabled) return false
    if (onlyUnknown && row.status === 'alive') return false
    return true
  })

  // Store propio de sub-bot: siempre verifica con su WA local
  if (owner) {
    const localProbe = probeFn || ((code) => probeInviteWithConn(conn, code, { owner }))
    let updated = 0
    for (const row of pending) {
      const probe = await localProbe(row.code)
      Object.assign(row, {
        status: probe.status,
        error: probe.error,
        subject: probe.subject || row.subject,
        size: probe.size || row.size,
        joinApprovalMode: probe.joinApprovalMode ?? row.joinApprovalMode,
        groupJid: probe.groupJid || row.groupJid || null,
        hasAvatar: probe.hasAvatar === true || hasCachedAvatar(row.code, owner),
        checkedAt: probe.checkedAt || Date.now(),
      })
      updated++
      await new Promise((r) => setTimeout(r, 350))
    }
    writeGroupLinks(store, owner)
    return { updated, total: store.links.length, via: 'tu bot' }
  }

  // Maestro: distribución entre maestro + todos los sub-bots online (si no hay probeFn forzado)
  if (!probeFn) {
    const distributed = await refreshLinksDistributed(pending)
    const byId = new Map(distributed.results.map((r) => [r.id, r.probe]))
    for (const row of store.links) {
      const probe = byId.get(row.id)
      if (!probe) continue
      Object.assign(row, {
        status: probe.status,
        error: probe.error,
        subject: probe.subject || row.subject,
        size: probe.size || row.size,
        joinApprovalMode: probe.joinApprovalMode ?? row.joinApprovalMode,
        groupJid: probe.groupJid || row.groupJid || null,
        hasAvatar: probe.hasAvatar === true || hasCachedAvatar(row.code),
        checkedAt: probe.checkedAt || Date.now(),
      })
    }
    writeGroupLinks(store)
    return {
      updated: distributed.updated,
      total: store.links.length,
      via: distributed.viaLabel,
      workers: distributed.workers,
      perWorker: distributed.perWorker,
    }
  }

  let updated = 0
  let via = null
  for (const row of pending) {
    const probe = await probeFn(row.code)
    if (probe?.via && !via) via = probe.viaNumber || probe.via
    Object.assign(row, {
      status: probe.status,
      error: probe.error,
      subject: probe.subject || row.subject,
      size: probe.size || row.size,
      joinApprovalMode: probe.joinApprovalMode ?? row.joinApprovalMode,
      groupJid: probe.groupJid || row.groupJid || null,
      hasAvatar: probe.hasAvatar === true || hasCachedAvatar(row.code),
      checkedAt: probe.checkedAt || Date.now(),
    })
    updated++
    await new Promise((r) => setTimeout(r, 350))
  }
  writeGroupLinks(store)
  return { updated, total: store.links.length, via }
}

/** ¿El WhatsApp local (este proceso) puede consultar invites? */
export function isLocalWaProbeReady(conn = global.conn) {
  return !!(conn?.user && typeof conn.groupGetInviteInfo === 'function')
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Lista todos los sub-bots con IPC usable (prioriza status online). */
export function listOnlineSubBotChildren() {
  if (!global.activeSubBots || typeof global.activeSubBots.entries !== 'function') return []
  const preferOnline = []
  const any = []
  for (const [number, child] of global.activeSubBots.entries()) {
    if (!child || child === 'initializing' || typeof child.send !== 'function') continue
    if (child.connected === false) continue
    const status = global.db?.data?.subbots?.[number]?.status
    const entry = { number, child, kind: 'subbot' }
    if (status === 'online') preferOnline.push(entry)
    else any.push(entry)
  }
  return preferOnline.length ? preferOnline : any
}

export function pickOnlineSubBotChild() {
  const list = listOnlineSubBotChildren()
  if (!list.length) return null
  return list[Math.floor(Math.random() * list.length)]
}

/** Workers disponibles: maestro (si WA listo) + todos los sub-bots online. */
export function listProbeWorkers() {
  const workers = []
  if (isLocalWaProbeReady()) {
    workers.push({ number: 'maestro', child: null, kind: 'master' })
  }
  for (const s of listOnlineSubBotChildren()) workers.push(s)
  return workers
}

export function canVerifyGroupLinks() {
  const workers = listProbeWorkers()
  if (!workers.length) return { ok: false, via: null, count: 0, numbers: [] }
  const subs = workers.filter((w) => w.kind === 'subbot').map((w) => w.number)
  const hasMaster = workers.some((w) => w.kind === 'master')
  let via = 'subbots'
  if (hasMaster && !subs.length) via = 'master'
  else if (hasMaster && subs.length) via = 'mixed'
  return {
    ok: true,
    via,
    count: workers.length,
    number: subs[0] || null,
    numbers: subs,
    hasMaster,
  }
}

function probeViaIpc(child, number, code, timeoutMs = 12000) {
  const reqId = 'p_' + randomBytes(4).toString('hex')
  return new Promise((resolve) => {
    let settled = false
    const finish = (payload) => {
      if (settled) return
      settled = true
      try { child.removeListener('message', onMsg) } catch {}
      clearTimeout(timer)
      resolve(payload)
    }
    const timer = setTimeout(() => {
      finish({
        ok: false,
        status: 'unknown',
        error: `Timeout verificando con sub-bot ${number}`,
        via: 'subbot',
        viaNumber: number,
        checkedAt: Date.now(),
      })
    }, timeoutMs)

    function onMsg(msg) {
      if (!msg || msg.type !== 'probe_invite_result' || msg.reqId !== reqId) return
      const result = msg.result && typeof msg.result === 'object' ? msg.result : {}
      finish({
        ...result,
        via: 'subbot',
        viaNumber: number,
        checkedAt: result.checkedAt || Date.now(),
      })
    }

    child.on('message', onMsg)
    try {
      child.send({ type: 'probe_invite', code: extractInviteCode(code) || code, reqId })
    } catch (e) {
      finish({
        ok: false,
        status: 'unknown',
        error: 'No se pudo hablar con el sub-bot: ' + (e?.message || e),
        via: 'subbot',
        viaNumber: number,
        checkedAt: Date.now(),
      })
    }
  })
}

async function probeWithWorker(worker, code) {
  if (worker.kind === 'master') {
    const result = await probeInviteWithConn(global.conn, code)
    return { ...result, via: 'master', viaNumber: null }
  }
  return probeViaIpc(worker.child, worker.number, code)
}

/**
 * Reparte links al azar entre todos los workers y verifica en paralelo
 * (cada worker procesa su cola en serie).
 * Ej: 10 links / 5 bots → ~2 cada uno.
 */
export async function refreshLinksDistributed(rows = []) {
  const workers = listProbeWorkers()
  if (!workers.length) {
    return { updated: 0, results: [], viaLabel: null, workers: 0, perWorker: {} }
  }
  if (!rows.length) {
    return { updated: 0, results: [], viaLabel: summarizeWorkers(workers), workers: workers.length, perWorker: {} }
  }

  const shuffledWorkers = shuffleInPlace([...workers])
  const shuffledRows = shuffleInPlace([...rows])
  const queues = shuffledWorkers.map((w) => ({ worker: w, items: [] }))
  shuffledRows.forEach((row, i) => {
    queues[i % queues.length].items.push(row)
  })

  const perWorker = {}
  const results = []

  await Promise.all(queues.map(async ({ worker, items }) => {
    const label = worker.kind === 'master' ? 'maestro' : worker.number
    perWorker[label] = items.length
    for (const row of items) {
      const probe = await probeWithWorker(worker, row.code)
      results.push({ id: row.id, code: row.code, probe })
      await new Promise((r) => setTimeout(r, 300))
    }
  }))

  return {
    updated: results.length,
    results,
    viaLabel: summarizeWorkers(workers, perWorker),
    workers: workers.length,
    perWorker,
  }
}

function summarizeWorkers(workers, perWorker = null) {
  const subs = workers.filter((w) => w.kind === 'subbot').map((w) => w.number)
  const hasMaster = workers.some((w) => w.kind === 'master')
  const parts = []
  if (hasMaster) parts.push('maestro')
  if (subs.length === 1) parts.push(`sub-bot ${subs[0]}`)
  else if (subs.length > 1) parts.push(`${subs.length} sub-bots`)
  if (perWorker && Object.keys(perWorker).length) {
    const detail = Object.entries(perWorker)
      .map(([k, n]) => `${k}:${n}`)
      .join(', ')
    return `${parts.join(' + ')} (${detail})`
  }
  return parts.join(' + ')
}

/**
 * Verifica un invite: maestro si está listo; si no, un sub-bot al azar.
 */
export async function probeInviteSmart(code, { timeoutMs = 12000 } = {}) {
  if (isLocalWaProbeReady()) {
    const result = await probeInviteWithConn(global.conn, code)
    return { ...result, via: 'master', viaNumber: null }
  }

  const picked = pickOnlineSubBotChild()
  if (!picked) {
    return {
      ok: false,
      status: 'unknown',
      error: 'Sin WhatsApp: vincula el maestro o ten al menos un sub-bot online',
      via: null,
      viaNumber: null,
      checkedAt: Date.now(),
    }
  }

  return probeViaIpc(picked.child, picked.number, code, timeoutMs)
}

export async function joinInviteWithConn(conn, code) {
  const clean = extractInviteCode(code)
  if (!clean) return { ok: false, error: 'Código inválido' }
  if (!conn || typeof conn.groupAcceptInvite !== 'function') {
    return { ok: false, error: 'Bot sin conexión WhatsApp' }
  }
  try {
    const jid = await conn.groupAcceptInvite(clean)
    return { ok: true, jid: jid || null }
  } catch (e) {
    const msg = e?.message || String(e)
    // Aprobación pendiente / ya miembro / link muerto
    if (/already|participant/i.test(msg)) {
      return { ok: true, jid: null, already: true, error: null }
    }
    if (/approval|request|pending/i.test(msg)) {
      return { ok: true, jid: null, pendingApproval: true, error: null }
    }
    return { ok: false, error: msg.slice(0, 200) }
  }
}

export function membershipLabel({ inGroup, pendingApproval, joinApprovalMode, status }) {
  if (status === 'dead') return { key: 'dead', text: 'Link muerto', className: 'st-dead' }
  if (inGroup) return { key: 'in', text: 'Ya estás dentro', className: 'st-in' }
  if (pendingApproval) return { key: 'pending', text: 'Pendiente de aprobación', className: 'st-pending' }
  if (joinApprovalMode) return { key: 'approval', text: 'Pide confirmación', className: 'st-approval' }
  if (status === 'alive') return { key: 'free', text: 'Libre para unirse', className: 'st-free' }
  return { key: 'unknown', text: 'Sin verificar', className: 'st-unknown' }
}

/** Estado local por sub-bot: pendientes de aprobación y último intento de join */
export function getSubbotLinksStatePath(subBotNumber) {
  if (!subBotNumber) return null
  return path.join(process.cwd(), 'usuarios', String(subBotNumber), 'group-links-state.json')
}

export function readSubbotLinksState(subBotNumber) {
  const file = getSubbotLinksStatePath(subBotNumber)
  if (!file) return { byCode: {} }
  try {
    if (!existsSync(file)) return { byCode: {} }
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    return { byCode: raw?.byCode && typeof raw.byCode === 'object' ? raw.byCode : {} }
  } catch {
    return { byCode: {} }
  }
}

export function writeSubbotLinksState(subBotNumber, state) {
  const file = getSubbotLinksStatePath(subBotNumber)
  if (!file) return
  const dir = path.dirname(file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(file, JSON.stringify({ byCode: state?.byCode || {} }, null, 2), 'utf8')
}

export function markSubbotJoinResult(subBotNumber, code, result = {}) {
  if (!subBotNumber || !code) return
  const state = readSubbotLinksState(subBotNumber)
  const prev = state.byCode[code] || {}
  state.byCode[code] = {
    ...prev,
    pendingApproval: !!result.pendingApproval,
    lastJoinAt: Date.now(),
    lastError: result.ok ? null : (result.error || null),
    joinedJid: result.jid || prev.joinedJid || null,
  }
  if (result.ok && (result.jid || result.already) && !result.pendingApproval) {
    state.byCode[code].pendingApproval = false
  }
  writeSubbotLinksState(subBotNumber, state)
}

export { MAX_LINKS, MAX_OWN_LINKS, LINKS_FILE }
