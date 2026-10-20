import { useState, type ReactNode } from 'react'
import { SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { POSITIONS } from '../../engine/model/types.ts'
import { POSITION_NAMES } from '../format.ts'
import { AGES, type AgeBand, type PlayerFilters } from '../playerFilter.ts'
import { Choices } from './Choices.tsx'

/**
 * The filters over a list of players: position and name always in sight, and
 * under "Filtros" age, minimum overall and potential and the sort. A list adds
 * its own controls in `quick` (next to the position) and `more` (in the panel).
 * It only gets the filters and hands back changes; paging is `usePage` and
 * `Pager`, and the table is the list's own.
 */
export function PlayerFilterBar<Sort extends string>(props: {
  filters: PlayerFilters
  onChange: (change: Partial<PlayerFilters>) => void
  sort?: { options: readonly Sort[]; value: Sort; onChange: (sort: Sort) => void }
  /** How many filters under "Filtros" are on, the list's own included. */
  active: number
  onClear: () => void
  quick?: ReactNode
  more?: ReactNode
}) {
  const { filters, onChange } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Choices
          ariaLabel="Posição"
          options={['Todos', ...POSITIONS] as const}
          value={filters.position}
          onChange={(position) => onChange({ position })}
          title={(p) => (p === 'Todos' ? 'Todas as posições' : POSITION_NAMES[p])}
        />
        {props.quick}
        <Input
          type="search"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Buscar jogador"
          className="h-8 sm:max-w-60"
        />
        <Button
          variant={open ? 'default' : 'outline'}
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((shown) => !shown)}
        >
          <SlidersHorizontalIcon />
          Filtros{props.active > 0 && ` (${props.active})`}
        </Button>
      </div>
      {open && (
        <Card className="gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <FilterField label="Idade">
              <Choices
                ariaLabel="Idade"
                options={Object.keys(AGES) as AgeBand[]}
                value={filters.age}
                onChange={(age) => onChange({ age })}
              />
            </FilterField>
            <FilterField label="Geral mínimo">
              <MinimumInput
                label="Geral mínimo"
                value={filters.minOverall}
                onChange={(minOverall) => onChange({ minOverall })}
              />
            </FilterField>
            <FilterField label="Potencial mínimo">
              <MinimumInput
                label="Potencial mínimo"
                value={filters.minPotential}
                onChange={(minPotential) => onChange({ minPotential })}
              />
            </FilterField>
            {props.more}
            {props.sort && (
              <FilterField label="Ordenar">
                <Choices
                  ariaLabel="Ordenar por"
                  options={props.sort.options}
                  value={props.sort.value}
                  onChange={props.sort.onChange}
                />
              </FilterField>
            )}
          </div>
          {props.active > 0 && (
            <Button variant="ghost" size="sm" className="self-start" onClick={props.onClear}>
              <XIcon />
              Limpar filtros
            </Button>
          )}
        </Card>
      )}
    </>
  )
}

/** A filter with its name above it. */
export function FilterField(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      {props.children}
    </div>
  )
}

/** A number from 0 to 99 that an attribute must reach; empty means no minimum. */
function MinimumInput(props: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      aria-label={props.label}
      placeholder="—"
      value={props.value || ''}
      onChange={(e) => props.onChange(Math.min(99, Math.max(0, Number(e.target.value) || 0)))}
      className="h-8 w-20"
    />
  )
}
