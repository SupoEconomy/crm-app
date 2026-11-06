import { resolveSavedImagePath, getImagesPath } from './image-storage.js'
import { imageFileToBase64, base64ToImageFile, parseBase64Input, writeImageBuffer } from './base64-image.js'
import { findCampaignPublicationTemplate } from './campaign-sync.js'
import { DEFAULT_CAMPAIGN_SCHEDULE, normalizeScheduleFields, getSpamMode } from './spam-schedule.js'
import { sortGroupIdsByHighlight } from './group-highlight.js'
import { normalizeAutoReplyConfig } from './auto-reply.js'
import { normalizeAccountManager } from './account-manager.js'
import { normalizeBotCodes } from './bot-codes.js'

/** v1: grupos · v2: + pubs · v3: + autoReply/gestor · v4: + bot códigos */
export const CAMPAIGN_BACKUP_VERSION = 4

function isVideoPublication(pub = {}) {
  if (pub.imageType === 'video') return true
  if (pub.video) return true
  const media = String(pub.image || '')
  return /\.(mp4|mov|webm|mkv|avi|3gp)$/i.test(media)
}

function isVideoFilename(name = '') {
  return /\.(mp4|mov|webm|mkv|avi|3gp)$/i.test(String(name || ''))
}

/**
 * Lee un archivo de imagen del usuario y lo empaqueta en base64.
 * Videos: no se embeben (solo se anota que había video).
 */
async function packImageFile(filename, imageOptions) {
  if (!filename) {
    return { mediaKind: 'none', imageBase64: null, imageMime: null, imageExt: null }
  }
  if (isVideoFilename(filename)) {
    return { mediaKind: 'video-text-only', imageBase64: null, imageMime: null, imageExt: null }
  }
  const abs = resolveSavedImagePath(filename, imageOptions)
  if (!abs) {
    return { mediaKind: 'missing', imageBase64: null, imageMime: null, imageExt: null }
  }
  const encoded = await imageFileToBase64(abs)
  if (!encoded) {
    return { mediaKind: 'missing', imageBase64: null, imageMime: null, imageExt: null }
  }
  return {
    mediaKind: 'image',
    imageBase64: encoded.imageBase64,
    imageMime: encoded.imageMime,
    imageExt: encoded.imageExt,
  }
}

async function writePackedImage(packed, imagesPath, baseName) {
  if (!packed?.imageBase64) return null
  const parsed = parseBase64Input(packed.imageBase64)
  if (!parsed?.buffer?.length) return null
  const written = await writeImageBuffer(parsed.buffer, imagesPath, baseName)
  return written?.filename || null
}

/**
 * Empaqueta auto-respuestas (reglas, carpetas, horarios, anti-spam, lista negra)
 * e incluye imágenes en base64. Los videos no se copian (igual que en publicaciones).
 */
export async function packAutoReply(cfg, imageOptions = {}) {
  if (!cfg || typeof cfg !== 'object') return null
  const base = normalizeAutoReplyConfig(cfg)
  let imagesEmbedded = 0
  let videosSkipped = 0

  const packSlot = async (image, imageType) => {
    const packed = await packImageFile(image, imageOptions)
    if (packed.mediaKind === 'image') imagesEmbedded++
    if (packed.mediaKind === 'video-text-only') videosSkipped++
    return {
      imageType: imageType === 'video' || packed.mediaKind === 'video-text-only' ? 'video' : (packed.mediaKind === 'image' ? 'image' : null),
      ...packed,
      // no guardamos el filename local (en otro bot no sirve); solo base64
      image: null,
    }
  }

  const rules = []
  for (const rule of base.rules || []) {
    const media = await packSlot(rule.image, rule.imageType)
    rules.push({
      ...rule,
      image: null,
      imageType: media.imageType,
      imageBase64: media.imageBase64,
      imageMime: media.imageMime,
      imageExt: media.imageExt,
      mediaKind: media.mediaKind,
    })
  }

  const hoursMedia = await packSlot(base.hours?.image, base.hours?.imageType)
  const antiMedia = await packSlot(base.antiSpam?.image, base.antiSpam?.imageType)

  return {
    config: {
      enabled: !!base.enabled,
      minTypingSec: base.minTypingSec,
      maxTypingSec: base.maxTypingSec,
      minReadSec: base.minReadSec,
      maxReadSec: base.maxReadSec,
      folders: base.folders || [],
      rules,
      blacklist: base.blacklist || [],
      // stats son estado del día; no hacen falta migrar, se empiezan de cero
      stats: {},
      riskAccepted: !!base.riskAccepted,
      hours: {
        ...(base.hours || {}),
        image: null,
        imageType: hoursMedia.imageType,
        imageBase64: hoursMedia.imageBase64,
        imageMime: hoursMedia.imageMime,
        imageExt: hoursMedia.imageExt,
        mediaKind: hoursMedia.mediaKind,
      },
      antiSpam: {
        ...(base.antiSpam || {}),
        image: null,
        imageType: antiMedia.imageType,
        imageBase64: antiMedia.imageBase64,
        imageMime: antiMedia.imageMime,
        imageExt: antiMedia.imageExt,
        mediaKind: antiMedia.mediaKind,
      },
    },
    meta: { imagesEmbedded, videosSkipped, rules: rules.length },
  }
}

/**
 * Restaura auto-respuestas desde el JSON (crea archivos de imagen reales).
 */
export async function unpackAutoReply(packed, imagesPath) {
  if (!packed || typeof packed !== 'object') return { ok: false, imagesWritten: 0 }
  const src = packed.config && typeof packed.config === 'object' ? packed.config : packed
  const stamp = Date.now()
  let imagesWritten = 0

  const restoreSlot = async (slot, prefix) => {
    if (!slot || typeof slot !== 'object') return { image: null, imageType: null }
    // soporta formato viejo con solo filename (sin base64) — no se puede recrear en otro disco
    if (slot.imageBase64) {
      const name = await writePackedImage(slot, imagesPath, prefix)
      if (name) {
        imagesWritten++
        return { image: name, imageType: 'image' }
      }
    }
    if (slot.mediaKind === 'video-text-only' || slot.imageType === 'video') {
      return { image: null, imageType: null }
    }
    // si solo trae filename sin base64, lo ignoramos (no existe en este bot)
    return { image: null, imageType: null }
  }

  const rules = []
  for (let i = 0; i < (src.rules || []).length; i++) {
    const r = src.rules[i]
    const media = await restoreSlot(r, `backup_ar_rule_${stamp}_${i}`)
    const camp = {
      id: r.id,
      folderId: r.folderId ?? null,
      name: r.name,
      enabled: r.enabled !== false,
      keywords: r.keywords,
      text: r.text,
      image: media.image,
      imageType: media.imageType,
      limitMode: r.limitMode,
      maxPerContact: r.maxPerContact,
      isFinal: !!r.isFinal,
    }
    rules.push(camp)
  }

  const hoursMedia = await restoreSlot(src.hours, `backup_ar_hours_${stamp}`)
  const antiMedia = await restoreSlot(src.antiSpam, `backup_ar_antispam_${stamp}`)

  const restored = {
    enabled: !!src.enabled,
    minTypingSec: src.minTypingSec,
    maxTypingSec: src.maxTypingSec,
    minReadSec: src.minReadSec,
    maxReadSec: src.maxReadSec,
    folders: Array.isArray(src.folders) ? src.folders : [],
    rules,
    blacklist: Array.isArray(src.blacklist) ? src.blacklist : [],
    stats: {},
    riskAccepted: !!src.riskAccepted,
    hours: {
      ...(src.hours || {}),
      image: hoursMedia.image,
      imageType: hoursMedia.imageType,
      // limpia campos de empaquetado
      imageBase64: undefined,
      imageMime: undefined,
      imageExt: undefined,
      mediaKind: undefined,
    },
    antiSpam: {
      ...(src.antiSpam || {}),
      image: antiMedia.image,
      imageType: antiMedia.imageType,
      imageBase64: undefined,
      imageMime: undefined,
      imageExt: undefined,
      mediaKind: undefined,
    },
  }

  return {
    ok: true,
    config: normalizeAutoReplyConfig(restored),
    imagesWritten,
    rules: rules.length,
  }
}

/**
 * Gestor General: solo datos JSON (cuentas, perfiles, clientes, alquileres).
 */
export function packAccountManager(cfg) {
  if (!cfg || typeof cfg !== 'object') return null
  const n = normalizeAccountManager(cfg)
  return {
    enabled: n.enabled,
    minTypingSec: n.minTypingSec,
    maxTypingSec: n.maxTypingSec,
    minReadSec: n.minReadSec,
    maxReadSec: n.maxReadSec,
    defaultRemindDays: n.defaultRemindDays,
    defaultRemindTime: n.defaultRemindTime,
    defaultRemindMsg: n.defaultRemindMsg,
    mothers: n.mothers || [],
    clients: n.clients || [],
    rentals: n.rentals || [],
  }
}

export function unpackAccountManager(raw) {
  if (!raw || typeof raw !== 'object') return null
  return normalizeAccountManager(raw)
}

/** Bot Códigos: buzones Spacemail + alias (sin imágenes). */
export function packBotCodes(cfg) {
  if (!cfg || typeof cfg !== 'object') return null
  const n = normalizeBotCodes(cfg)
  return {
    domain: n.domain,
    catchAll: n.catchAll !== false,
    settings: n.settings || {},
    mailboxes: (n.mailboxes || []).map((m) => ({ ...m })),
    aliases: (n.aliases || []).map((a) => ({ ...a })),
  }
}

export function unpackBotCodes(raw) {
  if (!raw || typeof raw !== 'object') return null
  return normalizeBotCodes(raw)
}

/**
 * Plantilla única de publicaciones de la carpeta (no N copias por grupo).
 */
export function collectCampaignTemplatePubs(db, campaign, campaignName) {
  const fromGroups = findCampaignPublicationTemplate(db, campaign, campaignName)
  if (fromGroups.length > 0) return fromGroups

  return (campaign.publications || []).filter((p) => {
    if (p.enabled === false) return false
    return !p.campaign || p.campaign === campaignName
  })
}

/**
 * Construye el JSON de respaldo COMPLETO:
 * carpeta (grupos, horario, pubs+imágenes) + auto-respuestas + gestor general.
 */
export async function buildCampaignBackup(db, gruposDB, campaignName, {
  isSubBot = false,
  subBotNumber = null,
} = {}) {
  const campaign = db?.data?.campaigns?.[campaignName] || {
    groups: [],
    publications: [],
    interval: 600000,
    ...DEFAULT_CAMPAIGN_SCHEDULE,
  }
  normalizeScheduleFields(campaign)

  const highlighted = gruposDB?.data?.highlightedGroups || []
  const imageOptions = { isSubBot, subBotNumber }
  const templates = collectCampaignTemplatePubs(db, campaign, campaignName)
  const sortedGroups = sortGroupIdsByHighlight(campaign.groups || [], highlighted)

  const publications = []
  let imagesEmbedded = 0
  let videosAsTextOnly = 0

  for (let i = 0; i < templates.length; i++) {
    const pub = templates[i]
    const entry = {
      text: pub.text || '',
      enabled: pub.enabled !== false,
      mediaKind: 'none',
      imageBase64: null,
      imageMime: null,
      imageExt: null,
    }

    if (isVideoPublication(pub)) {
      entry.mediaKind = 'video-text-only'
      videosAsTextOnly++
      publications.push(entry)
      continue
    }

    if (pub.image) {
      const abs = resolveSavedImagePath(pub.image, imageOptions)
      if (abs) {
        const encoded = await imageFileToBase64(abs)
        if (encoded) {
          entry.mediaKind = 'image'
          entry.imageBase64 = encoded.imageBase64
          entry.imageMime = encoded.imageMime
          entry.imageExt = encoded.imageExt
          imagesEmbedded++
        }
      }
    }

    publications.push(entry)
  }

  const autoReplyPack = await packAutoReply(db?.data?.autoReply, imageOptions)
  const accountManagerPack = packAccountManager(db?.data?.accountManager)
  const botCodesPack = packBotCodes(db?.data?.botCodes)

  return {
    version: CAMPAIGN_BACKUP_VERSION,
    campaignName,
    groups: sortedGroups,
    highlightedGroups: [...highlighted],
    interval: campaign.interval || 600000,
    spamMode: getSpamMode(campaign),
    scheduleEnabled: !!campaign.scheduleEnabled,
    scheduleStart: campaign.scheduleStart || '07:00',
    scheduleStop: campaign.scheduleStop || '21:00',
    weeklySlots: campaign.weeklySlots || { ...DEFAULT_CAMPAIGN_SCHEDULE.weeklySlots },
    publications,
    autoReply: autoReplyPack,
    accountManager: accountManagerPack,
    botCodes: botCodesPack,
    meta: {
      publicationsCount: publications.length,
      imagesEmbedded,
      videosAsTextOnly,
      autoReplyRules: autoReplyPack?.meta?.rules || 0,
      autoReplyImages: autoReplyPack?.meta?.imagesEmbedded || 0,
      accountMothers: accountManagerPack?.mothers?.length || 0,
      accountClients: accountManagerPack?.clients?.length || 0,
      accountRentals: accountManagerPack?.rentals?.length || 0,
      botCodesAliases: botCodesPack?.aliases?.length || 0,
      exportDate: new Date().toISOString(),
      scope: isSubBot ? `subbot:${subBotNumber}` : 'principal',
      includes: ['campaign', 'publications', 'autoReply', 'accountManager', 'botCodes'],
    },
  }
}

/**
 * Aplica pubs del respaldo a todos los grupos de la carpeta.
 * Imágenes: base64 → archivo real en imagesPath del usuario (.png si es PNG).
 */
export async function importBackupPublications(db, campaignName, publications, {
  imagesPath,
  isSubBot = false,
  subBotNumber = null,
  replaceExisting = false,
} = {}) {
  const campaign = db?.data?.campaigns?.[campaignName]
  if (!campaign) {
    return { imported: 0, imagesWritten: 0, textOnly: 0, skipped: 0 }
  }

  const list = Array.isArray(publications) ? publications : []
  if (list.length === 0) {
    return { imported: 0, imagesWritten: 0, textOnly: 0, skipped: 0 }
  }

  db.data.publicaciones ||= {}
  campaign.publications ||= []

  if (replaceExisting) {
    for (const groupId of campaign.groups || []) {
      const cfg = db.data.publicaciones[groupId]
      if (!cfg?.publications) continue
      cfg.publications = cfg.publications.filter((p) => p.campaign && p.campaign !== campaignName)
    }
    campaign.publications = (campaign.publications || []).filter(
      (p) => p.campaign && p.campaign !== campaignName
    )
  }

  const groups = campaign.groups || []
  let imported = 0
  let imagesWritten = 0
  let textOnly = 0
  const stamp = Date.now()

  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (!item || (typeof item !== 'object')) {
      continue
    }

    const text = String(item.text || '')
    const hasB64 = !!(item.imageBase64 || (item.mediaKind === 'image' && item.imageBase64))
    let sharedBuffer = null

    if (hasB64 && item.imageBase64) {
      const parsed = parseBase64Input(item.imageBase64)
      if (parsed?.buffer?.length) sharedBuffer = parsed.buffer
    }

    let campaignImageName = ''
    if (sharedBuffer) {
      const written = await writeImageBuffer(
        sharedBuffer,
        imagesPath,
        `backup_${stamp}_${i}_tpl`
      )
      if (written) {
        campaignImageName = written.filename
        imagesWritten++
      }
    }

    const campPub = {
      text,
      image: campaignImageName,
      video: '',
      imageType: campaignImageName ? 'image' : (item.mediaKind === 'video-text-only' ? '' : ''),
      enabled: item.enabled !== false,
      campaign: campaignName,
      timestamp: stamp + i,
    }
    campaign.publications.push(campPub)

    if (!sharedBuffer) textOnly++

    for (const groupId of groups) {
      if (!db.data.publicaciones[groupId]) {
        db.data.publicaciones[groupId] = {
          publications: [],
          interval: campaign.interval || 600000,
          enabled: campaign.enabled !== false,
        }
      }

      let groupImage = ''
      if (sharedBuffer) {
        const shortId = String(groupId).split('@')[0]
        const written = await writeImageBuffer(
          sharedBuffer,
          imagesPath,
          `backup_${stamp}_${i}_${shortId}`
        )
        if (written) {
          groupImage = written.filename
          imagesWritten++
        }
      }

      db.data.publicaciones[groupId].publications.push({
        text,
        image: groupImage,
        video: '',
        imageType: groupImage ? 'image' : '',
        enabled: item.enabled !== false,
        campaign: campaignName,
        timestamp: stamp + i,
      })
    }

    imported++
  }

  return { imported, imagesWritten, textOnly, skipped: 0 }
}

/**
 * Aplica un JSON de respaldo completo a la carpeta activa + módulos del bot.
 * Compat: v1 solo grupos; v2 + pubs; v3 + autoReply + accountManager.
 */
export async function applyCampaignBackup(db, gruposDB, campaignName, importedData, {
  imagesPath,
  isSubBot = false,
  subBotNumber = null,
  mergeHighlighted = true,
} = {}) {
  if (!importedData || typeof importedData !== 'object') {
    throw new Error('JSON de respaldo inválido.')
  }
  if (!Array.isArray(importedData.groups)) {
    throw new Error('El archivo JSON no tiene un formato válido de grupos.')
  }

  db.data.campaigns ||= {}
  if (!db.data.campaigns[campaignName]) {
    db.data.campaigns[campaignName] = {
      groups: [],
      publications: [],
      enabled: false,
      lastSent: 0,
      interval: importedData.interval || 600000,
      ...DEFAULT_CAMPAIGN_SCHEDULE,
    }
  }

  const campaign = db.data.campaigns[campaignName]
  normalizeScheduleFields(campaign)

  if (mergeHighlighted && Array.isArray(importedData.highlightedGroups)) {
    const prev = gruposDB.data.highlightedGroups || []
    const set = new Set([...prev, ...importedData.highlightedGroups])
    gruposDB.data.highlightedGroups = [...set]
  }

  const currentGroups = campaign.groups || []
  const combined = Array.from(new Set([...currentGroups, ...importedData.groups]))
  const addedGroups = importedData.groups.filter((id) => !currentGroups.includes(id))
  campaign.groups = combined

  if (importedData.interval) {
    campaign.interval = Number(importedData.interval) || campaign.interval
  }

  if (importedData.spamMode === 'weekly' || importedData.spamMode === 'auto') {
    campaign.spamMode = importedData.spamMode
  }
  if (typeof importedData.scheduleEnabled === 'boolean') {
    campaign.scheduleEnabled = importedData.scheduleEnabled
  }
  if (importedData.scheduleStart) campaign.scheduleStart = String(importedData.scheduleStart)
  if (importedData.scheduleStop) campaign.scheduleStop = String(importedData.scheduleStop)
  if (importedData.weeklySlots && typeof importedData.weeklySlots === 'object') {
    campaign.weeklySlots = importedData.weeklySlots
  }
  normalizeScheduleFields(campaign)

  const resolvedImagesPath = imagesPath || getImagesPath(isSubBot, subBotNumber)
  let pubsResult = { imported: 0, imagesWritten: 0, textOnly: 0, skipped: 0 }

  if (Array.isArray(importedData.publications) && importedData.publications.length > 0) {
    const existing = collectCampaignTemplatePubs(db, campaign, campaignName)
    const replaceExisting = existing.length === 0
    pubsResult = await importBackupPublications(db, campaignName, importedData.publications, {
      imagesPath: resolvedImagesPath,
      isSubBot,
      subBotNumber,
      replaceExisting,
    })
  }

  let autoReplyResult = { ok: false, imagesWritten: 0, rules: 0 }
  if (importedData.autoReply) {
    autoReplyResult = await unpackAutoReply(importedData.autoReply, resolvedImagesPath)
    if (autoReplyResult.ok && autoReplyResult.config) {
      db.data.autoReply = autoReplyResult.config
    }
  }

  let accountManagerResult = { ok: false, mothers: 0, clients: 0, rentals: 0 }
  if (importedData.accountManager) {
    const am = unpackAccountManager(importedData.accountManager)
    if (am) {
      db.data.accountManager = am
      accountManagerResult = {
        ok: true,
        mothers: (am.mothers || []).length,
        clients: (am.clients || []).length,
        rentals: (am.rentals || []).length,
      }
    }
  }

  let botCodesResult = { ok: false, aliases: 0, mailboxes: 0 }
  if (importedData.botCodes) {
    const bc = unpackBotCodes(importedData.botCodes)
    if (bc) {
      db.data.botCodes = bc
      botCodesResult = {
        ok: true,
        aliases: (bc.aliases || []).length,
        mailboxes: (bc.mailboxes || []).length,
      }
    }
  }

  return {
    addedGroups,
    totalGroups: campaign.groups.length,
    pubsResult,
    autoReplyResult,
    accountManagerResult,
    botCodesResult,
    version: importedData.version || 1,
  }
}

export { base64ToImageFile, imageFileToBase64 }
