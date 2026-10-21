import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BotIcon, TimerIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  draftPick,
  draftTick,
  loadDraftPicks,
  loadDraftPool,
  loadDraftTeams,
  setDraftAuto,
  watchRoom,
  type DraftPick,
  type DraftTeam,
  type LiveClock,
} from '../../cloud/draft.ts'
import type { Room } from '../../cloud/rooms.ts'
import { POSITIONS, type Position, type World } from '../../engine/model/types.ts'
import type { PoolPlayer } from '../../engine/room/start.ts'
import {
  draftTotal,
  pickProblem,
  picksUntil,
  positionCounts,
  roundOfPick,
  secondsLeft,
  slotOnTheClock,
  squadsOf,
  startersAndReserves,
  strongestFree,
  withLiveClock,
} from '../draft.ts'
import { CARD_CUTS, POSITION_NAMES } from '../format.ts'
import { usePackWorld } from '../usePackWorld.ts'
import { Choices } from './Choices.tsx'
import { PlayerCard } from './PlayerCard.tsx'
import { PlayRoundButton } from './PlayRoundButton.tsx'
import { TeamCrest } from './RoomParts.tsx'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Seconds between calls to the server once the clock ran out, until the pick shows up. */
const TICK_RETRY_MS = 2000
/** A fresh look at the whole draft now and then, in case a live update got lost. */
const SAFETY_RELOAD_MS = 20_000
/** Cards on the table at a time. */
const CARDS = 10

type PositionFilter = Position | 'todas'

/** Picks merged by number, so an older full list never drops a newer live one. */
const mergePicks = (now: DraftPick[], more: DraftPick[]) => {
  const byNo = new Map(now.map((p) => [p.pick, p]))
  for (const pick of more) byNo.set(pick.pick, pick)
  return [...byNo.values()].sort((a, b) => a.pick - b.pick)
}

/** The live draft: the clock, the latest pick, the strongest cards still free, and the squads. */
export function DraftView(props: { room: Room; userId: string; reload: () => Promise<void> }) {
  const { userId, reload } = props
  const [teams, setTeams] = useState<DraftTeam[]>()
  const [pool, setPool] = useState<PoolPlayer[]>()
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [live, setLive] = useState<LiveClock>()
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

  const byId = useMemo(() => new Map((pool ?? []).map((p) => [p.id, p])), [pool])
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
    <>
      <Clock
        room={room}
        teams={teams}
        mine={mine}
        owner={room.ownerId === userId}
        onTicked={after}
      />
      <LastPick room={room} teams={teams} byId={byId} picks={picks} />
      {slotOnTheClock(room) !== undefined && (
        <CardTable
          room={room}
          pool={pool}
          byId={byId}
          picks={picks}
          mine={mine}
          world={world}
          onPicked={after}
        />
      )}
      <DraftBoard room={room} teams={teams} byId={byId} picks={picks} />
    </>
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

  const toggleAuto = async () => {
    if (!mine) return
    try {
      await setDraftAuto(room.id, !mine.auto)
      await onTicked()
    } catch (error) {
      toast.error(messageOf(error))
    }
  }

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

  const share = Math.min(1, left / room.options.pickSeconds)
  return (
    <Card
      className={cn(
        'sticky top-2 z-10 gap-3 overflow-hidden',
        myTurn && 'border-highlight ring-2 ring-highlight/40',
      )}
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
            left <= 10 && 'text-destructive',
          )}
          aria-label={`${left} segundos`}
        >
          <TimerIcon className="size-5" />
          {left}
        </span>
        {mine && (
          <Button
            variant={mine.auto ? 'default' : 'outline'}
            size="sm"
            className="max-sm:w-full"
            onClick={toggleAuto}
          >
            <BotIcon />
            {mine.auto ? 'Automático ligado' : 'Ligar automático'}
          </Button>
        )}
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
  byId: ReadonlyMap<string, PoolPlayer>
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
function MiniCard(props: { player: PoolPlayer }) {
  const { player } = props
  const tier =
    player.overall >= CARD_CUTS.ouro
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
      )}
    >
      <span className="text-xl font-black tabular-nums">{player.overall}</span>
      <span className="text-xs font-bold">{player.position}</span>
    </span>
  )
}

/**
 * The strongest players still free as cards, of all positions or one. Tapping
 * a card picks it out; the button under the row makes the pick.
 */
function CardTable(props: {
  room: Room
  pool: PoolPlayer[]
  byId: ReadonlyMap<string, PoolPlayer>
  picks: DraftPick[]
  mine?: DraftTeam
  world?: World
  onPicked: () => Promise<void>
}) {
  const { room, pool, byId, picks, mine, world } = props
  const [position, setPosition] = useState<PositionFilter>('todas')
  const [selected, setSelected] = useState<string>()
  const [busy, setBusy] = useState(false)
  const myTurn = mine !== undefined && slotOnTheClock(room) === mine.slot
  const cards = strongestFree(pool, picks, position === 'todas' ? undefined : position, CARDS)
  const chosen = cards.find((p) => p.id === selected)
  const problem = mine && chosen ? pickProblem(room, byId, picks, mine.slot, chosen.id) : undefined
  const counts = mine ? positionCounts(squadsOf(picks).get(mine.slot) ?? [], byId) : undefined
  const shape = room.draft?.shape

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

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>{position === 'todas' ? 'Os mais fortes' : POSITION_NAMES[position]}</CardTitle>
        <CardDescription>
          {counts && shape
            ? 'Nos botões, quantos você tem de cada posição e quantos o elenco pede.'
            : 'As 10 cartas mais fortes ainda livres.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Choices
          ariaLabel="Posição"
          options={['todas', ...POSITIONS] as PositionFilter[]}
          value={position}
          label={(p) =>
            p === 'todas' ? 'Todas' : counts && shape ? `${p} ${counts[p]}/${shape[p]}` : p
          }
          title={(p) => (p === 'todas' ? 'Todas as posições' : POSITION_NAMES[p])}
          onChange={setPosition}
        />
        <ul className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pt-4 pb-3">
          {cards.map((player, i) => {
            const full = world?.players[player.id]
            const isSelected = player.id === selected
            return (
              <li
                key={player.id}
                className="snap-start duration-300 animate-in fade-in slide-in-from-right-4"
                style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'backwards' }}
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${player.name}, ${POSITION_NAMES[player.position]}, geral ${player.overall}`}
                  onClick={() => setSelected(isSelected ? undefined : player.id)}
                  className={cn(
                    'block rounded-[2.6rem_2.6rem_1.1rem_1.1rem] transition-transform outline-none hover:-translate-y-1 focus-visible:ring-3 focus-visible:ring-ring',
                    isSelected &&
                      '-translate-y-2 ring-4 ring-highlight ring-offset-4 ring-offset-card',
                  )}
                >
                  {full ? (
                    <PlayerCard
                      player={{ ...full, name: player.name, overall: player.overall }}
                      club={world.clubs[full.clubId]}
                    />
                  ) : (
                    <PlainCard player={player} />
                  )}
                </button>
              </li>
            )
          })}
          {cards.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">Ninguém livre nessa posição.</li>
          )}
        </ul>
        {mine &&
          (myTurn ? (
            <Button size="lg" onClick={pick} disabled={busy || !chosen || problem !== undefined}>
              {chosen ? `Escolher ${chosen.name}` : 'Toque numa carta para escolher'}
            </Button>
          ) : (
            chosen && (
              <p className="text-center text-sm text-muted-foreground">
                Quando chegar a sua vez, é só tocar em escolher.
              </p>
            )
          ))}
        {problem && <p className="text-center text-sm text-destructive">{problem}</p>}
      </CardContent>
    </Card>
  )
}

/** A card for a player the pack no longer has in full: overall, position, name and club. */
function PlainCard(props: { player: PoolPlayer }) {
  const { player } = props
  return (
    <span className="flex h-64 w-48 flex-col items-center justify-center gap-1 rounded-t-[2.5rem] rounded-b-2xl bg-gradient-to-br from-slate-400 via-slate-100 to-slate-400 p-3 text-slate-900 shadow-lg ring-1 ring-black/20">
      <span className="text-4xl font-black tabular-nums">{player.overall}</span>
      <span className="text-sm font-bold">{player.position}</span>
      <span className="w-full truncate text-center font-extrabold uppercase">{player.name}</span>
      <span className="text-xs">{player.origin}</span>
    </span>
  )
}

/** A player's line in the lists: overall, position, name, club of origin and age. */
function PlayerLine(props: { player: PoolPlayer }) {
  const { player } = props
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="w-7 shrink-0 text-right font-mono font-bold tabular-nums">
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
    </span>
  )
}

/** Every team's squad as it stands, eleven then reserves, or every pick, the latest first. */
export function DraftBoard(props: {
  room: Room
  teams: DraftTeam[]
  byId: ReadonlyMap<string, PoolPlayer>
  picks: DraftPick[]
}) {
  const { room, teams, byId, picks } = props
  const [view, setView] = useState<'elencos' | 'historico'>('elencos')
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
                    {player && <PlayerLine player={player} />}
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
              const { starters, reserves } = startersAndReserves(players)
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
                          <PlayerLine player={player} />
                        </li>
                      ))}
                      {reserves.length > 0 && (
                        <li className="mt-1 mb-0.5 border-t pt-1 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
                          Reservas
                        </li>
                      )}
                      {reserves.map((player) => (
                        <li key={player.id}>
                          <PlayerLine player={player} />
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
    </Card>
  )
}
