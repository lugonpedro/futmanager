import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckIcon,
  ClockIcon,
  MonitorPlayIcon,
  RepeatIcon,
  StarIcon,
  TrophyIcon,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  loadDraftPicks,
  loadDraftPool,
  loadDraftTeams,
  loadRoomSummary,
  watchRoom,
  type DraftPick,
  type DraftTeam,
} from '../../cloud/draft.ts'
import { loadRoundReplays, rematchRoom, setRoomReady } from '../../cloud/roomLeague.ts'
import { loadRosters, type RosterEntry } from '../../cloud/roomMarket.ts'
import { PASS_NEEDED, type Room } from '../../cloud/rooms.ts'
import type { MatchReplay as Replay } from '../../engine/match/simulate.ts'
import type { PoolPlayer } from '../../engine/room/start.ts'
import type { RoomMatchLine, RoomSummary } from '../../engine/room/summary.ts'
import { canPlayRound, readiness } from '../roomLeague.ts'
import { squadIds } from '../roomMarket.ts'
import { DraftBoard } from './Draft.tsx'
import { MatchReplay } from './MatchReplay.tsx'
import { PlayRoundButton } from './PlayRoundButton.tsx'
import { MarketView } from './Market.tsx'
import { RoomLineup } from './RoomLineup.tsx'
import { TeamCrest } from './RoomParts.tsx'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

type Loaded = {
  teams: DraftTeam[]
  pool: PoolPlayer[]
  picks: DraftPick[]
  summary?: RoomSummary
  rosters: RosterEntry[]
}

/**
 * The room's league: who is ready for the coming round, the player's lineup,
 * the last results to watch, the table, the next round and the squads.
 */
export function LeagueView(props: { room: Room; userId: string; reload: () => Promise<void> }) {
  const { room, userId, reload } = props
  const [loaded, setLoaded] = useState<Loaded>()
  const [failed, setFailed] = useState(false)
  const [watching, setWatching] = useState<{ replay: Replay; title: string }>()

  const load = useCallback(
    () =>
      Promise.all([
        loadDraftTeams(room.id),
        loadDraftPool(room.id),
        loadDraftPicks(room.id),
        loadRoomSummary(room.id),
        loadRosters(room.id),
      ]).then(([teams, pool, picks, summary, rosters]) => ({
        teams,
        pool,
        picks,
        summary,
        rosters,
      })),
    [room.id],
  )
  const loadSummary = useCallback(async () => {
    const summary = await loadRoomSummary(room.id)
    setLoaded((now) => now && { ...now, summary })
  }, [room.id])
  const [marketTick, setMarketTick] = useState(0)

  // Squads change in bursts of rows; read them once the burst is over.
  useEffect(() => {
    if (marketTick === 0) return
    const timer = setTimeout(() => {
      loadRosters(room.id)
        .then((rosters) => setLoaded((now) => now && { ...now, rosters }))
        .catch(() => {})
    }, 400)
    return () => clearTimeout(timer)
  }, [room.id, marketTick])

  useEffect(() => {
    let live = true
    load()
      .then((found) => live && setLoaded(found))
      .catch(() => live && setFailed(true))
    const stop = watchRoom(room.id, {
      pick: () => {},
      team: (team) =>
        setLoaded(
          (now) =>
            now && { ...now, teams: now.teams.map((t) => (t.slot === team.slot ? team : t)) },
        ),
      room: () => void reload(),
      round: () => void loadSummary(),
      market: () => setMarketTick((t) => t + 1),
    })
    return () => {
      live = false
      stop()
    }
  }, [room.id, load, loadSummary, reload])

  const byId = useMemo(() => new Map((loaded?.pool ?? []).map((p) => [p.id, p])), [loaded])
  if (failed) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          Não deu para carregar a liga agora. Atualize a página.
        </CardContent>
      </Card>
    )
  }
  if (!loaded?.summary) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">Carregando a liga…</CardContent>
      </Card>
    )
  }

  const { teams, picks, summary } = loaded
  const teamOf = new Map(teams.map((t) => [String(t.slot), t]))
  const over = summary.next.length === 0
  const mine = teams.find((t) => t.userId === userId && !t.robot)
  const played = async () => {
    await Promise.all([loadSummary(), reload()])
  }
  const watch = async (match: RoomMatchLine) => {
    try {
      const replays = await loadRoundReplays(room.id, summary.played)
      const replay = replays.find(
        (r) => r.input.home.club.id === match.homeId && r.input.away.club.id === match.awayId,
      )
      if (!replay) throw new Error('Esse jogo não está guardado.')
      setWatching({ replay, title: `${room.name} · rodada ${summary.played}` })
      window.scrollTo({ top: 0 })
    } catch (error) {
      toast.error(messageOf(error))
    }
  }

  if (watching) {
    return (
      <MatchReplay
        replay={watching.replay}
        title={watching.title}
        onClose={() => setWatching(undefined)}
      />
    )
  }

  return (
    <>
      {over ? (
        <LeagueEnd room={room} summary={summary} teamOf={teamOf} />
      ) : (
        room.round && (
          <ReadyCard
            room={room}
            userId={userId}
            teams={teams}
            mine={mine}
            summary={summary}
            onPlayed={played}
            onTeam={(team) =>
              setLoaded(
                (now) =>
                  now && {
                    ...now,
                    teams: now.teams.map((t) => (t.slot === team.slot ? team : t)),
                  },
              )
            }
          />
        )
      )}

      {summary.last.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resultados da rodada {summary.played}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-4">
              {summary.last.map((match) => (
                <MatchLine
                  key={`${match.homeId}-${match.awayId}`}
                  match={match}
                  teamOf={teamOf}
                  onWatch={() => watch(match)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!over && room.round && mine && (
        <RoomLineup
          // A new squad (a trade, a claim, a release) starts the editor over.
          key={squadIds(loaded.rosters, mine.slot).sort().join()}
          room={room.id}
          slot={mine.slot}
          round={room.round.no}
        />
      )}

      {!over && room.round && (
        <MarketView
          room={room}
          teams={teams}
          mine={mine}
          pool={loaded.pool}
          rosters={loaded.rosters}
          tick={marketTick}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tabela</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6">#</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right" title="Pontos">
                  P
                </TableHead>
                <TableHead className="text-right" title="Jogos">
                  J
                </TableHead>
                <TableHead className="text-right" title="Vitórias">
                  V
                </TableHead>
                <TableHead className="text-right" title="Empates">
                  E
                </TableHead>
                <TableHead className="text-right" title="Derrotas">
                  D
                </TableHead>
                <TableHead className="text-right" title="Saldo de gols">
                  SG
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.standings.map((row, i) => {
                const team = teamOf.get(row.teamId)
                return (
                  <TableRow key={row.teamId}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {team && (
                          <TeamCrest
                            team={team}
                            id={`tabela-${row.teamId}`}
                            className="size-5 shrink-0"
                          />
                        )}
                        <span className="truncate">{team?.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold">{row.points}</TableCell>
                    <TableCell className="text-right">{row.played}</TableCell>
                    <TableCell className="text-right">{row.wins}</TableCell>
                    <TableCell className="text-right">{row.draws}</TableCell>
                    <TableCell className="text-right">{row.losses}</TableCell>
                    <TableCell className="text-right">{row.goalsFor - row.goalsAgainst}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {summary.next.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Próxima rodada</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {summary.next.map((match) => (
                <li key={`${match.homeId}-${match.awayId}`} className="flex items-center gap-2">
                  <TeamName team={teamOf.get(match.homeId)} id={`prox-${match.homeId}`} />
                  <span className="text-muted-foreground">x</span>
                  <TeamName team={teamOf.get(match.awayId)} id={`prox-${match.awayId}`} end />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {summary.scorers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Artilharia</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-1 text-sm">
              {summary.scorers.map((row, i) => (
                <li key={`${row.name}-${row.teamId}`} className="flex items-center gap-2">
                  <span className="w-5 text-right text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {teamOf.get(row.teamId)?.shortName}
                  </span>
                  <span className="w-6 text-right font-bold">{row.goals}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <DraftBoard room={room} teams={teams} byId={byId} picks={picks} />
    </>
  )
}

function TeamName(props: { team?: DraftTeam; id: string; end?: boolean }) {
  const { team } = props
  return (
    <span
      className={`flex min-w-0 flex-1 items-center gap-2 ${props.end ? 'flex-row-reverse text-right' : ''}`}
    >
      {team && <TeamCrest team={team} id={props.id} className="size-5 shrink-0" />}
      <span className="truncate">{team?.name}</span>
    </span>
  )
}

function MatchLine(props: {
  match: RoomMatchLine
  teamOf: ReadonlyMap<string, DraftTeam>
  onWatch: () => void
}) {
  const { match, teamOf } = props
  const goals = (teamId: string) =>
    match.goals
      .filter((g) => g.teamId === teamId)
      .sort((a, b) => a.minute - b.minute)
      .map((g) => `${g.name} ${g.minute}'`)
      .join(', ')
  return (
    <li className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2 text-sm">
        <TeamName team={teamOf.get(match.homeId)} id={`res-${match.homeId}`} />
        <span className="shrink-0 font-mono font-bold tabular-nums">
          {match.homeGoals} x {match.awayGoals}
        </span>
        <TeamName team={teamOf.get(match.awayId)} id={`res-${match.awayId}`} end />
      </span>
      <span className="flex justify-between gap-4 text-xs text-muted-foreground">
        <span>{goals(match.homeId)}</span>
        <span className="text-right">{goals(match.awayId)}</span>
      </span>
      <Button variant="ghost" size="sm" className="self-center" onClick={props.onWatch}>
        <MonitorPlayIcon />
        Assistir
      </Button>
    </li>
  )
}

/** Who is ready for the coming round, the player's "Pronto" and the way to play without waiting. */
function ReadyCard(props: {
  room: Room
  userId: string
  teams: DraftTeam[]
  mine?: DraftTeam
  summary: RoomSummary
  onPlayed: () => Promise<void>
  onTeam: (team: DraftTeam) => void
}) {
  const { room, userId, mine, summary } = props
  const round = room.round!.no
  const [busy, setBusy] = useState(false)
  const { people, ready, waiting } = readiness(props.teams, round)
  const everyone = waiting.length === 0
  const amReady = mine?.readyRound === round
  const canForce = canPlayRound(room, userId, everyone)

  const toggle = async () => {
    if (!mine) return
    setBusy(true)
    try {
      const all = await setRoomReady(room.id, !amReady)
      props.onTeam({ ...mine, readyRound: amReady ? undefined : round })
      if (all) toast.success('Todos prontos! A rodada vai ser jogada agora.')
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Rodada {round} de {summary.totalRounds}
        </CardTitle>
        <CardDescription>
          {everyone
            ? 'Todos prontos. A rodada está sendo jogada…'
            : 'Escale o seu time e marque "Pronto". A rodada é jogada assim que todos marcarem.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-1 text-sm">
          {people.map((team) => {
            const isReady = ready.includes(team)
            return (
              <li key={team.slot} className="flex items-center gap-2">
                <TeamCrest team={team} id={`pronto-${team.slot}`} className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{team.name}</span>
                {isReady ? (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckIcon className="size-4" />
                    Pronto
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <ClockIcon className="size-4" />
                    Escalando
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          {mine && (
            <Button onClick={toggle} disabled={busy} variant={amReady ? 'outline' : 'default'}>
              <CheckIcon />
              {amReady ? 'Desmarcar "Pronto"' : 'Pronto'}
            </Button>
          )}
          {canForce && (
            <PlayRoundButton
              room={room.id}
              label={everyone ? 'Jogar agora' : 'Jogar sem esperar'}
              onPlayed={props.onPlayed}
              confirm={
                everyone
                  ? undefined
                  : {
                      title: 'Jogar a rodada sem esperar?',
                      description: `${waiting.length === 1 ? 'Falta 1 pessoa' : `Faltam ${waiting.length} pessoas`} marcar "Pronto". Quem não marcou joga com a escalação da última rodada.`,
                      action: 'Jogar sem esperar',
                    }
              }
            />
          )}
        </div>
        {!everyone && !canForce && (
          <p className="text-xs text-muted-foreground">
            Se alguém sumir, quem criou a sala pode jogar a rodada sem esperar; quem não marcou joga
            com a escalação da última rodada.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** The champion, the top scorer, the best player and the "Revanche" button. */
function LeagueEnd(props: {
  room: Room
  summary: RoomSummary
  teamOf: ReadonlyMap<string, DraftTeam>
}) {
  const { room, summary, teamOf } = props
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const champion = teamOf.get(summary.standings[0]?.teamId)
  const scorer = summary.scorers[0]
  const rematch = async () => {
    setBusy(true)
    try {
      navigate(`/sala/${await rematchRoom(room.id)}`)
    } catch (error) {
      toast.error(
        messageOf(error),
        messageOf(error) === PASS_NEEDED
          ? { action: { label: 'Ver o passe', onClick: () => navigate('/passe') } }
          : undefined,
      )
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrophyIcon className="size-5 text-highlight" />
          {champion ? `${champion.name} é o campeão!` : 'A liga acabou'}
        </CardTitle>
        <CardDescription>Foram {summary.totalRounds} rodadas.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {scorer && (
            <div className="flex flex-col">
              <dt className="text-xs text-muted-foreground">Artilheiro</dt>
              <dd>
                {scorer.name} ({teamOf.get(scorer.teamId)?.shortName}),{' '}
                {scorer.goals === 1 ? '1 gol' : `${scorer.goals} gols`}
              </dd>
            </div>
          )}
          {summary.best && (
            <div className="flex flex-col">
              <dt className="text-xs text-muted-foreground">Melhor jogador</dt>
              <dd className="flex items-center gap-1">
                <StarIcon className="size-3.5 text-highlight" />
                {summary.best.name} ({teamOf.get(summary.best.teamId)?.shortName}), média{' '}
                {summary.best.average.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}
              </dd>
            </div>
          )}
        </dl>
        {room.rematchId ? (
          <Button asChild className="self-start">
            <Link to={`/sala/${room.rematchId}`}>
              <RepeatIcon />
              Ir para a revanche
            </Link>
          </Button>
        ) : (
          <div className="flex flex-col gap-1">
            <Button onClick={rematch} disabled={busy} className="self-start">
              <RepeatIcon />
              Revanche
            </Button>
            <p className="text-xs text-muted-foreground">
              Abre uma sala nova com as mesmas pessoas e as mesmas regras, com o draft marcado para
              amanhã. Quem abrir a revanche fica como dono dela e precisa do passe.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
