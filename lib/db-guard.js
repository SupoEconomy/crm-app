

export function scoreDatabase(data) {
  if (!data || typeof data !== 'object') return 0
  let pubs = 0
  for (const cfg of Object.values(data.publicaciones || {})) {
    if (cfg && Array.isArray(cfg.publications)) pubs += cfg.publications.length
  }
  let campaignGroups = 0
  for (const campaign of Object.values(data.campaigns || {})) {
    if (campaign && Array.isArray(campaign.groups)) campaignGroups += campaign.groups.length
  }
  return pubs * 1000 + campaignGroups
}

export function scoreGrupos(data) {
  if (!data || typeof data !== 'object') return 0
  const selected = Array.isArray(data.selectedGroups) ? data.selectedGroups.length : 0
  const groups = Array.isArray(data.groups) ? data.groups.length : 0
  return selected * 1000 + groups
}

export function scoreData(data, kind) {
  if (kind === 'grupos') return scoreGrupos(data)
  if (kind === 'database') return scoreDatabase(data)
  return data && typeof data === 'object' ? Object.keys(data).length : 0
}

export function wouldMassWipe(newData, oldData, kind) {
  const oldScore = scoreData(oldData, kind)
  const newScore = scoreData(newData, kind)
  if (oldScore > 0 && newScore === 0) {
    return 'pasaría de datos existentes a vacío'
  }
  return null
}

export function mergeDbDefaults(defaults, diskData) {
  return {
    ...defaults,
    ...(diskData && typeof diskData === 'object' ? diskData : {}),
  }
}
