import { useState } from 'react'
import FilterPanel from '../search/FilterPanel'

export default function Sidebar() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden mb-4 px-4 py-2 rounded-lg border border-border text-sm"
      >
        ☰ Filters
      </button>
      <div className="hidden md:block w-64 shrink-0 pr-6 border-r border-border">
        <FilterPanel />
      </div>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-80 bg-bg border-r border-border p-6 overflow-y-auto">
            <button
              onClick={() => setOpen(false)}
              className="mb-4 text-muted text-sm"
              aria-label="Close filters"
            >
              ← Close
            </button>
            <FilterPanel />
          </div>
        </div>
      )}
    </>
  )
}
