import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import PublicationBadge from './PublicationBadge'
import { formatDate, shortId, truncate, opDetailUrl } from '../../utils/formatters'

const ROW_BG = {
  Report: 'bg-blue-500/5 hover:bg-blue-500/10',
  Study: 'bg-amber-500/5 hover:bg-amber-500/10',
  Brochure: 'bg-emerald-500/5 hover:bg-emerald-500/10',
  'Press release': 'bg-rose-500/5 hover:bg-rose-500/10',
  Factsheet: 'bg-violet-500/5 hover:bg-violet-500/10',
  'Working document': 'bg-slate-500/5 hover:bg-slate-500/10',
  Publication: 'bg-primary/5 hover:bg-primary/10',
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function Bubble({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-mono transition-all border ${
        active
          ? 'bg-primary border-primary text-white'
          : 'border-border text-muted hover:border-primary/50 hover:text-text'
      }`}
    >
      {label}
    </button>
  )
}

export default function PublicationTable({ results }) {
  const pool = results.slice(0, 50) // work from a wider pool before filtering
  const [activeYear, setActiveYear] = useState(null)
  const [activeMonth, setActiveMonth] = useState(null)

  // Derive available years and months from all results
  const { years, months } = useMemo(() => {
    const ySet = new Set()
    const mMap = {} // year → Set of month indices
    for (const pub of pool) {
      if (!pub.date) continue
      const d = new Date(pub.date)
      if (isNaN(d)) continue
      const y = d.getFullYear()
      const m = d.getMonth()
      ySet.add(y)
      if (!mMap[y]) mMap[y] = new Set()
      mMap[y].add(m)
    }
    const years = [...ySet].sort((a, b) => b - a)
    const months = activeYear && mMap[activeYear]
      ? [...mMap[activeYear]].sort((a, b) => b - a)
      : []
    return { years, months }
  }, [pool, activeYear])

  const rows = useMemo(() => {
    return pool.filter((pub) => {
      if (!activeYear && !activeMonth) return true
      if (!pub.date) return false
      const d = new Date(pub.date)
      if (isNaN(d)) return false
      if (activeYear && d.getFullYear() !== activeYear) return false
      if (activeMonth !== null && d.getMonth() !== activeMonth) return false
      return true
    }).slice(0, 15)
  }, [pool, activeYear, activeMonth])

  if (!pool.length) return null

  function selectYear(y) {
    if (activeYear === y) {
      setActiveYear(null)
      setActiveMonth(null)
    } else {
      setActiveYear(y)
      setActiveMonth(null)
    }
  }

  function selectMonth(m) {
    setActiveMonth(activeMonth === m ? null : m)
  }

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl flex items-center gap-2">
          <span className="text-accent" aria-hidden>★</span>
          Latest publications
        </h2>
        {(activeYear || activeMonth !== null) && (
          <button
            onClick={() => { setActiveYear(null); setActiveMonth(null) }}
            className="text-xs text-muted hover:text-text transition-colors"
          >
            Clear filter ×
          </button>
        )}
      </div>

      {/* Year bubbles */}
      <div className="flex flex-wrap gap-2 mb-2">
        {years.map((y) => (
          <Bubble key={y} label={String(y)} active={activeYear === y} onClick={() => selectYear(y)} />
        ))}
      </div>

      {/* Month bubbles — only shown when a year is selected */}
      {activeYear && months.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {months.map((m) => (
            <Bubble
              key={m}
              label={MONTH_NAMES[m]}
              active={activeMonth === m}
              onClick={() => selectMonth(m)}
            />
          ))}
        </div>
      )}

      {!activeYear && <div className="mb-4" />}

      {rows.length === 0 ? (
        <p className="text-muted text-sm py-8 text-center">No publications for this period.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface2 border-b border-border text-[10px] uppercase tracking-wider text-muted">
                  <th className="text-left px-4 py-3 w-8">#</th>
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3 w-36">Type</th>
                  <th className="text-left px-4 py-3 w-32 font-mono">Date</th>
                  <th className="text-left px-4 py-3 w-16">Lang</th>
                  <th className="text-left px-4 py-3 w-20">Source</th>
                  <th className="px-4 py-3 w-16 text-center">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((pub, i) => {
                  const rowBg = ROW_BG[pub.type] || ROW_BG.Publication
                  const detailPath = `/publication/${encodeURIComponent(shortId(pub.id))}`
                  return (
                    <tr key={pub.id || i} className={`transition-colors ${rowBg}`}>
                      <td className="px-4 py-3 font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</td>
                      <td className="px-4 py-3 max-w-md">
                        <Link
                          to={detailPath}
                          state={{ pub }}
                          className="font-medium text-text hover:text-primary transition-colors leading-snug block"
                        >
                          {pub.title}
                        </Link>
                        {pub.abstract && (
                          <p className="text-muted text-xs mt-0.5 leading-relaxed">
                            {truncate(pub.abstract, 80)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <PublicationBadge type={pub.type} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted whitespace-nowrap">
                        {formatDate(pub.date)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{pub.language}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-mono uppercase tracking-wide text-accent">
                          {pub.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <a
                          href={opDetailUrl(pub)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${pub.title} in Publications Office`}
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
      )}
    </section>
  )
}
