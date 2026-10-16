/** One page of a long list, with the page clamped to the ones that exist. */
export function pageOf<T>(items: readonly T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(0, page), pages - 1)
  const start = current * size
  return {
    items: items.slice(start, start + size),
    page: current,
    pages,
    start,
    total: items.length,
  }
}

export type Page<T> = ReturnType<typeof pageOf<T>>
