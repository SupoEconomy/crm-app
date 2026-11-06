import path from 'path'
import { existsSync } from 'fs'
import fs from 'fs/promises'

export function getImagesPath(isSubBot, subBotNumber) {
  if (isSubBot && subBotNumber) {
    return path.join(process.cwd(), 'usuarios', subBotNumber, 'images')
  }
  return path.join(process.cwd(), 'storage', 'images')
}

export function resolveSavedImagePath(image, { isSubBot = false, subBotNumber = null } = {}) {
  if (!image) return null
  const imagesPath = getImagesPath(isSubBot, subBotNumber)
  const basename = path.basename(image)

  if (path.isAbsolute(image) && existsSync(image)) return image

  const candidates = []
  if (isSubBot && subBotNumber) {
    candidates.push(path.join(process.cwd(), 'usuarios', subBotNumber, 'images', basename))
  }
  candidates.push(path.join(imagesPath, basename))
  candidates.push(path.join(process.cwd(), 'storage', 'images', basename))
  candidates.push(path.join(process.cwd(), basename))

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

export async function safeDeletePublicationImage(image, options = {}) {
  const imagePath = resolveSavedImagePath(image, options)
  if (!imagePath) return
  try {
    await fs.unlink(imagePath)
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.log('Error deleting image:', e.message)
    }
  }
}
