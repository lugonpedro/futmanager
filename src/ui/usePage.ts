import { useState } from 'react'
import { pageOf, type Page } from './paging.ts'

export type Paged<T> = Page<T> & { setPage: (page: number) => void }

/**
 * The page of a list on show. Changing `resetKey` (the filters and sort that
 * shape the list) goes back to the first page.
 */
export function usePage<T>(items: readonly T[], size: number, resetKey = ''): Paged<T> {
  const [state, setState] = useState({ key: resetKey, page: 0 })
  const page = pageOf(items, state.key === resetKey ? state.page : 0, size)
  return { ...page, setPage: (next: number) => setState({ key: resetKey, page: next }) }
}
