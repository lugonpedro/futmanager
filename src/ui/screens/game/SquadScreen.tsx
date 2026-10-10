import { useState, type ReactNode } from 'react'
import { POSITIONS, type Player, type Position } from '../../../engine/model/types.ts'
import { clubLineup } from '../../../engine/season/season.ts'
import { useGame } from '../../../store/game.ts'
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
        <div className="flex gap-1">
          <FilterButton active={!position} onClick={() => setPosition(undefined)}>
            Todos
          </FilterButton>
          {POSITIONS.map((p) => (
            <FilterButton
              key={p}
              active={position === p}
              onClick={() => setPosition(p)}
              title={POSITION_NAMES[p]}
            >
              {p}
            </FilterButton>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar jogador"
          className="min-w-0 flex-1 rounded bg-green-950/60 px-3 py-1 text-sm placeholder:text-green-400 sm:max-w-60"
        />
        <span className="text-sm text-green-200">
          {rows.length} {rows.length === 1 ? 'jogador' : 'jogadores'}
        </span>
      </div>

      <div className="overflow-x-auto rounded bg-green-950/60">
        <table className="w-full text-sm whitespace-nowrap tabular-nums">
          <thead className="text-green-300">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-2 py-2 text-left">
                  <button
                    type="button"
                    onClick={() => sortBy(c.key)}
                    title={'title' in c ? c.title : undefined}
                    className="hover:text-white"
                  >
                    {c.label}
                    {sort.key === c.key && (sort.ascending ? ' ▲' : ' ▼')}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-green-900">
                <td className="px-2 py-1 font-semibold" title={POSITION_NAMES[p.position]}>
                  {p.position}
                </td>
                <td className="px-2">
                  {p.name} <PlayerStatus playerId={p.id} season={season} />
                </td>
                <td className="px-2">{p.age}</td>
                <td className="px-2 font-bold">{p.strength}</td>
                <td className="px-2 text-green-200">{p.potential}</td>
                <td className="px-2 text-xs text-green-200">
                  {p.traits.map((t) => TRAIT_NAMES[t]).join(', ') || '-'}
                </td>
                <td className="px-2">{formatMoney(p.wage)}</td>
                <td className="px-2">{formatMoney(p.marketValue)}</td>
                <td className="px-2">{p.contractUntil}</td>
                <td className="px-2">
                  {p.role === 'titular' ? (
                    <span className="text-yellow-300">Titular</span>
                  ) : p.role === 'reserva' ? (
                    <span className="text-green-100">Reserva</span>
                  ) : (
                    <span className="text-green-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function FilterButton(props: {
  active: boolean
  onClick: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      className={`rounded px-3 py-1 text-sm ${props.active ? 'bg-green-600 font-semibold' : 'bg-green-800'}`}
    >
      {props.children}
    </button>
  )
}
