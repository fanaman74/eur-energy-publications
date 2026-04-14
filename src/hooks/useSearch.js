import { useEffect, useState, useCallback } from 'react'
import { DEBOUNCE_MS } from '../utils/constants'
import { usePublicationsContext } from '../context/PublicationsContext'

const HISTORY_KEY = 'eu-energy:history'
const MAX_HISTORY = 10

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}

export function useSearch() {
  const { state, dispatch } = usePublicationsContext()
  const [input, setInput] = useState(state.query)
  const [history, setHistory] = useState(readHistory)

  useEffect(() => {
    const t = setTimeout(() => {
      if (input !== state.query) {
        dispatch({ type: 'SET_QUERY', payload: input })
        if (input.trim()) {
          setHistory((prev) => {
            const next = [input, ...prev.filter((q) => q !== input)].slice(0, MAX_HISTORY)
            localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
            return next
          })
        }
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [input, state.query, dispatch])

  const clear = useCallback(() => setInput(''), [])

  return { input, setInput, clear, history, query: state.query }
}
