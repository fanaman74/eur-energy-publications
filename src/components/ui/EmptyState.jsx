export default function EmptyState({ title = 'No results', message, icon = '★' }) {
  return (
    <div className="text-center py-20 px-6 border border-dashed border-border rounded-xl">
      <div className="text-3xl text-accent mb-4">{icon}</div>
      <h3 className="font-display text-xl text-text mb-2">{title}</h3>
      {message && <p className="text-muted text-sm max-w-md mx-auto">{message}</p>}
    </div>
  )
}
