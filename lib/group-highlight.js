export function normalizeHighlightedGroups(data = []) {
  if (!Array.isArray(data)) return []
  return data.filter(id => typeof id === 'string' && id.endsWith('@g.us'))
}

export function isGroupHighlighted(groupId, highlighted = []) {
  return highlighted.includes(groupId)
}

export function sortGroupsByHighlight(groups, highlighted = []) {
  const set = new Set(highlighted)
  return [...groups].sort((a, b) => {
    const aId = typeof a === 'string' ? a : a.id
    const bId = typeof b === 'string' ? b : b.id
    const aHighlighted = set.has(aId) ? 0 : 1
    const bHighlighted = set.has(bId) ? 0 : 1
    if (aHighlighted !== bHighlighted) return aHighlighted - bHighlighted
    const aName = typeof a === 'string' ? a : (a.name || aId || '')
    const bName = typeof b === 'string' ? b : (b.name || bId || '')
    return String(aName).localeCompare(String(bName))
  })
}

export function sortGroupIdsByHighlight(ids, highlighted = []) {
  const unique = [...new Set(ids)]
  const highlightedFirst = highlighted.filter(id => unique.includes(id))
  const rest = unique.filter(id => !highlightedFirst.includes(id))
  return [...highlightedFirst, ...rest]
}

export function toggleHighlightInList(highlighted, groupId) {
  const list = [...normalizeHighlightedGroups(highlighted)]
  const idx = list.indexOf(groupId)
  if (idx === -1) list.push(groupId)
  else list.splice(idx, 1)
  return list
}

export function mergeHighlightedGroups(existing, imported) {
  return Array.from(new Set([
    ...normalizeHighlightedGroups(existing),
    ...normalizeHighlightedGroups(imported),
  ]))
}
