import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BotIcon, TimerIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  draftPick,
  draftTick,
  loadDraftDeal,
  loadDraftPicks,
  loadDraftPool,
  loadDraftTeams,
  openDraftSlot,
  setDraftFormation,
  watchRoom,
  type DraftDeal,
  type DraftPick,
  type DraftTeam,
  type LiveClock,
} from '../../cloud/draft.ts'
import type { Room } from '../../cloud/rooms.ts'
import { FORMATION_LINES } from '../../engine/match/roles.ts'
import type { Formation, Position, World } from '../../engine/model/types.ts'
import {
  CARDS_PER_DEAL,
  DRAFT_FORMATIONS,
  STARTING_PLACES,
  teamSlots,
} from '../../engine/room/slots.ts'
import { primePlayer } from '../../engine/room/prime.ts'
import type { PoolPlayer } from '../../engine/room/start.ts'
import {
  draftPlayers,
  draftTotal,
  handZoom,
  pickProblem,
  picksUntil,
  roundOfPick,
  roundOrder,
  secondsLeft,
  slotOnTheClock,
  squadsOf,
  startersAndReserves,
  withLiveClock,
  type DraftPlayer,
} from '../draft.ts'
import { CARD_CUTS, POSITION_NAMES } from '../format.ts'
import { usePackWorld } from '../usePackWorld.ts'
import { Choices } from './Choices.tsx'
import { PlayerCard } from './PlayerCard.tsx'
import { PlayRoundButton } from './PlayRoundButton.tsx'
import { RoomPlayerSheet } from './RoomPlayerSheet.tsx'
import { TeamCrest } from './RoomParts.tsx'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Seconds between calls to the server once the clock ran out, until the pick shows up. */
const TICK_RETRY_MS = 2000

/** A robot's clock, set by the server, long enough to watch its cards turn. */
const ROBOT_PICK_SECONDS = 7
/** How long the table keeps a pick's cards, the chosen one raised, before the next turn. */
const REVEAL_MS = 2000
/** A fresh look at the whole draft now and then, in case a live update got lost. */
const SAFETY_RELOAD_MS = 20_000
/** Picks merged by number, so an older full list never drops a newer live one. */
const mergePicks = (now: DraftPick[], more: DraftPick[]) => {
  const byNo = new Map(now.map((p) => [p.pick, p]))
  for (const pick of more) byNo.set(pick.pick, pick)
  return [...byNo.values()].sort((a, b) => a.pick - b.pick)
}

/** The live draft: the clock and the order, the latest pick, the cards dealt, the player's places and the squads. */
export function DraftView(props: { room: Room; userId: string; reload: () => Promise<void> }) {
  const { userId, reload } = props
  const [teams, setTeams] = useState<DraftTeam[]>()
  const [pool, setPool] = useState<PoolPlayer[]>()
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [live, setLive] = useState<LiveClock>()
  const [deal, setDeal] = useState<DraftDeal>()
  const [failed, setFailed] = useState(false)
  const world = usePackWorld(props.room.pack)
  // A live update moves the clock at once; the full room follows.
  const room = withLiveClock(props.room, live)
  const roomId = room.id

  const refresh = useCallback(
    () =>
      Promise.all([loadDraftTeams(roomId), loadDraftPicks(roomId)]).then(
        ([loadedTeams, loadedPicks]) => {
          setTeams(loadedTeams)
          setPicks((now) => mergePicks(now, loadedPicks))
        },
      ),
    [roomId],
  )

  useEffect(() => {
    let live = true
    Promise.all([loadDraftPool(roomId), loadDraftTeams(roomId), loadDraftPicks(roomId)])
      .then(([loadedPool, loadedTeams, loadedPicks]) => {
        if (!live) return
        setPool(loadedPool)
        setTeams(loadedTeams)
        setPicks((now) => mergePicks(now, loadedPicks))
      })
      .catch(() => live && setFailed(true))
    const stop = watchRoom(roomId, {
      pick: (pick) => setPicks((now) => mergePicks(now, [pick])),
      deal: setDeal,
      room: (clock) => {
        setLive((now) => (now && now.pickNo > clock.pickNo ? now : clock))
        void reload()
      },
      team: (team) => setTeams((now) => now?.map((t) => (t.slot === team.slot ? team : t))),
    })
    const safety = setInterval(() => {
      void refresh().catch(() => undefined)
      void reload()
    }, SAFETY_RELOAD_MS)
    return () => {
      live = false
      stop()
      clearInterval(safety)
    }
  }, [roomId, refresh, reload])

  // The cards of the pick under way, fetched again when the pick moves on, in case a live one got lost.
  const pickNo = room.draft?.pickNo ?? 0
  useEffect(() => {
    let live = true
    loadDraftDeal(roomId, pickNo)
      .then((found) => live && found && setDeal((now) => (now?.pick === found.pick ? now : found)))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [roomId, pickNo])
  const current = deal?.pick === pickNo ? deal : undefined

  // Every deal shown on the table, so its pick can be shown with the chosen card raised.
  const shown = useRef(new Map<number, DraftDeal>())
  useEffect(() => {
    if (current) shown.current.set(current.pick, current)
  }, [current])
  const [reveal, setReveal] = useState<Reveal>()
  const last = picks.at(-1)
  const lastNo = last?.pick
  const lastId = last?.playerId
  useEffect(() => {
    if (lastNo === undefined || lastId === undefined) return
    const dealt = shown.current.get(lastNo)
    if (!dealt) return
    shown.current.delete(lastNo)
    setReveal({ deal: dealt, playerId: lastId })
  }, [lastNo, lastId])
  useEffect(() => {
    if (!reveal) return
    const timer = setTimeout(() => setReveal(undefined), REVEAL_MS)
    return () => clearTimeout(timer)
  }, [reveal])

  const byId = useMemo(() => draftPlayers(pool ?? [], picks, current), [pool, picks, current])
  if (failed) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          Não deu para carregar o draft agora. Atualize a página.
        </CardContent>
      </Card>
    )
  }
  if (!teams || !pool) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">Carregando o draft…</CardContent>
      </Card>
    )
  }

  const mine = teams.find((t) => t.userId === userId)
  const after = () => Promise.all([refresh(), reload()]).then(() => undefined)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
      {/* On a phone the clock and the order stay on top; on a wider screen, in the side column. */}
      <aside className="z-10 flex min-w-0 flex-col gap-3 max-md:sticky max-md:top-0 max-md:-mx-4 max-md:bg-background max-md:px-4 max-md:pt-2 max-md:pb-1 md:sticky md:top-4 md:self-start">
        <Clock
          room={room}
          teams={teams}
          mine={mine}
          owner={room.ownerId === userId}
          onTicked={after}
        />
        <PickOrder room={room} teams={teams} picks={picks} mine={mine} />
      </aside>
      <div className="flex min-w-0 flex-col gap-4">
        <LastPick room={room} teams={teams} byId={byId} picks={picks} />
        {reveal ? (
          <RevealTable reveal={reveal} teams={teams} byId={byId} world={world} />
        ) : (
          slotOnTheClock(room) !== undefined && (
            <DealTable
              room={room}
              teams={teams}
              byId={byId}
              picks={picks}
              mine={mine}
              deal={current}
              world={world}
              onPicked={after}
            />
          )
        )}
        {mine && slotOnTheClock(room) !== undefined && (
          <MyPlaces
            room={room}
            team={mine}
            byId={byId}
            picks={picks}
            deal={current}
            onChanged={after}
          />
        )}
        <DraftBoard room={room} teams={teams} byId={byId} picks={picks} world={world} />
      </div>
    </div>
  )
}

/**
 * Every team in the order it picks this round, the one on the clock with a
 * highlighted border and the ones that already picked faded: a row on a
 * phone, a list in the side column.
 */
function PickOrder(props: {
  room: Room
  teams: DraftTeam[]
  picks: DraftPick[]
  mine?: DraftTeam
}) {
  const { room, teams, picks, mine } = props
  const list = useRef<HTMLOListElement>(null)
  const order = roundOrder(room)
  const onClock = slotOnTheClock(room)
  // On a phone the row scrolls: keep the team on the clock in the middle of it.
  useEffect(() => {
    const row = list.current
    const current = row?.querySelector<HTMLElement>('[aria-current]')
    if (!row || !current || row.scrollWidth <= row.clientWidth) return
    row.scrollTo({
      left: current.offsetLeft - row.offsetLeft - (row.clientWidth - current.clientWidth) / 2,
      behavior: 'smooth',
    })
  }, [onClock])
  if (order.length === 0) return null
  const pickNo = room.draft?.pickNo ?? 0
  const done = pickNo % room.options.teams
  const over = onClock === undefined
  const { round } = roundOfPick(Math.min(pickNo, draftTotal(room) - 1), room.options.teams)
  const counts = new Map<number, number>()
  for (const pick of picks) counts.set(pick.slot, (counts.get(pick.slot) ?? 0) + 1)
  return (
    <section aria-label="Ordem da rodada" className="flex flex-col gap-1.5">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase max-md:sr-only">
        Ordem da rodada {round}
      </h2>
      <ol
        ref={list}
        className="relative flex gap-2 overflow-x-auto pb-1 md:flex-col md:gap-1 md:overflow-visible"
      >
        {order.map((slot, i) => {
          const team = teams.find((t) => t.slot === slot)
          if (!team) return null
          const current = slot === onClock
          const picked = over || i < done
          return (
            <li
              key={slot}
              aria-current={current ? 'true' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg border-2 border-transparent transition-all max-md:w-16 max-md:flex-col max-md:p-1 md:px-2 md:py-1',
                current && 'border-highlight bg-highlight-soft shadow-sm',
                picked && !current && 'opacity-45',
              )}
            >
              <span className="relative">
                <TeamCrest
                  team={team}
                  id={`ordem-${slot}`}
                  className={cn('size-9 md:size-7', current && 'animate-pulse')}
                />
                {team.robot && (
                  <BotIcon
                    className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-background p-px text-muted-foreground"
                    aria-label="Robô"
                  />
                )}
              </span>
              <span className="min-w-0 max-md:w-full max-md:text-center md:flex-1">
                <span className="block truncate text-[0.7rem] font-semibold md:text-sm">
                  <span className="md:hidden">{team.shortName}</span>
                  <span className="max-md:hidden">{team.name}</span>
                </span>
                <span className="block text-[0.65rem] text-muted-foreground max-md:hidden">
                  {mine && slot === mine.slot ? 'você · ' : ''}
                  {counts.get(slot) ?? 0}/{room.options.squadSize} jogadores
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** While it is the player's turn: a buzz, and the tab's title says so. */
function useYourTurnAlert(myTurn: boolean) {
  useEffect(() => {
    if (!myTurn) return
    // Browsers only let a page buzz after the player touched it.
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([200, 100, 200])
    const title = document.title
    let on = true
    const blink = setInterval(() => {
      on = !on
      document.title = on ? '⚽ Sua vez!' : title
    }, 1000)
    document.title = '⚽ Sua vez!'
    return () => {
      clearInterval(blink)
      document.title = title
    }
  }, [myTurn])
}

function Clock(props: {
  room: Room
  teams: DraftTeam[]
  mine?: DraftTeam
  owner: boolean
  onTicked: () => Promise<void>
}) {
  const { room, mine } = props
  const [now, setNow] = useState(() => Date.now())
  const ticking = useRef(false)
  const slot = slotOnTheClock(room)
  const team = props.teams.find((t) => t.slot === slot)
  const deadline = room.draft?.deadline
  const left = secondsLeft(deadline, now)
  const myTurn = mine !== undefined && slot === mine.slot
  const total = draftTotal(room)
  const pickNo = room.draft?.pickNo ?? 0
  const { round, inRound } = roundOfPick(pickNo, room.options.teams)
  const until = mine ? picksUntil(room, mine.slot) : undefined
  useYourTurnAlert(myTurn && !mine?.auto)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])

  // Clock at zero: ask the server for the automatic pick, again every few seconds until it shows up.
  const { onTicked } = props
  useEffect(() => {
    if (slot === undefined || !deadline) return
    const due = deadline.getTime() - Date.now()
    let retry: ReturnType<typeof setInterval> | undefined
    const tick = () => {
      if (ticking.current) return
      ticking.current = true
      draftTick(room.id)
        .then((made) => (made ? onTicked() : undefined))
        .catch(() => undefined)
        .finally(() => (ticking.current = false))
    }
    const start = setTimeout(
      () => {
        tick()
        retry = setInterval(tick, TICK_RETRY_MS)
      },
      Math.max(0, due + 300),
    )
    return () => {
      clearTimeout(start)
      if (retry) clearInterval(retry)
    }
  }, [room.id, slot, deadline, pickNo, onTicked])

  if (slot === undefined || !team) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Draft encerrado</CardTitle>
          <CardDescription>
            Todos os {total} jogadores foram escolhidos.{' '}
            {props.owner
              ? 'Quando quiser, comece a liga: cada rodada é jogada quando você tocar no botão.'
              : 'Quem criou a sala começa a liga.'}
          </CardDescription>
        </CardHeader>
        {props.owner && (
          <CardContent>
            <PlayRoundButton room={room.id} label="Começar a liga" onPlayed={onTicked} />
          </CardContent>
        )}
      </Card>
    )
  }

  const share = Math.min(1, left / (team.robot ? ROBOT_PICK_SECONDS : room.options.pickSeconds))
  return (
    <Card
      className={cn('gap-3 overflow-hidden', myTurn && 'border-highlight ring-2 ring-highlight/40')}
    >
      <CardContent className="flex flex-wrap items-center gap-3">
        <TeamCrest team={team} id={`relogio-${team.slot}`} className="size-10 shrink-0" />
        <div className="flex min-w-40 flex-1 flex-col">
          <span className="text-xs text-muted-foreground">
            Rodada {round} de {room.options.squadSize}, escolha {inRound} · {pickNo + 1} de {total}
          </span>
          <span className="truncate text-lg font-bold">
            {myTurn ? 'Sua vez de escolher!' : `Vez do ${team.name}`}
          </span>
          <span className="text-xs text-muted-foreground">
            {team.robot
              ? 'Robô escolhendo…'
              : team.auto
                ? 'No automático'
                : !myTurn && until !== undefined
                  ? until === 1
                    ? 'Você é o próximo!'
                    : `Você escolhe daqui a ${until} escolhas.`
                  : ' '}
          </span>
        </div>
        <span
          className={cn(
            'flex items-center gap-1 font-mono text-2xl font-bold tabular-nums',
            left <= 10 && !team.robot && 'text-destructive',
          )}
          aria-label={`${left} segundos`}
        >
          <TimerIcon className="size-5" />
          {left}
        </span>
      </CardContent>
      <div className="h-1.5 w-full bg-muted" aria-hidden>
        <div
          className={cn(
            'h-full transition-[width] duration-300 ease-linear',
            left <= 10 ? 'bg-destructive' : 'bg-highlight',
          )}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </Card>
  )
}

/** The latest pick, revealed like a card flipped on the table. */
function LastPick(props: {
  room: Room
  teams: DraftTeam[]
  byId: ReadonlyMap<string, DraftPlayer>
  picks: DraftPick[]
}) {
  const last = props.picks.at(-1)
  if (!last) return null
  const team = props.teams.find((t) => t.slot === last.slot)
  const player = props.byId.get(last.playerId)
  if (!team || !player) return null
  const { round, inRound } = roundOfPick(last.pick, props.room.options.teams)
  return (
    <div
      key={last.pick}
      className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm duration-500 animate-in fade-in zoom-in-95 slide-in-from-top-2"
    >
      <TeamCrest team={team} id={`ultima-${last.pick}`} className="size-9 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted-foreground">
          Escolha {round}.{inRound} · {team.name}
          {last.auto && !team.robot && ' (automático)'}
        </span>
        <span className="truncate font-bold">{player.name}</span>
        <span className="text-xs text-muted-foreground">
          {POSITION_NAMES[player.position]} · {player.origin}
        </span>
      </div>
      <MiniCard player={player} />
    </div>
  )
}

/** A small card face: overall and position on the band colour of the player's card. */
function MiniCard(props: { player: DraftPlayer }) {
  const { player } = props
  const tier = player.prime
    ? 'prime'
    : player.overall >= CARD_CUTS.ouro
      ? 'ouro'
      : player.overall >= CARD_CUTS.prata
        ? 'prata'
        : 'bronze'
  return (
    <span
      className={cn(
        'flex w-12 shrink-0 flex-col items-center rounded-lg bg-gradient-to-br py-1 leading-none shadow ring-1 ring-black/20 duration-700 animate-in spin-in-12 zoom-in-50',
        tier === 'ouro' && 'from-amber-500 via-yellow-200 to-amber-500 text-amber-950',
        tier === 'prata' && 'from-slate-400 via-slate-100 to-slate-400 text-slate-900',
        tier === 'bronze' && 'from-amber-800 via-orange-300 to-amber-700 text-amber-950',
        tier === 'prime' && PRIME_CLASSES,
      )}
      title={player.prime ? `Prime: +${player.prime} de geral nesta sala` : undefined}
    >
      <span className="text-xl font-black tabular-nums">{player.overall}</span>
      <span className="text-xs font-bold">{player.position}</span>
    </span>
  )
}

/** The purple of a prime card, on a gradient. */
const PRIME_CLASSES = 'from-violet-950 via-purple-600 to-violet-950 text-violet-50'

/** How long each card waits before it turns, one after the other. */
const FLIP_STEP_MS = 450
/** Overall from which a card comes out with a glow, like a walkout. */
const WALKOUT = 85

/**
 * The cards dealt for the pick under way, the prime first and then the best
 * on the left, turned one by one for everyone in the room from the right, so
 * the best turns last. On the player's turn, tapping a card picks it out and
 * the button keeps it.
 */
function DealTable(props: {
  room: Room
  teams: DraftTeam[]
  byId: ReadonlyMap<string, DraftPlayer>
  picks: DraftPick[]
  mine?: DraftTeam
  deal?: DraftDeal
  world?: World
  onPicked: () => Promise<void>
}) {
  const { room, byId, picks, mine, deal, world } = props
  const [selected, setSelected] = useState<string>()
  const [handRef, zoom] = useHandZoom()
  const [busy, setBusy] = useState(false)
  const slot = slotOnTheClock(room)
  const team = props.teams.find((t) => t.slot === slot)
  const myTurn = mine !== undefined && slot === mine.slot
  const cards = (deal?.playerIds ?? [])
    .map((id) => byId.get(id))
    .filter((p) => p !== undefined)
    .sort(
      (a, b) => Number(!!b.prime) - Number(!!a.prime) || b.overall - a.overall || a.rank - b.rank,
    )
  const chosen = cards.find((p) => p.id === selected)
  const problem = mine && chosen ? pickProblem(room, byId, picks, mine.slot, chosen.id) : undefined
  const position = deal && team ? placePosition(team, room, deal.slotIndex) : undefined

  const pick = async () => {
    if (!chosen) return
    setBusy(true)
    try {
      await draftPick(room.id, chosen.id)
      setSelected(undefined)
      await props.onPicked()
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  // On the player's own turn the places come first; the cards show up once one is opened.
  if (!team || (myTurn && !deal)) return null
  return (
    <Card className="gap-3 overflow-hidden">
      <CardHeader>
        <CardTitle>
          {deal
            ? `${myTurn ? 'Suas cartas' : `Cartas do ${team.shortName}`}${position ? `: ${POSITION_NAMES[position].toLowerCase()}` : ''}`
            : `${team.name} está escolhendo a vaga…`}
        </CardTitle>
        <CardDescription>
          {deal
            ? myTurn
              ? 'Toque numa carta e confirme. Se o tempo acabar, fica a melhor.'
              : 'Uma delas vai para o time; as outras voltam para o monte.'
            : 'Quando a vaga for escolhida, as 5 cartas abrem aqui para todo mundo ver.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul
          key={deal?.pick ?? 'monte'}
          ref={handRef}
          className="flex flex-wrap justify-center gap-3 pt-3 pb-2 [perspective:1200px]"
        >
          {deal
            ? cards.map((player, i) => {
                const isSelected = player.id === selected
                return (
                  <li key={player.id} style={{ zoom }}>
                    <button
                      type="button"
                      disabled={!myTurn}
                      aria-pressed={isSelected}
                      aria-label={`${player.name}, ${POSITION_NAMES[player.position]}, geral ${player.overall}${player.prime ? ', carta prime' : ''}`}
                      onClick={() => setSelected(isSelected ? undefined : player.id)}
                      className={cn(
                        'block rounded-[2.6rem_2.6rem_1.1rem_1.1rem] transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-default',
                        myTurn && 'hover:-translate-y-1',
                        isSelected &&
                          '-translate-y-2 ring-4 ring-highlight ring-offset-4 ring-offset-card',
                      )}
                    >
                      <FlipCard
                        delayMs={(cards.length - 1 - i) * FLIP_STEP_MS}
                        glow={
                          player.prime ? 'prime' : player.overall >= WALKOUT ? 'walkout' : undefined
                        }
                        front={<DraftCard player={player} world={world} />}
                      />
                    </button>
                  </li>
                )
              })
            : Array.from({ length: CARDS_PER_DEAL }, (_, i) => (
                <li key={i} style={{ zoom }}>
                  <CardBack className={cn(!myTurn && 'animate-pulse')} />
                </li>
              ))}
        </ul>
        {deal &&
          myTurn &&
          (chosen ? (
            <Button size="lg" onClick={pick} disabled={busy || problem !== undefined}>
              Escolher {chosen.name}
            </Button>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Toque numa carta para escolher.
            </p>
          ))}
        {problem && <p className="text-center text-sm text-destructive">{problem}</p>}
      </CardContent>
    </Card>
  )
}

function useHandZoom(): [(node: HTMLUListElement | null) => void, number] {
  const [zoom, setZoom] = useState(1)
  const observer = useRef<ResizeObserver>(undefined)
  const ref = useCallback((node: HTMLUListElement | null) => {
    observer.current?.disconnect()
    if (!node) return
    observer.current = new ResizeObserver(([entry]) => setZoom(handZoom(entry.contentRect.width)))
    observer.current.observe(node)
  }, [])
  return [ref, zoom]
}

/** A draft player's card: the pack's full card when it has loaded, boosted if prime. */
function DraftCard(props: { player: DraftPlayer; world?: World }) {
  const { player, world } = props
  const full = world?.players[player.id]
  if (!world || !full) return <PlainCard player={player} />
  return (
    <PlayerCard
      player={{
        ...primePlayer(full, player.prime ?? 0),
        name: player.name,
        overall: player.overall,
      }}
      club={world.clubs[full.clubId]}
      tier={player.prime ? 'prime' : undefined}
    />
  )
}

/**
 * A drafted player's whole sheet, his card as it was picked; just the card
 * for a player the pack's world doesn't know.
 */
function DraftPlayerSheet(props: {
  player: DraftPlayer
  world: World
  team?: string
  onClose: () => void
}) {
  const { player, world, onClose } = props
  const full = world.players[player.id]
  if (!full) {
    return (
      <Dialog open onOpenChange={(on) => !on && onClose()}>
        <DialogContent className="w-auto items-center justify-items-center">
          <DialogTitle className="sr-only">Carta de {player.name}</DialogTitle>
          <PlainCard player={player} />
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <RoomPlayerSheet
      player={{
        ...primePlayer(full, player.prime ?? 0),
        name: player.name,
        overall: player.overall,
      }}
      world={world}
      prime={!!player.prime}
      team={props.team}
      onClose={onClose}
    />
  )
}

/** The position of a team's place, from its formation (4-4-2 until it picks one). */
function placePosition(team: DraftTeam, room: Room, index: number): Position | undefined {
  return teamSlots(team.formation ?? '4-4-2', room.options.squadSize)[index]
}

type Reveal = { deal: DraftDeal; playerId: string }

/**
 * The cards of the pick just made, for everyone in the room: the chosen one
 * raised and shining, the others dimmed, for a moment before the next turn.
 */
function RevealTable(props: {
  reveal: Reveal
  teams: DraftTeam[]
  byId: ReadonlyMap<string, DraftPlayer>
  world?: World
}) {
  const { reveal, byId, world } = props
  const [handRef, zoom] = useHandZoom()
  const team = props.teams.find((t) => t.slot === reveal.deal.slot)
  const cards = reveal.deal.playerIds
    .map((id) => byId.get(id))
    .filter((p) => p !== undefined)
    .sort(
      (a, b) => Number(!!b.prime) - Number(!!a.prime) || b.overall - a.overall || a.rank - b.rank,
    )
  const chosen = cards.find((p) => p.id === reveal.playerId)
  return (
    <Card className="gap-3 overflow-hidden">
      <CardHeader>
        <CardTitle>
          {team?.shortName} escolheu {chosen?.name ?? 'um jogador'}
        </CardTitle>
        <CardDescription>As outras cartas voltam para o monte.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul
          ref={handRef}
          className="flex flex-wrap justify-center gap-3 pt-8 pb-2"
          aria-label="Cartas da escolha"
        >
          {cards.map((player) => {
            const picked = player.id === reveal.playerId
            return (
              <li key={player.id} style={{ zoom }}>
                <span
                  className={cn(
                    'block rounded-[2.6rem_2.6rem_1.1rem_1.1rem] transition-all duration-500',
                    picked
                      ? 'z-10 animate-[card-lift_0.6s_cubic-bezier(0.2,0.8,0.3,1)_both] ring-4 ring-highlight ring-offset-4 ring-offset-card'
                      : 'scale-90 opacity-35 grayscale',
                  )}
                >
                  <DraftCard player={player} world={world} />
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

/** A card that comes face down and turns over after `delayMs`. */
function FlipCard(props: { front: ReactNode; delayMs: number; glow?: 'walkout' | 'prime' }) {
  return (
    <span
      className="relative block animate-[card-flip_0.7s_cubic-bezier(0.2,0.8,0.3,1)_both] [transform-style:preserve-3d]"
      style={{ animationDelay: `${props.delayMs}ms` }}
    >
      <span
        className={cn(
          'block [backface-visibility:hidden]',
          props.glow && 'rounded-[2.5rem_2.5rem_1rem_1rem]',
          props.glow === 'walkout' && 'animate-[walkout_1.8s_ease-in-out_infinite]',
          props.glow === 'prime' && 'animate-[prime-glow_1.4s_ease-in-out_infinite]',
        )}
        style={props.glow ? { animationDelay: `${props.delayMs + 700}ms` } : undefined}
      >
        {props.front}
      </span>
      <CardBack className="absolute inset-0 h-full [transform:rotateY(180deg)] [backface-visibility:hidden]" />
    </span>
  )
}

/** The back of a card: the deck the five come from. */
function CardBack(props: { className?: string }) {
  return (
    <span
      className={cn(
        'flex h-[17rem] w-48 items-center justify-center rounded-t-[2.5rem] rounded-b-2xl bg-[repeating-linear-gradient(45deg,var(--color-emerald-900)_0_10px,var(--color-emerald-800)_10px_20px)] shadow-lg ring-2 ring-highlight/60',
        props.className,
      )}
      aria-hidden
    >
      <span className="flex size-16 items-center justify-center rounded-full border-2 border-highlight/70 font-[Pixelify_Sans_Variable] text-2xl font-bold text-highlight">
        11
      </span>
    </span>
  )
}

/**
 * The player's team as places on a pitch, forwards on top, and the reserves:
 * the formation to pick before the first card, and on their turn the empty
 * place to open five cards for.
 */
function MyPlaces(props: {
  room: Room
  team: DraftTeam
  byId: ReadonlyMap<string, DraftPlayer>
  picks: DraftPick[]
  deal?: DraftDeal
  onChanged: () => Promise<void>
}) {
  const { room, team, byId, picks, deal } = props
  const [busy, setBusy] = useState(false)
  const formation = team.formation ?? '4-4-2'
  const places = teamSlots(formation, room.options.squadSize)
  const mine = picks.filter((p) => p.slot === team.slot)
  const filled = new Map(
    mine.filter((p) => p.slotIndex !== undefined).map((p) => [p.slotIndex!, p]),
  )
  const myTurn = slotOnTheClock(room) === team.slot
  const canOpen = myTurn && !deal && !busy
  // The formation is settled with the first card dealt to the team.
  const settled = mine.length > 0 || deal?.slot === team.slot

  const open = async (index: number) => {
    setBusy(true)
    try {
      await openDraftSlot(room.id, index)
      await props.onChanged()
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setBusy(false)
    }
  }
  const choose = async (next: Formation) => {
    try {
      await setDraftFormation(room.id, next)
      await props.onChanged()
    } catch (error) {
      toast.error(messageOf(error))
    }
  }

  // The eleven by line from the keeper forwards, drawn forwards on top.
  let at = 0
  const lines = FORMATION_LINES[formation].map((line) => line.map(() => at++))
  const reserves = places.map((_, i) => i).slice(STARTING_PLACES)

  const place = (index: number) => {
    const pick = filled.get(index)
    const player = pick && byId.get(pick.playerId)
    const position = places[index]
    const dealing = deal?.slot === team.slot && deal.slotIndex === index
    if (player) {
      return (
        <span
          key={index}
          className={cn(
            'flex w-16 flex-col items-center rounded-md bg-background/80 px-1 py-0.5 text-center shadow-sm ring-1 ring-black/10 sm:w-20',
            player.prime && cn('bg-gradient-to-br', PRIME_CLASSES),
          )}
          title={player.prime ? `Prime: +${player.prime} de geral nesta sala` : undefined}
        >
          <span className="font-mono text-sm font-bold tabular-nums">{player.overall}</span>
          <span className="w-full truncate text-[0.65rem] leading-tight">
            {player.name.split(' ').at(-1)}
          </span>
        </span>
      )
    }
    return (
      <button
        key={index}
        type="button"
        disabled={!canOpen}
        onClick={() => open(index)}
        title={POSITION_NAMES[position]}
        className={cn(
          'flex h-11 w-16 flex-col items-center justify-center rounded-md border-2 border-dashed border-white/50 text-sm font-bold text-white sm:w-20',
          canOpen && 'cursor-pointer border-highlight bg-highlight/20 hover:bg-highlight/40',
          dealing && 'animate-pulse border-solid border-highlight bg-highlight/40',
        )}
      >
        {position}
      </button>
    )
  }

  return (
    <Card className={cn('gap-3', canOpen && 'border-highlight ring-2 ring-highlight/40')}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          {canOpen ? 'Escolha uma vaga' : 'Seu time'}
          <span className="text-sm font-normal text-muted-foreground tabular-nums">
            {mine.length}/{room.options.squadSize}
          </span>
        </CardTitle>
        <CardDescription>
          {canOpen
            ? 'Toque numa vaga vazia para abrir 5 cartas daquela posição.'
            : settled
              ? `Formação ${formation}. Cada carta vai para a vaga em que foi aberta.`
              : 'Escolha a formação antes da sua primeira carta: ela decide as vagas do seu time.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!settled && (
          <Choices
            ariaLabel="Formação"
            options={DRAFT_FORMATIONS}
            value={formation}
            onChange={choose}
          />
        )}
        <div className="flex flex-col gap-2 rounded-lg bg-[linear-gradient(to_bottom,var(--color-green-700),var(--color-green-800))] p-3">
          {[...lines].reverse().map((line, i) => (
            <div key={i} className="flex justify-center gap-1.5">
              {line.map(place)}
            </div>
          ))}
        </div>
        {reserves.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Reservas
            </span>
            <div className="flex flex-wrap gap-1.5 rounded-lg bg-muted p-2">
              {reserves.map(place)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** A card for a player the pack no longer has in full: overall, position, name and club. */
function PlainCard(props: { player: DraftPlayer }) {
  const { player } = props
  return (
    <span
      className={cn(
        'flex h-64 w-48 flex-col items-center justify-center gap-1 rounded-t-[2.5rem] rounded-b-2xl bg-gradient-to-br p-3 shadow-lg ring-1 ring-black/20',
        player.prime ? PRIME_CLASSES : 'from-slate-400 via-slate-100 to-slate-400 text-slate-900',
      )}
    >
      <span className="text-4xl font-black tabular-nums">{player.overall}</span>
      <span className="text-sm font-bold">{player.position}</span>
      <span className="w-full truncate text-center font-extrabold uppercase">{player.name}</span>
      <span className="text-xs">{player.origin}</span>
      {player.prime && (
        <span className="rounded-full bg-black/30 px-2 text-[0.65rem] font-bold uppercase">
          Prime
        </span>
      )}
    </span>
  )
}

/** A player's line in the lists: overall, position, name, club of origin and age. */
function PlayerLine(props: { player: DraftPlayer; onOpen?: (player: DraftPlayer) => void }) {
  const { player, onOpen } = props
  const Line = onOpen ? 'button' : 'span'
  return (
    <Line
      {...(onOpen && {
        type: 'button' as const,
        onClick: () => onOpen(player),
        title: `Ver a carta de ${player.name}`,
      })}
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 text-left',
        onOpen && 'cursor-pointer rounded hover:bg-accent',
      )}
    >
      <span
        className={cn(
          'w-7 shrink-0 text-right font-mono font-bold tabular-nums',
          player.prime && 'rounded bg-purple-600 px-0.5 text-white',
        )}
        title={player.prime ? `Prime: +${player.prime} de geral nesta sala` : undefined}
      >
        {player.overall}
      </span>
      <span
        className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground"
        title={POSITION_NAMES[player.position]}
      >
        {player.position}
      </span>
      <span className="min-w-0 flex-1 truncate">{player.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{player.origin}</span>
    </Line>
  )
}

/**
 * A team's eleven and reserves: the places its cards went to, or for a draft
 * made before the places, the likely eleven of its players.
 */
function squadSplit(picks: readonly DraftPick[], byId: ReadonlyMap<string, DraftPlayer>) {
  const players = picks.map((p) => byId.get(p.playerId)).filter((p) => p !== undefined)
  if (!picks.every((p) => p.slotIndex !== undefined)) return startersAndReserves(players)
  const placed = [...picks].sort((a, b) => a.slotIndex! - b.slotIndex!)
  const pick = (list: DraftPick[]) =>
    list.map((p) => byId.get(p.playerId)).filter((p) => p !== undefined)
  return {
    starters: pick(placed.filter((p) => p.slotIndex! < STARTING_PLACES)),
    reserves: pick(placed.filter((p) => p.slotIndex! >= STARTING_PLACES)),
  }
}

/** Every team's squad as it stands, eleven then reserves, or every pick, the latest first. */
export function DraftBoard(props: {
  room: Room
  teams: DraftTeam[]
  byId: ReadonlyMap<string, DraftPlayer>
  picks: DraftPick[]
  /** The pack's world, for the cards; loaded here on the first card opened if not given. */
  world?: World
}) {
  const { room, teams, byId, picks } = props
  const [view, setView] = useState<'elencos' | 'historico'>('elencos')
  const [open, setOpen] = useState<DraftPlayer>()
  const [wanted, setWanted] = useState(false)
  const loaded = usePackWorld(props.world || !wanted ? undefined : room.pack)
  const world = props.world ?? loaded
  const onOpen = (player: DraftPlayer) => {
    setWanted(true)
    setOpen(player)
  }
  const squads = squadsOf(picks)
  const teamOf = new Map(teams.map((t) => [t.slot, t]))
  const recent = [...picks].sort((a, b) => b.pick - a.pick)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          {view === 'elencos' ? 'Elencos' : 'Histórico'}
          <Choices
            ariaLabel="Ver"
            options={['elencos', 'historico'] as const}
            value={view}
            label={(v) => (v === 'elencos' ? 'Elencos' : 'Histórico')}
            onChange={setView}
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {view === 'historico' ? (
          recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém escolheu ainda.</p>
          ) : (
            <ol className="flex flex-col gap-1 text-sm">
              {recent.map((pick) => {
                const team = teamOf.get(pick.slot)
                const player = byId.get(pick.playerId)
                const { round, inRound } = roundOfPick(pick.pick, room.options.teams)
                return (
                  <li key={pick.pick} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {round}.{inRound}
                    </span>
                    {team && (
                      <TeamCrest
                        team={team}
                        id={`escolha-${pick.pick}`}
                        className="size-5 shrink-0"
                      />
                    )}
                    <span className="w-10 shrink-0 text-xs font-semibold">{team?.shortName}</span>
                    {player && <PlayerLine player={player} onOpen={onOpen} />}
                    {pick.auto && !team?.robot && (
                      <BotIcon
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-label="Escolha automática"
                      />
                    )}
                  </li>
                )
              })}
            </ol>
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => {
              const players = (squads.get(team.slot) ?? [])
                .map((id) => byId.get(id))
                .filter((p) => p !== undefined)
              const { starters, reserves } = squadSplit(
                picks.filter((p) => p.slot === team.slot),
                byId,
              )
              return (
                <section key={team.slot} className="flex flex-col gap-1 rounded-md border p-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <TeamCrest team={team} id={`elenco-${team.slot}`} className="size-5" />
                    <span className="truncate">{team.name}</span>
                    {team.robot && (
                      <BotIcon className="size-3.5 text-muted-foreground" aria-label="Robô" />
                    )}
                    <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
                      {players.length}/{room.options.squadSize}
                    </span>
                  </h3>
                  {players.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Ainda sem jogadores.</p>
                  ) : (
                    <ul className="flex flex-col text-xs">
                      {starters.map((player) => (
                        <li key={player.id}>
                          <PlayerLine player={player} onOpen={onOpen} />
                        </li>
                      ))}
                      {reserves.length > 0 && (
                        <li className="mt-1 mb-0.5 border-t pt-1 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
                          Reservas
                        </li>
                      )}
                      {reserves.map((player) => (
                        <li key={player.id}>
                          <PlayerLine player={player} onOpen={onOpen} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </CardContent>
      {open && world && (
        <DraftPlayerSheet
          player={open}
          world={world}
          team={teamOf.get(picks.find((p) => p.playerId === open.id)?.slot ?? -1)?.name}
          onClose={() => setOpen(undefined)}
        />
      )}
    </Card>
  )
}
