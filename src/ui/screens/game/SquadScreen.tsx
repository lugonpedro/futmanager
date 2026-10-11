import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { POSITIONS, type Player, type Position } from '../../../engine/model/types.ts'
import { clubLineup } from '../../../engine/season/season.ts'
import { useGame } from '../../../store/game.ts'
import { Choices } from '../../components/Choices.tsx'
import { PlayerStatus } from '../../components/PlayerStatus.tsx'
import { formatMoney, POSITION_NAMES, POSITION_ORDER, TRAIT_NAMES } from '../../format.ts'

type Role = 'titular' | 'reserva' | 'fora'
type Row = Player & { role: Role }

const ROLE_ORDER: Record<Role, number> = { titular: 0, reserva: 1, fora: 2 }

const COLUMNS = [
  {
    key: 'position',
    label: 'Pos',
    title: 'Posição',
    value: (r: Row) => POSITION_ORDER[r.position],
  },
  { key: 'name', label: 'Nome', value: (r: Row) => r.name },
  { key: 'age', label: 'Idade', value: (r: Row) => r.age },
  { key: 'strength', label: 'Força', value: (r: Row) => r.strength },
  { key: 'potential', label: 'Pot', title: 'Potencial', value: (r: Row) => r.potential },
  { key: 'traits', label: 'Características', value: (r: Row) => r.traits.length },
  { key: 'wage', label: 'Salário', value: (r: Row) => r.wage },
  { key: 'marketValue', label: 'Valor', value: (r: Row) => r.marketValue },
  { key: 'contractUntil', label: 'Contrato', value: (r: Row) => r.contractUntil },
  { key: 'role', label: 'Escalação', value: (r: Row) => ROLE_ORDER[r.role] },
] as const

type SortKey = (typeof COLUMNS)[number]['key']

/** Text columns start A to Z; numbers start from the biggest. */
const ASCENDING_FIRST: ReadonlySet<SortKey> = new Set(['position', 'name', 'role'])

export function SquadScreen() {
  const game = useGame()
  const { world, season, userClubId } = game
  const [position, setPosition] = useState<Position | undefined>()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({
    key: 'position',
    ascending: true,
  })

  const lineup = clubLineup(game, userClubId)
  const starters = new Set(lineup.starters.map((s) => s.playerId))
  const bench = new Set(lineup.bench)
  const query = search.trim().toLocaleLowerCase('pt-BR')
  const column = COLUMNS.find((c) => c.key === sort.key)!
  const rows: Row[] = world.clubs[userClubId].playerIds
    .map((id) => world.players[id])
    .filter((p) => !position || p.position === position)
    .filter((p) => !query || p.name.toLocaleLowerCase('pt-BR').includes(query))
    .map((p) => ({
      ...p,
      role: starters.has(p.id) ? 'titular' : bench.has(p.id) ? 'reserva' : 'fora',
    }))
  rows.sort((a, b) => {
    const x = column.value(a)
    const y = column.value(b)
    const order = typeof x === 'string' ? x.localeCompare(y as string, 'pt-BR') : x - (y as number)
    // Ties fall back to the strongest first, so equal positions read best to worst.
    return (sort.ascending ? order : -order) || b.strength - a.strength
  })

  const sortBy = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, ascending: !current.ascending }
        : { key, ascending: ASCENDING_FIRST.has(key) },
    )

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Choices
          ariaLabel="Filtrar por posição"
          options={['Todos', ...POSITIONS]}
          value={position ?? 'Todos'}
          onChange={(value) => setPosition(value === 'Todos' ? undefined : (value as Position))}
          title={(value) =>
            value === 'Todos' ? 'Todas as posições' : POSITION_NAMES[value as Position]
          }
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar jogador"
          className="h-8 sm:max-w-60"
        />
        <span className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'jogador' : 'jogadores'}
        </span>
      </div>

      <Card className="py-0">
        <Table className="tabular-nums">
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead key={c.key}>
                  <button
                    type="button"
                    onClick={() => sortBy(c.key)}
                    title={'title' in c ? c.title : undefined}
                    className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"
                  >
                    {c.label}
                    {sort.key === c.key &&
                      (sort.ascending ? (
                        <ArrowUpIcon className="size-3" />
                      ) : (
                        <ArrowDownIcon className="size-3" />
                      ))}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-semibold" title={POSITION_NAMES[p.position]}>
                  {p.position}
                </TableCell>
                <TableCell>
                  {p.name} <PlayerStatus playerId={p.id} season={season} />
                  {p.id.startsWith('B') && p.id.split('-')[1] === userClubId && (
                    <Badge variant="outline" className="ml-1" title="Revelado pela base do clube">
                      Base
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{p.age}</TableCell>
                <TableCell className="font-bold">{p.strength}</TableCell>
                <TableCell className="text-muted-foreground">{p.potential}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.traits.map((t) => TRAIT_NAMES[t]).join(', ') || '-'}
                </TableCell>
                <TableCell>{formatMoney(p.wage)}</TableCell>
                <TableCell>{formatMoney(p.marketValue)}</TableCell>
                <TableCell>{p.contractUntil}</TableCell>
                <TableCell>
                  {p.role === 'titular' ? (
                    <Badge>Titular</Badge>
                  ) : p.role === 'reserva' ? (
                    <Badge variant="secondary">Reserva</Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  )
}
