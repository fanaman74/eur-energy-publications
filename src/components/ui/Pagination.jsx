export default function Pagination({ page, hasNext, onChange }) {
  const prev = () => onChange(Math.max(1, page - 1))
  const next = () => onChange(page + 1)
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-3 mt-10">
      <button
        onClick={prev}
        disabled={page <= 1}
        className="px-4 py-2 rounded border border-border text-sm disabled:opacity-40 hover:bg-surface"
      >
        ← Previous
      </button>
      <span className="font-mono text-xs text-muted">Page {page}</span>
      <button
        onClick={next}
        disabled={!hasNext}
        className="px-4 py-2 rounded border border-border text-sm disabled:opacity-40 hover:bg-surface"
      >
        Next →
      </button>
    </nav>
  )
}
