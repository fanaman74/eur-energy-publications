import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fetchLegislationDetail, LEG_TYPES } from '../api/eurLex'
import { formatDate, eurLexUrl, opDetailUrl, shortId } from '../utils/formatters'
import Spinner from '../components/ui/Spinner'
import BriefingNote from '../components/publications/BriefingNote'

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
  const [summarySource, setSummarySource] = useState(null)
  const [summaryStatus, setSummaryStatus] = useState('idle') // idle | loading | done | error
  const [summaryError, setSummaryError] = useState(null)
  const [summaryModalOpen, setSummaryModalOpen] = useState(false)
  const [summaryStep, setSummaryStep] = useState('')  // progress label shown while loading
  const [slideExporting, setSlideExporting] = useState(false)

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

  // ── PowerPoint slide export ──────────────────────────────────────────────────
  async function handleExportSlide() {
    if (slideExporting || !summary || !doc) return
    setSlideExporting(true)
    try {
      // Load pptxgenjs from CDN on demand
      if (!window.PptxGenJS) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js'
          s.onload = resolve; s.onerror = reject
          document.head.appendChild(s)
        })
      }

      // ── Ask AI to structure slide content from the briefing note ─────────────
      let slideData = null
      try {
        const aiRes = await fetch('/api/slide-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary,
            title: doc.title,
            date: doc.date,
            type: doc.typeLabel,
            celex: doc.celex || null,
          }),
        })
        if (aiRes.ok) {
          const aiJson = await aiRes.json()
          slideData = aiJson.slide || null
        }
      } catch (e) {
        console.warn('[slide-content] AI call failed, falling back to regex parse:', e.message)
      }

      // ── Regex fallback if AI call fails ──────────────────────────────────────
      if (!slideData) {
        function extractSectionBullets(text, keywords) {
          const lines = text.split('\n')
          const result = []
          let inSection = false
          for (const t of lines.map(l => l.trim())) {
            if (/^#{1,4}\s/.test(t)) {
              const heading = t.replace(/^#{1,4}\s*/, '').toUpperCase()
              inSection = keywords.some(k => heading.includes(k.toUpperCase()))
              continue
            }
            if (inSection) {
              const bullet = t.replace(/^\s*[-*]\s*/, '').replace(/^\*\*([^*]+):\*\*\s*/, '').replace(/\*\*/g, '').trim()
              if (bullet && bullet.length > 10) result.push(bullet)
            }
          }
          return result.slice(0, 4)
        }
        const exec    = extractSectionBullets(summary, ['EXECUTIVE', 'OVERVIEW', 'SUMMARY'])
        const risks   = extractSectionBullets(summary, ['RISK', 'IMPACT', 'LEGAL', 'COMPLIANCE'])
        const actions = extractSectionBullets(summary, ['ACTION', 'RECOMMENDATION', 'ENEL', 'STRATEGIC', 'REQUIRED'])
        slideData = {
          title: doc.title,
          subtitle: `${doc.typeLabel || 'Publication'} · ${formatDate(doc.date)}${doc.celex ? ' · ' + doc.celex : ''}`,
          issuing_body: doc.agents?.map(a => a.label).join(', ') || '',
          relevance: 'MEDIUM', urgency: 'MONITOR',
          columns: [
            { label: 'EXECUTIVE SUMMARY', theme: 'blue',  bullets: exec.length   ? exec   : ['See full briefing note for details.'] },
            { label: 'KEY RISKS & IMPACT', theme: 'amber', bullets: risks.length  ? risks  : ['Review full briefing note.'] },
            { label: 'REQUIRED ACTIONS',  theme: 'green', bullets: actions.length ? actions : ['Consult Regulatory Affairs team.'] },
          ],
          footer_note: '',
        }
      }

      const exec    = slideData.columns[0]?.bullets || []
      const risks   = slideData.columns[1]?.bullets || []
      const actions = slideData.columns[2]?.bullets || []

      // ── Build PPTX ───────────────────────────────────────────────────────────
      // eslint-disable-next-line no-undef
      const pptx = new PptxGenJS()
      pptx.layout = 'LAYOUT_WIDE'   // 13.33" × 7.5"
      pptx.author = 'ENEL Regulatory Affairs Research Unit'
      pptx.company = 'ENEL S.p.A.'
      pptx.subject = doc.title

      const slide = pptx.addSlide()

      // Background
      slide.background = { color: '0a0f1e' }

      // Left accent gradient bar (simulated with two rects)
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.08, h: 7.5, fill: { color: '3b82f6' } })

      // ── HEADER BAR ──────────────────────────────────────────────────────────
      // Header background
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.5, fill: { color: '0d1629' }, line: { color: '1e2d4a', width: 0.5 } })

      // ENEL mark
      slide.addText('✦ ENEL S.p.A.  /  Regulatory Affairs Research Unit', {
        x: 0.2, y: 0.08, w: 7, h: 0.3,
        fontSize: 7, bold: true, color: '93c5fd',
        fontFace: 'Calibri', charSpacing: 1,
      })

      // Date
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      slide.addText(today, {
        x: 9.5, y: 0.08, w: 1.8, h: 0.3,
        fontSize: 7, color: '4b5d80', align: 'right', fontFace: 'Calibri',
      })

      // INTERNAL badge
      slide.addShape(pptx.ShapeType.rect, { x: 11.5, y: 0.1, w: 1.6, h: 0.28, fill: { color: '3d0d17' }, line: { color: '7f1d2e', width: 0.5 }, rounding: true })
      slide.addText('INTERNAL — CONFIDENTIAL', {
        x: 11.5, y: 0.1, w: 1.6, h: 0.28,
        fontSize: 6, bold: true, color: 'fca5a5', align: 'center', fontFace: 'Calibri', charSpacing: 0.5,
      })

      // ── TITLE ZONE ──────────────────────────────────────────────────────────
      // Type pill background
      slide.addShape(pptx.ShapeType.rect, { x: 0.2, y: 0.58, w: 1.6, h: 0.22, fill: { color: '1e1040' }, line: { color: '5b21b6', width: 0.5 }, rounding: true })
      slide.addText((doc.typeLabel || 'Publication').toUpperCase(), {
        x: 0.2, y: 0.58, w: 1.6, h: 0.22,
        fontSize: 6, bold: true, color: 'c4b5fd', align: 'center', fontFace: 'Calibri', charSpacing: 0.8,
      })

      // Date text
      if (doc.date) {
        slide.addText(formatDate(doc.date) + (doc.celex ? `  ·  ${doc.celex}` : ''), {
          x: 2.0, y: 0.58, w: 11, h: 0.22,
          fontSize: 7, color: '4b5d80', fontFace: 'Calibri', valign: 'middle',
        })
      }

      // Document title — use AI-rewritten title if available, else original
      const rawTitle = slideData.title || doc.title
      const titleText = rawTitle.length > 130 ? rawTitle.slice(0, 127) + '…' : rawTitle
      slide.addText(titleText, {
        x: 0.2, y: 0.85, w: 12.9, h: 0.9,
        fontSize: 14, bold: true, color: 'FFFFFF',
        fontFace: 'Calibri', charSpacing: -0.2,
        wrap: true, valign: 'top',
      })

      // Separator line
      slide.addShape(pptx.ShapeType.line, { x: 0.2, y: 1.78, w: 12.9, h: 0, line: { color: '1e2d4a', width: 0.75 } })

      // ── THREE COLUMNS ────────────────────────────────────────────────────────
      const cols = [
        { x: 0.2,   w: 4.1, color: '3b82f6', label: 'EXECUTIVE SUMMARY',  labelColor: '93c5fd', bullets: exec },
        { x: 4.55,  w: 4.1, color: 'f59e0b', label: 'KEY RISKS & IMPACT',  labelColor: 'fcd34d', bullets: risks },
        { x: 8.9,   w: 4.25, color: '10b981', label: 'REQUIRED ACTIONS',  labelColor: '6ee7b7', bullets: actions },
      ]

      const colTop = 1.88
      const colH = 4.9

      cols.forEach(({ x, w, color, label, labelColor, bullets }) => {
        // Column background
        slide.addShape(pptx.ShapeType.rect, { x, y: colTop, w, h: colH, fill: { color: '0d1629', transparency: 40 }, line: { color: '1e2d4a', width: 0.5 } })

        // Top accent bar
        slide.addShape(pptx.ShapeType.rect, { x, y: colTop, w, h: 0.08, fill: { color } })

        // Column label
        slide.addText(label, {
          x: x + 0.12, y: colTop + 0.12, w: w - 0.24, h: 0.28,
          fontSize: 7, bold: true, color: labelColor,
          fontFace: 'Calibri', charSpacing: 1.5,
        })

        // Bullet items
        const bulletY = colTop + 0.5
        const maxBullets = Math.min(bullets.length, 4)
        const bulletH = (colH - 0.6) / Math.max(maxBullets, 1)

        bullets.slice(0, 4).forEach((text, bi) => {
          // Bullet dot
          slide.addShape(pptx.ShapeType.ellipse, {
            x: x + 0.12, y: bulletY + bi * bulletH + 0.05, w: 0.06, h: 0.06,
            fill: { color }, line: { color, width: 0 },
          })
          // Bullet text
          slide.addText(text.replace(/\*\*/g, ''), {
            x: x + 0.24, y: bulletY + bi * bulletH, w: w - 0.36, h: bulletH,
            fontSize: 8.5, color: 'b0c4e4',
            fontFace: 'Calibri', wrap: true, valign: 'top',
            paraSpaceAfter: 2,
          })
        })
      })

      // ── FOOTER ──────────────────────────────────────────────────────────────
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.1, w: 13.33, h: 0.4, fill: { color: '060b14' }, line: { color: '1e2d4a', width: 0.5 } })
      // AI footer note (key deadline / compliance point) or attribution fallback
      const footerLeft = slideData.footer_note
        ? slideData.footer_note
        : 'Prepared by ENEL Regulatory Affairs Research Unit  ·  EU Energy Explorer  ·  For regulatory use only'
      slide.addText(footerLeft, {
        x: 0.2, y: 7.12, w: 10.5, h: 0.3,
        fontSize: 6.5, color: slideData.footer_note ? 'fcd34d' : '2d4a7a', fontFace: 'Calibri',
      })
      // Relevance + urgency badge
      const badge = `${slideData.relevance || ''}  ·  ${slideData.urgency || ''}  ·  1 / 1`
      slide.addText(badge, {
        x: 10.5, y: 7.12, w: 2.6, h: 0.3,
        fontSize: 6, color: '2d4a7a', fontFace: 'Calibri', align: 'right',
      })

      await pptx.writeFile({ fileName: `enel-briefing-${doc.celex || workId.slice(0, 8)}.pptx` })
    } catch (err) {
      console.error('[slide export]', err)
      alert('Slide export failed. See console for details.')
    } finally {
      setSlideExporting(false)
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
        <h1 className="font-display text-base font-semibold text-text leading-snug">
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
                {/* Export Slide (.pptx) */}
                <button
                  onClick={handleExportSlide}
                  disabled={slideExporting}
                  title="Export McKinsey-style PowerPoint slide"
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: '#6ee7b7', background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.22)' }}
                  onMouseEnter={e => { if (!slideExporting) e.currentTarget.style.background='rgba(16,185,129,0.20)' }}
                  onMouseLeave={e => e.currentTarget.style.background='rgba(16,185,129,0.10)'}
                >
                  {slideExporting ? (
                    <>
                      <span className="h-2.5 w-2.5 rounded-full border border-emerald-400 border-t-transparent animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>▣ Export Slide</>
                  )}
                </button>

                {/* Download .md */}
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
