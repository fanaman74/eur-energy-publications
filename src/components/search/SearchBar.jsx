import { useEffect, useRef, useState } from 'react'
import { useSearch } from '../../hooks/useSearch'

export default function SearchBar() {
  const { input, setInput, clear, history } = useSearch()
  const [focused, setFocused] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 focus-within:border-primary/50">
        <span className="text-muted" aria-hidden>⌕</span>
        <input
          ref={ref}
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search EU energy publications…  (press / to focus)"
          aria-label="Search publications"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted"
        />
        {input && (
          <button onClick={clear} className="text-muted hover:text-text text-xs" aria-label="Clear search">
            ✕
          </button>
        )}
      </div>
      {focused && history.length > 0 && (
        <ul className="absolute left-0 right-0 mt-2 rounded-xl border border-border bg-surface shadow-xl z-10 overflow-hidden">
          <li className="text-[10px] uppercase tracking-wider text-muted px-4 pt-3 pb-1">Recent</li>
          {history.map((h) => (
            <li key={h}>
              <button
                onMouseDown={() => setInput(h)}
                className="w-full text-left px-4 py-2 text-sm hover:bg-bg"
              >
                {h}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
