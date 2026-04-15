import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fetchLegislation, LEG_TYPES, LEG_BODIES } from '../api/eurLex'
import { formatDate, eurLexUrl, opDetailUrl, shortId } from '../utils/formatters'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'

const TYPE_COLOR = {
  REG:        'text-blue-400   border-blue-400/30   bg-blue-400/10',
  REG_IMPL:   'text-sky-400    border-sky-400/30    bg-sky-400/10',
  REG_DEL:    'text-cyan-400   border-cyan-400/30   bg-cyan-400/10',
  DIR:        'text-violet-400 border-violet-400/30 bg-violet-400/10',
  DIR_IMPL:   'text-purple-400 border-purple-400/30 bg-purple-400/10',
  DEC:        'text-amber-400  border-amber-400/30  bg-amber-400/10',
  DEC_IMPL:   'text-orange-400 border-orange-400/30 bg-orange-400/10',
  DEC_DEL:    'text-rose-400   border-rose-400/30   bg-rose-400/10',
  PROP_REG:   'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  PROP_DIR:   'text-teal-400   border-teal-400/30   bg-teal-400/10',
  PROP_DEC:   'text-lime-400   border-lime-400/30   bg-lime-400/10',
}

const DEBOUNCE_MS = 400
const DEFAULT_YEAR = '2026'
const YEAR_OPTIONS = Array.from({ length: new Date().getFullYear() - 2009 }, (_, i) => 2010 + i).reverse()



export default function EurLex() {
  useDocumentTitle('EUR-Lex · EU Legislation')
  const [searchParams, setSearchParams] = useSearchParams()

  const [query, setQuery]       = useState(searchParams.get('q')    || '')
  const [typeKey, setTypeKey]   = useState(searchParams.get('type') || '')
  const [bodyKey, setBodyKey]   = useState(searchParams.get('body') || '')
  const [dateFrom, setDateFrom] = useState(DEFAULT_YEAR)
  const [docs, setDocs]         = useState([])
  const [status, setStatus]     = useState('idle')
  const debounceRef = useRef(null)

  const load = useCallback((q, type, body, from) => {
    setStatus('loading')
    const controller = new AbortController()
    fetchLegislation(
      {
        keyword: q,
        typeKey: type || null,
        bodyKey: body || null,
        dateFrom: `${from || DEFAULT_YEAR}-01-01`,
        limit: 40,
      },
      { signal: controller.signal }
    )
      .then((results) => { setDocs(results); setStatus('done') })
      .catch((e) => { if (e.name !== 'AbortError') setStatus('error') })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const q    = searchParams.get('q')    || ''
    const type = searchParams.get('type') || ''
    const body = searchParams.get('body') || ''
    const from = searchParams.get('from') || DEFAULT_YEAR
    setQuery(q); setTypeKey(type); setBodyKey(body); setDateFrom(from)
    return load(q, type, body, from)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleQueryChange(e) {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchParams({ q: val, type: typeKey, body: bodyKey, from: dateFrom }, { replace: true })
      load(val, typeKey, bodyKey, dateFrom)
    }, DEBOUNCE_MS)
  }

  function handleTypeChange(e) {
    const val = e.target.value
    setTypeKey(val)
    setSearchParams({ q: query, type: val, body: bodyKey, from: dateFrom }, { replace: true })
    load(query, val, bodyKey, dateFrom)
  }

  function handleBodyChange(e) {
    const val = e.target.value
    setBodyKey(val)
    setSearchParams({ q: query, type: typeKey, body: val, from: dateFrom }, { replace: true })
    load(query, typeKey, val, dateFrom)
  }

  function handleFromChange(e) {
    const val = e.target.value
    setDateFrom(val)
    setSearchParams({ q: query, type: typeKey, body: bodyKey, from: val }, { replace: true })
    load(query, typeKey, bodyKey, val)
  }

  const hasFilters = query || typeKey || bodyKey

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs text-muted mb-4">
          <span className="text-accent" aria-hidden>★</span>
          Powered by CELLAR SPARQL · Linked to EUR-Lex
        </div>
        <h1 className="font-display text-3xl font-semibold mb-2">
          EU <span className="text-primary">Legislation</span>
        </h1>
        <p className="text-muted text-sm max-w-2xl">
          Search Regulations, Directives, and Decisions from the CELLAR repository.
          Without a keyword the view is scoped to DG ENER + ACER + COM. Add a keyword to search all EU institutions.
          Each row links directly to{' '}
          <a href="https://eur-lex.europa.eu" target="_blank" rel="noreferrer" className="text-primary hover:underline">eur-lex.europa.eu ↗</a>.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-8">
        {/* Keyword */}
        <div className="flex-1 min-w-64 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">⌕</span>
          <input
            type="search"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search by title keyword (e.g. REMIT, hydrogen, electricity…)"
            className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-border bg-surface text-text text-sm placeholder:text-muted focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
          />
        </div>

        {/* Document type */}
        <select
          value={typeKey}
          onChange={handleTypeChange}
          className="px-3 py-2.5 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:border-primary/60 min-w-48"
        >
          <option value="">All legislative types</option>
          {Object.entries(LEG_TYPES).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {/* Issuing body */}
        <select
          value={bodyKey}
          onChange={handleBodyChange}
          className="px-3 py-2.5 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:border-primary/60 min-w-52"
        >
          <option value="">All issuing bodies</option>
          {Object.entries(LEG_BODIES).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {/* From year */}
        <select
          value={dateFrom}
          onChange={handleFromChange}
          className="px-3 py-2.5 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:border-primary/60"
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={String(y)}>From {y}</option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() => {
              setQuery(''); setTypeKey(''); setBodyKey('')
              setSearchParams({ from: dateFrom }, { replace: true })
              load('', '', '', dateFrom)
            }}
            className="px-4 py-2.5 rounded-lg border border-border text-muted hover:text-text text-sm transition-colors"
          >
            Clear ×
          </button>
        )}
      </div>

      {/* Results */}
      {status === 'idle' || status === 'loading' ? (
        <Spinner label="Querying CELLAR…" />
      ) : status === 'error' ? (
        <EmptyState title="Query failed" message="CELLAR SPARQL didn't respond. Try again." />
      ) : docs.length === 0 ? (
        <EmptyState title="No legislation found" message="Try a different keyword, type, or broader date range." />
      ) : (
        <>
          <div className="text-[11px] text-muted font-mono mb-4 uppercase tracking-wider">
            {docs.length} act{docs.length !== 1 ? 's' : ''}
            {query ? ` · keyword "${query}"` : bodyKey ? ` · all of CELLAR` : ' · scoped to ENER + ACER + COM'}
            {typeKey ? ` · type: ${LEG_TYPES[typeKey]?.label}` : ''}
            {bodyKey ? ` · body: ${LEG_BODIES[bodyKey]?.label}` : ''}
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface2 border-b border-border text-[10px] uppercase tracking-wider text-muted">
                    <th className="text-left px-4 py-3">Title</th>
                    <th className="text-left px-4 py-3 w-48">Type</th>
                    <th className="text-left px-4 py-3 w-32 font-mono">Date</th>
                    <th className="px-4 py-3 w-28 text-center">Links</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {docs.map((doc, i) => {
                    const pub = { id: doc.id }
                    const cls = TYPE_COLOR[doc.rawType] || 'text-muted border-border'
                    const detailId = shortId(doc.id)
                    return (
                      <tr key={doc.id || i} className="hover:bg-primary/5 transition-colors">
                        <td className="px-4 py-3 font-medium leading-snug">
                          <Link
                            to={`/eur-lex/${detailId}`}
                            className="text-text hover:text-primary transition-colors"
                          >
                            {doc.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block text-[10px] font-mono uppercase tracking-wide border rounded px-1.5 py-0.5 ${cls}`}>
                            {doc.typeLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted whitespace-nowrap">
                          {formatDate(doc.date)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <a
                              href={eurLexUrl(pub)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary hover:underline"
                              title="Open full text in EUR-Lex"
                            >
                              EUR-Lex ↗
                            </a>
                            <a
                              href={opDetailUrl(pub)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted hover:text-text"
                              title="Open in Publications Office"
                            >
                              OP ↗
                            </a>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
