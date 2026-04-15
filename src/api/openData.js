import { ApiError, fetchPublications } from './cellar'
import { searchPublications } from './opSearch'

const BASE = '/api/opendata/datasets'

export async function fetchDatasets({ query = 'energy', limit = 20 } = {}, { signal } = {}) {
  const params = new URLSearchParams({
    query,
    categories: 'ENER',
    format: 'json',
    limit: String(limit),
  })
  const res = await fetch(`${BASE}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) {
    throw new ApiError({ source: 'opendata', status: res.status, message: `Open Data ${res.status}` })
  }
  const json = await res.json().catch(() => ({}))
  const items = json?.result?.results || json?.results || []
  return items.map((it, i) => ({
    id: it.id || `od-${i}`,
    title: it.title?.en || it.title || 'Untitled',
    date: it.issued || it.modified || null,
    type: 'Dataset',
    url: it.landing_page?.[0] || it.resources?.[0]?.access_url || null,
    language: 'EN',
    abstract: it.description?.en || it.description || '',
    source: 'opendata',
  }))
}

export async function fetchWithFallback(params, opts) {
  // Tier 1: CELLAR SPARQL
  try {
    const r = await fetchPublications(params, opts)
    if (r.length) return { results: r, source: 'cellar' }
  } catch (e) {
    if (e.name === 'AbortError') throw e
    // fall through to next tier
  }

  // Tier 2: OP Search portlet
  try {
    const r = await searchPublications(
      { query: params.keyword || 'energy', page: Math.floor((params.offset || 0) / (params.limit || 20)) + 1, rows: params.limit || 20 },
      opts
    )
    if (r.length) return { results: r, source: 'opsearch' }
  } catch (e) {
    if (e.name === 'AbortError') throw e
    // fall through to next tier
  }

  // Tier 3: Open Data Portal (graceful — always returns even if empty)
  try {
    const r = await fetchDatasets({ query: params.keyword || 'energy', limit: params.limit || 20 }, opts)
    return { results: r, source: 'opendata' }
  } catch (e) {
    if (e.name === 'AbortError') throw e
    // All three sources failed — return empty rather than crashing the UI
    return { results: [], source: 'none' }
  }
}
