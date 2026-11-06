/**
 * Comandos /code y /codigo — OTPs Spacemail por alias autorizado.
 * Formato: /code correo|plataforma
 * Sin args: muestra ejemplo.
 * Número no autorizado o vencido: silencio (no responde).
 * Respuesta con delay de lectura + "escribiendo" (tiempos globales Config Email).
 */
import {
  ensureBotCodes,
  parseCodeCommandText,
  lookupCodeForRequest,
  CODE_COMMAND_HELP,
  serviceLabel,
  normalizePhoneDigits,
  findAliasByEmail,
  getPhoneOnAlias,
  isPhoneAccessActive,
  resolvePlatform,
  getGlobalMailConfig,
  computeCodeReadMs,
  computeCodeTypingMs,
} from '../lib/bot-codes.js'

function digitsFromJid(jid = '') {
  const user = String(jid || '').split('@')[0] || ''
  return normalizePhoneDigits(user.split(':')[0] || '')
}

function senderDigits(m) {
  const candidates = [m?.sender, m?.chat, m?.key?.participant, m?.key?.remoteJid]
  for (const j of candidates) {
    const d = digitsFromJid(j)
    if (d.length >= 8) return d
  }
  return ''
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function humanRead(conn, jid, ms, msgKey) {
  if (!ms || ms < 1) return
  if (conn?.presenceSubscribe) {
    await conn.presenceSubscribe(jid).catch(() => {})
  }
  if (conn && typeof conn.readMessages === 'function' && msgKey) {
    await conn.readMessages([msgKey]).catch(() => {})
  }
  await sleep(ms)
}

async function humanTyping(conn, jid, ms) {
  if (!ms || ms < 1) {
    await sleep(400)
    return
  }
  if (conn?.presenceSubscribe) {
    await conn.presenceSubscribe(jid).catch(() => {})
  }
  if (!conn || typeof conn.sendPresenceUpdate !== 'function') {
    await sleep(ms)
    return
  }
  const start = Date.now()
  await conn.sendPresenceUpdate('composing', jid).catch(() => {})
  while (Date.now() - start < ms) {
    await sleep(1400 + Math.floor(Math.random() * 400))
    if (Date.now() - start < ms) {
      await conn.sendPresenceUpdate('composing', jid).catch(() => {})
    }
  }
  await sleep(200 + Math.floor(Math.random() * 400))
}

async function replyHuman(conn, m, text) {
  const timing = getGlobalMailConfig().responseTiming
  const jid = m.chat
  const readMs = computeCodeReadMs(timing)
  const typingMs = computeCodeTypingMs(timing, text)
  console.log(
    `\x1b[36m[BOT-CODIGOS]\x1b[0m /code → ${jid}` +
      ` leer ${Math.round(readMs / 1000)}s + typing ${Math.round(typingMs / 1000)}s`
  )
  await humanRead(conn, jid, readMs, m.key)
  await humanTyping(conn, jid, typingMs)
  await m.reply(text)
  if (conn && typeof conn.sendPresenceUpdate === 'function') {
    await conn.sendPresenceUpdate('paused', jid).catch(() => {})
  }
}

let handler = async (m, { conn, text }) => {
  if (m.isGroup) return

  const db = global.db
  if (!db?.data) return

  const cfg = ensureBotCodes(db)
  if (cfg.settings?.commandsEnabled === false) return

  const phone = senderDigits(m)
  const argsText = String(text || '').trim()

  if (!argsText) {
    return replyHuman(conn, m, CODE_COMMAND_HELP)
  }

  const { email, platform } = parseCodeCommandText(argsText)
  if (!email || !platform) {
    return replyHuman(conn, m, CODE_COMMAND_HELP)
  }

  // Pre-check silencioso (sin IMAP): alias + número activo + plataforma del alias
  const alias = findAliasByEmail(cfg, email)
  if (!alias) return
  const access = getPhoneOnAlias(alias, phone)
  if (!access || !isPhoneAccessActive(access)) return

  const platformId = resolvePlatform(platform)
  if (
    platformId &&
    alias.service &&
    alias.service !== 'other' &&
    platformId !== 'other' &&
    platformId !== alias.service
  ) {
    // Alias es de otra plataforma → ignorar
    return
  }

  // Leer + escribiendo en paralelo con la consulta IMAP (más natural)
  const timing = getGlobalMailConfig().responseTiming
  const jid = m.chat
  const readMs = computeCodeReadMs(timing)

  const lookupPromise = lookupCodeForRequest(cfg, { phone, email, platform })

  console.log(
    `\x1b[36m[BOT-CODIGOS]\x1b[0m /code lookup → ${email}` +
      ` leer ${Math.round(readMs / 1000)}s…`
  )
  await humanRead(conn, jid, readMs, m.key)

  const result = await lookupPromise

  if (result.silent) return

  let replyText
  if (!result.ok) {
    replyText = `No pude consultar el correo (${result.error || result.reason || 'error'}).`
  } else {
    const svc = serviceLabel(result.platform || platform)
    if (!result.found || !(result.codes || []).length) {
      replyText =
        `No hay código reciente para *${result.alias?.email || email}* (${svc}).\n` +
        `Pedí el OTP otra vez y volvé a usar el comando.`
    } else {
      const codes = result.codes.join('  ·  ')
      const subj = result.message?.subject ? `\n_${result.message.subject}_` : ''
      replyText = `*${svc}*\n\`${codes}\`${subj}\n\n${result.alias?.email || email}`
    }
  }

  const typingMs = computeCodeTypingMs(timing, replyText)
  console.log(
    `\x1b[36m[BOT-CODIGOS]\x1b[0m /code typing ${Math.round(typingMs / 1000)}s → ${jid}`
  )
  await humanTyping(conn, jid, typingMs)
  await m.reply(replyText)
  if (conn && typeof conn.sendPresenceUpdate === 'function') {
    await conn.sendPresenceUpdate('paused', jid).catch(() => {})
  }
}

handler.help = ['code', 'codigo']
handler.tags = ['tools']
handler.command = ['code', 'codigo']

export default handler
