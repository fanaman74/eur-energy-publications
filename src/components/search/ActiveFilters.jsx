import { useFilters } from '../../hooks/useFilters'

export default function ActiveFilters() {
  const { filters, setFilter, activeCount } = useFilters()
  if (activeCount === 0) return null

  const chips = []
  if (filters.type) chips.push({ label: filters.type, clear: () => setFilter('type', null) })
  filters.topic.forEach((t) =>
    chips.push({
      label: t,
      clear: () => setFilter('topic', filters.topic.filter((x) => x !== t)),
    })
  )
  if (filters.dateFrom !== '2015-01-01')
    chips.push({ label: `From ${filters.dateFrom.slice(0, 4)}`, clear: () => setFilter('dateFrom', '2015-01-01') })
  if (filters.dateTo)
    chips.push({ label: `To ${filters.dateTo.slice(0, 4)}`, clear: () => setFilter('dateTo', null) })
  if (filters.language !== 'EN')
    chips.push({ label: filters.language, clear: () => setFilter('language', 'EN') })
  if (filters.format !== 'All')
    chips.push({ label: filters.format, clear: () => setFilter('format', 'All') })

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {chips.map((c, i) => (
        <button
          key={i}
          onClick={c.clear}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs hover:bg-primary/20"
        >
          {c.label} <span aria-hidden>✕</span>
        </button>
      ))}
    </div>
  )
}
