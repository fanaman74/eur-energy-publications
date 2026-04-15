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

// ── Priority / urgency pill ───────────────────────────────────────────────────
const PILL_MAP = {
  HIGH:        'bg-rose-500/15 text-rose-300 border-rose-500/30',
  MEDIUM:      'bg-amber-500/15 text-amber-300 border-amber-500/30',
  LOW:         'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  IMMEDIATE:   'bg-rose-500/15 text-rose-300 border-rose-500/30',
  'SHORT-TERM':'bg-orange-500/15 text-orange-300 border-orange-500/30',
  'MEDIUM-TERM':'bg-sky-500/15 text-sky-300 border-sky-500/30',
  MONITOR:     'bg-slate-500/15 text-slate-300 border-slate-500/30',
}
const PILL_RE = /\b(HIGH|MEDIUM|LOW|IMMEDIATE|SHORT-TERM|MEDIUM-TERM|MONITOR)\b/g

// ── Inline renderer: **bold**, *italic*, priority pills ───────────────────────
function R({ t }) {
  // Split on bold, italic, and priority keywords
  const tokens = t.split(/(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|\b(?:HIGH|MEDIUM|LOW|IMMEDIATE|SHORT-TERM|MEDIUM-TERM|MONITOR)\b)/)
  return <>
    {tokens.map((p, i) => {
      if (!p) return null
      if (p.startsWith('**') && p.endsWith('**'))
        return <strong key={i} className="font-semibold text-white">{p.slice(2,-2)}</strong>
      if (p.startsWith('*') && p.endsWith('*'))
        return <em key={i} className="italic text-white/60">{p.slice(1,-1)}</em>
      if (PILL_MAP[p])
        return <span key={i} className={`inline-block mx-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${PILL_MAP[p]}`}>{p}</span>
      return p
    })}
  </>
}

// ── Pipe-table renderer ───────────────────────────────────────────────────────
function BriefingTable({ lines }) {
  const rows = lines.filter(l => !/^\|\s*[-:]+[\s|:-]*\|?\s*$/.test(l.trim()))
  if (rows.length < 2) return null
  const cells = (row) => row.split('|').slice(1,-1).map(c => c.trim())
  const headers = cells(rows[0])
  return (
    <div className="overflow-x-auto my-6 rounded-lg border border-white/10 shadow-lg">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ background: 'rgba(59,130,246,0.08)', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
            {headers.map((c,i) => (
              <th key={i} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-blue-300/70 font-mono whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, ri) => (
            <tr key={ri} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                className="hover:bg-white/3 transition-colors">
              {cells(row).map((c, ci) => (
                <td key={ci} className={`px-4 py-3 align-top text-white/75 leading-relaxed ${ci === 0 ? 'font-medium text-white/90 whitespace-nowrap' : ''}`}>
                  <R t={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Section accent colours (10 sections) ─────────────────────────────────────
const SECTION_ACCENTS = [
  { bar: '#3b82f6', num: 'text-blue-400',    bg: 'rgba(59,130,246,0.06)'  },
  { bar: '#8b5cf6', num: 'text-violet-400',  bg: 'rgba(139,92,246,0.06)' },
  { bar: '#f59e0b', num: 'text-amber-400',   bg: 'rgba(245,158,11,0.06)' },
  { bar: '#10b981', num: 'text-emerald-400', bg: 'rgba(16,185,129,0.06)' },
  { bar: '#f43f5e', num: 'text-rose-400',    bg: 'rgba(244,63,94,0.06)'  },
  { bar: '#0ea5e9', num: 'text-sky-400',     bg: 'rgba(14,165,233,0.06)' },
  { bar: '#14b8a6', num: 'text-teal-400',    bg: 'rgba(20,184,166,0.06)' },
  { bar: '#f97316', num: 'text-orange-400',  bg: 'rgba(249,115,22,0.06)' },
  { bar: '#a855f7', num: 'text-purple-400',  bg: 'rgba(168,85,247,0.06)' },
  { bar: '#ec4899', num: 'text-pink-400',    bg: 'rgba(236,72,153,0.06)' },
]

// ── Main briefing note renderer ───────────────────────────────────────────────
function BriefingNote({ text }) {
  // Extra normalisation pass inside the renderer as a safety net
  const normalised = text
    .replace(/\r\n/g, '\n')
    .replace(/(?<!\n)(#{1,4} )/g, '\n$1')
    .replace(/(?<!\n)(\*\*(Document|Reference|Type|Date|Issuing|Prepared|Classification):\*\*)/g, '\n$1')
  const lines = normalised.split('\n')
  const nodes = []
  let i = 0
  let inKvBlock = false

  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trimEnd()
    const trimmed = line.trim()

    // ── blank line ────────────────────────────────────────────────────────────
    if (trimmed === '') { nodes.push(<div key={`sp${i}`} className="h-1" />); i++; continue }

    // ── noise lines: ---, ___, bare #, 📋 alone ──────────────────────────────
    if (/^[-_*]{2,}$/.test(trimmed) || /^#{1,4}$/.test(trimmed) || trimmed === '📋') { i++; continue }

    // ── REGULATORY BRIEFING NOTE banner (any heading level) ──────────────────
    if (/^#{1,4}\s+.*REGULATORY BRIEFING NOTE/i.test(line)) {
      nodes.push(
        <div key={`bnr${i}`} className="mb-8 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest"
                 style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.20)', color: '#93c5fd' }}>
              ✦ ENEL S.p.A.
            </div>
            <span className="text-[10px] font-mono text-white/20">Regulatory Affairs Research Unit</span>
            <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded"
                  style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.20)', color: '#fca5a5' }}>
              INTERNAL
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">
            📋 Regulatory Briefing Note
          </h1>
        </div>
      )
      i++; continue
    }

    // ── Any heading level (#, ##, ###, ####) → section block ─────────────────
    if (/^#{1,4}\s/.test(line)) {
      const title = line.replace(/^#{1,4}\s*/, '').replace(/^📋\s*/, '').trim()
      const numMatch = title.match(/^(\d+)\.?\s+/)
      const num = numMatch ? parseInt(numMatch[1]) - 1 : 0
      const acc = SECTION_ACCENTS[Math.max(0, num) % SECTION_ACCENTS.length]
      // sub-headings (####) rendered smaller
      const isSubHead = /^####/.test(line)
      if (isSubHead) {
        nodes.push(
          <h4 key={`h4${i}`} className="text-[11px] font-bold uppercase tracking-widest text-white/50 mt-5 mb-2">
            <R t={title} />
          </h4>
        )
      } else {
        nodes.push(
          <div key={`sec${i}`} className="mt-10 mb-4 flex items-stretch gap-0 rounded-lg overflow-hidden"
               style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-1 shrink-0 rounded-l-lg" style={{ background: acc.bar }} />
            <div className="flex items-center gap-3 px-4 py-3 flex-1" style={{ background: acc.bg }}>
              {numMatch && (
                <span className={`text-[22px] font-black leading-none ${acc.num} opacity-30 font-mono`}>
                  {numMatch[1]}
                </span>
              )}
              <span className="text-xs font-bold uppercase tracking-widest text-white/80">
                {title.replace(/^\d+\.?\s*/, '')}
              </span>
            </div>
          </div>
        )
      }
      i++; continue
    }

    // ── H2 (kept as fallback for any ## that slipped through) ────────────────
    if (/^##\s/.test(line)) {
      nodes.push(
        <h2 key={`h2${i}`} className="text-sm font-bold text-white/90 mt-6 mb-2 pb-1"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <R t={line.replace(/^##\s*/, '')} />
        </h2>
      )
      i++; continue
    }

    // ── Pipe table ────────────────────────────────────────────────────────────
    if (trimmed.startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].trim().startsWith('|')) { tableLines.push(lines[i]); i++ }
      nodes.push(<BriefingTable key={`tbl${i}`} lines={tableLines} />)
      continue
    }

    // ── **Key:** Value metadata card ──────────────────────────────────────────
    if (/^\*\*[^*]+:\*\*/.test(trimmed) && !trimmed.startsWith('**What') && !trimmed.startsWith('**Who') && !trimmed.startsWith('**Deadline') && !trimmed.startsWith('**ENEL') && !trimmed.startsWith('**Revenue') && !trimmed.startsWith('**Investment') && !trimmed.startsWith('**Cost') && !trimmed.startsWith('**Trading') && !trimmed.startsWith('**Penalties') && !trimmed.startsWith('**Relevance') && !trimmed.startsWith('**Rationale') && !trimmed.startsWith('**Urgency')) {
      const kvLines = []
      while (i < lines.length && /^\*\*[^*]+:\*\*/.test(lines[i].trim()) && !lines[i].trim().startsWith('**What') && !lines[i].trim().startsWith('**Who') && !lines[i].trim().startsWith('**Deadline') && !lines[i].trim().startsWith('**ENEL') && !lines[i].trim().startsWith('**Revenue') && !lines[i].trim().startsWith('**Investment') && !lines[i].trim().startsWith('**Cost') && !lines[i].trim().startsWith('**Trading') && !lines[i].trim().startsWith('**Penalties') && !lines[i].trim().startsWith('**Relevance') && !lines[i].trim().startsWith('**Rationale') && !lines[i].trim().startsWith('**Urgency')) {
        kvLines.push(lines[i].trim()); i++
      }
      if (kvLines.length > 0) {
        nodes.push(
          <div key={`kv${i}`} className="rounded-lg overflow-hidden my-5"
               style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            {kvLines.map((kv, ki) => {
              const m = kv.match(/^\*\*([^*]+):\*\*\s*(.*)$/)
              if (!m) return null
              return (
                <div key={ki} className="flex gap-0"
                     style={{ borderTop: ki > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined }}>
                  <div className="w-44 shrink-0 px-4 py-2.5 text-[10px] font-mono uppercase tracking-wide text-white/30 flex items-start pt-3"
                       style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {m[1]}
                  </div>
                  <div className="flex-1 px-4 py-2.5 text-xs text-white/80 leading-relaxed border-l"
                       style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <R t={m[2]} />
                  </div>
                </div>
              )
            })}
          </div>
        )
        continue
      }
    }

    // ── Bullet list ───────────────────────────────────────────────────────────
    if (/^(\s*)[-*]\s/.test(line)) {
      const baseIndent = line.match(/^(\s*)/)[1].length
      const items = []
      while (i < lines.length && /^(\s*)[-*]\s/.test(lines[i])) {
        const ind = lines[i].match(/^(\s*)/)[1].length
        items.push({ t: lines[i].replace(/^\s*[-*]\s/, ''), lvl: Math.round((ind - baseIndent) / 2) })
        i++
      }
      nodes.push(
        <ul key={`ul${i}`} className="my-4 space-y-1.5">
          {items.map((item, ii) => (
            <li key={ii} className="flex gap-3 text-[13px] text-white/72 leading-relaxed"
                style={{ paddingLeft: `${item.lvl * 18}px` }}>
              <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full"
                    style={{ background: item.lvl === 0 ? '#3b82f6' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
              <span><R t={item.t} /></span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // ── Numbered list ─────────────────────────────────────────────────────────
    if (/^\d+\.\s/.test(trimmed)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].replace(/^\d+\.\s/, '').trim()); i++
      }
      nodes.push(
        <ol key={`ol${i}`} className="my-4 space-y-2 list-none">
          {items.map((item, ii) => (
            <li key={ii} className="flex gap-3 text-[13px] text-white/72 leading-relaxed">
              <span className="shrink-0 text-[10px] font-mono font-bold text-blue-400/60 w-5 text-right pt-0.5">{ii+1}.</span>
              <span><R t={item} /></span>
            </li>
          ))}
        </ol>
      )
      continue
    }

    // ── Paragraph ─────────────────────────────────────────────────────────────
    nodes.push(
      <p key={`p${i}`} className="text-[13px] text-white/72 leading-[1.75] my-2">
        <R t={line} />
      </p>
    )
    i++
  }

  return <div>{nodes}</div>
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
  const [summarySource, setSummarySource] = useState(null)
  const [summaryStatus, setSummaryStatus] = useState('idle') // idle | loading | done | error
  const [summaryError, setSummaryError] = useState(null)
  const [summaryModalOpen, setSummaryModalOpen] = useState(false)
  const [summaryStep, setSummaryStep] = useState('')  // progress label shown while loading

  const [fullText, setFullText] = useState(null)
  const [fullTextStatus, setFullTextStatus] = useState('idle')
  const [fullTextOpen, setFullTextOpen] = useState(false)
  useDocumentTitle(doc ? doc.title.slice(0, 60) + '…' : 'EUR-Lex · Detail')

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setSummary(null)
    setSummaryStatus('idle')
    setSummaryError(null)
    setFullText(null)
    setFullTextStatus('idle')
    setFullTextOpen(false)
    fetchLegislationDetail(workId, { signal: controller.signal })
      .then((d) => { setDoc(d); setStatus('done') })
      .catch((e) => { if (e.name !== 'AbortError') setStatus('error') })
    return () => controller.abort()
  }, [workId])

  async function handleSummarise() {
    if (!doc || summaryStatus === 'loading') return
    if (summaryStatus === 'done' && summary) { setSummaryModalOpen(true); return }
    setSummaryStatus('loading')
    setSummaryError(null)
    try {
      setSummaryStep('Fetching full text from CELLAR…')
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: doc.title,
          date: doc.date,
          type: doc.typeLabel,
          celex: doc.celex || null,
          subjects: doc.subjects,
          agents: doc.agents.map(a => a.label),
          abstract: doc.abstract || null,
          workId,
        }),
      })
      setSummaryStep('Generating briefing note…')
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
      // Normalise: some models output without newlines — inject them before headings
      const raw = data.summary || ''
      console.log('[summary] first 200 chars:', JSON.stringify(raw.slice(0, 200)))
      const normalised = raw
        .replace(/\r\n/g, '\n')
        .replace(/(?<!\n)(#{1,4} )/g, '\n$1')        // ensure newline before any heading
        .replace(/(?<!\n)(\*\*[A-Z][^*]{0,40}:\*\*)/g, '\n$1') // ensure newline before **Key:** pairs
        .replace(/\n{3,}/g, '\n\n')                  // collapse excessive blank lines
        .trim()
      setSummary(normalised)
      setSummaryModel(data.model || null)
      setSummarySource(data.source || null)
      setSummaryStatus('done')
      setSummaryModalOpen(true)
    } catch (e) {
      setSummaryError(e.message)
      setSummaryStatus('error')
    }
  }

  async function handleLoadFullText() {
    if (fullTextStatus === 'loading') return
    if (fullTextStatus === 'done') { setFullTextOpen(o => !o); return }
    setFullTextOpen(true)
    setFullTextStatus('loading')
    try {
      // Server proxy forwards our browser's real headers (sec-ch-ua, UA, Sec-Fetch-*)
      // to publications.europa.eu, which requires them to serve content.
      const res = await fetch(`/api/fulltext/${encodeURIComponent(workId)}`)
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
      setFullText(data.text)
      setFullTextStatus('done')
    } catch (e) {
      setFullTextStatus('error')
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

      {/* ── AI Summary button ── */}
      <div className="flex flex-col items-center gap-3 mb-10">
        <button
          onClick={handleSummarise}
          disabled={summaryStatus === 'loading'}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-primary/40 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 hover:border-primary/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {summaryStatus === 'loading' ? (
            <>
              <span className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              {summaryStep || 'Working…'}
            </>
          ) : (
            <>
              <span>✦</span>
              {summaryStatus === 'done' ? 'View AI Summary' : 'Summarise with AI'}
            </>
          )}
        </button>
        {summaryStatus === 'error' && (
          <p className="text-xs text-rose-400">
            {summaryError || 'Summary failed.'}{' '}
            <button onClick={() => setSummaryStatus('idle')} className="underline hover:text-rose-300">Try again</button>
          </p>
        )}
      </div>

      {/* ── Regulatory Briefing Note modal ── */}
      {summaryModalOpen && summary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(2,4,12,0.92)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setSummaryModalOpen(false) }}
        >
          <div
            className="relative w-full max-w-4xl flex flex-col rounded-2xl overflow-hidden"
            style={{
              maxHeight: 'calc(100vh - 2rem)',
              background: 'linear-gradient(160deg, #0e1623 0%, #0a0f1c 100%)',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(59,130,246,0.08)',
            }}
          >
            {/* ── Top bar ── */}
            <div className="shrink-0 flex items-center gap-3 px-5 py-3.5"
                 style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(59,130,246,0.04)' }}>
              {/* Logo mark */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-5 h-5 rounded flex items-center justify-center text-[10px]"
                     style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                  ✦
                </div>
                <span className="text-[11px] font-bold text-white/70 tracking-wide">ENEL</span>
                <span className="text-white/20 text-[10px]">/</span>
                <span className="text-[11px] text-white/40">Regulatory Briefing</span>
              </div>

              {/* Source badge */}
              {summarySource && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono border ${
                  summarySource === 'Full text'
                    ? 'text-emerald-300 border-emerald-400/25 bg-emerald-400/8'
                    : 'text-amber-300 border-amber-400/25 bg-amber-400/8'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${summarySource === 'Full text' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {summarySource}
                </div>
              )}

              {summaryModel && (
                <span className="text-[10px] font-mono text-white/20 hidden sm:block truncate max-w-[180px]">{summaryModel}</span>
              )}

              <div className="ml-auto flex items-center gap-2">
                {/* Download */}
                <button
                  onClick={() => {
                    const blob = new Blob([summary], { type: 'text/markdown' })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = `enel-briefing-${doc.celex || workId.slice(0,8)}.md`
                    a.click()
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                  style={{ color: '#93c5fd', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(59,130,246,0.22)'}
                  onMouseLeave={e => e.currentTarget.style.background='rgba(59,130,246,0.12)'}
                >
                  ↓ Download .md
                </button>
                {/* Close */}
                <button
                  onClick={() => setSummaryModalOpen(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-white/30 hover:text-white hover:bg-white/8"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* ── Amber warning (metadata-only analysis) ── */}
            {summarySource && summarySource !== 'Full text' && (
              <div className="shrink-0 flex gap-3 px-6 py-3"
                   style={{ background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
                <span className="text-amber-400 shrink-0 text-sm mt-px">⚠</span>
                <p className="text-[12px] text-amber-200/70 leading-snug">
                  Full document text was unavailable from CELLAR. This analysis is based on <strong className="text-amber-200">{summarySource.toLowerCase()}</strong> only — conclusions may be incomplete.
                </p>
              </div>
            )}

            {/* ── Scrollable body ── */}
            <div className="overflow-y-auto flex-1 px-8 py-7">
              <BriefingNote text={summary} />
            </div>

            {/* ── Footer ── */}
            <div className="shrink-0 flex items-center justify-between px-6 py-3"
                 style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
              <button
                onClick={() => { setSummary(null); setSummaryStatus('idle'); setSummarySource(null); setSummaryModalOpen(false) }}
                className="text-[11px] text-white/20 hover:text-rose-400 transition-colors"
              >
                ↺ Regenerate
              </button>
              <div className="flex items-center gap-4">
                <a href={eurLink} target="_blank" rel="noreferrer"
                   className="text-[11px] text-white/30 hover:text-blue-400 transition-colors">
                  EUR-Lex ↗
                </a>
                <span className="text-[10px] font-mono text-white/12 hidden sm:block">
                  INTERNAL — FOR REGULATORY USE ONLY
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

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
          {/* Full text */}
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={handleLoadFullText}
              className="w-full flex items-center justify-between px-5 py-3 bg-surface2 hover:bg-surface transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-widest text-muted font-mono">Full text</span>
                {fullTextStatus === 'loading' && (
                  <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                )}
                {fullTextStatus === 'done' && fullText && (
                  <span className="text-[10px] text-muted font-mono">{(fullText.length / 1000).toFixed(0)}k chars</span>
                )}
              </div>
              <span className="text-muted text-sm" style={{ display: 'inline-block', transition: 'transform 0.2s', transform: fullTextOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
            </button>

            {fullTextOpen && (
              <div className="border-t border-border">
                {fullTextStatus === 'loading' && (
                  <p className="px-5 py-6 text-sm text-muted text-center">Fetching from CELLAR…</p>
                )}
                {fullTextStatus === 'done' && fullText && (
                  <div>
                    <pre className="px-5 py-5 text-xs text-text/80 font-mono leading-relaxed whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
                      {fullText}
                    </pre>
                    <div className="px-5 py-3 border-t border-border bg-surface2/80 flex items-center justify-between">
                      <span className="text-[10px] text-muted font-mono">{(fullText.length / 1000).toFixed(1)}k chars · CELLAR content negotiation</span>
                      <a href={eurLink} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline font-mono">Open on EUR-Lex ↗</a>
                    </div>
                  </div>
                )}
                {(fullTextStatus === 'error' || (fullTextStatus === 'done' && !fullText)) && (
                  <div className="px-5 py-6 flex flex-col items-center gap-4 text-center">
                    {doc.abstract && (
                      <div className="w-full text-left mb-2">
                        <p className="text-[10px] uppercase tracking-widest text-muted font-mono mb-2">Abstract · from CELLAR</p>
                        <p className="text-sm text-text/85 leading-relaxed">{doc.abstract}</p>
                      </div>
                    )}
                    {!doc.abstract && <p className="text-sm text-muted">Full text not available via CELLAR content negotiation.</p>}
                    <a href={eurLink} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 transition-colors">
                      Read full text on EUR-Lex ↗
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
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
