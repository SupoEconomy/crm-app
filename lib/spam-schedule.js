const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/

/** 0=Domingo … 6=Sábado (igual que Date.getDay()) */
export const WEEKDAY_LABELS = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
}

export const WEEKDAY_SHORT = {
  0: 'Dom',
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
}

export function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null
  const match = timeStr.trim().match(TIME_RE)
  if (!match) return null
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
}

export function formatMinutesToTime(totalMins) {
  const h = Math.floor(totalMins / 60) % 24
  const m = totalMins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatTime12h(timeStr) {
  const mins = parseTimeToMinutes(timeStr)
  if (mins === null) return timeStr || '--:--'
  let h = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

function normalizeTimeStr(raw) {
  const mins = parseTimeToMinutes(String(raw || '').trim())
  if (mins === null) return null
  return formatMinutesToTime(mins)
}

export function getSpamMode(campaign = {}) {
  return campaign?.spamMode === 'weekly' ? 'weekly' : 'auto'
}

/** Normaliza campos de horario auto + calendario semanal (por carpeta). */
export function normalizeScheduleFields(campaign = {}) {
  if (campaign.spamMode !== 'weekly') campaign.spamMode = 'auto'

  campaign.scheduleEnabled = !!campaign.scheduleEnabled
  campaign.scheduleStart = parseTimeToMinutes(campaign.scheduleStart) != null
    ? campaign.scheduleStart.trim().slice(0, 5)
    : '07:00'
  campaign.scheduleStop = parseTimeToMinutes(campaign.scheduleStop) != null
    ? campaign.scheduleStop.trim().slice(0, 5)
    : '21:00'

  if (!campaign.weeklySlots || typeof campaign.weeklySlots !== 'object') {
    campaign.weeklySlots = {}
  }
  for (let d = 0; d <= 6; d++) {
    const k = String(d)
    const arr = Array.isArray(campaign.weeklySlots[k]) ? campaign.weeklySlots[k] : []
    const cleaned = []
    const seen = new Set()
    for (const t of arr) {
      const nt = normalizeTimeStr(t)
      if (!nt || seen.has(nt)) continue
      seen.add(nt)
      cleaned.push(nt)
    }
    cleaned.sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b))
    // máx 12 envíos por día (profesional, sin abusar)
    campaign.weeklySlots[k] = cleaned.slice(0, 12)
  }

  if (!campaign.weeklyFired || typeof campaign.weeklyFired !== 'object') {
    campaign.weeklyFired = {}
  }

  return campaign
}

export function isWithinSpamSchedule(startTime, stopTime, date = new Date()) {
  const startMins = parseTimeToMinutes(startTime)
  const stopMins = parseTimeToMinutes(stopTime)
  if (startMins === null || stopMins === null) return true
  if (startMins === stopMins) return false

  const nowMins = date.getHours() * 60 + date.getMinutes()

  if (startMins < stopMins) {
    return nowMins >= startMins && nowMins < stopMins
  }
  return nowMins >= startMins || nowMins < stopMins
}

export function getScheduledActiveState(campaign, date = new Date()) {
  normalizeScheduleFields(campaign)
  // En modo weekly la ventana diaria no aplica
  if (getSpamMode(campaign) === 'weekly') return null
  if (!campaign.scheduleEnabled) return null
  return isWithinSpamSchedule(campaign.scheduleStart, campaign.scheduleStop, date)
}

/**
 * ¿Puede esta campaña spamear de forma continua (intervalo)?
 * - auto + schedule: solo dentro de ventana
 * - weekly: NUNCA continuo (solo disparos puntuales)
 */
export function isCampaignEffectivelyEnabled(campaign, date = new Date()) {
  if (!campaign) return false
  if (getSpamMode(campaign) === 'weekly') return false
  const scheduled = getScheduledActiveState(campaign, date)
  if (scheduled !== null) return scheduled
  return campaign.enabled !== false
}

/** Kill-switch manual: aplica a auto y weekly. */
export function isCampaignManuallyOn(campaign) {
  return !!(campaign && campaign.enabled !== false)
}

/**
 * ¿Puede enviar AHORA (un disparo)?
 * weekly: solo si está ON y hay un slot en este minuto (o force flag).
 * auto: same as effectively enabled.
 */
export function isCampaignAllowedToSend(campaign, date = new Date(), { forceWeekly = false } = {}) {
  if (!campaign || campaign.enabled === false) return false
  if (getSpamMode(campaign) === 'weekly') {
    if (forceWeekly) return true
    return getDueWeeklySlots(campaign, date).length > 0
  }
  return isCampaignEffectivelyEnabled(campaign, date)
}

/** Recalcula enabled del grupo = true si ALGUNA campaña que lo usa está activa (evita contagio entre carpetas). */
export function refreshGroupEnabledFromCampaigns(db, groupId, date = new Date()) {
  if (!db?.data?.publicaciones?.[groupId]) return
  const campaigns = db.data.campaigns || {}
  const anyOn = Object.values(campaigns).some((c) => {
    if (!(c.groups || []).includes(groupId)) return false
    if (getSpamMode(c) === 'weekly') return isCampaignManuallyOn(c)
    return isCampaignEffectivelyEnabled(c, date)
  })
  db.data.publicaciones[groupId].enabled = anyOn
}

export function applyCampaignEnabledState(db, campaignName, enabled) {
  const campaign = db?.data?.campaigns?.[campaignName]
  if (!campaign) return false
  if (campaign.enabled === enabled) {
    // Aun si no cambia, refrescar grupos
    for (const groupId of campaign.groups || []) {
      refreshGroupEnabledFromCampaigns(db, groupId)
    }
    return false
  }

  campaign.enabled = enabled
  db.data.publicaciones ||= {}

  for (const groupId of campaign.groups || []) {
    if (!db.data.publicaciones[groupId]) {
      db.data.publicaciones[groupId] = {
        publications: [],
        interval: campaign.interval || 600000,
        enabled: !!enabled,
      }
    }
    refreshGroupEnabledFromCampaigns(db, groupId)
  }
  return true
}

export function syncCampaignSchedule(db, campaignName, date = new Date()) {
  const campaign = db?.data?.campaigns?.[campaignName]
  if (!campaign) return false
  // Modo weekly no pisa enabled con la ventana
  if (getSpamMode(campaign) === 'weekly') return false
  const scheduled = getScheduledActiveState(campaign, date)
  if (scheduled === null) return false
  return applyCampaignEnabledState(db, campaignName, scheduled)
}

export function syncAllCampaignSchedules(db, date = new Date()) {
  if (!db?.data?.campaigns) return []
  const changed = []
  for (const name of Object.keys(db.data.campaigns)) {
    if (syncCampaignSchedule(db, name, date)) changed.push(name)
  }
  return changed
}

export function localDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Slots semanales pendientes de este minuto (no disparados aún).
 * @returns {{ day: number, time: string, key: string }[]}
 */
export function getDueWeeklySlots(campaign, date = new Date()) {
  normalizeScheduleFields(campaign)
  if (getSpamMode(campaign) !== 'weekly') return []
  if (campaign.enabled === false) return []

  const day = date.getDay()
  const dayKey = String(day)
  const times = campaign.weeklySlots[dayKey] || []
  if (!times.length) return []

  const nowMins = date.getHours() * 60 + date.getMinutes()
  const dateKey = localDateKey(date)
  const due = []

  for (const time of times) {
    const slotMins = parseTimeToMinutes(time)
    if (slotMins === null) continue
    if (slotMins !== nowMins) continue
    const key = `${dateKey}|${day}|${time}`
    if (campaign.weeklyFired[key]) continue
    due.push({ day, time, key })
  }
  return due
}

export function markWeeklySlotsFired(campaign, slots = []) {
  normalizeScheduleFields(campaign)
  for (const s of slots) {
    if (s?.key) campaign.weeklyFired[s.key] = Date.now()
  }
  pruneWeeklyFired(campaign)
}

/** Mantiene ~21 días de historial para no crecer sin límite. */
export function pruneWeeklyFired(campaign, keepDays = 21) {
  if (!campaign.weeklyFired) return
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000
  for (const [k, v] of Object.entries(campaign.weeklyFired)) {
    const ts = typeof v === 'number' ? v : 0
    if (ts && ts < cutoff) delete campaign.weeklyFired[k]
    // keys muy viejas por string de fecha
    const m = k.match(/^(\d{4}-\d{2}-\d{2})\|/)
    if (m) {
      const t = Date.parse(m[1] + 'T00:00:00')
      if (!Number.isNaN(t) && t < cutoff) delete campaign.weeklyFired[k]
    }
  }
}

/**
 * Parsea body del form weekly:
 * weekly_1=15:00&weekly_1=22:00  o weeklyTimes_1 como CSV
 */
export function parseWeeklySlotsFromBody(body = {}) {
  const slots = {}
  for (let d = 0; d <= 6; d++) {
    const k = String(d)
    let vals = body[`weekly_${k}`]
    if (vals == null) vals = body[`weeklyTimes_${k}`]
    if (vals == null) {
      slots[k] = []
      continue
    }
    const list = Array.isArray(vals) ? vals : String(vals).split(/[,;\n]+/)
    const cleaned = []
    const seen = new Set()
    for (const raw of list) {
      const t = normalizeTimeStr(raw)
      if (!t || seen.has(t)) continue
      seen.add(t)
      cleaned.push(t)
    }
    cleaned.sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b))
    slots[k] = cleaned.slice(0, 12)
  }
  return slots
}

export function countWeeklySlots(campaign) {
  normalizeScheduleFields(campaign)
  let n = 0
  for (let d = 0; d <= 6; d++) {
    n += (campaign.weeklySlots[String(d)] || []).length
  }
  return n
}

export function getNextWeeklySlot(campaign, date = new Date()) {
  normalizeScheduleFields(campaign)
  if (getSpamMode(campaign) !== 'weekly') return null
  if (campaign.enabled === false) return null

  // Busca en los próximos 8 días
  for (let offset = 0; offset < 8; offset++) {
    const d = new Date(date.getTime() + offset * 86400000)
    const day = d.getDay()
    const times = campaign.weeklySlots[String(day)] || []
    const nowMins = date.getHours() * 60 + date.getMinutes()
    for (const time of times) {
      const mins = parseTimeToMinutes(time)
      if (mins === null) continue
      if (offset === 0 && mins <= nowMins) continue
      return {
        day,
        dayLabel: WEEKDAY_LABELS[day],
        time,
        time12: formatTime12h(time),
        dateKey: localDateKey(d),
      }
    }
  }
  return null
}

export function getScheduleStatus(campaign, date = new Date()) {
  normalizeScheduleFields(campaign)

  if (getSpamMode(campaign) === 'weekly') {
    const total = countWeeklySlots(campaign)
    if (campaign.enabled === false) {
      return {
        enabled: true,
        mode: 'weekly',
        withinWindow: false,
        label: 'Spam programado · carpeta desactivada',
        nextAction: null,
        nextTime: null,
        minutesUntil: null,
        weeklySlots: total,
      }
    }
    if (total === 0) {
      return {
        enabled: true,
        mode: 'weekly',
        withinWindow: false,
        label: 'Spam programado · sin horas configuradas',
        nextAction: null,
        nextTime: null,
        minutesUntil: null,
        weeklySlots: 0,
      }
    }
    const next = getNextWeeklySlot(campaign, date)
    if (!next) {
      return {
        enabled: true,
        mode: 'weekly',
        withinWindow: false,
        label: `Spam programado · ${total} envío(s)/semana`,
        nextAction: null,
        nextTime: null,
        minutesUntil: null,
        weeklySlots: total,
      }
    }
    return {
      enabled: true,
      mode: 'weekly',
      withinWindow: false,
      label: `Spam programado · próximo ${next.dayLabel} ${next.time12}`,
      nextAction: 'send',
      nextTime: `${next.dayLabel} ${next.time12}`,
      minutesUntil: null,
      weeklySlots: total,
    }
  }

  if (!campaign.scheduleEnabled) {
    return {
      enabled: false,
      mode: 'auto',
      withinWindow: null,
      label: 'Programación diaria desactivada',
      nextAction: null,
      nextTime: null,
      minutesUntil: null,
    }
  }

  const withinWindow = isWithinSpamSchedule(
    campaign.scheduleStart,
    campaign.scheduleStop,
    date
  )
  const nowMins = date.getHours() * 60 + date.getMinutes()
  const startMins = parseTimeToMinutes(campaign.scheduleStart)
  const stopMins = parseTimeToMinutes(campaign.scheduleStop)

  const minutesUntil = (targetMins) => {
    let diff = targetMins - nowMins
    if (diff <= 0) diff += 24 * 60
    return diff
  }

  const start12 = formatTime12h(campaign.scheduleStart)
  const stop12 = formatTime12h(campaign.scheduleStop)

  if (withinWindow) {
    return {
      enabled: true,
      mode: 'auto',
      withinWindow: true,
      label: `Enviando · pausa a las ${stop12}`,
      nextAction: 'pause',
      nextTime: stop12,
      minutesUntil: minutesUntil(stopMins),
    }
  }

  return {
    enabled: true,
    mode: 'auto',
    withinWindow: false,
    label: `Pausado · inicia a las ${start12}`,
    nextAction: 'start',
    nextTime: start12,
    minutesUntil: minutesUntil(startMins),
  }
}

export function formatScheduleCountdown(minutes) {
  if (minutes == null) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}min`
  if (h > 0) return `${h}h`
  return `${m} min`
}

export const DEFAULT_CAMPAIGN_SCHEDULE = {
  spamMode: 'auto',
  scheduleEnabled: false,
  scheduleStart: '07:00',
  scheduleStop: '21:00',
  weeklySlots: {
    '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [],
  },
  weeklyFired: {},
}
