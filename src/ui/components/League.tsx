import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CheckIcon,
  ClockIcon,
  CrownIcon,
  MonitorPlayIcon,
  RepeatIcon,
  ShirtIcon,
  StarIcon,
  TrophyIcon,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
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
import {
  loadTeamSheet,
  loadPlayedRound,
  loadRoundReplays,
  loadRoundResults,
  loadSpeedUp,
  rematchRoom,
  setRoomReady,
  speedUpRound,
} from '../../cloud/roomLeague.ts'
import { serverNow, syncServerClock } from '../../cloud/serverClock.ts'
import { loadRosters, type RosterEntry } from '../../cloud/roomMarket.ts'
import { PASS_NEEDED, type Room } from '../../cloud/rooms.ts'
import type { MatchReplay as Replay } from '../../engine/match/simulate.ts'
import type { PoolPlayer } from '../../engine/room/start.ts'
import {
  replayMatchesLine,
  replaysMatchLines,
  type RoomMatchLine,
  type RoomSummary,
  type TeamSheet,
} from '../../engine/room/summary.ts'
import { draftPlayers } from '../draft.ts'
import {
  LIVE,
  liveElapsed,
  markRoundSeen,
  roundOver,
  roundTimeline,
  seenRound,
} from '../liveRound.ts'
import { describeOptions } from '../room.ts'
import { roomPageSlug, type RoomPageSlug } from '../roomPages.ts'
import {
  absenceNews,
  announcedAbsences,
  canPlayRound,
  readiness,
  saveAnnouncedAbsences,
} from '../roomLeague.ts'
import { announce } from '../announce.ts'
import { squadIds } from '../roomMarket.ts'
import { DeleteRoomButton } from './DeleteRoomButton.tsx'
import { DraftBoard } from './Draft.tsx'
import { MatchReplay } from './MatchReplay.tsx'
import { PlayRoundButton } from './PlayRoundButton.tsx'
import { MarketView } from './Market.tsx'
import { RoomLineup } from './RoomLineup.tsx'
import { RoomLayout } from './RoomLayout.tsx'
import { RoomLiveRound } from './RoomLiveRound.tsx'
import { RoomNotices } from './RoomNotices.tsx'
import { RoomTeamSquad } from './RoomTeamSquad.tsx'
import { Note, TeamCrest } from './RoomParts.tsx'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** When the page's engine is not the one that played the round, so its replays would be wrong. */
const OUTDATED =
  'Esta versão do jogo está diferente da do servidor, então os jogos não podem ser mostrados. Atualize a página; os resultados abaixo são os oficiais.'

/** The round being shown live, and the table as it stood before it, so nothing gives it away. */
type Live = {
  round: number
  replays: Replay[]
  kickOff: number
  timeline: number[]
  before: RoomSummary
}

type Loaded = {
  teams: DraftTeam[]
  pool: PoolPlayer[]
  picks: DraftPick[]
  summary?: RoomSummary
  rosters: RosterEntry[]
}

/**
 * The room's league, a page for each part in the room's menu: the summary
 * (who is ready, the next match, the last results), the lineup, the market,
 * the table, every round and the room itself.
 */
export function LeagueView(props: {
  room: Room
  userId: string
  reload: () => Promise<void>
  /** The page of the room's menu, from the address. */
  page?: string
}) {
  const { room, userId, reload } = props
  const [loaded, setLoaded] = useState<Loaded>()
  const [failed, setFailed] = useState(false)
  const [watching, setWatching] = useState<{ replay: Replay; title: string }>()
  /** The team whose squad is open, from the table. */
  const [squadOf, setSquadOf] = useState<string>()
  const [live, setLive] = useState<Live>()
  /** Who asked to speed up the round shown live, and when it sped up. */
  const [speed, setSpeed] = useState<{ round: number; asked: number[]; spedAt?: number }>()
  const [speedTick, setSpeedTick] = useState(0)
  /** The last round checked for being live, so its results don't show before that is known. */
  const [checked, setChecked] = useState(0)

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
      speed: () => setSpeedTick((t) => t + 1),
    })
    return () => {
      live = false
      stop()
    }
  }, [room.id, load, loadSummary, reload])

  // A round played less than its length ago is shown live, unless the player already saw it.
  const played = loaded?.summary?.played ?? 0
  useEffect(() => {
    if (played === 0 || seenRound(room.id) >= played) return
    let on = true
    Promise.all([
      loadPlayedRound(room.id, played),
      loadPlayedRound(room.id, played - 1),
      syncServerClock(),
    ])
      .then(([now, before]) => {
        if (!on) return
        const timeline = now ? roundTimeline(now.replays) : []
        // By the server's clock; never further off than the lead, should it not have been measured.
        const kickOff = Math.min(now?.playedAt.getTime() ?? 0, serverNow()) + LIVE.leadMs
        const spedAt = now?.spedAt && Math.min(now.spedAt.getTime(), serverNow())
        // A page whose engine differs from the server's would act out other matches.
        const faithful = !now || replaysMatchLines(now.replays, now.summary.last)
        if (!faithful) toast.warning(OUTDATED)
        if (
          !now ||
          !before ||
          !faithful ||
          roundOver(timeline, liveElapsed(kickOff, serverNow(), spedAt))
        ) {
          markRoundSeen(room.id, played)
        } else {
          setLive({
            round: played,
            replays: now.replays,
            kickOff,
            timeline,
            before: before.summary,
          })
        }
        setChecked(played)
      })
      .catch(() => on && setChecked(played))
    return () => {
      on = false
    }
  }, [room.id, played])

  // Asking to speed up the round shown live, and it speeding up once everyone asked.
  const liveRound = live?.round
  useEffect(() => {
    if (liveRound === undefined) return
    let on = true
    loadSpeedUp(room.id, liveRound)
      .then(({ asked, spedAt }) => {
        if (!on) return
        // The first time seen sticks: a device clock behind the server's would push it back.
        setSpeed((now) => ({
          round: liveRound,
          asked,
          spedAt:
            (now?.round === liveRound ? now.spedAt : undefined) ??
            (spedAt && Math.min(spedAt.getTime(), serverNow())),
        }))
      })
      .catch(() => undefined)
    return () => {
      on = false
    }
  }, [room.id, liveRound, speedTick])

  // After a round (once it was watched or skipped), the toasts of the team's new injuries and bans.
  const navigate = useNavigate()
  const mineSlot = loaded?.teams.find((t) => t.userId === userId && !t.robot)?.slot
  const watched = played > 0 && !live && (checked >= played || seenRound(room.id) >= played)
  useEffect(() => {
    if (mineSlot === undefined || !watched) return
    let on = true
    loadTeamSheet(room.id, mineSlot)
      .then((sheet) => {
        if (!on || !sheet) return
        const { news, keys } = absenceNews(sheet, announcedAbsences(room.id))
        saveAnnouncedAbsences(room.id, keys)
        const team = { label: 'Ver time', to: `/sala/${room.id}/time` }
        announce(
          news.map((item) => ({ ...item, link: team })),
          navigate,
        )
      })
      .catch(() => undefined)
    return () => {
      on = false
    }
  }, [room.id, mineSlot, watched, played, navigate])

  const byId = useMemo(() => draftPlayers(loaded?.pool ?? [], loaded?.picks ?? []), [loaded])
  const primes = useMemo(
    () => new Set([...byId.values()].filter((p) => p.prime).map((p) => p.id)),
    [byId],
  )
  const slug = roomPageSlug(props.page)
  const frame = (status: string, children: ReactNode, mine?: DraftTeam, marked = NONE) => (
    <RoomLayout room={room} page={slug} mine={mine} status={status} marked={marked}>
      {children}
    </RoomLayout>
  )
  if (failed) {
    return frame('', <Note>Não deu para carregar a liga agora. Atualize a página.</Note>)
  }
  const pending = played > 0 && checked < played && seenRound(room.id) < played
  if (!loaded?.summary || pending) return frame('', <Note>Carregando a liga…</Note>)

  const { teams, picks } = loaded
  const summary = live?.before ?? loaded.summary
  const teamOf = new Map(teams.map((t) => [String(t.slot), t]))
  const over = summary.next.length === 0
  const mine = teams.find((t) => t.userId === userId && !t.robot)
  const owner = room.ownerId === userId
  const open = !over && room.round !== undefined
  const onPlayed = async () => {
    await Promise.all([loadSummary(), reload()])
  }
  const watch = async (match: RoomMatchLine, round: number) => {
    try {
      const replays = await loadRoundReplays(room.id, round)
      const replay = replays.find(
        (r) => r.input.home.club.id === match.homeId && r.input.away.club.id === match.awayId,
      )
      if (!replay) throw new Error('Esse jogo não está guardado.')
      if (!replayMatchesLine(replay, match)) throw new Error(OUTDATED)
      setWatching({ replay, title: `${room.name} · rodada ${round}` })
      window.scrollTo({ top: 0 })
    } catch (error) {
      toast.error(messageOf(error))
    }
  }
  const status = live
    ? `rodada ${live.round} ao vivo`
    : over
      ? 'liga encerrada'
      : `rodada ${room.round?.no ?? summary.played + 1} de ${summary.totalRounds}`
  const marked = new Set<RoomPageSlug>()
  if (live || (open && mine && mine.readyRound !== room.round!.no)) marked.add('')
  const doneWatching = () => {
    markRoundSeen(room.id, live!.round)
    setLive(undefined)
  }
  const liveSpeed = speed?.round === live?.round ? speed : undefined
  const speedUp = () => {
    const round = live!.round
    setSpeed((now) => ({
      round,
      spedAt: now?.round === round ? now.spedAt : undefined,
      asked: [...new Set([...(now?.round === round ? now.asked : []), mine!.slot])],
    }))
    speedUpRound(room.id, round)
      .then(() => setSpeedTick((t) => t + 1))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : String(error))
        setSpeedTick((t) => t + 1)
      })
  }

  if (watching) {
    return frame(
      status,
      <MatchReplay
        replay={watching.replay}
        title={watching.title}
        onClose={() => setWatching(undefined)}
      />,
      mine,
      marked,
    )
  }

  const onTeam = (team: DraftTeam) =>
    setLoaded(
      (now) => now && { ...now, teams: now.teams.map((t) => (t.slot === team.slot ? team : t)) },
    )

  let page: ReactNode
  if (live && slug === '') {
    page = (
      <RoomLiveRound
        key={live.round}
        round={live.round}
        replays={live.replays}
        kickOff={live.kickOff}
        timeline={live.timeline}
        teamOf={teamOf}
        mine={mine}
        spedAt={liveSpeed?.spedAt}
        asked={liveSpeed?.asked ?? []}
        people={teams.filter((t) => !t.robot && t.userId).length}
        onSpeedUp={mine && speedUp}
        onDone={doneWatching}
      />
    )
  } else if (slug === 'time') {
    page =
      open && mine ? (
        <RoomLineup
          // A new squad (a trade, a claim, a release) starts the editor over.
          key={squadIds(loaded.rosters, mine.slot).sort().join()}
          room={room.id}
          slot={mine.slot}
          round={room.round!.no}
          pack={room.pack}
          primes={primes}
        />
      ) : (
        <Note>
          {over
            ? 'A liga acabou; não há mais rodadas para escalar.'
            : mine
              ? 'A escalação abre quando a próxima rodada abrir.'
              : 'Você não tem time nesta sala.'}
        </Note>
      )
  } else if (slug === 'mercado') {
    page = open ? (
      <MarketView
        room={room}
        teams={teams}
        mine={mine}
        pool={loaded.pool}
        rosters={loaded.rosters}
        drafted={byId}
        tick={marketTick}
      />
    ) : (
      <Note>
        {over ? 'O mercado fechou com o fim da liga.' : 'O mercado abre com a próxima rodada.'}
      </Note>
    )
  } else if (slug === 'tabela') {
    page = (
      <Tabs defaultValue="classificacao">
        <TabsList>
          <TabsTrigger value="classificacao">Classificação</TabsTrigger>
          <TabsTrigger value="artilharia">Artilharia</TabsTrigger>
        </TabsList>
        <TabsContent value="classificacao">
          <StandingsCard summary={summary} teamOf={teamOf} mine={mine} onOpen={setSquadOf} />
        </TabsContent>
        <TabsContent value="artilharia">
          <ScorersCard summary={summary} teamOf={teamOf} />
        </TabsContent>
      </Tabs>
    )
  } else if (slug === 'rodadas') {
    page = <RoundsPage room={room} summary={summary} teamOf={teamOf} mine={mine} onWatch={watch} />
  } else if (slug === 'sala') {
    page = (
      <>
        <MembersCard teams={teams} userId={userId} ownerId={room.ownerId} />
        <Card>
          <CardHeader>
            <CardTitle>Regras</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {describeOptions(room.options).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <DraftBoard room={room} teams={teams} byId={byId} picks={picks} />
        {!over && <RoomNotices />}
        {owner && <DeleteRoomButton room={room} />}
      </>
    )
  } else {
    const next = mine
      ? summary.next.find((m) => m.homeId === String(mine.slot) || m.awayId === String(mine.slot))
      : undefined
    page = (
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
              onPlayed={onPlayed}
              onTeam={onTeam}
            />
          )
        )}
        {next && (
          <Card>
            <CardHeader>
              <CardTitle>Seu próximo jogo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <span className="flex items-center gap-2">
                <TeamName team={teamOf.get(next.homeId)} id={`seu-${next.homeId}`} />
                <span className="text-muted-foreground">x</span>
                <TeamName team={teamOf.get(next.awayId)} id={`seu-${next.awayId}`} end />
              </span>
              {mine && <Absences room={room.id} slot={mine.slot} round={summary.played} />}
              {open && (
                <Button asChild variant="outline" size="sm" className="self-start">
                  <Link to={`/sala/${room.id}/time`}>
                    <ShirtIcon />
                    Escalar o time
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
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
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        <StandingsCard
          summary={summary}
          teamOf={teamOf}
          mine={mine}
          top={4}
          roomId={room.id}
          onOpen={setSquadOf}
        />
      </>
    )
  }

  const squadTeam = squadOf !== undefined ? teamOf.get(squadOf) : undefined
  if (squadTeam) {
    page = (
      <>
        {page}
        <RoomTeamSquad
          room={room}
          team={squadTeam}
          squad={squadIds(loaded.rosters, squadTeam.slot)}
          byId={byId}
          onClose={() => setSquadOf(undefined)}
        />
      </>
    )
  }

  return frame(
    status,
    live && slug !== '' ? (
      <>
        <Card className="flex-row items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm">A rodada {live.round} está sendo jogada agora.</span>
          <Button asChild size="sm">
            <Link to={`/sala/${room.id}`}>
              <MonitorPlayIcon />
              Assistir
            </Link>
          </Button>
        </Card>
        {page}
      </>
    ) : (
      page
    ),
    mine,
    marked,
  )
}

const NONE: ReadonlySet<RoomPageSlug> = new Set()

/** The table, or its top rows with a link to the whole of it. */
function StandingsCard(props: {
  summary: RoomSummary
  teamOf: ReadonlyMap<string, DraftTeam>
  mine?: DraftTeam
  top?: number
  roomId?: number
  /** Opens a team's squad. */
  onOpen?: (teamId: string) => void
}) {
  const { summary, teamOf, mine, top, onOpen } = props
  const rows = top ? summary.standings.slice(0, top) : summary.standings
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          Tabela
          {top && props.roomId !== undefined && (
            <Button asChild variant="ghost" size="sm">
              <Link to={`/sala/${props.roomId}/tabela`}>Ver toda</Link>
            </Button>
          )}
        </CardTitle>
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
            {rows.map((row, i) => {
              const team = teamOf.get(row.teamId)
              return (
                <TableRow
                  key={row.teamId}
                  className={cn(mine && row.teamId === String(mine.slot) && 'bg-highlight-soft')}
                >
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
                      {onOpen ? (
                        <button
                          type="button"
                          onClick={() => onOpen(row.teamId)}
                          className="cursor-pointer truncate text-left hover:underline"
                          title="Ver o elenco"
                        >
                          {team?.name}
                        </button>
                      ) : (
                        <span className="truncate">{team?.name}</span>
                      )}
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
  )
}

function ScorersCard(props: { summary: RoomSummary; teamOf: ReadonlyMap<string, DraftTeam> }) {
  const { summary, teamOf } = props
  return (
    <Card>
      <CardHeader>
        <CardTitle>Artilharia</CardTitle>
      </CardHeader>
      <CardContent>
        {summary.scorers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém marcou ainda.</p>
        ) : (
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
        )}
      </CardContent>
    </Card>
  )
}

/** The round to come, then every round played, the latest first, each match to watch. */
function RoundsPage(props: {
  room: Room
  summary: RoomSummary
  teamOf: ReadonlyMap<string, DraftTeam>
  mine?: DraftTeam
  onWatch: (match: RoomMatchLine, round: number) => void
}) {
  const { room, summary, teamOf } = props
  const [rounds, setRounds] = useState<{ round: number; matches: RoomMatchLine[] }[]>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    loadRoundResults(room.id)
      .then((found) => live && setRounds(found))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [room.id, summary.played])
  return (
    <>
      {summary.next.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rodada {summary.played + 1}</CardTitle>
            <CardDescription>A próxima, ainda por jogar.</CardDescription>
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
      {failed ? (
        <Note>Não deu para carregar as rodadas agora.</Note>
      ) : !rounds ? (
        <Note>Carregando as rodadas…</Note>
      ) : rounds.every(({ round }) => round > summary.played) ? (
        <Note>Nenhuma rodada jogada ainda.</Note>
      ) : (
        rounds
          .filter(({ round }) => round <= summary.played)
          .reverse()
          .map(({ round, matches }) => (
            <Card key={round}>
              <CardHeader>
                <CardTitle>Rodada {round}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-4">
                  {matches.map((match) => (
                    <MatchLine
                      key={`${match.homeId}-${match.awayId}`}
                      match={match}
                      teamOf={teamOf}
                      onWatch={() => props.onWatch(match, round)}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))
      )}
    </>
  )
}

/** Everyone in the room, people and robots, with the owner's crown. */
function MembersCard(props: { teams: DraftTeam[]; userId: string; ownerId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Times</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {props.teams.map((team) => (
            <li key={team.slot} className="flex items-center gap-2">
              <TeamCrest team={team} id={`membro-${team.slot}`} className="size-6 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{team.name}</span>
              {team.userId === props.ownerId && (
                <CrownIcon
                  className="size-4 fill-highlight text-highlight"
                  aria-label="Criou a sala"
                />
              )}
              <span className="text-xs text-muted-foreground">
                {team.robot ? 'robô' : team.userId === props.userId ? 'você' : team.shortName}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
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
  /** Without it, the result alone. */
  onWatch?: () => void
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
      {props.onWatch && (
        <Button variant="ghost" size="sm" className="self-center" onClick={props.onWatch}>
          <MonitorPlayIcon />
          Assistir
        </Button>
      )}
    </li>
  )
}

/**
 * The player's team's absences for the coming round, as the career's
 * overview lists them: who is injured or banned, and for how long.
 */
function Absences(props: { room: number; slot: number; round: number }) {
  const { room, slot, round } = props
  const [sheet, setSheet] = useState<TeamSheet | null>()
  useEffect(() => {
    let live = true
    loadTeamSheet(room, slot)
      .then((found) => live && setSheet(found ?? null))
      .catch(() => live && setSheet(null))
    return () => {
      live = false
    }
  }, [room, slot, round])
  if (!sheet) return null
  const out = sheet.players.filter((p) => sheet.out.includes(p.id))
  const reason = (id: string) => {
    const injured = sheet.injured?.[id]
    const banned = sheet.suspended?.[id]
    if (injured) {
      return `lesionado, fora ${injured === 1 ? 'da próxima rodada' : `das próximas ${injured} rodadas`}`
    }
    if (banned) return `suspenso ${banned === 1 ? 'na próxima rodada' : `por ${banned} rodadas`}`
    return 'fora'
  }
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">Desfalques</h3>
      {out.length === 0 ? (
        <p className="text-sm text-muted-foreground">Elenco completo.</p>
      ) : (
        <ul className="text-sm">
          {out.map((p) => (
            <li key={p.id}>
              {p.name}{' '}
              <span className="text-muted-foreground">
                ({p.position}), {reason(p.id)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
