import path from 'path'
import fs from 'fs/promises'
import { resolveSavedImagePath } from './image-storage.js'

function getGroupCampaignPubs(db, groupId, campaignName) {
  const pubs = db.data.publicaciones?.[groupId]?.publications || []
  return pubs.filter(p => p.campaign === campaignName && p.enabled !== false)
}

/**
 * Busca publicaciones plantilla de una campaña: primero en un grupo que ya las tenga,
 * si no en campaign.publications.
 */
export function findCampaignPublicationTemplate(db, campaign, campaignName) {
  for (const groupId of campaign.groups || []) {
    const pubs = getGroupCampaignPubs(db, groupId, campaignName)
    if (pubs.length > 0) return pubs
  }
  return (campaign.publications || []).filter(p => {
    if (p.enabled === false) return false
    return !p.campaign || p.campaign === campaignName
  })
}

async function copyPublicationImage(sourceImage, groupId, slotIndex, imagesPath, imageOptions) {
  if (!sourceImage) return ''
  const sourcePath = resolveSavedImagePath(sourceImage, imageOptions)
  if (!sourcePath) return path.basename(sourceImage)

  const extension = path.extname(sourcePath) || path.extname(path.basename(sourceImage))
  const filename = `${Date.now()}_sync_${slotIndex}_${groupId.split('@')[0]}${extension}`
  const destPath = path.join(imagesPath, filename)
  await fs.mkdir(path.dirname(destPath), { recursive: true })
  await fs.copyFile(sourcePath, destPath)
  return filename
}

/**
 * Copia las publicaciones existentes de la campaña a grupos recién añadidos.
 * Cada grupo nuevo recibe su propia copia de imágenes (igual que al subir pubs).
 */
export async function syncPublicationsToNewGroups(db, campaignName, newGroupIds, {
  imagesPath,
  isSubBot = false,
  subBotNumber = null,
} = {}) {
  if (!db?.data || !Array.isArray(newGroupIds) || newGroupIds.length === 0) {
    return { syncedGroups: 0, copiedPublications: 0, skippedGroups: 0 }
  }

  const campaign = db.data.campaigns?.[campaignName]
  if (!campaign) return { syncedGroups: 0, copiedPublications: 0, skippedGroups: 0 }

  const templatePubs = findCampaignPublicationTemplate(db, campaign, campaignName)
  if (templatePubs.length === 0) {
    return { syncedGroups: 0, copiedPublications: 0, skippedGroups: newGroupIds.length }
  }

  db.data.publicaciones ||= {}
  const imageOptions = { isSubBot, subBotNumber }
  let syncedGroups = 0
  let copiedPublications = 0
  let skippedGroups = 0

  for (const groupId of newGroupIds) {
    const existing = getGroupCampaignPubs(db, groupId, campaignName)
    if (existing.length >= templatePubs.length) {
      skippedGroups++
      continue
    }

    if (!db.data.publicaciones[groupId]) {
      db.data.publicaciones[groupId] = {
        publications: [],
        interval: campaign.interval || 600000,
        enabled: campaign.enabled !== false,
      }
    } else {
      db.data.publicaciones[groupId].interval = campaign.interval || db.data.publicaciones[groupId].interval || 600000
    }

    const startIndex = existing.length
    for (let i = startIndex; i < templatePubs.length; i++) {
      const template = templatePubs[i]
      const newImage = template.image
        ? await copyPublicationImage(template.image, groupId, i, imagesPath, imageOptions)
        : ''

      db.data.publicaciones[groupId].publications.push({
        text: template.text || '',
        image: newImage,
        video: template.video || '',
        imageType: template.imageType || (newImage ? 'image' : ''),
        enabled: template.enabled !== false,
        campaign: campaignName,
        timestamp: (template.timestamp || Date.now()) + i,
      })
      copiedPublications++
    }

    if (startIndex < templatePubs.length) syncedGroups++
  }

  return { syncedGroups, copiedPublications, skippedGroups }
}
