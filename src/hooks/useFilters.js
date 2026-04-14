import { usePublicationsContext } from '../context/PublicationsContext'

export function useFilters() {
  const { state, dispatch } = usePublicationsContext()
  const { filters } = state

  const setFilter = (key, value) => dispatch({ type: 'SET_FILTERS', payload: { [key]: value } })
  const clearAll = () => dispatch({ type: 'CLEAR_FILTERS' })

  const activeCount =
    (filters.type ? 1 : 0) +
    (filters.topic?.length || 0) +
    (filters.dateFrom !== '2015-01-01' ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.language !== 'EN' ? 1 : 0) +
    (filters.format !== 'All' ? 1 : 0)

  return { filters, setFilter, clearAll, activeCount }
}
