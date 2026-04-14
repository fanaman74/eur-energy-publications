import { buildDocumentsQuery } from '../utils/sparqlBuilder'
import { typeLabelFromUri } from '../utils/formatters'

const SPARQL_ENDPOINT = import.meta.env.VITE_SPARQL_ENDPOINT || '/api/sparql'

export async function fetchDocuments(params = {}, { signal } = {}) {
  const query = buildDocumentsQuery(params)
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

  return bindings.map((b) => ({
    id: b.work?.value || '',
    title: b.title?.value || 'Untitled',
    date: b.date?.value || null,
    type: typeLabelFromUri(b.type?.value),
    rawType: b.type?.value?.split('/').pop() || '',
    url: b.url?.value || null,
    source: 'cellar',
    language: 'EN',
  }))
}
