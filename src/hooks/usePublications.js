import { useEffect } from 'react'
import { usePublicationsContext } from '../context/PublicationsContext'

export function usePublications() {
  const { state, load } = usePublicationsContext()
  useEffect(() => {
    load({ query: state.query, filters: state.filters, page: state.page })
  }, [state.query, state.filters, state.page, load])
  return state
}
