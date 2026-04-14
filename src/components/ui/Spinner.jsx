export default function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 text-muted py-10" role="status" aria-live="polite">
      <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
