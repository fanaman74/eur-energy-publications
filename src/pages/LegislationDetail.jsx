import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fetchLegislationDetail, LEG_TYPES } from '../api/eurLex'
import { formatDate, eurLexUrl, opDetailUrl, shortId } from '../utils/formatters'
import Spinner from '../components/ui/Spinner'

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

function MetaRow({ label, children }) {
  return (
    <div className="flex gap-4 py-3 border-b border-border last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-muted font-mono w-40 shrink-0 pt-0.5">{label}</span>
      <div className="text-sm text-text flex-1">{children}</div>
    </div>
  )
}

function Pill({ children, cls }) {
  return (
    <span className={`inline-block text-[10px] font-mono uppercase tracking-wide border rounded px-1.5 py-0.5 ${cls}`}>
      {children}
    </span>
  )
}

export default function LegislationDetail() {
  const { workId } = useParams()
  const [doc, setDoc] = useState(null)
  const [status, setStatus] = useState('loading')
  const [summary, setSummary] = useState(null)
  const [summaryModel, setSummaryModel] = useState(null)
  const [summaryStatus, setSummaryStatus] = useState('idle') // idle | loading | done | error
  const [summaryError, setSummaryError] = useState(null)
  useDocumentTitle(doc ? doc.title.slice(0, 60) + '…' : 'EUR-Lex · Detail')

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setSummary(null)
    setSummaryStatus('idle')
    setSummaryError(null)
    fetchLegislationDetail(workId, { signal: controller.signal })
      .then((d) => { setDoc(d); setStatus('done') })
      .catch((e) => { if (e.name !== 'AbortError') setStatus('error') })
    return () => controller.abort()
  }, [workId])

  async function handleSummarise() {
    if (!doc || summaryStatus === 'loading') return
    setSummaryStatus('loading')
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: doc.title,
          date: doc.date,
          type: doc.typeLabel,
          subjects: doc.subjects,
          agents: doc.agents.map(a => a.label),
        }),
      })
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
      setSummary(data.summary)
      setSummaryModel(data.model || null)
      setSummaryStatus('done')
    } catch (e) {
      setSummaryError(e.message)
      setSummaryStatus('error')
    }
  }

  const eurLink = doc ? eurLexUrl({ id: doc.workUri }) : null
  const opLink  = doc ? opDetailUrl({ id: doc.workUri }) : null
  const typeCls = doc ? (TYPE_COLOR[doc.rawType] || 'text-muted border-border bg-surface2') : ''

  if (status === 'loading') {
    return (
      <div className="max-w-5xl mx-auto px-6 py-20">
        <Spinner label="Fetching from CELLAR…" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="max-w-5xl mx-auto px-6 py-20 text-center">
        <p className="text-muted mb-4">Could not load this legislative act from CELLAR.</p>
        <Link to="/eur-lex" className="text-primary hover:underline text-sm">← Back to EUR-Lex</Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-muted mb-8">
        <Link to="/eur-lex" className="hover:text-primary transition-colors">EUR-Lex</Link>
        <span>›</span>
        <span className={`font-mono ${typeCls.split(' ')[0]}`}>{doc.typeLabel}</span>
        {doc.celex && (
          <>
            <span>›</span>
            <span className="font-mono">{doc.celex}</span>
          </>
        )}
      </nav>

      {/* Title block */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Pill cls={typeCls}>{doc.typeLabel}</Pill>
          {doc.celex && (
            <span className="text-[11px] font-mono text-muted border border-border rounded px-2 py-0.5">
              CELEX {doc.celex}
            </span>
          )}
          <span className="text-[11px] font-mono text-muted">
            {formatDate(doc.date)}
          </span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-text leading-snug">
          {doc.title}
        </h1>
      </div>

      {/* ── AI Summary ── */}
      <div className="flex flex-col items-center gap-4 mb-10">
        {summaryStatus !== 'done' && (
          <button
            onClick={handleSummarise}
            disabled={summaryStatus === 'loading'}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-primary/40 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 hover:border-primary/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {summaryStatus === 'loading' ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                Summarising…
              </>
            ) : (
              <>
                <span>✦</span>
                Summarise with AI
              </>
            )}
          </button>
        )}

        {summaryStatus === 'done' && summary && (
          <div className="w-full max-w-3xl rounded-xl border border-primary/25 bg-primary/5 p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-primary text-xs">✦</span>
              <span className="text-[10px] uppercase tracking-widest text-primary font-mono">AI Summary · {summaryModel || 'OpenRouter'}</span>
            </div>
            <p className="text-text text-sm leading-relaxed">{summary}</p>
            <button
              onClick={() => { setSummary(null); setSummaryStatus('idle') }}
              className="mt-4 text-xs text-muted hover:text-text transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {summaryStatus === 'error' && (
          <div className="text-xs text-rose-400 text-center max-w-xl">
            <p className="font-medium mb-1">Summary failed</p>
            {summaryError && <p className="font-mono text-rose-400/70 break-all">{summaryError}</p>}
            <button onClick={() => setSummaryStatus('idle')} className="mt-2 text-muted hover:text-text underline">Try again</button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">

        {/* Left — metadata */}
        <div className="lg:col-span-2 space-y-6">

          {/* Core metadata table */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-surface2">
              <span className="text-[10px] uppercase tracking-widest text-muted font-mono">Metadata</span>
            </div>
            <div className="px-5">
              <MetaRow label="Document date">{formatDate(doc.date) || '—'}</MetaRow>

              {doc.entryIntoForce && (
                <MetaRow label="Entry into force">
                  <span className="text-emerald-400">{formatDate(doc.entryIntoForce)}</span>
                </MetaRow>
              )}

              {doc.endOfValidity && (
                <MetaRow label="End of validity">
                  <span className="text-rose-400">{formatDate(doc.endOfValidity)}</span>
                </MetaRow>
              )}

              <MetaRow label="Legislative type">
                <Pill cls={typeCls}>{doc.typeLabel}</Pill>
              </MetaRow>

              {doc.celex && (
                <MetaRow label="CELEX number">
                  <span className="font-mono">{doc.celex}</span>
                </MetaRow>
              )}

              {doc.agents.length > 0 && (
                <MetaRow label="Issuing body">
                  <div className="flex flex-wrap gap-2">
                    {doc.agents.map(a => (
                      <span key={a.uri} className="text-xs text-primary/80 border border-primary/20 bg-primary/5 rounded px-2 py-0.5 font-mono">
                        {a.label}
                      </span>
                    ))}
                  </div>
                </MetaRow>
              )}

              {doc.languages.length > 0 && (
                <MetaRow label="Languages">
                  <div className="flex flex-wrap gap-1.5">
                    {doc.languages.map(l => (
                      <span key={l} className="text-[10px] font-mono border border-border rounded px-1.5 py-0.5 text-muted">{l}</span>
                    ))}
                  </div>
                </MetaRow>
              )}

              <MetaRow label="CELLAR URI">
                <span className="font-mono text-[11px] text-muted break-all">{doc.workUri}</span>
              </MetaRow>
            </div>
          </div>

          {/* Subject matters */}
          {doc.subjects.length > 0 && (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-surface2">
                <span className="text-[10px] uppercase tracking-widest text-muted font-mono">Subject matters</span>
              </div>
              <div className="px-5 py-4 flex flex-wrap gap-2">
                {doc.subjects.map(s => (
                  <span key={s} className="text-xs border border-border bg-surface2 rounded-full px-3 py-1 text-muted">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Related legislation */}
          {doc.related.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-surface2">
                <span className="text-[10px] uppercase tracking-widest text-muted font-mono">Related legislation</span>
                <span className="ml-2 text-[10px] text-muted">(shares subject matter)</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {doc.related.map((rel, i) => {
                    const relId = shortId(rel.id)
                    const relCls = TYPE_COLOR[rel.rawType] || 'text-muted border-border'
                    return (
                      <tr key={rel.id || i} className="hover:bg-primary/5 transition-colors">
                        <td className="px-4 py-3 leading-snug">
                          <Link
                            to={`/eur-lex/${relId}`}
                            className="text-text hover:text-primary transition-colors font-medium"
                          >
                            {rel.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 w-40">
                          <Pill cls={relCls}>{rel.typeLabel}</Pill>
                        </td>
                        <td className="px-4 py-3 w-28 font-mono text-xs text-muted whitespace-nowrap">
                          {formatDate(rel.date)}
                        </td>
                        <td className="px-4 py-3 w-20 text-center">
                          <a
                            href={eurLexUrl({ id: rel.id })}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline"
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
          )}
        </div>

        {/* Right — action panel */}
        <div className="space-y-4">

          {/* Primary links */}
          <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-1">Open full text</div>
            <a
              href={eurLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between w-full px-4 py-3 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
            >
              EUR-Lex
              <span className="text-lg leading-none">↗</span>
            </a>
            <a
              href={opLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between w-full px-4 py-3 rounded-lg border border-border text-muted hover:text-text hover:border-primary/30 transition-colors text-sm"
            >
              Publications Office
              <span className="text-lg leading-none">↗</span>
            </a>
          </div>

          {/* Quick stats */}
          <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
            <div className="text-[10px] uppercase tracking-widest text-muted font-mono">At a glance</div>

            <div>
              <div className="text-[10px] text-muted mb-1">Type</div>
              <Pill cls={typeCls}>{doc.typeLabel}</Pill>
            </div>

            {doc.celex && (
              <div>
                <div className="text-[10px] text-muted mb-1">CELEX</div>
                <div className="font-mono text-sm text-text">{doc.celex}</div>
              </div>
            )}

            <div>
              <div className="text-[10px] text-muted mb-1">Document date</div>
              <div className="font-mono text-sm text-text">{formatDate(doc.date)}</div>
            </div>

            {doc.entryIntoForce && (
              <div>
                <div className="text-[10px] text-muted mb-1">In force from</div>
                <div className="font-mono text-sm text-emerald-400">{formatDate(doc.entryIntoForce)}</div>
              </div>
            )}

            {doc.endOfValidity && (
              <div>
                <div className="text-[10px] text-muted mb-1">Valid until</div>
                <div className="font-mono text-sm text-rose-400">{formatDate(doc.endOfValidity)}</div>
              </div>
            )}

            <div>
              <div className="text-[10px] text-muted mb-1">Available languages</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {doc.languages.length > 0
                  ? doc.languages.map(l => (
                      <span key={l} className="text-[10px] font-mono border border-border rounded px-1.5 py-0.5 text-muted">{l}</span>
                    ))
                  : <span className="text-muted text-xs">—</span>
                }
              </div>
            </div>
          </div>

          {/* Back link */}
          <Link
            to="/eur-lex"
            className="flex items-center gap-2 text-sm text-muted hover:text-text transition-colors px-1"
          >
            <span>←</span> Back to EUR-Lex
          </Link>
        </div>
      </div>
    </div>
  )
}
