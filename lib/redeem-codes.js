import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { parseRentalDuration, getRentalLabel } from './rental.js'

/**
 * Sistema de códigos de canje compartido entre el panel maestro y los sub-bots.
 * Todos los procesos comparten el mismo cwd, así que el archivo vive en una
 * ruta fija del maestro y es legible/escribible por cualquier instancia.
 */

const CODES_DIR = path.join(process.cwd(), 'storage', 'databases')
const CODES_FILE = path.join(CODES_DIR, 'redeem-codes.json')

export function readRedeemCodes() {
  if (!existsSync(CODES_FILE)) return { codes: [] }
  try {
    const data = JSON.parse(readFileSync(CODES_FILE, 'utf8'))
    if (!data || !Array.isArray(data.codes)) return { codes: [] }
    return data
  } catch {
    return { codes: [] }
  }
}

export function writeRedeemCodes(data) {
  try {
    if (!existsSync(CODES_DIR)) mkdirSync(CODES_DIR, { recursive: true })
    writeFileSync(CODES_FILE, JSON.stringify(data, null, 2))
    return true
  } catch (e) {
    console.error('[REDEEM] Error guardando códigos:', e.message)
    return false
  }
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomBlock(len = 4) {
  let out = ''
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}

export function generateCodeString() {
  return `ULTRA-${randomBlock(4)}-${randomBlock(4)}`
}

/**
 * Crea un código nuevo.
 * @param {object} opts { label, durationValue, maxUses }
 * durationValue: cadena tipo '2h', '30min', '1d' o 'infinite'
 */
export function createRedeemCode({ label = '', durationValue, maxUses = 1 } = {}) {
  const data = readRedeemCodes()

  const isInfinite = durationValue === 'infinite'
  const addMs = isInfinite ? null : parseRentalDuration(durationValue)
  if (!isInfinite && !addMs) {
    return { ok: false, error: 'Duración inválida' }
  }

  const uses = Math.max(1, parseInt(maxUses, 10) || 1)

  // Generar código único
  let code = generateCodeString()
  let guard = 0
  while (data.codes.some(c => c.code === code) && guard < 50) {
    code = generateCodeString()
    guard++
  }

  const entry = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    code,
    label: String(label || '').slice(0, 60),
    durationValue,
    addMs,
    rentalInfinite: isInfinite,
    maxUses: uses,
    redemptions: [],
    createdAt: Date.now(),
    active: true,
  }

  data.codes.unshift(entry)
  writeRedeemCodes(data)
  return { ok: true, code: entry }
}

export function deleteRedeemCode(id) {
  const data = readRedeemCodes()
  const before = data.codes.length
  data.codes = data.codes.filter(c => c.id !== id)
  if (data.codes.length === before) return { ok: false, error: 'Código no encontrado' }
  writeRedeemCodes(data)
  return { ok: true }
}

/**
 * Intenta canjear un código para un sub-bot.
 * Valida tope de usos y que el sub no lo haya canjeado antes.
 * Registra el canje de forma atómica (lee fresco antes de escribir).
 */
export function redeemCode(rawCode, subId, subName = '') {
  const code = String(rawCode || '').trim().toUpperCase()
  if (!code) return { ok: false, error: 'Escribe un código.' }

  const data = readRedeemCodes()
  const entry = data.codes.find(c => c.code === code)

  if (!entry) return { ok: false, error: 'Este código no existe o fue eliminado.' }
  if (entry.active === false) return { ok: false, error: 'Este código ya no está disponible.' }

  if (entry.redemptions.some(r => r.subId === subId)) {
    return { ok: false, error: 'Ya canjeaste este código antes. Solo se puede una vez.' }
  }

  if (entry.redemptions.length >= entry.maxUses) {
    return { ok: false, error: 'Este código ya alcanzó su límite de canjes.' }
  }

  entry.redemptions.push({
    subId,
    subName: String(subName || '').slice(0, 40),
    at: Date.now(),
  })

  writeRedeemCodes(data)

  return {
    ok: true,
    addMs: entry.addMs,
    durationValue: entry.durationValue,
    rentalInfinite: !!entry.rentalInfinite,
    label: entry.label,
    code: entry.code,
    rewardLabel: getRentalLabel(entry.durationValue, { rentalInfinite: entry.rentalInfinite }),
  }
}

export function getRedemptionsForSub(subId) {
  const data = readRedeemCodes()
  const list = []
  for (const c of data.codes) {
    for (const r of c.redemptions) {
      if (r.subId === subId) {
        list.push({
          code: c.code,
          label: c.label,
          rewardLabel: getRentalLabel(c.durationValue, { rentalInfinite: c.rentalInfinite }),
          at: r.at,
        })
      }
    }
  }
  return list.sort((a, b) => b.at - a.at)
}
