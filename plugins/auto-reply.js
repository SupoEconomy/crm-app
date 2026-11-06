import fs from 'fs/promises'
import { existsSync } from 'fs'
import {
  ensureAutoReplyConfig,
  findMatchingRule,
  findKeywordHit,
  bumpRuleChatReplyCount,
  computeTypingMs,
  computeReadMs,
  isWithinAttentionHours,
  hasHoursMessage,
  isHoursLimitReached,
  getHoursReplyPayload,
  HOURS_STATS_ID,
  isBlacklisted,
  getAntiSpamPayload,
  hasAntiSpamMessage,
  addBlacklistEntry,
  removeBlacklistByJids,
  pickBestPhoneDigits,
  digitsFromJid,
} from '../lib/auto-reply.js'
import { resolveSavedImagePath } from '../lib/image-storage.js'

/** Por chat: evita responder 2 veces mientras aún escribe la primera. */
const busyChats = new Map()
/** Anti-spam: timestamps recientes por chat. */
const antiSpamHits = new Map()
/**
 * Bloqueo inmediato en memoria (LID/PN/busyKey).
 * Evita que, tras mensaje final, el siguiente keyword responda antes de matchear lista negra.
 */
const sessionBlocked = new Set()

function blockSessionKeys(...keys) {
  for (const k of keys) {
    const s = String(k || '').trim()
    if (!s) continue
    sessionBlocked.add(s)
    const dig = digitsFromJid(s) || s.replace(/\D/g, '')
    if (dig.length >= 8) sessionBlocked.add(dig)
  }
}

function unblockSessionKeys(...keys) {
  for (const k of keys) {
    const s = String(k || '').trim()
    if (!s) continue
    sessionBlocked.delete(s)
    const dig = digitsFromJid(s) || s.replace(/\D/g, '')
    if (dig.length >= 8) sessionBlocked.delete(dig)
  }
}

function isSessionBlocked(...keys) {
  return keys.some((k) => {
    const s = String(k || '').trim()
    if (!s) return false
    if (sessionBlocked.has(s)) return true
    const dig = digitsFromJid(s) || s.replace(/\D/g, '')
    return dig.length >= 8 && sessionBlocked.has(dig)
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function isPrivateUserJid(jid = '') {
  const s = String(jid || '')
  return (
    s.endsWith('@s.whatsapp.net') ||
    s.endsWith('@lid') ||
    s.endsWith('@hosted.lid')
  )
}

/** Solo mensajes de chat reales con texto (no reacciones, protocol, stickers vacíos, sync viejo). */
const ALLOWED_AUTO_REPLY_MTYPES = new Set([
  'conversation',
  'extendedTextMessage',
  'imageMessage',
  'videoMessage',
  'documentMessage',
])

/** Momento en que este proceso quedó listo; se actualiza al conectar WhatsApp. */
const pluginLoadedAt = Date.now()
if (!global.autoReplyOnlineAt) global.autoReplyOnlineAt = pluginLoadedAt

function getOnlineSinceMs() {
  return Number(global.autoReplyOnlineAt) || pluginLoadedAt
}

function getMessageTsMs(m) {
  const ts = Number(m?.messageTimestamp || 0)
  if (!ts) return 0
  return ts > 1e12 ? ts : ts * 1000
}

function extractUserText(m) {
  const raw = (
    m?.text ||
    m?.msg?.conversation ||
    m?.msg?.extendedTextMessage?.text ||
    m?.msg?.caption ||
    ''
  )
  return String(raw || '').trim()
}

function isEligibleAutoReplyMessage(m) {
  if (!m || m.isGroup || m.fromMe || m.isBaileys) return false
  if (m.messageStubType) return false
  const mtype = String(m.mtype || '')
  if (!ALLOWED_AUTO_REPLY_MTYPES.has(mtype)) return false

  const text = extractUserText(m)
  if (!text) return false

  // Solo mensajes DESPUÉS de estar online (ignora historial al reiniciar/reconectar)
  const onlineAt = getOnlineSinceMs()
  const tsMs = getMessageTsMs(m)
  if (tsMs && tsMs < onlineAt) {
    console.log(
      `\x1b[33m[AUTO-REPLY]\x1b[0m Ignorado (antes de online) → ${m.chat || m.key?.remoteJid || '-'}`,
    )
    return false
  }
  return true
}

function resolvePrivateChat(m) {
  const remote = m?.key?.remoteJid || m?.chat || ''
  const alt = m?.key?.remoteJidAlt || ''
  const chat = m?.chat || remote

  if (isPrivateUserJid(remote)) {
    return { chatId: remote, statsId: isPrivateUserJid(alt) ? alt : remote, alt }
  }
  if (isPrivateUserJid(chat)) {
    return { chatId: chat, statsId: isPrivateUserJid(alt) ? alt : chat, alt }
  }
  if (isPrivateUserJid(alt)) {
    return { chatId: alt, statsId: alt, alt }
  }
  return null
}

/** Registra un hit y devuelve true si cruzó el umbral anti-spam. */
function checkAntiSpam(cfg, busyKey) {
  const as = cfg.antiSpam
  if (!as?.enabled) return false
  const now = Date.now()
  const windowMs = Math.max(1, as.windowSec || 3) * 1000
  const max = Math.max(2, as.maxMessages || 4)
  let arr = antiSpamHits.get(busyKey) || []
  arr = arr.filter((t) => now - t < windowMs)
  arr.push(now)
  antiSpamHits.set(busyKey, arr)
  return arr.length >= max
}

async function humanRead(conn, jid, ms, msgKey) {
  if (conn?.presenceSubscribe) {
    await conn.presenceSubscribe(jid).catch(() => {})
  }
  // Marca como leído al “empezar a leer”
  if (conn && typeof conn.readMessages === 'function' && msgKey) {
    await conn.readMessages([msgKey]).catch(() => {})
  }
  await sleep(ms)
}

async function humanTyping(conn, jid, ms, isVideo) {
  const type = isVideo ? 'recording' : 'composing'
  if (conn?.presenceSubscribe) {
    await conn.presenceSubscribe(jid).catch(() => {})
  }
  if (!conn || typeof conn.sendPresenceUpdate !== 'function') {
    await sleep(ms)
    return
  }
  const start = Date.now()
  await conn.sendPresenceUpdate(type, jid).catch(() => {})
  while (Date.now() - start < ms) {
    await sleep(1400 + Math.floor(Math.random() * 400))
    if (Date.now() - start < ms) {
      await conn.sendPresenceUpdate(type, jid).catch(() => {})
    }
  }
  await sleep(250 + Math.floor(Math.random() * 450))
}

async function sendAutoReply(conn, jid, rule) {
  const isSubBot = process.env.IS_SUBBOT === 'true'
  const subBotNumber = process.env.SUBBOT_NUMBER || null
  const caption = rule.text || ''
  const isVideo = rule.imageType === 'video'

  let mediaBuffer = null
  if (rule.image) {
    const full = resolveSavedImagePath(rule.image, { isSubBot, subBotNumber })
    if (full && existsSync(full)) {
      mediaBuffer = await fs.readFile(full)
    }
  }

  if (mediaBuffer) {
    const payload = isVideo
      ? { video: mediaBuffer, caption: caption || undefined, mimetype: 'video/mp4' }
      : { image: mediaBuffer, caption: caption || undefined }
    await conn.sendMessage(jid, payload)
  } else if (caption) {
    await conn.sendMessage(jid, { text: caption })
  } else {
    return false
  }

  if (typeof conn.sendPresenceUpdate === 'function') {
    await conn.sendPresenceUpdate('paused', jid).catch(() => {})
  }
  return true
}

async function deliverWithHumanDelay(conn, chatId, cfg, rule, msgKey, label) {
  const readMs = computeReadMs(cfg)
  const typingMs = computeTypingMs(cfg, rule.text)
  const isVideo = rule.imageType === 'video'
  console.log(
    `\x1b[36m[AUTO-REPLY]\x1b[0m ${label} → ${chatId}` +
      ` leer ${Math.round(readMs / 1000)}s + typing ${Math.round(typingMs / 1000)}s`,
  )
  await humanRead(conn, chatId, readMs, msgKey)
  await humanTyping(conn, chatId, typingMs, isVideo)
  return sendAutoReply(conn, chatId, rule)
}

async function reactOk(conn, m) {
  try {
    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
  } catch (_) { /* ignore */ }
}

/** Número propio del bot (para no usarlo como destino de /black o /del). */
function ownBotDigits(conn) {
  const u = conn?.user || global.conn?.user || {}
  return digitsFromJid(u.id || u.jid || '') || ''
}

/**
 * Destino del chat del cliente.
 * En comandos fromMe, m.sender es el bot: priorizar remoteJid / remoteJidAlt.
 */
function pickCommandTarget(m, conn) {
  const chatId = m.chat || m.key?.remoteJid || ''
  const alt = m.key?.remoteJidAlt || ''
  const own = ownBotDigits(conn)
  const jids = m.fromMe
    ? [alt, chatId]
    : [alt, chatId, m.sender, m.key?.remoteJidAlt, m.key?.remoteJid]
  let phone = pickBestPhoneDigits(...jids)
  if (phone && own && (phone === own || phone.endsWith(own) || own.endsWith(phone))) {
    // Preferir LID/alt del chat si el "mejor" número era el del bot
    phone = pickBestPhoneDigits(...jids.filter((j) => {
      const d = digitsFromJid(j) || ''
      return d && d !== own && !d.endsWith(own) && !own.endsWith(d)
    }))
  }
  return { chatId, alt, phone, jids: [...jids, phone].filter(Boolean) }
}

async function persistAutoReply(label = '') {
  if (!global.db?.data) return false
  const cfg = ensureAutoReplyConfig(global.db)
  global.db.data.autoReply = cfg
  try {
    const writeFn = global.safeDbWrite || ((d) => d.write?.())
    const ok = await writeFn(global.db)
    const n = cfg.blacklist?.length || 0
    if (ok === false) {
      console.error(`[AUTO-REPLY] No se pudo guardar${label ? ` (${label})` : ''} · blacklist=${n}`)
      return false
    }
    console.log(`[AUTO-REPLY] DB ok${label ? ` (${label})` : ''} · blacklist=${n}`)
    return true
  } catch (e) {
    console.error(`[AUTO-REPLY] Error guardando${label ? ` (${label})` : ''}:`, e.message)
    return false
  }
}

async function handleBlacklistCommands(m, { conn }) {
  if (!m || m.isGroup || m.isBaileys) return false
  // Solo el bot (dueño escribiendo desde esa cuenta). No otros números, aunque estén en global.owner.
  if (!m.fromMe) return false

  const cmd = (m.text || '').trim().toLowerCase()
  if (cmd !== '/black' && cmd !== '/del') return false

  if (!global.db?.data) return true
  const cfg = ensureAutoReplyConfig(global.db)
  const active = conn || global.conn
  const { chatId, alt, phone, jids } = pickCommandTarget(m, active)

  if (!phone) {
    console.log(`\x1b[33m[AUTO-REPLY]\x1b[0m ${cmd} sin número de cliente (chat=${chatId || '-'})`)
    await reactOk(active, m)
    return true
  }

  if (cmd === '/black') {
    addBlacklistEntry(cfg, {
      number: phone,
      name: 'Comando /black',
      jids,
    })
    blockSessionKeys(chatId, alt, phone)
    await persistAutoReply('/black')
    console.log(`\x1b[33m[AUTO-REPLY]\x1b[0m /black → ${phone}`)
  } else {
    removeBlacklistByJids(cfg, ...jids, phone)
    unblockSessionKeys(chatId, alt, phone)
    await persistAutoReply('/del')
    console.log(`\x1b[33m[AUTO-REPLY]\x1b[0m /del → ${phone}`)
  }
  await reactOk(active, m)
  return true
}

async function all(m, { conn, isOwner }) {
  try {
    // Comandos del dueño en el chat del cliente (antes de todo)
    if (await handleBlacklistCommands(m, { conn, isOwner })) return

    if (!isEligibleAutoReplyMessage(m)) return

    const resolved = resolvePrivateChat(m)
    if (!resolved) return

    const { chatId, statsId, alt } = resolved
    const busyKey = statsId || chatId

    if (!global.db?.data) return
    const cfg = ensureAutoReplyConfig(global.db)
    if (!cfg.enabled) return

    // Bloqueo inmediato (sesión) + lista negra persistente (PN + LID)
    if (isSessionBlocked(busyKey, chatId, statsId, alt, m.sender, m.key?.remoteJid, m.key?.remoteJidAlt)) {
      return
    }
    if (isBlacklisted(cfg, chatId, statsId, alt, m.sender, m.key?.remoteJid, m.key?.remoteJidAlt)) {
      blockSessionKeys(busyKey, chatId, statsId, alt, m.sender)
      return
    }

    const text = extractUserText(m)
    if (!text) return

    const withinHours = isWithinAttentionHours(cfg)
    const outsideHours = !withinHours && cfg.hours?.enabled
    const keywordHit = findKeywordHit(cfg, text)

    // Anti-spam: cuenta hits aunque esté “ocupado” escribiendo
    const countsForAntiSpam = !!(keywordHit || outsideHours)
    if (countsForAntiSpam && checkAntiSpam(cfg, busyKey)) {
      if (busyChats.get(busyKey)) return
      busyChats.set(busyKey, true)
      try {
        const active = conn || global.conn
        const phone = pickBestPhoneDigits(statsId, chatId, alt, m.sender, m.key?.remoteJidAlt, m.key?.remoteJid)
        const liveCfg = ensureAutoReplyConfig(global.db)
        if (phone) {
          addBlacklistEntry(liveCfg, {
            number: phone,
            name: 'Anti-spam automático',
            jids: [chatId, statsId, alt, m.sender, m.key?.remoteJid, m.key?.remoteJidAlt, phone],
          })
          blockSessionKeys(busyKey, chatId, statsId, alt, phone, m.sender)
          await persistAutoReply('anti-spam')
        }
        antiSpamHits.delete(busyKey)

        if (hasAntiSpamMessage(liveCfg)) {
          const warn = getAntiSpamPayload(liveCfg)
          await deliverWithHumanDelay(active, chatId, liveCfg, warn, m.key, 'Anti-spam')
        }
        console.log(`\x1b[33m[AUTO-REPLY]\x1b[0m Anti-spam → lista negra ${phone || chatId}`)
      } catch (e) {
        console.error('[AUTO-REPLY] Anti-spam error:', e.message)
      } finally {
        busyChats.delete(busyKey)
      }
      return
    }

    if (busyChats.get(busyKey)) return

    let rule = null
    let isHoursReply = false

    if (outsideHours) {
      // Fuera de horario: solo si hay texto real de usuario (ya filtrado arriba)
      if (!hasHoursMessage(cfg)) return
      if (isHoursLimitReached(cfg, busyKey)) return
      rule = getHoursReplyPayload(cfg)
      isHoursReply = true
    } else {
      rule = findMatchingRule(cfg, text, busyKey)
      if (!rule) return
    }

    busyChats.set(busyKey, true)
    try {
      const active = conn || global.conn
      const label = isHoursReply ? 'Fuera de horario' : `Match "${rule.name}"`
      console.log(
        `\x1b[36m[AUTO-REPLY]\x1b[0m Trigger text=${JSON.stringify(text.slice(0, 80))} mtype=${m.mtype || '-'}`,
      )
      const ok = await deliverWithHumanDelay(active, chatId, cfg, rule, m.key, label)
      if (ok) {
        // Releer config tras el await (typing): evita mutar un objeto obsoleto
        const liveCfg = ensureAutoReplyConfig(global.db)
        let needWrite = false
        if (rule.limitMode === 'max') {
          bumpRuleChatReplyCount(liveCfg, isHoursReply ? HOURS_STATS_ID : rule.id, busyKey)
          needWrite = true
        }
        // Mensaje final: deja de responder/leer a este contacto
        if (!isHoursReply && rule.isFinal) {
          const phone = pickBestPhoneDigits(statsId, chatId, alt, m.sender, m.key?.remoteJidAlt, m.key?.remoteJid)
          const jids = [chatId, statsId, alt, m.sender, m.key?.remoteJid, m.key?.remoteJidAlt, phone]
          const added = addBlacklistEntry(liveCfg, {
            number: phone || digitsFromJid(chatId) || digitsFromJid(statsId),
            name: `Final: ${String(rule.name || 'respuesta').slice(0, 40)}`,
            jids,
          })
          // Siempre bloqueo en memoria (aunque falle el PN)
          blockSessionKeys(busyKey, chatId, statsId, alt, phone, m.sender)
          needWrite = true
          console.log(
            `\x1b[35m[AUTO-REPLY]\x1b[0m Mensaje final → lista negra` +
              ` phone=${phone || '-'} lid=${digitsFromJid(chatId) || '-'} saved=${added}` +
              ` total=${liveCfg.blacklist?.length || 0}`,
          )
        }
        if (needWrite) {
          await persistAutoReply(rule.isFinal ? 'mensaje-final' : 'stats')
        }
      }
    } catch (e) {
      console.error('[AUTO-REPLY] Error enviando:', e.message)
    } finally {
      busyChats.delete(busyKey)
    }
  } catch (e) {
    console.error('[AUTO-REPLY] Error:', e.message)
  }
}

const handler = async () => {}
handler.all = all
handler.command = []
handler.tags = ['system']
handler.help = ['auto-reply']

export default handler
