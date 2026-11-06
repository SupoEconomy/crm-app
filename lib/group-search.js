const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g


export function toGroupSearchText(str) {
  return String(str ?? '')
    .replace(INVISIBLE_RE, '')
    .normalize('NFKC')
    .toLowerCase()
}

export function groupMatchesSearch(name, groupId, query) {
  const q = toGroupSearchText(query).trim()
  if (!q) return true
  const haystack = toGroupSearchText(`${name} ${groupId}`)
  return haystack.includes(q)
}


export function attachGroupSearchGlobals(scope) {
  scope.GroupSearch = { toGroupSearchText, groupMatchesSearch }
}

if (typeof globalThis !== 'undefined') {
  attachGroupSearchGlobals(globalThis)
}
