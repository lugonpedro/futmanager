import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Paged } from '../usePage.ts'

/** Previous and next buttons under a long list, with where in it the reader is. */
export function Pager(props: { paged: Paged<unknown>; className?: string }) {
  const { items, page, pages, start, total, setPage } = props.paged
  if (pages <= 1) return null
  return (
    <nav
      aria-label="Paginação"
      className={cn('flex items-center justify-between gap-2 text-sm', props.className)}
    >
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
        <ChevronLeftIcon />
        <span className="hidden sm:inline">Anterior</span>
      </Button>
      <span className="text-muted-foreground tabular-nums">
        {start + 1}–{start + items.length} de {total}
        <span className="hidden sm:inline">
          {' '}
          · página {page + 1} de {pages}
        </span>
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page === pages - 1}
        onClick={() => setPage(page + 1)}
      >
        <span className="hidden sm:inline">Próxima</span>
        <ChevronRightIcon />
      </Button>
    </nav>
  )
}
