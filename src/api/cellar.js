import { buildEnergyPublicationsQuery, buildRelatedQuery } from '../utils/sparqlBuilder'
import { typeLabelFromUri } from '../utils/formatters'

export class ApiError extends Error {
  constructor({ source, status, message }) {
    super(message)
    this.source = source
    this.status = status
  }
}

const ENDPOINT = '/api/sparql'

async function runSparql(query, { signal } = {}) {
  const body = new URLSearchParams({ query }).toString()
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/sparql-results+json',
    },
    body,
    signal,
  })
  if (!res.ok) {
    throw new ApiError({ source: 'cellar', status: res.status, message: `CELLAR ${res.status}` })
  }
  return res.json()
}

function normalizeBinding(b) {
  const workUri = b.work?.value || ''
  return {
    id: workUri,
    title: b.title?.value || 'Untitled',
    date: b.date?.value || null,
    type: typeLabelFromUri(b.type?.value),
    url: b.url?.value || null,
    language: 'EN',
    abstract: '',
    source: 'cellar',
  }
}

export async function fetchPublications(params = {}, opts = {}) {
  // Forward topics array so the SPARQL builder can generate OR title filters
  const query = buildEnergyPublicationsQuery({
    ...params,
    topics: params.topics || [],
  })
  const json = await runSparql(query, opts)
  const bindings = json?.results?.bindings || []
  return bindings.map(normalizeBinding)
}

export async function fetchPublicationDetail(workUri, opts = {}) {
  if (!workUri) return null
  const query = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?title ?abstract ?subject ?subjectLabel ?agent ?agentLabel ?type ?date ?manifestationType ?manifestationUrl
WHERE {
  BIND(<${workUri}> AS ?work)
  OPTIONAL {
    ?expr cdm:expression_belongs_to_work ?work .
    ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
    OPTIONAL { ?expr cdm:expression_title ?title . }
    OPTIONAL { ?expr cdm:expression_abstract ?abstract . }
    OPTIONAL {
      ?manif cdm:manifestation_manifests_expression ?expr .
      ?manif cdm:manifestation_type ?manifestationType .
      OPTIONAL { ?manif cdm:manifestation_official_journal_part_url ?manifestationUrl . }
    }
  }
  OPTIONAL {
    ?work cdm:work_is_about ?subject .
    OPTIONAL { ?subject skos:prefLabel ?subjectLabel . FILTER(LANG(?subjectLabel) = 'en') }
  }
  OPTIONAL {
    ?work cdm:work_created_by_agent ?agent .
    OPTIONAL { ?agent skos:prefLabel ?agentLabel . FILTER(LANG(?agentLabel) = 'en') }
  }
  OPTIONAL { ?work cdm:resource_legal_type ?type . }
  OPTIONAL { ?work cdm:work_date_document ?date . }
}
LIMIT 40`
  const json = await runSparql(query, opts)
  const bindings = json?.results?.bindings || []
  if (!bindings.length) return null

  const first = bindings[0]
  const subjects = []
  const agents = new Set()
  const manifestations = []

  for (const b of bindings) {
    if (b.subjectLabel?.value && !subjects.includes(b.subjectLabel.value))
      subjects.push(b.subjectLabel.value)
    if (b.agentLabel?.value) agents.add(b.agentLabel.value)
    if (b.manifestationUrl?.value) {
      const typeRaw = b.manifestationType?.value || ''
      const format = typeRaw.includes('pdf') ? 'PDF' : typeRaw.includes('html') ? 'HTML' : 'Document'
      const existing = manifestations.find((m) => m.url === b.manifestationUrl.value)
      if (!existing) manifestations.push({ url: b.manifestationUrl.value, format })
    }
  }

  return {
    title: first.title?.value || null,
    abstract: first.abstract?.value || null,
    date: first.date?.value || null,
    type: typeLabelFromUri(first.type?.value),
    subjects,
    agents: [...agents],
    manifestations,
  }
}

export async function fetchRelated(workUri, opts = {}) {
  if (!workUri) return []
  const json = await runSparql(buildRelatedQuery(workUri), opts)
  const bindings = json?.results?.bindings || []
  return bindings.map((b) => ({
    id: b.related?.value || '',
    title: b.title?.value || 'Untitled',
    date: b.date?.value || null,
    type: 'Publication',
    url: null,
    language: 'EN',
    abstract: '',
    source: 'cellar',
  }))
}
