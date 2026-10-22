import {
  ArrowDownIcon,
  ArrowUpIcon,
  DumbbellIcon,
  FilePenLineIcon,
  StarIcon,
  TagIcon,
  WandSparklesIcon,
} from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
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
import { positionFit } from '../../../engine/match/strength.ts'
import {
  POSITIONS,
  type Lineup,
  type Player,
  type Position,
  type TrainingPlan,
} from '../../../engine/model/types.ts'
import {
  careerGames,
  potentialRange,
  setRecommendedPlans,
} from '../../../engine/progression/progression.ts'
import {
  canTrain,
  recoveryRate,
  setTrainingPlan,
  TRAINING,
  trainingBlock,
} from '../../../engine/progression/training.ts'
import { checkLoan, LOAN, loanClub, loanPlayer } from '../../../engine/transfer/loans.ts'
import { confirm } from '../../confirm.ts'
import { conditionOn, formOf } from '../../../engine/season/form.ts'
import {
  clubLineup,
  nextUserGame,
  savedUserLineup,
  unavailableOn,
  unavailablePlayers,
} from '../../../engine/season/season.ts'
import { useLineupPrefs } from '../../../store/lineupPrefs.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { Choices } from '../../components/Choices.tsx'
import { FocusSelect } from '../../components/FocusSelect.tsx'
import { listText } from '../../learn.ts'
import { FavoriteStar } from '../../components/FavoriteStar.tsx'
import { LearnLink } from '../../components/LearnLink.tsx'
import { LineupEditor } from '../../components/LineupEditor.tsx'
import { useSwapSpot } from '../../components/swapSpot.ts'
import { RowDetails } from '../../components/RowDetails.tsx'
import { PlayerStatus } from '../../components/PlayerStatus.tsx'
import {
  fitClass,
  formatMoney,
  absentName,
  isHomegrown,
  POSITION_NAMES,
  POSITION_ORDER,
  rangeText,
  signedChange,
  type Role,
} from '../../format.ts'
import { ListDialog, RenewDialog } from './MarketDialogs.tsx'
import { FormArrow } from '../../components/PlayerSheetView.tsx'
import { PlayerSheet } from './PlayerSheet.tsx'
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
  const [viewing, setViewing] = useState<string>()
  const [listing, setListing] = useState<string>()
  const [renewing, setRenewing] = useState<string>()
  const [position, setPosition] = useState<Position | undefined>()
  const [search, setSearch] = useState('')
  const [trainableOnly, setTrainableOnly] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const list = useRef<HTMLElement>(null)
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({
    key: 'position',
    ascending: true,
  })

  const squad = world.clubs[userClubId].playerIds.map((id) => world.players[id])
  const out = unavailablePlayers(season)
  const { autoReplace, setAutoReplace } = useLineupPrefs()
  // Injured and banned starters stay put until the manager swaps them, unless he lets the game do it.
  const lineup = autoReplace ? clubLineup(game, userClubId) : savedUserLineup(game)
  // Who misses the next match: an injury that heals by then doesn't count.
  const outForMatch = unavailableOn(season, nextUserGame(game)?.date ?? game.today)
  const missing = lineup.starters.filter((s) => outForMatch.has(s.playerId)).map((s) => s.playerId)
  const slots = new Map(lineup.starters.map((s) => [s.playerId, s.position]))
  const slotOf = (id: string) => lineup.starters.find((s) => s.playerId === id)
  const bench = new Set(lineup.bench)
  const roleOf = (id: string): Role =>
    slots.has(id) ? 'titular' : bench.has(id) ? 'reserva' : 'fora'

  const save = (next: Lineup) => setGame({ ...game, userLineup: next })
  const conditionOf = (id: string) =>
    conditionOn(season, world.players[id], game.today, recoveryRate(game, id))

  const query = search.trim().toLocaleLowerCase('pt-BR')
  const column = COLUMNS.find((c) => c.key === sort.key)!
  const rows: Row[] = squad
    .filter((p) => !position || p.position === position)
    .filter((p) => !query || p.name.toLocaleLowerCase('pt-BR').includes(query))
    .filter((p) => !trainableOnly || canTrain(p))
    .filter((p) => !favoritesOnly || game.favorites.includes(p.id))
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
  const idle = squad.filter((p) => canTrain(p) && !game.training.individual[p.id]).length
  // Phones have room for either the training plans or the sell and renew buttons:
  // the "Escolher treino" filter swaps one for the other.
  const trainingColumn = trainableOnly ? undefined : 'hidden sm:table-cell'
  const actionsColumn = trainableOnly ? 'hidden sm:table-cell' : undefined
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

  /** Opens the sale dialog; for a favorite not up for sale yet, only once the manager confirms. */
  const sell = async (id: string) => {
    const player = world.players[id]
    if (game.favorites.includes(id) && market.listed[id] === undefined) {
      const ok = await confirm({
        title: `Vender ${player.name}?`,
        description: `${player.name} está nos seus favoritos. Colocar à venda mesmo assim?`,
        action: 'Colocar à venda',
      })
      if (!ok) return
    }
    setListing(id)
  }

  const byId = (id: string | undefined) => (id ? world.players[id] : undefined)
  const viewed = byId(viewing)
  const listed = byId(listing)
  const renewed = byId(renewing)

  return (
    <>
      <div className="flex flex-col gap-4">
        <LineupEditor
          players={world.players}
          lineup={lineup}
          onChange={save}
          unavailable={out}
          outForMatch={outForMatch}
          condition={conditionOf}
          form={(id) => formOf(season, id)}
          notice={(editing) => (
            <>
              {missing.length > 0 && (
                <MissingStarters
                  names={missing.map((id) => absentName(game, id))}
                  onReplace={() => editing.change(clubLineup(game, userClubId))}
                  autoReplace={autoReplace}
                  onAutoReplace={setAutoReplace}
                />
              )}
              {missing.length === 0 && autoReplace && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked
                    onChange={() => setAutoReplace(false)}
                  />
                  Trocar desfalques automaticamente
                </label>
              )}
              <LearnLink tab="em-campo" section="funcoes" className="self-start" />
            </>
          )}
          hint="Toque no nome para ver a carta, vender ou renovar."
        >
          {({ selected, pick, movable }) => (
            <section ref={list} className="flex min-w-0 scroll-mt-16 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Choices
                  ariaLabel="Filtrar por posição"
                  options={['Todos', ...POSITIONS]}
                  value={position ?? 'Todos'}
                  onChange={(value) =>
                    setPosition(value === 'Todos' ? undefined : (value as Position))
                  }
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
                <Button
                  variant={trainableOnly ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={trainableOnly}
                  onClick={() => setTrainableOnly((only) => !only)}
                  title="Quem ainda pode ter treino individual"
                >
                  <DumbbellIcon />
                  Escolher treino
                </Button>
                <Button
                  variant={favoritesOnly ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={favoritesOnly}
                  onClick={() => setFavoritesOnly((only) => !only)}
                  title="Só os jogadores marcados com a estrela"
                >
                  <StarIcon />
                  Favoritos
                </Button>
              </div>
              {idle > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <p>
                    {idle}{' '}
                    {idle === 1 ? 'jogador pode treinar e está' : 'jogadores podem treinar e estão'}{' '}
                    sem treino individual.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGame(setRecommendedPlans(game, true))}
                  >
                    Colocar no recomendado
                  </Button>
                </div>
              )}
              {expiring > 0 && (
                <p className="text-sm text-muted-foreground">
                  {expiring} {expiring === 1 ? 'contrato termina' : 'contratos terminam'} no fim
                  desta temporada (em vermelho): renove ou o jogador sai de graça.
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
                      <TableHead
                        title="Treino individual; as setas mostram o que mais sobe o geral"
                        className={trainingColumn}
                      >
                        Treino
                      </TableHead>
                      <TableHead className={actionsColumn}>
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
                            colSpan={COLUMNS.length + 2}
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
                            disabled={!movable(p.id)}
                            listed={market.listed[p.id] !== undefined}
                            expiring={p.contractUntil <= season.year}
                            onPick={() => pick(p.id)}
                            onSell={() => sell(p.id)}
                            onRenew={() => setRenewing(p.id)}
                            actionsClassName={actionsColumn}
                          >
                            {/* On phones the tags wrap under the name, so the row fits the screen. */}
                            <TableCell className="whitespace-normal sm:whitespace-nowrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setViewing(p.id)
                                }}
                                className="cursor-pointer text-left font-medium hover:underline"
                              >
                                {p.name}
                              </button>
                              <FavoriteStar player={p} className="align-middle" />{' '}
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
                              <RowDetails>
                                {[
                                  `${p.age} anos`,
                                  <span key="condition" className="whitespace-nowrap">
                                    <span
                                      className={cn(
                                        p.condition < 85 && 'text-amber-600 dark:text-yellow-300',
                                      )}
                                    >
                                      {p.condition}%
                                    </span>{' '}
                                    <FormArrow form={p.form} />
                                  </span>,
                                  <span
                                    key="contract"
                                    className={cn(
                                      p.contractUntil <= season.year &&
                                        'font-semibold text-destructive',
                                    )}
                                  >
                                    até {p.contractUntil}
                                  </span>,
                                ]}
                              </RowDetails>
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
                              <GrowthMark growth={game.growth?.overall[p.id]} />
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
                            <TrainingCell
                              className={trainingColumn}
                              player={p}
                              plan={game.training.individual[p.id]}
                              onChange={(plan) => setGame(setTrainingPlan(game, p.id, plan))}
                            />
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
          )}
        </LineupEditor>

        <TrainingPanel
          onPickOneByOne={() => {
            setTrainableOnly(true)
            list.current?.scrollIntoView({ behavior: 'smooth' })
          }}
        />
      </div>

      {viewed && (
        <PlayerSheet
          game={game}
          player={viewed}
          role={roleOf(viewed.id)}
          slot={slotOf(viewed.id)}
          onClose={() => setViewing(undefined)}
          onSell={() => sell(viewed.id)}
          onRenew={() => setRenewing(viewed.id)}
          onTrain={(plan) => setGame(setTrainingPlan(game, viewed.id, plan))}
          onLoan={() => lend(viewed.id)}
        />
      )}
      {listed && <ListDialog game={game} player={listed} onClose={() => setListing(undefined)} />}
      {renewed && (
        <RenewDialog game={game} player={renewed} onClose={() => setRenewing(undefined)} />
      )}
    </>
  )
}

/**
 * Starters who can't play the next match, with the choice of swapping them
 * by hand or letting the game pick, now or from now on.
 */
function MissingStarters(props: {
  names: string[]
  onReplace: () => void
  autoReplace: boolean
  onAutoReplace: (auto: boolean) => void
}) {
  const many = props.names.length > 1
  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
      <p>
        <span className="font-semibold">{listText(props.names)}</span>{' '}
        {many ? 'não podem' : 'não pode'} jogar o próximo jogo. Toque {many ? 'em cada um' : 'nele'}{' '}
        e depois em quem entra, ou deixe o jogo escolher.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button size="sm" onClick={props.onReplace}>
          <WandSparklesIcon />
          Trocar automaticamente
        </Button>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={props.autoReplace}
            onChange={(e) => props.onAutoReplace(e.target.checked)}
          />
          Sempre trocar desfalques automaticamente
        </label>
      </div>
    </div>
  )
}

/**
 * A player's training plan in the squad list. The cell keeps its clicks and
 * presses to itself, so working the select never picks or drags the row.
 */
function TrainingCell(props: {
  className?: string
  player: Player
  plan: TrainingPlan | undefined
  onChange: (plan: TrainingPlan | undefined) => void
}) {
  const { player } = props
  const block = trainingBlock(player)
  const keep = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <TableCell className={props.className} onClick={keep} onMouseDown={keep} onTouchStart={keep}>
      {block ? (
        <span
          className="text-xs text-muted-foreground"
          title={
            block === 'idade'
              ? `Acima de ${TRAINING.individualUntil} anos`
              : 'Já chegou ao potencial'
          }
        >
          {block === 'idade' ? 'Idade' : 'No teto'}
        </span>
      ) : (
        <FocusSelect
          player={player}
          plan={props.plan}
          onChange={props.onChange}
          className={cn(
            'h-7 w-24 px-2 text-xs sm:w-32 sm:px-3 sm:text-sm',
            !props.plan && 'border-amber-500/60',
          )}
        />
      )}
    </TableCell>
  )
}

/** A squad list row: tap to pick for a swap, drag onto another player, or sell and renew. */
function SquadRow(props: {
  row: Row
  selected: boolean
  disabled: boolean
  listed: boolean
  expiring: boolean
  onPick: () => void
  onSell: () => void
  onRenew: () => void
  actionsClassName?: string
  children: ReactNode
}) {
  const { row, selected, disabled } = props
  const { setNode, listeners, isDragging, isOver } = useSwapSpot(row.id, 'list', disabled)
  const fit = row.slot && positionFit(row, row.slot)
  return (
    <TableRow
      ref={setNode}
      {...listeners}
      onClick={disabled ? undefined : props.onPick}
      data-state={selected ? 'selected' : undefined}
      className={cn(
        'touch-manipulation',
        disabled ? 'opacity-60' : 'cursor-pointer',
        selected &&
          'bg-yellow-300 text-green-950 hover:bg-yellow-300 data-[state=selected]:bg-yellow-300',
        isDragging && 'opacity-40',
        isOver && !isDragging && 'outline-2 -outline-offset-2 outline-yellow-400',
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
      <TableCell className={cn('text-right whitespace-nowrap sm:w-16', props.actionsClassName)}>
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
        <RowAction
          label={
            props.expiring
              ? `O contrato de ${row.name} termina em ${row.contractUntil}: renovar`
              : `Renovar o contrato de ${row.name}`
          }
          danger={props.expiring}
          onClick={props.onRenew}
        >
          <FilePenLineIcon />
        </RowAction>
      </TableCell>
    </TableRow>
  )
}

/** An icon button in a squad row, kept from picking or dragging the row; red when it needs doing. */
function RowAction(props: {
  label: string
  active?: boolean
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      // A finger needs a bigger target than a cursor.
      className={cn(
        'size-9 sm:size-7',
        props.active && 'text-yellow-600 dark:text-yellow-300',
        props.danger && 'text-destructive',
      )}
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

/** How much a player's overall moved in the last month, when it did. */
function GrowthMark({ growth }: { growth: number | undefined }) {
  if (!growth) return null
  return (
    <span
      className={cn(
        'ml-1 text-xs',
        growth > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400',
      )}
      title="No último mês"
    >
      {signedChange(growth)}
    </span>
  )
}
