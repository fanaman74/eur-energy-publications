import Sidebar from '../components/layout/Sidebar'
import SearchBar from '../components/search/SearchBar'
import ActiveFilters from '../components/search/ActiveFilters'
import PublicationList from '../components/publications/PublicationList'
import PublicationTable from '../components/publications/PublicationTable'
import Pagination from '../components/ui/Pagination'
import { usePublications } from '../hooks/usePublications'
import { usePublicationsContext } from '../context/PublicationsContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { RESULTS_PER_PAGE } from '../utils/constants'

export default function Browse() {
  useDocumentTitle('Browse')
  const state = usePublications()
  const { dispatch } = usePublicationsContext()
  const setPage = (p) => dispatch({ type: 'SET_PAGE', payload: p })
  const hasNext = state.results.length === RESULTS_PER_PAGE

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl mb-2">Browse publications</h1>
        <p className="text-muted text-sm">
          {state.source ? (
            <>Source: <span className="font-mono text-xs text-accent">{state.source}</span></>
          ) : (
            'Searching across CELLAR, OP Search, and EU Open Data Portal.'
          )}
        </p>
      </div>
      <div className="flex gap-8">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <div className="mb-6">
            <SearchBar />
          </div>
          <ActiveFilters />
          <PublicationList
            status={state.status}
            results={state.results}
            error={state.error}
            query={state.query}
          />
          {state.results.length > 0 && (
            <Pagination page={state.page} hasNext={hasNext} onChange={setPage} />
          )}
          <PublicationTable results={state.results} />
        </main>
      </div>
    </div>
  )
}
