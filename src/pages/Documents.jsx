import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fetchDocuments } from '../api/energyDocuments'
import { formatDate, shortId, opDetailUrl } from '../utils/formatters'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'

const TYPE_COLOR = {
  'Working document': 'text-slate-400 border-slate-500/30 bg-slate-500/10',
  Report:            'text-blue-400  border-blue-500/30  bg-blue-500/10',
  Study:             'text-amber-400 border-amber-500/30 bg-amber-500/10',
  Opinion:           'text-rose-400  border-rose-500/30  bg-rose-500/10',
  Decision:          'text-violet-400 border-violet-500/30 bg-violet-500/10',
  Factsheet:         'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  Publication:       'text-primary   border-primary/30   bg-primary/10',
}

function TypePill({ type }) {
  const cls = TYPE_COLOR[type] || TYPE_COLOR.Publication
  return (
    <span className={`inline-block text-[10px] font-mono uppercase tracking-wide border rounded px-1.5 py-0.5 ${cls}`}>
      {type}
    </span>
  )
}

const DEBOUNCE_MS = 400

export default function Documents() {
  useDocumentTitle('Documents')
  const [searchParams, setSearchParams] = useSearchParams()

  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [dateFrom, setDateFrom] = useState(searchParams.get('from') || '2015')
  const [docs, setDocs] = useState([])
  const [status, setStatus] = useState('idle')
  const debounceRef = useRef(null)

  const load = useCallback((q, from) => {
    setStatus('loading')
    const controller = new AbortController()
    fetchDocuments(
      { keyword: q, dateFrom: from ? `${from}-01-01` : '2015-01-01', limit: 40 },
      { signal: controller.signal }
    )
      .then((results) => { setDocs(results); setStatus('done') })
      .catch((e) => { if (e.name !== 'AbortError') setStatus('error') })
    return () => controller.abort()
  }, [])

  // Initial + param-driven load
  useEffect(() => {
    const q = searchParams.get('q') || ''
    const from = searchParams.get('from') || '2015'
    setQuery(q)
    setDateFrom(from)
    return load(q, from)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleQueryChange(e) {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchParams({ q: val, from: dateFrom }, { replace: true })
      load(val, dateFrom)
    }, DEBOUNCE_MS)
  }

  function handleFromChange(e) {
    const val = e.target.value
    setDateFrom(val)
    setSearchParams({ q: query, from: val }, { replace: true })
    load(query, val)
  }

  const years = Array.from({ length: new Date().getFullYear() - 2009 }, (_, i) => 2010 + i).reverse()

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold mb-2">
          EU Energy <span className="text-primary">Documents</span>
        </h1>
        <p className="text-muted text-sm max-w-2xl">
          Working documents, staff working documents, opinions, decisions, and reports from DG ENER, ACER, and the Commission — sourced from CELLAR.
          Search by keyword to scan all of CELLAR; clear the search to scope to energy bodies only.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-8">
        <div className="flex-1 min-w-64 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">⌕</span>
          <input
            type="search"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search all CELLAR by title (e.g. REMIT, hydrogen, grid…)"
            className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-border bg-surface text-text text-sm placeholder:text-muted focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <select
          value={dateFrom}
          onChange={handleFromChange}
          className="px-3 py-2.5 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:border-primary/60"
        >
          {years.map((y) => (
            <option key={y} value={String(y)}>From {y}</option>
          ))}
        </select>
        {query && (
          <button
            onClick={() => { setQuery(''); setSearchParams({ from: dateFrom }, { replace: true }); load('', dateFrom) }}
            className="px-4 py-2.5 rounded-lg border border-border text-muted hover:text-text text-sm transition-colors"
          >
            Clear ×
          </button>
        )}
      </div>

      {/* Status / results */}
      {status === 'idle' || status === 'loading' ? (
        <Spinner label="Searching CELLAR…" />
      ) : status === 'error' ? (
        <EmptyState title="Search failed" message="CELLAR didn't respond. Try again in a moment." />
      ) : docs.length === 0 ? (
        <EmptyState title="No documents found" message="Try a different keyword or broader date range." />
      ) : (
        <>
          <div className="text-[11px] text-muted font-mono mb-4 uppercase tracking-wider">
            {docs.length} document{docs.length !== 1 ? 's' : ''} · source: cellar
            {query ? ` · keyword "${query}"` : ' · scoped to ENER + ACER + COM'}
          </div>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface2 border-b border-border text-[10px] uppercase tracking-wider text-muted">
                    <th className="text-left px-4 py-3 w-8">#</th>
                    <th className="text-left px-4 py-3">Title</th>
                    <th className="text-left px-4 py-3 w-40">Type</th>
                    <th className="text-left px-4 py-3 w-32 font-mono">Date</th>
                    <th className="px-4 py-3 w-16 text-center">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {docs.map((doc, i) => {
                    const detailPath = `/publication/${encodeURIComponent(shortId(doc.id))}`
                    return (
                      <tr
                        key={doc.id || i}
                        className="hover:bg-primary/5 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</td>
                        <td className="px-4 py-3">
                          <Link
                            to={detailPath}
                            state={{ pub: doc }}
                            className="font-medium text-text hover:text-primary transition-colors leading-snug block"
                          >
                            {doc.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <TypePill type={doc.type} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted whitespace-nowrap">
                          {formatDate(doc.date)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <a
                            href={opDetailUrl(doc)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${doc.title} in Publications Office`}
                            className="text-primary hover:text-primary/70 text-base"
                          >
                            ↗
                          </a>
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
