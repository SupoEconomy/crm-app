/**
 * Recordatorios del Gestor General — envío proactivo a WhatsApp con typing humano.
 */
import {
  ensureAccountManager,
  shouldSendRemindToday,
  buildRentalContext,
  fillMessageTemplate,
  computeTypingMs,
  computeReadMs,
  toDateInputValue,
  syncProfileRentalStatus,
  getClient,
} from '../lib/account-manager.js'
import { stripCredentialVars } from '../lib/reminder-template.js'

const CHECK_MS = 55_000
let running = false
let intervalId = null

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function digitsToJid(digits) {
  const d = String(digits || '').replace(/\D/g, '')
  if (d.length < 8) return null
  return `${d}@s.whatsapp.net`
}

async function humanTyping(conn, jid, totalMs) {
  const end = Date.now() + Math.max(1500, totalMs)
  try {
    await conn.presenceSubscribe(jid).catch(() => {})
  } catch { /* ignore */ }
  while (Date.now() < end) {
    try {
      await conn.sendPresenceUpdate('composing', jid)
    } catch { /* ignore */ }
    await sleep(1400 + Math.floor(Math.random() * 400))
  }
  try {
    await conn.sendPresenceUpdate('paused', jid)
  } catch { /* ignore */ }
}

async function sendReminder(conn, jid, text, cfg) {
  const readMs = computeReadMs(cfg)
  if (readMs > 0) {
    try {
      await conn.presenceSubscribe(jid).catch(() => {})
    } catch { /* ignore */ }
    await sleep(readMs)
  }
  const typingMs = computeTypingMs(cfg, text)
  await humanTyping(conn, jid, typingMs)
  await conn.sendMessage(jid, { text })
  try {
    await conn.sendPresenceUpdate('paused', jid)
  } catch { /* ignore */ }
}

async function processReminders() {
  if (running) return
  const conn = global.conn
  const db = global.db
  if (!conn?.user || !db?.data) return

  running = true
  try {
    const cfg = ensureAccountManager(db)
    if (!cfg.enabled) return

    const now = new Date()
    let changed = false

    for (const rental of cfg.rentals || []) {
      if (rental.status === 'active' && rental.expiresAt && rental.expiresAt < Date.now()) {
        rental.status = 'expired'
        changed = true
      }
      if (rental.status === 'cancelled') continue
      if (!shouldSendRemindToday(rental, now)) continue

      const client = getClient(cfg, rental.clientId)
      if (!client?.whatsapp) continue
      const jid = digitsToJid(client.whatsapp)
      if (!jid) continue

      const ctx = buildRentalContext(cfg, rental)
      let tpl = rental.remindMessage || cfg.defaultRemindMsg
      if (!rental.includeCredentials) {
        tpl = stripCredentialVars(tpl)
      }
      const text = fillMessageTemplate(tpl, ctx)
      if (!text) continue

      try {
        await sendReminder(conn, jid, text, cfg)
        rental.lastRemindDay = toDateInputValue(now.getTime())
        changed = true
        console.log(`\x1b[36m[GESTOR]\x1b[0m Recordatorio → ${client.whatsapp} (${client.name})`)
      } catch (e) {
        console.error('[GESTOR] Error enviando recordatorio:', e?.message || e)
      }
    }

    syncProfileRentalStatus(cfg)
    db.data.accountManager = cfg

    if (changed) {
      if (typeof global.safeDbWrite === 'function') await global.safeDbWrite(db)
      else if (typeof db.write === 'function') await db.write()
    }
  } catch (e) {
    console.error('[GESTOR] processReminders:', e?.message || e)
  } finally {
    running = false
  }
}

function startLoop() {
  if (intervalId) return
  intervalId = setInterval(() => {
    processReminders().catch(() => {})
  }, CHECK_MS)
  setTimeout(() => processReminders().catch(() => {}), 12_000)
}

startLoop()

const handler = {}
handler.all = async function () { /* solo cron de recordatorios */ }
export default handler
