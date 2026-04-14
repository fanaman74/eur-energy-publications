import { createContext, useContext, useReducer, useCallback, useRef } from 'react'
import { fetchWithFallback } from '../api/openData'
import { CACHE_MAX, RESULTS_PER_PAGE } from '../utils/constants'

const PublicationsContext = createContext(null)

const initialFilters = {
  type: null,
  dateFrom: '2015-01-01',
  dateTo: null,
  topic: [],
  language: 'EN',
  format: 'All',
}

const initial = {
  query: '',
  filters: initialFilters,
  results: [],
  page: 1,
  status: 'idle',
  error: null,
  source: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.payload, page: 1 }
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload }, page: 1 }
    case 'CLEAR_FILTERS':
      return { ...state, filters: initialFilters, page: 1 }
    case 'SET_PAGE':
      return { ...state, page: action.payload }
    case 'FETCH_START':
      return { ...state, status: 'loading', error: null }
    case 'FETCH_SUCCESS':
      return { ...state, status: 'success', results: action.payload.results, source: action.payload.source }
    case 'FETCH_ERROR':
      return { ...state, status: 'error', error: action.payload }
    default:
      return state
  }
}

export function PublicationsProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const cacheRef = useRef(new Map())
  const abortRef = useRef(null)

  const load = useCallback(async ({ query, filters, page }) => {
    const key = JSON.stringify({ query, filters, page })
    if (cacheRef.current.has(key)) {
      dispatch({ type: 'FETCH_SUCCESS', payload: cacheRef.current.get(key) })
      return
    }
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    dispatch({ type: 'FETCH_START' })
    try {
      const params = {
        keyword: query,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        type: filters.type,
        topics: filters.topic,
        limit: RESULTS_PER_PAGE,
        offset: (page - 1) * RESULTS_PER_PAGE,
      }
      const payload = await fetchWithFallback(params, { signal: controller.signal })
      if (cacheRef.current.size >= CACHE_MAX) {
        const firstKey = cacheRef.current.keys().next().value
        cacheRef.current.delete(firstKey)
      }
      cacheRef.current.set(key, payload)
      dispatch({ type: 'FETCH_SUCCESS', payload })
    } catch (err) {
      if (err.name === 'AbortError') return
      dispatch({ type: 'FETCH_ERROR', payload: err.message || 'Unknown error' })
    }
  }, [])

  const value = { state, dispatch, load }
  return <PublicationsContext.Provider value={value}>{children}</PublicationsContext.Provider>
}

export function usePublicationsContext() {
  const ctx = useContext(PublicationsContext)
  if (!ctx) throw new Error('usePublicationsContext must be inside PublicationsProvider')
  return ctx
}
