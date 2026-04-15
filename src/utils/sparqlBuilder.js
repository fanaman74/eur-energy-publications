const TYPE_URIS = {
  Report: 'http://publications.europa.eu/resource/authority/resource-type/REPORT',
  Study: 'http://publications.europa.eu/resource/authority/resource-type/STUD',
  Brochure: 'http://publications.europa.eu/resource/authority/resource-type/BROCH',
  'Press release': 'http://publications.europa.eu/resource/authority/resource-type/PRESS_REL',
  Factsheet: 'http://publications.europa.eu/resource/authority/resource-type/FACT_SHEET',
  'Working document': 'http://publications.europa.eu/resource/authority/resource-type/WORK_DOC',
}

// Corporate bodies that publish DG ENER-related content
const ENER_AGENTS = [
  'http://publications.europa.eu/resource/authority/corporate-body/ENER',
  'http://publications.europa.eu/resource/authority/corporate-body/ACER',
]

export function buildEnergyPublicationsQuery({
  keyword = '',
  dateFrom = '2015-01-01',
  dateTo = null,
  type = null,
  topics = [],
  limit = 20,
  offset = 0,
} = {}) {
  const kw = keyword?.trim()
  const filters = [`FILTER(?date >= "${dateFrom}"^^xsd:date)`]
  if (dateTo) filters.push(`FILTER(?date <= "${dateTo}"^^xsd:date)`)
  if (kw) {
    const safe = kw.replace(/["\\]/g, '')
    filters.push(`FILTER(CONTAINS(LCASE(STR(?title)), LCASE("${safe}")))`)
  }
  // Topics are OR-combined title keyword filters
  if (topics && topics.length > 0) {
    const parts = topics.map(t => `CONTAINS(LCASE(STR(?title)), "${t.replace(/["\\]/g, '').toLowerCase()}")`)
    filters.push(`FILTER(${parts.join(' || ')})`)
  }

  const typeBind = type && TYPE_URIS[type]
    ? `?work cdm:resource_legal_type <${TYPE_URIS[type]}> .`
    : ''

  // Without a keyword: scope to DG ENER + ACER corporate bodies (fast, focused).
  // Topics-only: keep ENER/ACER scope but add title filter above.
  // With a keyword: drop the agent filter entirely and search all of CELLAR by
  // title — this is how cross-body topics like REMIT, hydrogen, etc. surface.
  const agentFilter = kw
    ? '' // keyword alone is enough to scope results
    : `VALUES ?agent { ${ENER_AGENTS.map(a => `<${a}>`).join(' ')} }
  ?work cdm:work_created_by_agent ?agent .`

  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?work ?title ?date ?type ?url
WHERE {
  ${agentFilter}
  ?work cdm:work_date_document ?date .
  ?expr cdm:expression_belongs_to_work ?work .
  ?expr cdm:expression_title ?title .
  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  OPTIONAL { ?work cdm:resource_legal_type ?type . }
  OPTIONAL {
    ?manif cdm:manifestation_manifests_expression ?expr .
    ?manif cdm:manifestation_type <http://publications.europa.eu/resource/authority/manifestation-type/html_simpl> .
    ?manif cdm:manifestation_official_journal_part_url ?url .
  }
  ${typeBind}
  ${filters.join('\n  ')}
}
ORDER BY DESC(?date)
LIMIT ${limit}
OFFSET ${offset}`
}

// Agents for the Documents view (no COM — too broad, returns exchange rates etc.)
const ENERGY_AGENTS = [
  'http://publications.europa.eu/resource/authority/corporate-body/ENER',
  'http://publications.europa.eu/resource/authority/corporate-body/ACER',
]

/**
 * Documents query — covers formal EU documents (working docs, staff working
 * documents, opinions, technical reports, annexes, decisions) beyond the
 * narrower publications set. When a keyword is provided, searches all of
 * CELLAR by title without an agent filter.
 */
export function buildDocumentsQuery({
  keyword = '',
  dateFrom = '2015-01-01',
  dateTo = null,
  limit = 20,
  offset = 0,
} = {}) {
  const kw = keyword?.trim()
  const filters = [`FILTER(?date >= "${dateFrom}"^^xsd:date)`]
  if (dateTo) filters.push(`FILTER(?date <= "${dateTo}"^^xsd:date)`)
  if (kw) {
    const safe = kw.replace(/["\\]/g, '')
    filters.push(`FILTER(CONTAINS(LCASE(STR(?title)), LCASE("${safe}")))`)
  }

  const agentFilter = kw
    ? ''
    : `VALUES ?agent { ${ENERGY_AGENTS.map(a => `<${a}>`).join(' ')} }
  ?work cdm:work_created_by_agent ?agent .`

  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?work ?title ?date ?type ?url
WHERE {
  ${agentFilter}
  ?work cdm:work_date_document ?date .
  ?expr cdm:expression_belongs_to_work ?work .
  ?expr cdm:expression_title ?title .
  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  OPTIONAL { ?work cdm:work_has_resource-type ?type . }
  OPTIONAL {
    ?manif cdm:manifestation_manifests_expression ?expr .
    ?manif cdm:manifestation_official_journal_part_url ?url .
  }
  ${filters.join('\n  ')}
}
ORDER BY DESC(?date)
LIMIT ${limit}
OFFSET ${offset}`
}

// EUR-Lex legislative resource types
export const LEG_TYPES = {
  REG:       { label: 'Regulation',              uri: 'http://publications.europa.eu/resource/authority/resource-type/REG' },
  REG_IMPL:  { label: 'Implementing Regulation', uri: 'http://publications.europa.eu/resource/authority/resource-type/REG_IMPL' },
  REG_DEL:   { label: 'Delegated Regulation',    uri: 'http://publications.europa.eu/resource/authority/resource-type/REG_DEL' },
  DIR:       { label: 'Directive',               uri: 'http://publications.europa.eu/resource/authority/resource-type/DIR' },
  DIR_IMPL:  { label: 'Implementing Directive',  uri: 'http://publications.europa.eu/resource/authority/resource-type/DIR_IMPL' },
  DEC:       { label: 'Decision',                uri: 'http://publications.europa.eu/resource/authority/resource-type/DEC' },
  DEC_IMPL:  { label: 'Implementing Decision',   uri: 'http://publications.europa.eu/resource/authority/resource-type/DEC_IMPL' },
  DEC_DEL:   { label: 'Delegated Decision',      uri: 'http://publications.europa.eu/resource/authority/resource-type/DEC_DEL' },
  PROP_DEC:  { label: 'Proposal (Decision)',     uri: 'http://publications.europa.eu/resource/authority/resource-type/PROP_DEC' },
  PROP_REG:  { label: 'Proposal (Regulation)',   uri: 'http://publications.europa.eu/resource/authority/resource-type/PROP_REG' },
  PROP_DIR:  { label: 'Proposal (Directive)',    uri: 'http://publications.europa.eu/resource/authority/resource-type/PROP_DIR' },
}

const DEFAULT_LEG_AGENTS = [
  'http://publications.europa.eu/resource/authority/corporate-body/ENER',
  'http://publications.europa.eu/resource/authority/corporate-body/ACER',
  'http://publications.europa.eu/resource/authority/corporate-body/COM',
]

// Issuing bodies available as a filter on the EUR-Lex page
export const LEG_BODIES = {
  COM:    { label: 'European Commission',  uri: 'http://publications.europa.eu/resource/authority/corporate-body/COM' },
  EP:     { label: 'European Parliament',  uri: 'http://publications.europa.eu/resource/authority/corporate-body/EP' },
  CONSIL: { label: 'Council of the EU',    uri: 'http://publications.europa.eu/resource/authority/corporate-body/CONSIL' },
  ENER:   { label: 'DG Energy (ENER)',     uri: 'http://publications.europa.eu/resource/authority/corporate-body/ENER' },
  ACER:   { label: 'ACER',                 uri: 'http://publications.europa.eu/resource/authority/corporate-body/ACER' },
}

/**
 * EUR-Lex legislative query — covers Regulations, Directives, Decisions and
 * their implementing/delegated variants. Without a keyword, scopes to energy
 * bodies (ENER, ACER) + COM legislative proposals. With a keyword, opens to
 * all CELLAR for cross-institution legislation. A specific bodyKey overrides
 * the agent filter regardless of keyword.
 */
export function buildLegislativeQuery({
  keyword = '',
  dateFrom = '2010-01-01',
  dateTo = null,
  typeKey = null,   // one of LEG_TYPES keys
  bodyKey = null,   // one of LEG_BODIES keys
  limit = 20,
  offset = 0,
} = {}) {
  const kw = keyword?.trim()
  const filters = [`FILTER(?date >= "${dateFrom}"^^xsd:date)`]
  if (dateTo) filters.push(`FILTER(?date <= "${dateTo}"^^xsd:date)`)
  if (kw) {
    const safe = kw.replace(/["\\]/g, '')
    filters.push(`FILTER(CONTAINS(LCASE(STR(?title)), LCASE("${safe}")))`)
  }

  // Type filter: either a specific type or the full set of legislative types
  const typeValues = typeKey && LEG_TYPES[typeKey]
    ? `VALUES ?type { <${LEG_TYPES[typeKey].uri}> }`
    : `VALUES ?type { ${Object.values(LEG_TYPES).map(t => `<${t.uri}>`).join(' ')} }`

  // Body filter: specific body > default scoped set > all (when keyword provided)
  let agentFilter
  if (bodyKey && LEG_BODIES[bodyKey]) {
    agentFilter = `VALUES ?agent { <${LEG_BODIES[bodyKey].uri}> }
  ?work cdm:work_created_by_agent ?agent .`
  } else if (kw) {
    agentFilter = '' // keyword search: all institutions
  } else {
    agentFilter = `VALUES ?agent { ${DEFAULT_LEG_AGENTS.map(a => `<${a}>`).join(' ')} }
  ?work cdm:work_created_by_agent ?agent .`
  }

  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?work ?title ?date ?type ?cellarId
WHERE {
  ${typeValues}
  ${agentFilter}
  ?work cdm:work_has_resource-type ?type .
  ?work cdm:work_date_document ?date .
  ?expr cdm:expression_belongs_to_work ?work .
  ?expr cdm:expression_title ?title .
  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  ${filters.join('\n  ')}
}
ORDER BY DESC(?date)
LIMIT ${limit}
OFFSET ${offset}`
}

/**
 * Fetches rich metadata for a single legislative work by its CELLAR URI.
 * Returns multiple rows (one per language × subject combination); client
 * must aggregate arrays for subjects and languages.
 */
export function buildLegislationDetailQuery(workUri) {
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?title ?abstract ?date ?type ?celex ?entryIntoForce ?endOfValidity ?agent ?subjectLabel ?lang
WHERE {
  BIND(<${workUri}> AS ?work)
  ?work cdm:work_has_resource-type ?type .
  OPTIONAL { ?work cdm:work_date_document ?date . }
  OPTIONAL { ?work cdm:resource_legal_id_celex ?celex . }
  OPTIONAL { ?work cdm:work_date_entry-into-force ?entryIntoForce . }
  OPTIONAL { ?work cdm:work_date_end-of-validity ?endOfValidity . }
  OPTIONAL { ?work cdm:work_created_by_agent ?agent . }
  OPTIONAL {
    ?work cdm:work_is_about ?subject .
    ?subject skos:prefLabel ?subjectLabel .
    FILTER(LANG(?subjectLabel) = "en")
  }
  ?expr cdm:expression_belongs_to_work ?work .
  ?expr cdm:expression_title ?title .
  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  OPTIONAL { ?expr cdm:expression_abstract ?abstract . }
  OPTIONAL {
    ?anyExpr cdm:expression_belongs_to_work ?work .
    ?anyExpr cdm:expression_uses_language ?langUri .
    BIND(REPLACE(STR(?langUri), ".*language/", "") AS ?lang)
  }
}
LIMIT 100`
}

/**
 * Related legislation — works sharing at least one cdm:work_is_about topic
 * with the given work, filtered to core legislative types only.
 */
export function buildRelatedLegislationQuery(workUri, limit = 8) {
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?related ?title ?date ?type
WHERE {
  <${workUri}> cdm:work_is_about ?topic .
  ?related cdm:work_is_about ?topic .
  ?related cdm:work_has_resource-type ?type .
  ?related cdm:work_date_document ?date .
  ?expr cdm:expression_belongs_to_work ?related .
  ?expr cdm:expression_title ?title .
  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  FILTER(?related != <${workUri}>)
  VALUES ?type {
    <http://publications.europa.eu/resource/authority/resource-type/REG>
    <http://publications.europa.eu/resource/authority/resource-type/REG_IMPL>
    <http://publications.europa.eu/resource/authority/resource-type/REG_DEL>
    <http://publications.europa.eu/resource/authority/resource-type/DIR>
    <http://publications.europa.eu/resource/authority/resource-type/DIR_IMPL>
    <http://publications.europa.eu/resource/authority/resource-type/DEC>
    <http://publications.europa.eu/resource/authority/resource-type/DEC_IMPL>
  }
}
ORDER BY DESC(?date)
LIMIT ${limit}`
}

export function buildRelatedQuery(workUri, limit = 6) {
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?related ?title ?date
WHERE {
  <${workUri}> cdm:work_is_about ?topic .
  ?related cdm:work_is_about ?topic .
  ?related cdm:work_date_document ?date .
  ?expr cdm:expression_belongs_to_work ?related .
  ?expr cdm:expression_title ?title .
  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  FILTER(?related != <${workUri}>)
}
ORDER BY DESC(?date)
LIMIT ${limit}`
}
