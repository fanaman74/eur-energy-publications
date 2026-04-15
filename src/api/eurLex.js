import { buildLegislativeQuery, buildLegislationDetailQuery, buildRelatedLegislationQuery, LEG_TYPES, LEG_BODIES } from '../utils/sparqlBuilder'

const SPARQL_ENDPOINT = import.meta.env.VITE_SPARQL_ENDPOINT || '/api/sparql'

export { LEG_TYPES, LEG_BODIES }

export async function fetchLegislation(params = {}, { signal } = {}) {
  const query = buildLegislativeQuery(params)
  const body = new URLSearchParams({ query })

  const res = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/sparql-results+json',
    },
    body: body.toString(),
    signal,
  })

  if (!res.ok) throw new Error(`SPARQL ${res.status}`)
  const json = await res.json()
  const bindings = json?.results?.bindings || []

  return bindings.map((b) => {
    const typeUri  = b.type?.value || ''
    const rawType  = typeUri.split('/').pop() || ''
    const typeMeta = Object.values(LEG_TYPES).find(t => t.uri === typeUri)
    return {
      id:       b.work?.value || '',
      title:    b.title?.value || 'Untitled',
      date:     b.date?.value || null,
      rawType,
      typeLabel: typeMeta?.label || rawType,
      source:   'cellar',
    }
  })
}

async function sparql(query, signal) {
  const res = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/sparql-results+json',
    },
    body: new URLSearchParams({ query }).toString(),
    signal,
  })
  if (!res.ok) throw new Error(`SPARQL ${res.status}`)
  const json = await res.json()
  return json?.results?.bindings || []
}

// Known CELLAR corporate body URI → human label
const BODY_LABELS = {
  COM:    'European Commission',
  EP:     'European Parliament',
  CONSIL: 'Council of the EU',
  ENER:   'DG Energy (ENER)',
  ACER:   'ACER',
  EPSO:   'EPSO',
  EEAS:   'EEAS',
}

function agentLabel(uri) {
  const key = uri.split('/').pop()
  return BODY_LABELS[key] || key
}

/**
 * Fetch rich metadata for a single legislative act by its CELLAR work UUID.
 * Returns { title, date, rawType, typeLabel, celex, entryIntoForce,
 *           endOfValidity, agents[], subjects[], languages[], workUri }
 * plus a `related` array of { id, title, date, rawType, typeLabel } objects.
 */
export async function fetchLegislationDetail(workId, { signal } = {}) {
  const workUri = `http://publications.europa.eu/resource/cellar/${workId}`

  const [detailRows, relatedRows] = await Promise.all([
    sparql(buildLegislationDetailQuery(workUri), signal),
    sparql(buildRelatedLegislationQuery(workUri, 8), signal),
  ])

  if (detailRows.length === 0) throw new Error('Not found')

  const first = detailRows[0]
  const typeUri  = first.type?.value || ''
  const rawType  = typeUri.split('/').pop() || ''
  const typeMeta = Object.values(LEG_TYPES).find(t => t.uri === typeUri)

  // Aggregate multi-valued fields across all rows
  const agentSet   = new Set()
  const subjectSet = new Set()
  const langSet    = new Set()
  for (const b of detailRows) {
    if (b.agent?.value)        agentSet.add(b.agent.value)
    if (b.subjectLabel?.value) subjectSet.add(b.subjectLabel.value)
    if (b.lang?.value && b.lang.value.length <= 3) langSet.add(b.lang.value.toUpperCase())
  }

  const related = relatedRows.map((b) => {
    const rTypeUri  = b.type?.value || ''
    const rRawType  = rTypeUri.split('/').pop() || ''
    const rTypeMeta = Object.values(LEG_TYPES).find(t => t.uri === rTypeUri)
    return {
      id:        b.related?.value || '',
      title:     b.title?.value || 'Untitled',
      date:      b.date?.value || null,
      rawType:   rRawType,
      typeLabel: rTypeMeta?.label || rRawType,
    }
  })

  return {
    workUri,
    id:             workUri,
    title:          first.title?.value || 'Untitled',
    date:           first.date?.value || null,
    rawType,
    typeLabel:      typeMeta?.label || rawType,
    celex:          first.celex?.value || null,
    entryIntoForce: first.entryIntoForce?.value || null,
    endOfValidity:  first.endOfValidity?.value || null,
    abstract:       first.abstract?.value || null,
    agents:         [...agentSet].map(uri => ({ uri, label: agentLabel(uri) })),
    subjects:       [...subjectSet].sort(),
    languages:      [...langSet].sort(),
    related,
  }
}
