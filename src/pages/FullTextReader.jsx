import { useEffect, useRef, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fetchLegislationDetail } from '../api/eurLex'
import { formatDate } from '../utils/formatters'
import Spinner from '../components/ui/Spinner'
import BriefingNote from '../components/publications/BriefingNote'

// ── Language display config ───────────────────────────────────────────────────
const LANG_META = {
  ENG: { label: 'English',  flag: '🇬🇧', accept: 'en' },
  ITA: { label: 'Italiano', flag: '🇮🇹', accept: 'it' },
}

// ── Parse raw text into navigable article sections ───────────────────────────
function parseArticles(text) {
  if (!text) return []
  const lines = text.split('\n')
  const sections = []
  let current = null

  const isHeading = (line) => {
    const t = line.trim()
    return (
      /^(Article|ARTICLE|Articolo|ARTICOLO)\s+\d+/i.test(t) ||
      /^(Chapter|CHAPTER|Capo|CAPO)\s+[IVX\d]+/i.test(t) ||
      /^(Section|SECTION|Sezione|SEZIONE)\s+[IVX\d]+/i.test(t) ||
      /^(Title|TITLE|Titolo|TITOLO)\s+[IVX\d]+/i.test(t) ||
      /^(Annex|ANNEX|Allegato|ALLEGATO)\s*/i.test(t) ||
      /^(Recital|RECITAL|Considerando)\s+\(/i.test(t) ||
      /^(Preamble|PREAMBLE|Premessa)/i.test(t) ||
      /^(Whereas|WHEREAS|Visto che)/i.test(t)
    )
  }

  for (const line of lines) {
    if (isHeading(line)) {
      if (current) sections.push(current)
      current = { heading: line.trim(), body: [] }
    } else if (current) {
      current.body.push(line)
    } else if (line.trim()) {
      // pre-article content (recitals block, preamble)
      current = { heading: 'Preamble', body: [line] }
    }
  }
  if (current) sections.push(current)

  // Collapse tiny trailing-space sections into previous
  return sections.filter(s => s.heading || s.body.join('').trim().length > 0)
}

// ── Single article section renderer ──────────────────────────────────────────
function ArticleSection({ section, id }) {
  return (
    <div id={id} className="mb-8 scroll-mt-20">
      <h3
        className="text-sm font-bold text-white/90 mb-3 py-2 px-3 rounded-md"
        style={{ background: 'rgba(59,130,246,0.08)', borderLeft: '3px solid #3b82f6' }}
      >
        {section.heading}
      </h3>
      <div className="space-y-1">
        {section.body
          .join('\n')
          .split(/\n{2,}/)
          .map((para, pi) => {
            const t = para.trim()
            if (!t) return null
            return (
              <p key={pi} className="text-[13px] text-white/70 leading-[1.8]">
                {t}
              </p>
            )
          })}
      </div>
    </div>
  )
}

// ── Main reader page ──────────────────────────────────────────────────────────
export default function FullTextReader() {
  const { workId, lang = 'ENG' } = useParams()
  const normLang = lang.toUpperCase()
  const langMeta = LANG_META[normLang] || LANG_META.ENG

  const [doc, setDoc]               = useState(null)
  const [docStatus, setDocStatus]   = useState('loading')

  const [text, setText]             = useState(null)
  const [textStatus, setTextStatus] = useState('loading')
  const [textError, setTextError]   = useState(null)

  const [summary, setSummary]           = useState(null)
  const [summaryModel, setSummaryModel] = useState(null)
  const [summarySource, setSummarySource] = useState(null)
  const [summaryStep, setSummaryStep]   = useState('')
  const [summaryStatus, setSummaryStatus] = useState('idle')
  const [summaryError, setSummaryError] = useState(null)
  const [summaryOpen, setSummaryOpen]   = useState(false)

  const [tocOpen, setTocOpen]   = useState(true)
  const [activeId, setActiveId] = useState(null)
  const mainRef = useRef(null)

  useDocumentTitle(doc ? `${langMeta.flag} ${doc.title.slice(0, 50)}…` : 'Full Text Reader')

  // Load doc metadata
  useEffect(() => {
    setDocStatus('loading')
    fetchLegislationDetail(workId)
      .then(d => { setDoc(d); setDocStatus('done') })
      .catch(() => setDocStatus('error'))
  }, [workId])

  // Load full text
  useEffect(() => {
    setTextStatus('loading')
    setText(null)
    setTextError(null)
    const celex = doc?.celex || ''
    const params = new URLSearchParams({ lang: normLang })
    if (celex) params.set('celex', celex)
    fetch(`/api/fulltext/${encodeURIComponent(workId)}?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setText(data.text)
        setTextStatus('done')
      })
      .catch(e => { setTextError(e.message); setTextStatus('error') })
  }, [workId, normLang, doc])

  // Parse sections from text
  const sections = useMemo(() => parseArticles(text), [text])

  // Active section tracking via IntersectionObserver
  useEffect(() => {
    if (!sections.length) return
    const ids = sections.map((_, i) => `sec-${i}`)
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    )
    ids.forEach(id => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [sections])

  async function handleSummarise() {
    if (!doc || summaryStatus === 'loading') return
    if (summaryStatus === 'done' && summary) { setSummaryOpen(true); return }
    setSummaryStatus('loading')
    setSummaryError(null)
    try {
      setSummaryStep('Preparing document for analysis…')
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:    doc.title,
          date:     doc.date,
          type:     doc.typeLabel,
          celex:    doc.celex || null,
          subjects: doc.subjects,
          agents:   doc.agents.map(a => a.label),
          abstract: doc.abstract || null,
          workId,
          // Pass already-fetched text so server doesn't need to re-fetch
          fullText: text || null,
        }),
      })
      setSummaryStep('Generating briefing note…')
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
      const raw = data.summary || ''
      const normalised = raw
        .replace(/\r\n/g, '\n')
        .replace(/(?<!\n)(#{1,4} )/g, '\n$1')
        .replace(/(?<!\n)(\*\*[A-Z][^*]{0,40}:\*\*)/g, '\n$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      setSummary(normalised)
      setSummaryModel(data.model || null)
      setSummarySource(data.source || null)
      setSummaryStatus('done')
      setSummaryOpen(true)
    } catch (e) {
      setSummaryError(e.message)
      setSummaryStatus('error')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const isLoading = docStatus === 'loading' || textStatus === 'loading'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 shrink-0 px-6 py-3 flex items-center gap-3"
        style={{
          background: 'rgba(10,15,30,0.92)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Back link */}
        <Link
          to={`/eur-lex/${workId}`}
          className="shrink-0 flex items-center gap-1.5 text-[11px] font-mono text-white/40 hover:text-white/80 transition-colors"
        >
          ← Detail
        </Link>

        <span className="text-white/15">|</span>

        {/* Language badge */}
        <span
          className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded border"
          style={{
            color: normLang === 'ITA' ? '#86efac' : '#93c5fd',
            borderColor: normLang === 'ITA' ? 'rgba(134,239,172,0.3)' : 'rgba(147,197,253,0.3)',
            background: normLang === 'ITA' ? 'rgba(134,239,172,0.08)' : 'rgba(147,197,253,0.08)',
          }}
        >
          {langMeta.flag} {normLang}
        </span>

        {/* CELEX */}
        {doc?.celex && (
          <span className="shrink-0 text-[10px] font-mono text-white/30 border border-white/10 rounded px-1.5 py-0.5">
            {doc.celex}
          </span>
        )}

        {/* Title — truncated */}
        <span className="flex-1 text-[12px] text-white/60 truncate hidden sm:block">
          {doc?.title || '…'}
        </span>

        {/* Summarise button */}
        <button
          onClick={handleSummarise}
          disabled={summaryStatus === 'loading' || textStatus !== 'done'}
          className="shrink-0 flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: summaryStatus === 'done' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
            border: summaryStatus === 'done' ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(59,130,246,0.35)',
            color: summaryStatus === 'done' ? '#6ee7b7' : '#93c5fd',
          }}
          onMouseEnter={e => {
            if (summaryStatus !== 'loading' && textStatus === 'done')
              e.currentTarget.style.background = summaryStatus === 'done' ? 'rgba(16,185,129,0.25)' : 'rgba(59,130,246,0.25)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = summaryStatus === 'done' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)'
          }}
        >
          {summaryStatus === 'loading' ? (
            <>
              <span className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin" />
              {summaryStep || 'Analysing…'}
            </>
          ) : summaryStatus === 'done' ? (
            <>✦ View Briefing Note</>
          ) : (
            <>✦ Generate Briefing Note</>
          )}
        </button>
      </header>

      {/* ── Error states ──────────────────────────────────────────────────── */}
      {textStatus === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 text-center px-6">
          <div className="text-4xl opacity-40">📄</div>
          <p className="text-white/50 text-sm max-w-md">
            {textError || 'Full text not available for this document in the selected language.'}
          </p>
          <p className="text-white/30 text-xs">
            Try opening the document directly on{' '}
            {doc?.celex ? (
              <a
                href={`https://eur-lex.europa.eu/legal-content/${normLang === 'ITA' ? 'IT' : 'EN'}/TXT/HTML/?uri=CELEX:${doc.celex}`}
                target="_blank" rel="noreferrer"
                className="text-blue-400/70 hover:text-blue-400 underline"
              >
                EUR-Lex ↗
              </a>
            ) : 'EUR-Lex'}
          </p>
          <Link to={`/eur-lex/${workId}`} className="mt-2 text-xs text-white/40 hover:text-white/70 transition-colors">
            ← Back to detail
          </Link>
        </div>
      )}

      {/* ── Main content: TOC + text ──────────────────────────────────────── */}
      {textStatus !== 'error' && (
        <div className="flex flex-1 min-h-0">

          {/* TOC sidebar */}
          <aside
            className={`shrink-0 overflow-y-auto transition-all duration-300 ${tocOpen ? 'w-64' : 'w-10'}`}
            style={{
              borderRight: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.015)',
              position: 'sticky',
              top: '49px',
              height: 'calc(100vh - 49px)',
            }}
          >
            {/* Toggle */}
            <button
              onClick={() => setTocOpen(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-white/30 hover:text-white/60 transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              title={tocOpen ? 'Collapse contents' : 'Expand contents'}
            >
              <span className="text-[10px] font-mono">{tocOpen ? '◂' : '▸'}</span>
              {tocOpen && (
                <span className="text-[10px] font-mono uppercase tracking-widest">Contents</span>
              )}
            </button>

            {tocOpen && (
              <nav className="py-2">
                {isLoading && (
                  <div className="px-4 py-3">
                    <div className="h-2 bg-white/10 rounded animate-pulse mb-2" />
                    <div className="h-2 bg-white/10 rounded animate-pulse mb-2 w-3/4" />
                    <div className="h-2 bg-white/10 rounded animate-pulse w-1/2" />
                  </div>
                )}
                {sections.map((sec, i) => {
                  const id = `sec-${i}`
                  const isActive = activeId === id
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                      className="w-full text-left px-4 py-1.5 text-[11px] transition-all"
                      style={{
                        color: isActive ? '#93c5fd' : 'rgba(255,255,255,0.35)',
                        background: isActive ? 'rgba(59,130,246,0.07)' : 'transparent',
                        borderLeft: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                      }}
                    >
                      <span className="line-clamp-2 leading-snug">{sec.heading}</span>
                    </button>
                  )
                })}
              </nav>
            )}
          </aside>

          {/* Document body */}
          <main
            ref={mainRef}
            className="flex-1 overflow-y-auto px-8 py-8 max-w-4xl mx-auto"
            style={{ minWidth: 0 }}
          >
            {/* Title block */}
            {doc && (
              <div className="mb-8 pb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-[10px] font-mono text-white/30">{doc.typeLabel}</span>
                  {doc.celex && (
                    <span className="text-[10px] font-mono text-white/20">CELEX {doc.celex}</span>
                  )}
                  <span className="text-[10px] font-mono text-white/20">{formatDate(doc.date)}</span>
                  <span className="ml-auto text-[10px] font-mono" style={{ color: normLang === 'ITA' ? '#86efac' : '#93c5fd' }}>
                    {langMeta.flag} {langMeta.label}
                  </span>
                </div>
                <h1 className="text-base font-semibold text-white/90 leading-snug">
                  {doc.title}
                </h1>
              </div>
            )}

            {/* Loading state */}
            {isLoading && (
              <div className="py-20 flex flex-col items-center gap-4">
                <Spinner label={textStatus === 'loading' ? `Fetching ${langMeta.label} text…` : 'Loading metadata…'} />
                <p className="text-[11px] text-white/25 font-mono">
                  Retrieving from EUR-Lex / CELLAR…
                </p>
              </div>
            )}

            {/* Sections */}
            {textStatus === 'done' && sections.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-white/40 text-sm">No article content found in retrieved text.</p>
              </div>
            )}

            {textStatus === 'done' && sections.map((sec, i) => (
              <ArticleSection key={i} id={`sec-${i}`} section={sec} />
            ))}

            {/* Bottom: char count */}
            {textStatus === 'done' && text && (
              <p className="mt-12 text-center text-[10px] font-mono text-white/15">
                {text.length.toLocaleString()} characters · {sections.length} sections
              </p>
            )}
          </main>
        </div>
      )}

      {/* ── Summary error banner ──────────────────────────────────────────── */}
      {summaryError && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}
        >
          <span>⚠</span>
          <span>{summaryError}</span>
          <button onClick={() => setSummaryError(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Briefing note full-screen modal ──────────────────────────────── */}
      {summaryOpen && summary && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(10,15,30,0.97)', backdropFilter: 'blur(8px)' }}
        >
          {/* Modal header */}
          <div
            className="shrink-0 flex items-center gap-3 px-6 py-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
          >
            <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">
              Regulatory Briefing Note
            </span>

            {/* Source badge */}
            {summarySource && (
              summarySource === 'Full text' ? (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border font-semibold"
                     style={{ color: '#fca5a5', borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.12)' }}>
                  ● Full text
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border"
                     style={{ color: '#fcd34d', borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)' }}>
                  ⚠ {summarySource}
                </div>
              )
            )}

            {summaryModel && (
              <span className="text-[10px] font-mono text-white/20 truncate max-w-[180px]">{summaryModel}</span>
            )}

            <div className="ml-auto flex items-center gap-2">
              {/* Download .md */}
              <button
                onClick={() => {
                  const blob = new Blob([summary], { type: 'text/markdown' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `enel-briefing-${doc?.celex || workId.slice(0, 8)}.md`
                  a.click()
                }}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                style={{ color: '#93c5fd', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.22)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(59,130,246,0.12)'}
              >
                ↓ Download .md
              </button>
              {/* Close */}
              <button
                onClick={() => setSummaryOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-white/30 hover:text-white hover:bg-white/8"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Amber warning for non-full-text */}
          {summarySource && summarySource !== 'Full text' && (
            <div className="shrink-0 flex gap-3 px-6 py-3"
                 style={{ background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
              <span className="text-amber-400 shrink-0 text-sm mt-px">⚠</span>
              <p className="text-[12px] text-amber-200/70 leading-snug">
                Full document text was unavailable from CELLAR. This analysis is based on{' '}
                <strong className="text-amber-200">{summarySource.toLowerCase()}</strong> only — conclusions may be incomplete.
              </p>
            </div>
          )}

          {/* Scrollable briefing note */}
          <div className="overflow-y-auto flex-1 px-8 py-7 max-w-5xl mx-auto w-full">
            <BriefingNote text={summary} />
          </div>

          {/* Footer */}
          <div
            className="shrink-0 flex items-center justify-between px-6 py-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-[10px] font-mono text-white/20">
              ENEL Regulatory Affairs Research Unit · INTERNAL — FOR REGULATORY USE ONLY
            </span>
            <button
              onClick={() => setSummaryOpen(false)}
              className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
            >
              ← Back to document
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
