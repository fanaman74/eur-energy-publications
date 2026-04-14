import { useLocation, Link } from 'react-router-dom'
import PublicationDetail from '../components/publications/PublicationDetail'
import PublicationSummary from '../components/publications/PublicationSummary'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import EmptyState from '../components/ui/EmptyState'

export default function Detail() {
  const { state } = useLocation()
  const pub = state?.pub
  useDocumentTitle(pub?.title)

  if (!pub) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20">
        <EmptyState
          title="Publication not in context"
          message="Open this publication from the Browse page to see full details."
        />
        <div className="text-center mt-6">
          <Link to="/browse" className="text-primary text-sm hover:underline">← Back to browse</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 py-12">
      <div className="max-w-3xl mx-auto mb-6">
        <Link to="/browse" className="text-muted hover:text-text text-sm">← Back to browse</Link>
      </div>
      <PublicationDetail pub={pub} related={[]} />
      <div className="max-w-3xl mx-auto">
        <PublicationSummary pub={pub} />
      </div>
    </div>
  )
}
