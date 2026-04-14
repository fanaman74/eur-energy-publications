import { useFilters } from '../../hooks/useFilters'
import { PUBLICATION_TYPES, TOPICS, LANGUAGES, FORMATS, YEAR_RANGE } from '../../utils/constants'

export default function FilterPanel() {
  const { filters, setFilter, clearAll, activeCount } = useFilters()

  return (
    <aside className="space-y-6 text-sm" aria-label="Filters">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base">Filters</h2>
        {activeCount > 0 && (
          <button onClick={clearAll} className="text-xs text-primary hover:underline">
            Clear all ({activeCount})
          </button>
        )}
      </div>

      <Group label="Publication type">
        <div className="space-y-2">
          <Radio
            name="type"
            checked={filters.type === null}
            onChange={() => setFilter('type', null)}
            label="All types"
          />
          {PUBLICATION_TYPES.map((t) => (
            <Radio
              key={t}
              name="type"
              checked={filters.type === t}
              onChange={() => setFilter('type', t)}
              label={t}
            />
          ))}
        </div>
      </Group>

      <Group label="Date range">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={filters.dateFrom.slice(0, 4)}
            onChange={(e) => setFilter('dateFrom', `${e.target.value}-01-01`)}
            className="bg-bg border border-border rounded px-2 py-1.5 text-xs"
            aria-label="From year"
          >
            {YEAR_RANGE.map((y) => (
              <option key={y} value={y}>From {y}</option>
            ))}
          </select>
          <select
            value={filters.dateTo ? filters.dateTo.slice(0, 4) : ''}
            onChange={(e) => setFilter('dateTo', e.target.value ? `${e.target.value}-12-31` : null)}
            className="bg-bg border border-border rounded px-2 py-1.5 text-xs"
            aria-label="To year"
          >
            <option value="">To latest</option>
            {YEAR_RANGE.map((y) => (
              <option key={y} value={y}>To {y}</option>
            ))}
          </select>
        </div>
      </Group>

      <Group label="Topic">
        <div className="space-y-2">
          {TOPICS.map((t) => (
            <Checkbox
              key={t}
              checked={filters.topic.includes(t)}
              onChange={() => {
                const next = filters.topic.includes(t)
                  ? filters.topic.filter((x) => x !== t)
                  : [...filters.topic, t]
                setFilter('topic', next)
              }}
              label={t}
            />
          ))}
        </div>
      </Group>

      <Group label="Language">
        <div className="space-y-2">
          {LANGUAGES.map((l) => (
            <Radio
              key={l.code}
              name="lang"
              checked={filters.language === l.code}
              onChange={() => setFilter('language', l.code)}
              label={l.label}
            />
          ))}
        </div>
      </Group>

      <Group label="Format">
        <div className="flex gap-2">
          {FORMATS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter('format', f)}
              className={`px-3 py-1 rounded-full border text-xs ${
                filters.format === f
                  ? 'bg-primary/20 border-primary/40 text-primary'
                  : 'border-border text-muted hover:text-text'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </Group>
    </aside>
  )
}

function Group({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted mb-2">{label}</div>
      {children}
    </div>
  )
}

function Radio({ name, checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-muted hover:text-text">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-primary" />
      <span>{label}</span>
    </label>
  )
}

function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-muted hover:text-text">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-primary" />
      <span>{label}</span>
    </label>
  )
}
