import { useEffect } from 'react'

export function useDocumentTitle(title) {
  useEffect(() => {
    const prev = document.title
    document.title = title ? `${title} · EU Energy Publications` : 'EU Energy Publications Explorer'
    return () => { document.title = prev }
  }, [title])
}
