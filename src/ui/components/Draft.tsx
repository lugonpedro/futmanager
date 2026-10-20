import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, BotIcon, StarIcon, TimerIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  draftPick,
  draftTick,
  loadDraftPicks,
  loadDraftPool,
  loadDraftQueue,
  loadDraftTeams,
  saveDraftQueue,
  setDraftAuto,
  watchRoom,
  type DraftPick,
  type DraftTeam,
} from '../../cloud/draft.ts'
import type { Room } from '../../cloud/rooms.ts'
import { POSITIONS, type Position } from '../../engine/model/types.ts'
import type { PoolPlayer } from '../../engine/room/start.ts'
import {
  draftTotal,
  moveInQueue,
  pickProblem,
  positionCounts,
  roundOfPick,
  searchKey,
  secondsLeft,
  slotOnTheClock,
  squadsOf,
} from '../draft.ts'
import { POSITION_NAMES } from '../format.ts'
import { Choices } from './Choices.tsx'
import { TeamCrest } from './RoomParts.tsx'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Seconds between calls to the server once the clock ran out, until the pick shows up. */
const TICK_RETRY_MS = 2000
/** A fresh look at the whole draft now and then, in case a live update got lost. */
const SAFETY_RELOAD_MS = 20_000
/** Players listed at first; more on demand. */
const PAGE = 40

type PositionFilter = Position | 'todas'

/** The live draft: the clock, the players, the queue, the squads and every pick. */
export function DraftView(props: { room: Room; userId: string; reload: () => Promise<void> }) {
  const { room, userId, reload } = props
  const [teams, setTeams] = useState<DraftTeam[]>()
  const [pool, setPool] = useState<PoolPlayer[]>()
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [queue, setQueue] = useState<string[]>([])
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(
    () =>
      Promise.all([loadDraftTeams(room.id), loadDraftPicks(room.id)]).then(
        ([loadedTeams, loadedPicks]) => {
          setTeams(loadedTeams)
          setPicks(loadedPicks)
        },
      ),
    [room.id],
  )

  useEffect(() => {
    let live = true
    Promise.all([
      loadDraftPool(room.id),
      loadDraftQueue(room.id, userId),
      loadDraftTeams(room.id),
      loadDraftPicks(room.id),
    ])
      .then(([loadedPool, loadedQueue, loadedTeams, loadedPicks]) => {
        if (!live) return
        setPool(loadedPool)
        setQueue(loadedQueue)
        setTeams(loadedTeams)
        setPicks(loadedPicks)
      })
      .catch(() => live && setFailed(true))
    const stop = watchRoom(room.id, {
      pick: (pick) =>
        setPicks((now) => (now.some((p) => p.pick === pick.pick) ? now : [...now, pick])),
      room: () => void reload(),
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
  }, [room.id, userId, refresh, reload])

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
  const changeQueue = (next: string[]) => {
    setQueue(next)
    saveDraftQueue(room.id, next).catch((error) => toast.error(messageOf(error)))
  }

  return (
    <>
      <Clock
        room={room}
        teams={teams}
        mine={mine}
        onTicked={() => Promise.all([refresh(), reload()]).then(() => undefined)}
      />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
        <PoolCard
          room={room}
          pool={pool}
          byId={byId}
          picks={picks}
          mine={mine}
          queue={queue}
          onQueue={changeQueue}
          onPicked={() => Promise.all([refresh(), reload()]).then(() => undefined)}
        />
        <div className="flex flex-col gap-4">
          {mine && <QueueCard byId={byId} picks={picks} queue={queue} onChange={changeQueue} />}
          {mine && <SquadCard room={room} byId={byId} picks={picks} team={mine} />}
        </div>
      </div>
      <BoardCard room={room} teams={teams} byId={byId} picks={picks} />
    </>
  )
}

function Clock(props: {
  room: Room
  teams: DraftTeam[]
  mine?: DraftTeam
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
            Todos os {total} jogadores foram escolhidos. A liga da sala começa em seguida.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className={cn(myTurn && 'border-highlight ring-2 ring-highlight/40')}>
      <CardContent className="flex flex-wrap items-center gap-3">
        <TeamCrest team={team} id={`relogio-${team.slot}`} className="size-10 shrink-0" />
        <div className="flex min-w-40 flex-1 flex-col">
          <span className="text-xs text-muted-foreground">
            Rodada {round} de {room.options.squadSize}, escolha {inRound} · {pickNo + 1} de {total}
          </span>
          <span className="truncate text-lg font-bold">
            {myTurn ? 'Sua vez de escolher!' : `Vez do ${team.name}`}
          </span>
          {team.robot ? (
            <span className="text-xs text-muted-foreground">Robô escolhendo…</span>
          ) : (
            team.auto && <span className="text-xs text-muted-foreground">No automático</span>
          )}
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
    </Card>
  )
}

function PoolCard(props: {
  room: Room
  pool: PoolPlayer[]
  byId: ReadonlyMap<string, PoolPlayer>
  picks: DraftPick[]
  mine?: DraftTeam
  queue: string[]
  onQueue: (queue: string[]) => void
  onPicked: () => Promise<void>
}) {
  const { room, pool, byId, picks, mine, queue } = props
  const [position, setPosition] = useState<PositionFilter>('todas')
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [busy, setBusy] = useState(false)
  const takenBy = useMemo(() => new Map(picks.map((p) => [p.playerId, p.slot])), [picks])
  const myTurn = mine !== undefined && slotOnTheClock(room) === mine.slot
  const key = searchKey(search)
  const matching = pool.filter(
    (p) =>
      !takenBy.has(p.id) &&
      (position === 'todas' || p.position === position) &&
      (!key || searchKey(p.name).includes(key) || searchKey(p.origin).includes(key)),
  )

  const pick = async (player: PoolPlayer) => {
    setBusy(true)
    try {
      await draftPick(room.id, player.id)
      await props.onPicked()
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jogadores livres</CardTitle>
        <CardDescription>
          {matching.length} de {pool.length - takenBy.size} livres. A estrela põe o jogador na sua
          fila: quando o tempo acaba, sai o primeiro dela que ainda estiver livre.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Choices
            ariaLabel="Posição"
            options={['todas', ...POSITIONS] as PositionFilter[]}
            value={position}
            label={(p) => (p === 'todas' ? 'Todas' : p)}
            title={(p) => (p === 'todas' ? 'Todas as posições' : POSITION_NAMES[p])}
            onChange={(p) => {
              setPosition(p)
              setShown(PAGE)
            }}
          />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setShown(PAGE)
            }}
            placeholder="Nome ou clube"
            aria-label="Buscar jogador"
            className="min-w-32 flex-1"
          />
        </div>
        <ul className="flex max-h-[30rem] flex-col divide-y overflow-y-auto rounded-md border">
          {matching.slice(0, shown).map((player) => {
            const queued = queue.includes(player.id)
            const problem = mine ? pickProblem(room, byId, picks, mine.slot, player.id) : undefined
            return (
              <li key={player.id} className="flex items-center gap-2 px-2 py-1.5">
                <PlayerLine player={player} />
                {mine && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                      queued ? `Tirar ${player.name} da fila` : `Pôr ${player.name} na fila`
                    }
                    aria-pressed={queued}
                    onClick={() =>
                      props.onQueue(
                        queued ? queue.filter((id) => id !== player.id) : [...queue, player.id],
                      )
                    }
                  >
                    {queued ? <StarIcon className="fill-current text-highlight" /> : <StarIcon />}
                  </Button>
                )}
                {myTurn && (
                  <Button
                    size="sm"
                    disabled={busy || problem !== undefined}
                    title={problem}
                    onClick={() => pick(player)}
                  >
                    Escolher
                  </Button>
                )}
              </li>
            )
          })}
          {matching.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">Ninguém livre com esse filtro.</li>
          )}
        </ul>
        {matching.length > shown && (
          <Button variant="outline" size="sm" onClick={() => setShown(shown + PAGE)}>
            Mostrar mais
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/** A player's line in the lists: overall, position, name, club of origin and age. */
function PlayerLine(props: { player: PoolPlayer; muted?: boolean; compact?: boolean }) {
  const { player } = props
  return (
    <span className={cn('flex min-w-0 flex-1 items-center gap-2', props.muted && 'opacity-50')}>
      <span className="w-7 shrink-0 text-right font-mono font-bold tabular-nums">
        {player.overall}
      </span>
      <span
        className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground"
        title={POSITION_NAMES[player.position]}
      >
        {player.position}
      </span>
      <span className={cn('min-w-0 flex-1 truncate', props.muted && 'line-through')}>
        {player.name}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {player.origin}
        {!props.compact && ` · ${player.age}`}
      </span>
    </span>
  )
}

function QueueCard(props: {
  byId: ReadonlyMap<string, PoolPlayer>
  picks?: DraftPick[]
  queue: string[]
  onChange: (queue: string[]) => void
}) {
  const { byId, queue } = props
  const taken = new Set((props.picks ?? []).map((p) => p.playerId))
  const players = queue.map((id) => byId.get(id)).filter((p) => p !== undefined)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sua fila</CardTitle>
        <CardDescription>
          {players.length === 0
            ? 'Vazia: sem fila, o automático pega o melhor livre na posição que mais falta.'
            : 'Na ordem em que o automático escolhe por você. Os já escolhidos são pulados.'}
        </CardDescription>
      </CardHeader>
      {players.length > 0 && (
        <CardContent>
          <ol className="flex flex-col gap-1">
            {players.map((player, i) => (
              <li key={player.id} className="flex items-center gap-1 text-sm">
                <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
                <PlayerLine player={player} muted={taken.has(player.id)} compact />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Subir ${player.name}`}
                  disabled={i === 0}
                  onClick={() => props.onChange(moveInQueue(queue, player.id, -1))}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Descer ${player.name}`}
                  disabled={i === players.length - 1}
                  onClick={() => props.onChange(moveInQueue(queue, player.id, 1))}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Tirar ${player.name} da fila`}
                  onClick={() => props.onChange(queue.filter((id) => id !== player.id))}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ol>
        </CardContent>
      )}
    </Card>
  )
}

function SquadCard(props: {
  room: Room
  byId: ReadonlyMap<string, PoolPlayer>
  picks: DraftPick[]
  team: DraftTeam
}) {
  const { room, byId, team } = props
  const ids = squadsOf(props.picks).get(team.slot) ?? []
  const counts = positionCounts(ids, byId)
  const shape = room.draft?.shape
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Seu elenco ({ids.length} de {room.options.squadSize})
        </CardTitle>
        <CardDescription className="flex flex-wrap gap-x-3">
          {POSITIONS.map((p) => (
            <span key={p} title={POSITION_NAMES[p]}>
              {p} {counts[p]}
              {shape && `/${shape[p]}`}
            </span>
          ))}
        </CardDescription>
      </CardHeader>
      {ids.length > 0 && (
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm">
            {ids
              .map((id) => byId.get(id))
              .filter((p) => p !== undefined)
              .sort(
                (a, b) =>
                  POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) ||
                  b.overall - a.overall,
              )
              .map((player) => (
                <li key={player.id}>
                  <PlayerLine player={player} />
                </li>
              ))}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}

function BoardCard(props: {
  room: Room
  teams: DraftTeam[]
  byId: ReadonlyMap<string, PoolPlayer>
  picks: DraftPick[]
}) {
  const { room, teams, byId, picks } = props
  const [view, setView] = useState<'escolhas' | 'elencos'>('escolhas')
  const squads = squadsOf(picks)
  const teamOf = new Map(teams.map((t) => [t.slot, t]))
  const recent = [...picks].sort((a, b) => b.pick - a.pick)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          Quadro do draft
          <Choices
            ariaLabel="Ver"
            options={['escolhas', 'elencos'] as const}
            value={view}
            label={(v) => (v === 'escolhas' ? 'Escolhas' : 'Elencos')}
            onChange={setView}
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {view === 'escolhas' ? (
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
            {teams.map((team) => (
              <section key={team.slot} className="flex flex-col gap-1 rounded-md border p-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <TeamCrest team={team} id={`elenco-${team.slot}`} className="size-5" />
                  <span className="truncate">{team.name}</span>
                  {team.robot && (
                    <BotIcon className="size-3.5 text-muted-foreground" aria-label="Robô" />
                  )}
                </h3>
                <ul className="flex flex-col text-xs">
                  {(squads.get(team.slot) ?? [])
                    .map((id) => byId.get(id))
                    .filter((p) => p !== undefined)
                    .map((player) => (
                      <li key={player.id}>
                        <PlayerLine player={player} />
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The queue before the draft, with the pool the app lists from the pack
 * itself (the same one the server lists when the draft starts).
 */
export function QueueBeforeDraft(props: { room: Room; userId: string; pool: PoolPlayer[] }) {
  const { room, userId, pool } = props
  const [queue, setQueue] = useState<string[]>()
  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool])
  const [position, setPosition] = useState<PositionFilter>('todas')
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    let live = true
    loadDraftQueue(room.id, userId)
      .then((loaded) => live && setQueue(loaded))
      .catch(() => live && setQueue([]))
    return () => {
      live = false
    }
  }, [room.id, userId])

  if (!queue) return null
  const change = (next: string[]) => {
    setQueue(next)
    saveDraftQueue(room.id, next).catch((error) => toast.error(messageOf(error)))
  }
  const key = searchKey(search)
  const matching = pool.filter(
    (p) =>
      (position === 'todas' || p.position === position) &&
      (!key || searchKey(p.name).includes(key) || searchKey(p.origin).includes(key)),
  )

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader>
          <CardTitle>Monte sua fila</CardTitle>
          <CardDescription>
            Marque com a estrela quem você quer, na ordem de preferência. No draft, quando o seu
            tempo acaba, sai o primeiro da fila que ainda estiver livre.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Choices
              ariaLabel="Posição"
              options={['todas', ...POSITIONS] as PositionFilter[]}
              value={position}
              label={(p) => (p === 'todas' ? 'Todas' : p)}
              title={(p) => (p === 'todas' ? 'Todas as posições' : POSITION_NAMES[p])}
              onChange={(p) => {
                setPosition(p)
                setShown(PAGE)
              }}
            />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setShown(PAGE)
              }}
              placeholder="Nome ou clube"
              aria-label="Buscar jogador"
              className="min-w-32 flex-1"
            />
          </div>
          <ul className="flex max-h-[30rem] flex-col divide-y overflow-y-auto rounded-md border">
            {matching.slice(0, shown).map((player) => {
              const queued = queue.includes(player.id)
              return (
                <li key={player.id} className="flex items-center gap-2 px-2 py-1.5">
                  <PlayerLine player={player} />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                      queued ? `Tirar ${player.name} da fila` : `Pôr ${player.name} na fila`
                    }
                    aria-pressed={queued}
                    onClick={() =>
                      change(
                        queued ? queue.filter((id) => id !== player.id) : [...queue, player.id],
                      )
                    }
                  >
                    {queued ? <StarIcon className="fill-current text-highlight" /> : <StarIcon />}
                  </Button>
                </li>
              )
            })}
          </ul>
          {matching.length > shown && (
            <Button variant="outline" size="sm" onClick={() => setShown(shown + PAGE)}>
              Mostrar mais
            </Button>
          )}
        </CardContent>
      </Card>
      <QueueCard byId={byId} queue={queue} onChange={change} />
    </div>
  )
}
