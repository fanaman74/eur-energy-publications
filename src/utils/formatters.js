export function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function shortId(uri) {
  if (!uri) return ''
  const m = uri.match(/[^/#]+$/)
  return m ? m[0] : uri
}

// Build the stable OP detail page URL from a CELLAR work URI.
// Pattern: https://op.europa.eu/en/publication-detail/-/publication/{uuid}
export function opDetailUrl(pub) {
  if (pub?.url) return pub.url
  const id = shortId(pub?.id)
  if (!id) return null
  return `https://op.europa.eu/en/publication-detail/-/publication/${id}`
}

// Build a EUR-Lex content URL from a CELLAR work URI.
// Pattern: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELLAR:{uuid}
export function eurLexUrl(pub) {
  const id = shortId(pub?.id)
  if (!id) return null
  return `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELLAR:${id}`
}

export function truncate(text, n = 220) {
  if (!text) return ''
  return text.length > n ? text.slice(0, n).trimEnd() + '…' : text
}

export function highlightMatch(text, query) {
  if (!query || !text) return text
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${safe})`, 'ig'))
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase()
      ? { mark: true, text: p, key: i }
      : { mark: false, text: p, key: i }
  )
}

export function typeLabelFromUri(uri) {
  if (!uri) return 'Publication'
  const tail = uri.split('/').pop() || ''
  const map = {
    REPORT: 'Report',
    STUD: 'Study',
    BROCH: 'Brochure',
    PRESS_REL: 'Press release',
    FACT_SHEET: 'Factsheet',
    WORK_DOC: 'Working document',
  }
  return map[tail] || 'Publication'
}
