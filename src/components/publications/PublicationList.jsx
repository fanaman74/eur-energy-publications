import PublicationCard from './PublicationCard'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'

export default function PublicationList({ status, results, error, query }) {
  if (status === 'loading' && results.length === 0) return <Spinner label="Fetching publications…" />
  if (status === 'error') {
    return (
      <EmptyState
        icon="!"
        title="Could not load publications"
        message={error || 'All data sources failed to respond. Please try again later.'}
      />
    )
  }
  if (results.length === 0) {
    return (
      <EmptyState
        title="No publications found"
        message={query ? `No matches for "${query}". Try a different keyword or loosen filters.` : 'Try a broader date range or remove filters.'}
      />
    )
  }
  return (
    <div className="grid gap-4">
      {results.map((pub, i) => (
        <PublicationCard key={pub.id || i} pub={pub} index={i} />
      ))}
    </div>
  )
}
