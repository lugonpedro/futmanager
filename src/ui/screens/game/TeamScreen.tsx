import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FilePenLineIcon,
  MapIcon,
  TagIcon,
  WandSparklesIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import {
  autoLineup,
  changeFormation,
  formationLines,
  swapPlayers,
} from '../../../engine/match/lineup.ts'
import { positionFit, sectorStrength } from '../../../engine/match/strength.ts'
import {
  POSITIONS,
  type Lineup,
  type Player,
  type Position,
  type Posture,
} from '../../../engine/model/types.ts'
import { careerGames, potentialRange } from '../../../engine/progression/progression.ts'
import { recoveryRate } from '../../../engine/progression/training.ts'
import { checkLoan, LOAN, loanClub, loanPlayer } from '../../../engine/transfer/loans.ts'
import { confirm } from '../../confirm.ts'
import { conditionOn, formOf } from '../../../engine/season/form.ts'
import { clubLineup, unavailablePlayers } from '../../../engine/season/season.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { Choices } from '../../components/Choices.tsx'
import { FormationSelect } from '../../components/FormationSelect.tsx'
import { Pitch } from '../../components/Pitch.tsx'
import { PlayerStatus } from '../../components/PlayerStatus.tsx'
import {
  fitClass,
  fitLevel,
  formatMoney,
  isHomegrown,
  POSITION_NAMES,
  POSITION_ORDER,
  POSTURE_NAMES,
  rangeText,
  type Role,
} from '../../format.ts'
import { ListDialog, RenewDialog } from './MarketDialogs.tsx'
import { FormArrow, PlayerSheet } from './PlayerSheet.tsx'
import { TrainingPanel } from './TrainingPanel.tsx'

type Row = Player & {
  role: Role
  slot?: Position
  condition: number
  form: number
  potentialRange: { low: number; high: number }
}

const GROUPS: { role: Role; label: string }[] = [
  { role: 'titular', label: 'Titulares' },
  { role: 'reserva', label: 'Reservas' },
  { role: 'fora', label: 'Fora do jogo' },
]

const COLUMNS = [
  {
    key: 'position',
    label: 'Pos',
    title: 'Posição',
    value: (r: Row) => POSITION_ORDER[r.slot ?? r.position],
  },
  { key: 'name', label: 'Nome', value: (r: Row) => r.name },
  { key: 'age', label: 'Idade', value: (r: Row) => r.age, hide: 'hidden sm:table-cell' },
  { key: 'overall', label: 'Geral', title: 'Geral e potencial', value: (r: Row) => r.overall },
  {
    key: 'condition',
    label: 'Cond',
    title: 'Condição física e forma',
    value: (r: Row) => r.condition,
    hide: 'hidden sm:table-cell',
  },
  { key: 'wage', label: 'Salário', value: (r: Row) => r.wage, hide: 'hidden md:table-cell' },
  {
    key: 'contractUntil',
    label: 'Contrato',
    value: (r: Row) => r.contractUntil,
    hide: 'hidden sm:table-cell',
  },
] as const

type SortKey = (typeof COLUMNS)[number]['key']

/** Text columns start A to Z; numbers start from the biggest. */
const ASCENDING_FIRST: ReadonlySet<SortKey> = new Set(['position', 'name'])

/**
 * The squad in one place: the XI on the pitch next to the full squad list,
 * with lineup changes by drag and drop or tap-and-tap, and each player's card
 * with the sell and renew actions.
 */
export function TeamScreen() {
  const game = useGame()
  const setGame = useGameStore((s) => s.setGame)
  const { world, season, userClubId, market } = game
  const [selected, setSelected] = useState<string>()
  const [dragging, setDragging] = useState<string>()
  const [viewing, setViewing] = useState<string>()
  const [listing, setListing] = useState<string>()
  const [renewing, setRenewing] = useState<string>()
  const [showPitch, setShowPitch] = useState(false)
  const [position, setPosition] = useState<Position | undefined>()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({
    key: 'position',
    ascending: true,
  })
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const squad = world.clubs[userClubId].playerIds.map((id) => world.players[id])
  const out = unavailablePlayers(season)
  const lineup = clubLineup(game, userClubId)
  const slots = new Map(lineup.starters.map((s) => [s.playerId, s.position]))
  const bench = new Set(lineup.bench)
  const roleOf = (id: string): Role =>
    slots.has(id) ? 'titular' : bench.has(id) ? 'reserva' : 'fora'
  const inLineup = (id: string) => roleOf(id) !== 'fora'

  const save = (next: Lineup) => {
    setGame({ ...game, userLineup: next })
    setSelected(undefined)
  }
  /** Swaps two players, as long as one of them is in the lineup and both can play. */
  const swap = (a: string, b: string) => {
    if (a === b || out.has(a) || out.has(b)) return false
    if (!inLineup(a) && !inLineup(b)) return false
    const next = swapPlayers(lineup, a, b)
    save(next)
    warnOutOfPosition(next, [a, b])
    return true
  }
  const pick = (id: string) => {
    if (out.has(id)) return
    if (!selected || selected === id) return setSelected(selected === id ? undefined : id)
    if (!swap(selected, id)) setSelected(id)
  }
  /** A player just moved into a slot far from his position plays well below his level. */
  const warnOutOfPosition = (next: Lineup, moved: string[]) => {
    for (const slot of next.starters) {
      if (!moved.includes(slot.playerId) || slots.get(slot.playerId) === slot.position) continue
      const player = world.players[slot.playerId]
      if (fitLevel(positionFit(player, slot.position)) !== 'poor') continue
      toast.warning(
        `${player.name} (${player.position}) vai jogar como ${POSITION_NAMES[slot.position].toLowerCase()} e rende bem menos fora de posição.`,
      )
    }
  }
  const onDragStart = (event: DragStartEvent) => setDragging(playerOf(event.active))
  const onDragEnd = (event: DragEndEvent) => {
    setDragging(undefined)
    if (event.over) swap(playerOf(event.active), playerOf(event.over))
  }

  const starters = lineup.starters.map((s) => ({
    player: world.players[s.playerId],
    position: s.position,
  }))
  const conditionOf = (id: string) =>
    conditionOn(season, world.players[id], game.today, recoveryRate(game, id))
  const sectors = sectorStrength(
    starters.map((s) => ({
      ...s,
      energy: conditionOf(s.player.id),
      form: formOf(season, s.player.id),
    })),
    lineup.posture,
    lineup.formation,
  )

  const query = search.trim().toLocaleLowerCase('pt-BR')
  const column = COLUMNS.find((c) => c.key === sort.key)!
  const rows: Row[] = squad
    .filter((p) => !position || p.position === position)
    .filter((p) => !query || p.name.toLocaleLowerCase('pt-BR').includes(query))
    .map((p) => ({
      ...p,
      role: roleOf(p.id),
      slot: slots.get(p.id),
      condition: conditionOf(p.id),
      form: formOf(season, p.id),
      potentialRange: potentialRange(p, careerGames(p, season.appearances)),
    }))
  rows.sort((a, b) => {
    const x = column.value(a)
    const y = column.value(b)
    const order = typeof x === 'string' ? x.localeCompare(y as string, 'pt-BR') : x - (y as number)
    // Ties fall back to the strongest first, so equal positions read best to worst.
    return (sort.ascending ? order : -order) || b.overall - a.overall
  })
  const sortBy = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, ascending: !current.ascending }
        : { key, ascending: ASCENDING_FIRST.has(key) },
    )
  const expiring = squad.filter((p) => p.contractUntil <= season.year).length
  const loaned = game.loans.map((l) => world.players[l.playerId])

  /** Sends a youngster out on loan, once the manager confirms. */
  const lend = async (id: string) => {
    const player = world.players[id]
    const verdict = checkLoan(game, id)
    if (!verdict.ok) return toast.error(verdict.reason)
    const club = world.clubs[loanClub(game, player)!]
    const ok = await confirm({
      title: `Emprestar ${player.name}`,
      description: `${player.name} vai jogar no ${club.name} (${club.division}ª divisão) até o fim da temporada e volta em janeiro. O outro clube paga o salário enquanto ele estiver lá.`,
      action: 'Emprestar',
    })
    if (!ok) return
    setGame(loanPlayer(game, id))
    setViewing(undefined)
    toast.success(`${player.name} foi emprestado ao ${club.name}.`)
  }

  const byId = (id: string | undefined) => (id ? world.players[id] : undefined)
  const viewed = byId(viewing)
  const listed = byId(listing)
  const renewed = byId(renewing)
  const dragged = byId(dragging)

  return (
    <DndContext
      sensors={sensors}
      // The drop goes where the finger or cursor is, not where the dragged chip overlaps most.
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(undefined)}
    >
      <div className="flex flex-col gap-4">
        <Card className="gap-3 px-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Formação</span>
              <FormationSelect
                value={lineup.formation}
                onChange={(f) => save(changeFormation(lineup, f, world.players))}
              />
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Postura</span>
              <Choices
                ariaLabel="Postura"
                options={Object.keys(POSTURE_NAMES) as Posture[]}
                value={lineup.posture}
                onChange={(p) => save({ ...lineup, posture: p })}
                label={(p) => POSTURE_NAMES[p]}
              />
            </div>
            <Button
              size="sm"
              onClick={() => save(autoLineup(squad, lineup.formation, lineup.posture, out))}
            >
              <WandSparklesIcon />
              Escalar automaticamente
            </Button>
            <p className="text-sm text-muted-foreground tabular-nums">
              Defesa {Math.round(sectors.defense)} · Meio {Math.round(sectors.midfield)} · Ataque{' '}
              {Math.round(sectors.attack)}
            </p>
          </div>

          <StarterLines
            lines={formationLines(starters, lineup.formation)}
            selected={selected}
            onSelect={pick}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Arraste um jogador até outro, ou toque em um e depois no outro, para trocá-los de
              lugar. A cor da posição mostra o encaixe:{' '}
              <span className={fitClass(1)}>na posição</span>,{' '}
              <span className={fitClass(0.95)}>secundária</span> ou{' '}
              <span className={fitClass(0.72)}>improvisado</span>. Toque no nome para ver a carta,
              vender ou renovar.
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowPitch((shown) => !shown)}>
              <MapIcon />
              {showPitch ? 'Esconder o campo' : 'Ver no campo'}
            </Button>
          </div>
          {showPitch && (
            <div className="w-full md:mx-auto md:max-w-lg">
              <Pitch
                slots={starters}
                formation={lineup.formation}
                selected={selected}
                onSelect={pick}
                wrap={(id, className, player) => (
                  <DragSlot id={id} className={className}>
                    {player}
                  </DragSlot>
                )}
              />
            </div>
          )}
        </Card>

        <section className="flex min-w-0 flex-col gap-3">
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
              className="h-8 sm:max-w-48"
            />
          </div>
          {expiring > 0 && (
            <p className="text-sm text-muted-foreground">
              {expiring} {expiring === 1 ? 'contrato termina' : 'contratos terminam'} no fim desta
              temporada (em vermelho): renove ou o jogador sai de graça.
            </p>
          )}

          <Card className="py-0">
            <Table className="tabular-nums">
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((c) => (
                    <TableHead key={c.key} className={'hide' in c ? c.hide : undefined}>
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
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {GROUPS.map((group) => {
                  const members = rows.filter((r) => r.role === group.role)
                  return [
                    <TableRow key={group.role} className="bg-muted/50 hover:bg-muted/50">
                      <TableCell
                        colSpan={COLUMNS.length + 1}
                        className="py-1.5 text-xs font-semibold text-muted-foreground"
                      >
                        {group.label} ({members.length})
                      </TableCell>
                    </TableRow>,
                    ...members.map((p) => (
                      <SquadRow
                        key={p.id}
                        row={p}
                        selected={selected === p.id}
                        disabled={out.has(p.id)}
                        listed={market.listed[p.id] !== undefined}
                        onPick={() => pick(p.id)}
                        onSell={() => setListing(p.id)}
                        onRenew={() => setRenewing(p.id)}
                      >
                        <TableCell>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setViewing(p.id)
                            }}
                            className="cursor-pointer text-left font-medium hover:underline"
                          >
                            {p.name}
                          </button>{' '}
                          <PlayerStatus playerId={p.id} season={season} />
                          {isHomegrown(p, userClubId) && (
                            <Badge
                              variant="outline"
                              className="ml-1"
                              title="Revelado pela base do clube"
                            >
                              Base
                            </Badge>
                          )}
                          {market.listed[p.id] !== undefined && (
                            <Badge variant="secondary" className="ml-1">
                              à venda
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{p.age}</TableCell>
                        <TableCell
                          className="whitespace-nowrap"
                          title={`Geral ${p.overall}, potencial ${rangeText(p.potentialRange)}`}
                        >
                          <span className="font-bold">{p.overall}</span>
                          <span className="text-xs text-muted-foreground">
                            /{p.potentialRange.high}
                          </span>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap sm:table-cell">
                          <span
                            className={cn(
                              p.condition < 85 && 'text-amber-600 dark:text-yellow-300',
                            )}
                          >
                            {p.condition}%
                          </span>{' '}
                          <FormArrow form={p.form} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {formatMoney(p.wage)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'hidden sm:table-cell',
                            p.contractUntil <= season.year && 'font-semibold text-destructive',
                          )}
                        >
                          {p.contractUntil}
                        </TableCell>
                      </SquadRow>
                    )),
                  ]
                })}
              </TableBody>
            </Table>
          </Card>
          {loaned.length > 0 && (
            <Card className="gap-2 px-4">
              <h3 className="text-sm font-semibold">Emprestados ({loaned.length})</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {loaned.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setViewing(p.id)}
                      className="cursor-pointer text-left hover:underline"
                    >
                      <span className="text-muted-foreground">{p.position}</span> {p.name}
                    </button>{' '}
                    <span className="text-muted-foreground">
                      (geral {p.overall}) no {world.clubs[p.clubId].name},{' '}
                      {season.appearances[p.id] ?? 0} jogos
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Voltam no fim da temporada. Jogadores de até {LOAN.maxAge} anos podem ser
                emprestados com a janela aberta, pela carta do jogador.
              </p>
            </Card>
          )}
        </section>

        <TrainingPanel />
      </div>

      <DragOverlay dropAnimation={null}>
        {dragged && (
          <span className="inline-flex items-center gap-2 rounded-md bg-yellow-300 px-2 py-1 text-sm font-semibold text-green-950 shadow-lg">
            {dragged.position} {dragged.name} {dragged.overall}
          </span>
        )}
      </DragOverlay>

      {viewed && (
        <PlayerSheet
          game={game}
          player={viewed}
          role={roleOf(viewed.id)}
          slot={slots.get(viewed.id)}
          onClose={() => setViewing(undefined)}
          onSell={() => setListing(viewed.id)}
          onRenew={() => setRenewing(viewed.id)}
          onLoan={() => lend(viewed.id)}
        />
      )}
      {listed && <ListDialog game={game} player={listed} onClose={() => setListing(undefined)} />}
      {renewed && (
        <RenewDialog game={game} player={renewed} onClose={() => setRenewing(undefined)} />
      )}
    </DndContext>
  )
}

/**
 * A starter is both on the pitch and in the list, so each spot gets its own
 * drag id and carries the player's id as data.
 */
const playerOf = (spot: { data: { current?: Record<string, unknown> } }) =>
  spot.data.current!.playerId as string

/**
 * A starter, as a chip or on the pitch, that can be dragged onto another player
 * and take a drop. Chips and pitch can show at once, so each has its own ids.
 */
function DragSlot(props: {
  id: string
  className: string
  children: ReactNode
  place?: 'chip' | 'pitch'
}) {
  const spot = { id: `${props.place ?? 'pitch'}-${props.id}`, data: { playerId: props.id } }
  const drag = useDraggable(spot)
  const drop = useDroppable(spot)
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      {...drag.listeners}
      className={cn(
        props.className,
        'touch-manipulation',
        drag.isDragging && 'opacity-40',
        drop.isOver && !drag.isDragging && 'rounded ring-2 ring-yellow-300',
      )}
    >
      {props.children}
    </div>
  )
}

/** What each line of the XI is called, from the keeper forwards. */
function lineName(line: readonly { position: Position }[], index: number, lines: number): string {
  const position = line[0].position
  if (position === 'G') return 'Goleiro'
  if (position === 'A') return 'Ataque'
  if (position !== 'M') return 'Defesa'
  // With two midfield lines the first holds back.
  const midfield = lines - 3
  if (midfield < 2) return 'Meio'
  return index === 2 ? 'Volantes' : 'Meias'
}

/** The XI as chips by line, each one a drag handle and a drop target like on the pitch. */
function StarterLines(props: {
  lines: { player: Player; position: Position }[][]
  selected?: string
  onSelect: (playerId: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {props.lines.map((line, i) => (
        <div key={i} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
          <span className="shrink-0 text-xs text-muted-foreground sm:w-16 sm:pt-2">
            {lineName(line, i, props.lines.length)}
          </span>
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {line.map(({ player, position }) => {
              const fit = positionFit(player, position)
              const selected = props.selected === player.id
              return (
                <DragSlot key={player.id} id={player.id} place="chip" className="min-w-0 sm:w-48">
                  <button
                    type="button"
                    onClick={() => props.onSelect(player.id)}
                    title={`${POSITION_NAMES[position]}${fit < 1 ? ` (é ${POSITION_NAMES[player.position].toLowerCase()})` : ''}`}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm hover:bg-accent',
                      selected &&
                        'border-yellow-400 bg-yellow-300 text-green-950 hover:bg-yellow-300',
                    )}
                  >
                    <span className={cn('w-4 font-bold', !selected && fitClass(fit))}>
                      {position}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{player.name}</span>
                    <span className="font-semibold tabular-nums">{player.overall}</span>
                  </button>
                </DragSlot>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** A squad list row: tap to pick for a swap, drag onto another player, or sell and renew. */
function SquadRow(props: {
  row: Row
  selected: boolean
  disabled: boolean
  listed: boolean
  onPick: () => void
  onSell: () => void
  onRenew: () => void
  children: ReactNode
}) {
  const { row, selected, disabled } = props
  const spot = { id: `list-${row.id}`, data: { playerId: row.id }, disabled }
  const drag = useDraggable(spot)
  const drop = useDroppable(spot)
  const fit = row.slot && positionFit(row, row.slot)
  return (
    <TableRow
      ref={(node: HTMLTableRowElement | null) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      {...drag.listeners}
      onClick={disabled ? undefined : props.onPick}
      data-state={selected ? 'selected' : undefined}
      className={cn(
        'touch-manipulation',
        disabled ? 'opacity-60' : 'cursor-pointer',
        selected &&
          'bg-yellow-300 text-green-950 hover:bg-yellow-300 data-[state=selected]:bg-yellow-300',
        drag.isDragging && 'opacity-40',
        drop.isOver && !drag.isDragging && 'outline-2 -outline-offset-2 outline-yellow-400',
      )}
    >
      <TableCell className="font-semibold">
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            props.onPick()
          }}
          aria-label={`Selecionar ${row.name} para trocar`}
          title={
            row.slot
              ? `Jogando de ${POSITION_NAMES[row.slot].toLowerCase()}${fit! < 1 ? ` (é ${POSITION_NAMES[row.position].toLowerCase()})` : ''}`
              : POSITION_NAMES[row.position]
          }
          className={cn(
            'cursor-pointer disabled:cursor-not-allowed',
            fit !== undefined && !selected && fitClass(fit),
          )}
        >
          {row.slot ?? row.position}
          {row.slot && row.slot !== row.position && (
            <span className="ml-0.5 text-xs font-normal opacity-70">({row.position})</span>
          )}
        </button>
      </TableCell>
      {props.children}
      <TableCell className="w-16 text-right whitespace-nowrap">
        <RowAction
          label={
            props.listed
              ? `Mudar preço ou tirar ${row.name} da venda`
              : `Colocar ${row.name} à venda`
          }
          active={props.listed}
          onClick={props.onSell}
        >
          <TagIcon />
        </RowAction>
        <RowAction label={`Renovar o contrato de ${row.name}`} onClick={props.onRenew}>
          <FilePenLineIcon />
        </RowAction>
      </TableCell>
    </TableRow>
  )
}

/** An icon button in a squad row, kept from picking or dragging the row. */
function RowAction(props: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('size-7', props.active && 'text-yellow-600 dark:text-yellow-300')}
      aria-label={props.label}
      title={props.label}
      onClick={(e) => {
        e.stopPropagation()
        props.onClick()
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {props.children}
    </Button>
  )
}
