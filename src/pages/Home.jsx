import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fetchWithFallback } from '../api/openData'
import PublicationTable from '../components/publications/PublicationTable'
import Spinner from '../components/ui/Spinner'

function useLatestPublications() {
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    fetchWithFallback({ limit: 50, offset: 0 }, { signal: controller.signal })
      .then(({ results: r }) => { setResults(r); setStatus('done') })
      .catch((e) => { if (e.name !== 'AbortError') setStatus('error') })
    return () => controller.abort()
  }, [])

  return { results, status }
}

export default function Home() {
  useDocumentTitle('Home')
  const { results, status } = useLatestPublications()

  return (
    <div className="relative">
      <div
        className="absolute inset-0 bg-grid-faint bg-[size:48px_48px] opacity-40 pointer-events-none"
        aria-hidden
      />

      {/* Hero */}
      <section className="relative max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs text-muted mb-8">
          <span className="text-accent" aria-hidden>★</span>
          Publications Office of the European Union
        </div>
        <h1 className="font-display text-5xl md:text-6xl font-semibold leading-[1.05] mb-6 tracking-tight">
          EU energy policy publications,
          <br />
          <span className="text-primary">browsable at the speed of thought.</span>
        </h1>
        <p className="text-muted text-lg max-w-2xl mx-auto mb-10">
          Search, filter, and explore every DG ENER publication sourced from the CELLAR
          repository — no friction, no institutional navigation.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/browse"
            className="px-6 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90"
          >
            Browse publications →
          </Link>
          <Link
            to="/about"
            className="px-6 py-3 rounded-lg border border-border text-muted hover:text-text"
          >
            How it works
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-20 text-left">
          {[
            { k: 'CELLAR', v: 'Direct SPARQL access to the EU metadata graph' },
            { k: 'Search API', v: 'Resilient fallback via OP Search portlet' },
            { k: 'Open Data', v: 'Final fallback to data.europa.eu hub' },
          ].map((c) => (
            <div key={c.k} className="rounded-xl border border-border bg-surface p-5">
              <div className="text-accent text-xs font-mono uppercase mb-2">{c.k}</div>
              <div className="text-sm text-muted">{c.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Latest 15 table */}
      <section className="relative max-w-7xl mx-auto px-6 pb-24">
        <div className="border-t border-border pt-12">
          {status === 'loading' ? (
            <Spinner label="Loading latest publications…" />
          ) : (
            <PublicationTable results={results} />
          )}
        </div>
        {results.length > 0 && (
          <div className="mt-6 text-center">
            <Link to="/browse" className="text-primary text-sm hover:underline">
              Browse all publications →
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
