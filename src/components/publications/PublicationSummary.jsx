import { useEffect, useState } from 'react'
import { fetchPublicationDetail, fetchRelated } from '../../api/cellar'
import { fetchOpDescription } from '../../api/opSearch'
import { formatDate } from '../../utils/formatters'

async function fetchAiSummary({ title, date, type, subjects, agents }) {
  const res = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, date, type, subjects, agents }),
  })
  if (!res.ok) throw new Error('Summary request failed')
  const data = await res.json()
  return data.summary
}

export default function PublicationSummary({ pub }) {
  const [detail, setDetail] = useState(null)
  const [related, setRelated] = useState([])
  const [status, setStatus] = useState('loading')
  const [aiSummary, setAiSummary] = useState(null)
  const [summaryStatus, setSummaryStatus] = useState('idle')
  const [summarySource, setSummarySource] = useState(null) // 'op' | 'ai'

  useEffect(() => {
    if (!pub?.id) return
    setStatus('loading')
    setDetail(null)
    setRelated([])
    setAiSummary(null)
    setSummaryStatus('idle')
    setSummarySource(null)

    const controller = new AbortController()
    Promise.all([
      fetchPublicationDetail(pub.id, { signal: controller.signal }).catch(() => null),
      fetchRelated(pub.id, { signal: controller.signal }).catch(() => []),
    ]).then(([d, r]) => {
      setDetail(d)
      setRelated(r)
      setStatus('done')
    })

    return () => controller.abort()
  }, [pub?.id])

  // Once detail loads and there's no abstract, fetch an AI summary
  useEffect(() => {
    if (status !== 'done') return
    const rawAbstract = detail?.abstract || pub?.abstract || null
    if (rawAbstract || summaryStatus !== 'idle') return

    setSummaryStatus('loading')

    // 1. Try OP Search API for a real description first
    fetchOpDescription(pub)
      .then((opDesc) => {
        if (opDesc) {
          setAiSummary(opDesc)
          setSummarySource('op')
          setSummaryStatus('done')
          return
        }
        // 2. Fall back to Claude AI summary generation
        return fetchAiSummary({
          title: pub.title,
          date: pub.date,
          type: pub.type,
          subjects: detail?.subjects,
          agents: detail?.agents,
        }).then((s) => {
          setAiSummary(s)
          setSummarySource('ai')
          setSummaryStatus('done')
        })
      })
      .catch(() => setSummaryStatus('error'))
  }, [status, detail, pub, summaryStatus])

  const abstract = detail?.abstract || pub?.abstract || aiSummary || null
  const subjects = detail?.subjects || []
  const agents = detail?.agents || []
  const manifestations = detail?.manifestations || []

  return (
    <section className="mt-16 border-t border-border pt-10">
      <div className="flex items-center gap-2 mb-8">
        <span className="text-accent text-lg" aria-hidden>★</span>
        <h2 className="font-display text-2xl">Publication Summary</h2>
        {status === 'loading' && (
          <span className="ml-2 h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin inline-block" />
        )}
      </div>

      {/* Abstract */}
      <div className="rounded-xl border border-border bg-surface p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-wider text-muted">Abstract / Description</div>
          {aiSummary && summaryStatus === 'done' && (
            <span className="text-[9px] uppercase tracking-wider text-accent border border-accent/30 rounded px-1.5 py-0.5">
              {summarySource === 'ai' ? 'AI summary' : 'OP Search'}
            </span>
          )}
        </div>
        {abstract ? (
          <p className="text-text leading-relaxed text-sm">{abstract}</p>
        ) : summaryStatus === 'loading' ? (
          <div className="flex items-center gap-2 text-muted text-sm">
            <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin inline-block" />
            Generating summary…
          </div>
        ) : (
          <p className="text-muted text-sm italic">
            No abstract available for this publication.
          </p>
        )}
      </div>

      {/* Key facts grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Fact label="Document date" value={formatDate(pub.date)} mono />
        <Fact label="Publication type" value={pub.type} />
        <Fact label="Language" value={pub.language || 'EN'} />
        {agents.length > 0 && (
          <Fact label="Issuing body" value={agents.join(', ')} />
        )}
        {pub.source && (
          <Fact label="Data source" value={pub.source} mono accent />
        )}
      </div>

      {/* Subject tags */}
      {subjects.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-3">Subject areas</div>
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => (
              <span
                key={s}
                className="px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Manifestation links */}
      {manifestations.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-3">Available formats</div>
          <div className="flex flex-wrap gap-3">
            {manifestations.map((m, i) => (
              <a
                key={i}
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-surface hover:border-primary/40 hover:bg-primary/5 text-sm transition-colors"
              >
                <span className="font-mono text-xs text-accent">{m.format}</span>
                <span className="text-muted">↗</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Identifier block */}
      <div className="rounded-xl border border-border bg-surface/50 p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted mb-2">CELLAR identifier (URI)</div>
        <code className="font-mono text-xs text-muted break-all">{pub.id || '—'}</code>
      </div>

      {/* Related publications */}
      {related.length > 0 && (
        <div className="mt-8">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-3">Related publications</div>
          <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {related.map((r) => (
              <li key={r.id} className="flex items-start gap-4 px-4 py-3 bg-surface hover:bg-surface/60 transition-colors">
                <span className="font-mono text-[11px] text-accent shrink-0 pt-0.5">{formatDate(r.date)}</span>
                <span className="text-sm text-muted leading-snug">{r.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Fact({ label, value, mono, accent }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className={`text-sm font-medium ${mono ? 'font-mono' : ''} ${accent ? 'text-accent' : 'text-text'}`}>
        {value || '—'}
      </div>
    </div>
  )
}
