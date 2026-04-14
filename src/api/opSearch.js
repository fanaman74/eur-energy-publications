import { ApiError } from './cellar'

const BASE = '/api/opsearch'

/**
 * Look up a single publication in the OP Search API by title/ID and return
 * its description/abstract field, or null if not found.
 */
export async function fetchOpDescription(pub, { signal } = {}) {
  if (!pub?.title) return null

  // Use the short UUID from the CELLAR URI as the most precise query term
  const uuidMatch = pub.id?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  const query = uuidMatch ? uuidMatch[0] : pub.title.slice(0, 80)

  const params = new URLSearchParams({
    p_p_id: 'eu_search_results_portlet',
    p_p_lifecycle: '2',
    p_p_resource_id: 'eu_search_results',
    _eu_search_results_portlet_query: query,
    _eu_search_results_portlet_collection: 'EU_PUBLICATIONS',
    _eu_search_results_portlet_language: 'en',
    _eu_search_results_portlet_rows: '5',
    _eu_search_results_portlet_start: '0',
  })

  try {
    const res = await fetch(`${BASE}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal,
    })
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    if (!json) return null

    const items = json?.results || json?.documents || json?.hits?.hits || []
    for (const it of items) {
      // Try every common field name the OP Search API might use
      const desc =
        it.description ||
        it.summary ||
        it.abstract ||
        it.content ||
        it.excerpt ||
        it._source?.description ||
        it._source?.summary ||
        it.metadata?.description ||
        it.metadata?.abstract ||
        null
      if (desc && desc.length > 30) return desc
    }
    return null
  } catch {
    return null
  }
}

export async function searchPublications(
  { query = 'energy', page = 1, rows = 20 } = {},
  { signal } = {}
) {
  const start = (page - 1) * rows
  const params = new URLSearchParams({
    p_p_id: 'eu_search_results_portlet',
    p_p_lifecycle: '2',
    p_p_resource_id: 'eu_search_results',
    _eu_search_results_portlet_query: query || 'energy',
    _eu_search_results_portlet_collection: 'EU_PUBLICATIONS',
    _eu_search_results_portlet_language: 'en',
    _eu_search_results_portlet_rows: String(rows),
    _eu_search_results_portlet_start: String(start),
  })
  const res = await fetch(`${BASE}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) {
    throw new ApiError({ source: 'opsearch', status: res.status, message: `OP Search ${res.status}` })
  }
  const json = await res.json().catch(() => ({}))
  const items = json?.results || json?.documents || []
  return items.map((it, i) => ({
    id: it.id || it.reference || `${page}-${i}`,
    title: it.title || it.metadata?.title || 'Untitled',
    date: it.date || it.metadata?.date || null,
    type: it.type || it.metadata?.resourceType || 'Publication',
    url: it.url || it.link || null,
    language: 'EN',
    abstract: it.summary || it.description || '',
    source: 'opsearch',
  }))
}
