// ── Shared McKinsey-style briefing note renderer ──────────────────────────────
// Used in LegislationDetail modal AND PublicationSummary inline display.

// ── Priority / urgency pill ───────────────────────────────────────────────────
const PILL_MAP = {
  HIGH:         'bg-rose-500/15 text-rose-300 border-rose-500/30',
  MEDIUM:       'bg-amber-500/15 text-amber-300 border-amber-500/30',
  LOW:          'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  IMMEDIATE:    'bg-rose-500/15 text-rose-300 border-rose-500/30',
  'SHORT-TERM': 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  'MEDIUM-TERM':'bg-sky-500/15 text-sky-300 border-sky-500/30',
  MONITOR:      'bg-slate-500/15 text-slate-300 border-slate-500/30',
}

// ── Inline renderer: **bold**, *italic*, priority pills ───────────────────────
function R({ t }) {
  const tokens = t.split(/(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|\b(?:HIGH|MEDIUM|LOW|IMMEDIATE|SHORT-TERM|MEDIUM-TERM|MONITOR)\b)/)
  return <>
    {tokens.map((p, i) => {
      if (!p) return null
      if (p.startsWith('**') && p.endsWith('**'))
        return <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>
      if (p.startsWith('*') && p.endsWith('*'))
        return <em key={i} className="italic text-white/60">{p.slice(1, -1)}</em>
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
  const cells = (row) => row.split('|').slice(1, -1).map(c => c.trim())
  const headers = cells(rows[0])
  return (
    <div className="overflow-x-auto my-6 rounded-lg border border-white/10 shadow-lg">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ background: 'rgba(59,130,246,0.08)', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
            {headers.map((c, i) => (
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

// ── KV-line exclusions (render as paragraph, not metadata card) ───────────────
const KV_EXCLUDE = /^\*\*(What|Who|Deadline|ENEL|Revenue|Investment|Cost|Trading|Penalties|Relevance|Rationale|Urgency)/

// ── Main briefing note renderer ───────────────────────────────────────────────
export default function BriefingNote({ text }) {
  // Normalisation: inject newlines before headings and **Key:** pairs
  const normalised = text
    .replace(/\r\n/g, '\n')
    .replace(/(?<!\n)(#{1,4} )/g, '\n$1')
    .replace(/(?<!\n)(\*\*(Document|Reference|Type|Date|Issuing|Prepared|Classification):\*\*)/g, '\n$1')
  const lines = normalised.split('\n')
  const nodes = []
  let i = 0

  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trimEnd()
    const trimmed = line.trim()

    // ── blank line ────────────────────────────────────────────────────────────
    if (trimmed === '') { nodes.push(<div key={`sp${i}`} className="h-1" />); i++; continue }

    // ── noise lines ───────────────────────────────────────────────────────────
    if (/^[-_*]{1,}$/.test(trimmed) || /^#{1,4}$/.test(trimmed) || trimmed === '📋') { i++; continue }

    // ── REGULATORY BRIEFING NOTE banner ──────────────────────────────────────
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

    // ── Any heading level ─────────────────────────────────────────────────────
    if (/^#{1,4}\s/.test(line)) {
      const title = line.replace(/^#{1,4}\s*/, '').replace(/^📋\s*/, '').trim()
      const numMatch = title.match(/^(\d+)\.?\s+/)
      const num = numMatch ? parseInt(numMatch[1]) - 1 : 0
      const acc = SECTION_ACCENTS[Math.max(0, num) % SECTION_ACCENTS.length]
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

    // ── Pipe table ────────────────────────────────────────────────────────────
    if (trimmed.startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].trim().startsWith('|')) { tableLines.push(lines[i]); i++ }
      nodes.push(<BriefingTable key={`tbl${i}`} lines={tableLines} />)
      continue
    }

    // ── **Key:** Value metadata card ──────────────────────────────────────────
    if (/^\*\*[^*]+:\*\*/.test(trimmed) && !KV_EXCLUDE.test(trimmed)) {
      const kvLines = []
      while (i < lines.length && /^\*\*[^*]+:\*\*/.test(lines[i].trim()) && !KV_EXCLUDE.test(lines[i].trim())) {
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
      while (i < lines.length && /^(\s*)[-*]\s*/.test(lines[i])) {
        const ind = lines[i].match(/^(\s*)/)[1].length
        const t = lines[i].replace(/^\s*[-*]\s*/, '').trim()
        if (t) items.push({ t, lvl: Math.round((ind - baseIndent) / 2) })
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
              <span className="shrink-0 text-[10px] font-mono font-bold text-blue-400/60 w-5 text-right pt-0.5">{ii + 1}.</span>
              <span><R t={item} /></span>
            </li>
          ))}
        </ol>
      )
      continue
    }

    // ── **Bold key:** value lines (KV_EXCLUDE group) → bulleted with blue dot ──
    // These are inline KV pairs like "**What it requires:** ..." that should
    // render consistently with the rest of the bullet list, not as bare paragraphs.
    if (/^\*\*[^*]+:\*\*/.test(trimmed)) {
      const items = []
      while (i < lines.length && /^\*\*[^*]+:\*\*/.test(lines[i].trim())) {
        items.push(lines[i].trim()); i++
      }
      nodes.push(
        <ul key={`kvb${i}`} className="my-1.5 space-y-2">
          {items.map((item, ii) => (
            <li key={ii} className="flex gap-3 text-[13px] text-white/72 leading-relaxed">
              <span className="shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full" style={{ background: '#3b82f6', flexShrink: 0 }} />
              <span><R t={item} /></span>
            </li>
          ))}
        </ul>
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
