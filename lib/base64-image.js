import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'

/** Magic bytes → extensión y mime más comunes en el panel. */
const SIGNATURES = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], ext: '.png', mime: 'image/png' },
  { bytes: [0xff, 0xd8, 0xff], ext: '.jpg', mime: 'image/jpeg' },
  { bytes: [0x47, 0x49, 0x46, 0x38], ext: '.gif', mime: 'image/gif' },
  { bytes: [0x52, 0x49, 0x46, 0x46], ext: '.webp', mime: 'image/webp', // RIFF....WEBP
    confirm: (buf) => buf.length >= 12 && buf.slice(8, 12).toString('ascii') === 'WEBP' },
]

/**
 * Quita prefijo data-URL si existe y devuelve Buffer.
 * Acepta "data:image/png;base64,AAAA" o base64 puro.
 */
export function parseBase64Input(raw) {
  if (raw == null) return null
  let str = String(raw).trim()
  if (!str) return null

  let mimeHint = null
  const dataUrl = /^data:([^;]+);base64,(.+)$/is.exec(str)
  if (dataUrl) {
    mimeHint = dataUrl[1].trim().toLowerCase()
    str = dataUrl[2]
  }

  // limpia espacios/saltos de línea
  str = str.replace(/\s+/g, '')
  if (!str) return null

  let buffer
  try {
    buffer = Buffer.from(str, 'base64')
  } catch {
    return null
  }
  if (!buffer.length) return null

  return { buffer, mimeHint }
}

export function detectImageFormat(buffer) {
  if (!buffer || !buffer.length) {
    return { ext: '.png', mime: 'image/png' }
  }
  for (const sig of SIGNATURES) {
    if (buffer.length < sig.bytes.length) continue
    let ok = true
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[i] !== sig.bytes[i]) {
        ok = false
        break
      }
    }
    if (!ok) continue
    if (typeof sig.confirm === 'function' && !sig.confirm(buffer)) continue
    return { ext: sig.ext, mime: sig.mime }
  }
  return { ext: '.png', mime: 'image/png' }
}

export function mimeToExt(mime) {
  const m = String(mime || '').toLowerCase()
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg'
  if (m.includes('gif')) return '.gif'
  if (m.includes('webp')) return '.webp'
  if (m.includes('png')) return '.png'
  return null
}

/**
 * Lee un archivo de imagen del disco y lo serializa a base64 (sin data-URL).
 * @returns {{ imageBase64: string, imageMime: string, imageExt: string } | null}
 */
export async function imageFileToBase64(filePath) {
  if (!filePath || !existsSync(filePath)) return null
  try {
    const buffer = await fs.readFile(filePath)
    if (!buffer.length) return null
    const detected = detectImageFormat(buffer)
    const ext = path.extname(filePath).toLowerCase() || detected.ext
    const mime = detectImageFormat(buffer).mime
    return {
      imageBase64: buffer.toString('base64'),
      imageMime: mime,
      imageExt: ext.startsWith('.') ? ext : `.${ext}`,
    }
  } catch {
    return null
  }
}

/**
 * Guarda un base64 como archivo de imagen real en imagesPath del usuario.
 * Por defecto escribe .png si el contenido es PNG (o no se puede detectar);
 * si el binario es JPEG/GIF/WebP conserva la extensión correcta para no corromper el archivo.
 *
 * @param {string} base64Input - base64 o data-URL
 * @param {string} imagesPath - storage/images o usuarios/{n}/images
 * @param {object} [opts]
 * @param {string} [opts.filenamePrefix]
 * @param {string} [opts.hintMime]
 * @param {boolean} [opts.forcePngExt=false] - fuerza extensión .png (solo seguro si el buffer es PNG)
 * @returns {Promise<{ filename: string, absolutePath: string, mime: string, ext: string } | null>}
 */
export async function base64ToImageFile(base64Input, imagesPath, opts = {}) {
  const parsed = parseBase64Input(base64Input)
  if (!parsed) return null

  const { buffer, mimeHint } = parsed
  const detected = detectImageFormat(buffer)
  const fromHint = mimeToExt(opts.hintMime || mimeHint)

  // Preferir formato real del archivo. Si forcePng y es PNG → .png
  let ext = detected.ext
  if (opts.forcePngExt && detected.ext === '.png') {
    ext = '.png'
  } else if (fromHint && detected.ext === '.png' && fromHint !== '.png') {
    // magic no detectó; confiar mime del export
    ext = fromHint
  }

  // Usuario pidió .png: si el contenido es PNG, usamos .png siempre
  if (detected.mime === 'image/png') ext = '.png'

  const prefix = String(opts.filenamePrefix || `img_${Date.now()}`).replace(/[^\w.-]+/g, '_')
  const filename = `${prefix}${ext}`
  const absolutePath = path.join(imagesPath, filename)

  await fs.mkdir(imagesPath, { recursive: true })
  await fs.writeFile(absolutePath, buffer)

  return {
    filename,
    absolutePath,
    mime: detected.mime,
    ext,
  }
}

/**
 * Copia un buffer de imagen ya decodificado a un archivo con nombre único.
 */
export async function writeImageBuffer(buffer, imagesPath, filenamePrefix = 'img') {
  if (!buffer?.length) return null
  const detected = detectImageFormat(buffer)
  const ext = detected.mime === 'image/png' ? '.png' : detected.ext
  const safePrefix = String(filenamePrefix).replace(/[^\w.-]+/g, '_')
  const filename = `${safePrefix}${ext}`
  const absolutePath = path.join(imagesPath, filename)
  await fs.mkdir(imagesPath, { recursive: true })
  await fs.writeFile(absolutePath, buffer)
  return { filename, absolutePath, mime: detected.mime, ext }
}
