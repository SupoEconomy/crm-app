/**
 * Lógica de tiempos recomendados de spam según cantidad de grupos y publicaciones.
 * Se usa tanto en el servidor (render del panel) como en el navegador
 * (advertencia al actualizar el tiempo).
 */

/** Tramos por cantidad de grupos. min/max en minutos. */
export const SPAM_GROUP_BRACKETS = [
  { upTo: 10, min: 8, max: 10, groupsLabel: '5 - 10' },
  { upTo: 45, min: 14, max: 18, groupsLabel: '15 - 45' },
  { upTo: 70, min: 30, max: 38, groupsLabel: '50 - 70' },
  { upTo: 100, min: 43, max: 63, groupsLabel: '85 - 100' },
  { upTo: 150, min: 63, max: 73, groupsLabel: '130 - 150' },
  { upTo: Infinity, min: 83, max: 123, groupsLabel: '190+' },
]

/**
 * Minutos extra según cantidad de publicaciones.
 * 1-2 pub: +0 · 3 pub: +5 · 4 pub: +8 · cada publicación extra: +3
 */
export function spamPubExtra(pubCount) {
  const n = Math.max(0, Math.floor(pubCount || 0))
  if (n <= 2) return 0
  if (n === 3) return 5
  if (n === 4) return 8
  return 8 + (n - 4) * 3
}

/**
 * Devuelve el rango recomendado de minutos para los grupos/publicaciones dados.
 */
export function getSpamTimeAdvice(groupCount, pubCount) {
  const groups = Math.max(0, Math.floor(groupCount || 0))
  const bracket = SPAM_GROUP_BRACKETS.find(b => groups <= b.upTo) || SPAM_GROUP_BRACKETS[SPAM_GROUP_BRACKETS.length - 1]
  const extra = spamPubExtra(pubCount)
  const minMinutes = bracket.min + extra
  const maxMinutes = bracket.max + extra
  return {
    groups,
    pubCount: Math.max(0, Math.floor(pubCount || 0)),
    extra,
    minMinutes,
    maxMinutes,
    bracketLabel: bracket.groupsLabel,
  }
}

/**
 * Evalúa el tiempo elegido por el usuario.
 * Es "peligroso" si está por debajo del mínimo recomendado.
 */
export function evaluateSpamTime(chosenMinutes, groupCount, pubCount) {
  const advice = getSpamTimeAdvice(groupCount, pubCount)
  const minutes = Number(chosenMinutes)
  const dangerous = Number.isFinite(minutes) && minutes < advice.minMinutes
  return { ...advice, chosenMinutes: minutes, dangerous }
}

export function attachSpamTimeAdvisorGlobals(scope) {
  scope.SpamTimeAdvisor = {
    SPAM_GROUP_BRACKETS,
    spamPubExtra,
    getSpamTimeAdvice,
    evaluateSpamTime,
  }
}

if (typeof globalThis !== 'undefined') {
  attachSpamTimeAdvisorGlobals(globalThis)
}
