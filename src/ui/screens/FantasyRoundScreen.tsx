import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon, StarIcon } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { cloudEnabled } from '../../cloud/client.ts'
import {
  loadFantasyRound,
  loadFantasySeason,
  type FantasyRoundView,
  type FantasySeason,
} from '../../cloud/fantasy.ts'
import type { Position } from '../../engine/model/types.ts'
import { useAccountStore } from '../../store/account.ts'
import { ClubMark, Note } from '../components/FantasyParts.tsx'
import { MatchReplay } from '../components/MatchReplay.tsx'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import { roundLeaders, scoredTeam } from '../fantasyRound.ts'
import { formatDayDate, POSITION_NAMES, tenths } from '../format.ts'

/** How many of the round's best the screen lists. */
const LEADERS = 10

/** A played round of the official season: its matches to watch and everyone's points. */
export function FantasyRoundScreen() {
  const round = Number(useParams().round)
  const { ready, user } = useAccountStore()
  const [season, setSeason] = useState<FantasySeason | null>()
  const [view, setView] = useState<FantasyRoundView>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!cloudEnabled) return
    let live = true
    loadFantasySeason()
      .then((loaded) => live && setSeason(loaded ?? null))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  const valid = season && Number.isInteger(round) && round >= 1 && round <= season.played
  useEffect(() => {
    if (!season || !valid || !ready) return
    let live = true
    loadFantasyRound(season.id, round, user?.id)
      .then((loaded) => live && setView(loaded))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [season, valid, round, ready, user?.id])

  if (season === null || (season && !valid)) return <Navigate to="/fantasia" replace />

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Voltar à fantasia">
            <Link to="/fantasia">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Rodada {Number.isInteger(round) ? round : ''}</h1>
        </div>
        <div className="flex items-center gap-1">
          {season && (
            <>
              <RoundLink to={round - 1} season={season} label="Rodada anterior">
                <ChevronLeftIcon />
              </RoundLink>
              <RoundLink to={round + 1} season={season} label="Próxima rodada">
                <ChevronRightIcon />
              </RoundLink>
            </>
          )}
          <ThemeToggle />
        </div>
      </header>

      {!cloudEnabled ? (
        <Note>O jogo online não está disponível nesta versão.</Note>
      ) : failed ? (
        <Note>Não deu para carregar a rodada agora. Tente de novo mais tarde.</Note>
      ) : !season || view?.round !== round ? (
        <Note>Carregando…</Note>
      ) : (
        <Round key={round} season={season} view={view} signedIn={Boolean(user)} />
      )}
    </main>
  )
}

function RoundLink(props: {
  to: number
  season: FantasySeason
  label: string
  children: ReactNode
}) {
  const reachable = props.to >= 1 && props.to <= props.season.played
  if (!reachable)
    return (
      <Button variant="ghost" size="icon" aria-label={props.label} disabled>
        {props.children}
      </Button>
    )
  return (
    <Button asChild variant="ghost" size="icon" aria-label={props.label}>
      <Link to={`/fantasia/rodada/${props.to}`}>{props.children}</Link>
    </Button>
  )
}

function Round(props: { season: FantasySeason; view: FantasyRoundView; signedIn: boolean }) {
  const { season, view } = props
  const { clubs } = season
  const [watching, setWatching] = useState<number>()
  const top = useRef<HTMLDivElement>(null)

  // Names and positions of everyone in the round, newcomers to the market included.
  const people = useMemo(() => {
    const out: Record<string, { name: string; clubId: string; position: Position }> = {}
    for (const replay of view.replays) {
      for (const side of ['home', 'away'] as const) {
        const { club, lineup } = replay.input[side]
        for (const id of [...lineup.starters.map((s) => s.playerId), ...lineup.bench]) {
          const { name, position } = replay.input.players[id]
          out[id] = { name, clubId: club.id, position }
        }
      }
    }
    return { ...out, ...view.pool }
  }, [view])
  const mine = useMemo(() => new Set(view.team?.playerIds), [view.team])

  const watch = (index: number) => {
    setWatching(index)
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const replay = watching === undefined ? undefined : view.replays[watching]

  return (
    <>
      <div ref={top} className="scroll-mt-4">
        {replay && (
          <MatchReplay
            key={watching}
            replay={replay}
            title={`Brasileirão oficial ${season.year} · rodada ${view.round} · ${formatDayDate(view.date)}`}
            points={view.points}
            mine={mine}
            onClose={() => setWatching(undefined)}
          />
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Jogos</CardTitle>
            <CardDescription>{formatDayDate(view.date)}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              {view.results.map((result, i) => {
                const yours = view.team?.playerIds.filter(
                  (id) =>
                    people[id]?.clubId === result.homeId || people[id]?.clubId === result.awayId,
                ).length
                return (
                  <li
                    key={`${result.homeId}-${result.awayId}`}
                    className={cn(
                      'flex items-center gap-2 rounded-md border p-2',
                      watching === i && 'border-primary',
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
                      <span className="truncate">{clubs[result.homeId]?.shortName}</span>
                      <ClubMark clubId={result.homeId} clubs={clubs} />
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {result.homeGoals} x {result.awayGoals}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <ClubMark clubId={result.awayId} clubs={clubs} />
                      <span className="truncate">{clubs[result.awayId]?.shortName}</span>
                    </span>
                    {yours ? (
                      <Badge variant="secondary" title="Jogadores do seu time neste jogo">
                        {yours}
                      </Badge>
                    ) : null}
                    {view.replays[i] && (
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`Assistir ${clubs[result.homeId]?.name} x ${clubs[result.awayId]?.name}`}
                        onClick={() => watch(i)}
                      >
                        <PlayIcon />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {props.signedIn && (
            <Card>
              <CardHeader>
                <CardTitle>Seu time</CardTitle>
                <CardDescription>
                  {view.team
                    ? `${tenths.format(view.team.points ?? 0)} pontos na rodada`
                    : 'Você não tinha time nesta rodada.'}
                </CardDescription>
              </CardHeader>
              {view.team && (
                <CardContent>
                  <ul className="flex flex-col gap-1 text-sm">
                    {scoredTeam(view.team, view.points).map((pick) => (
                      <PointsLine
                        key={pick.id}
                        person={people[pick.id]}
                        clubs={clubs}
                        points={pick.points === undefined ? undefined : pick.counted}
                        captain={pick.captain}
                      />
                    ))}
                  </ul>
                </CardContent>
              )}
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Destaques da rodada</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-1 text-sm">
                {roundLeaders(view.points, LEADERS).map(([id, points]) => (
                  <PointsLine
                    key={id}
                    person={people[id]}
                    clubs={clubs}
                    points={points}
                    mine={mine.has(id)}
                  />
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function PointsLine(props: {
  person?: { name: string; clubId: string; position: Position }
  clubs: FantasySeason['clubs']
  /** Undefined when he did not play. */
  points?: number
  captain?: boolean
  mine?: boolean
}) {
  const { person, points } = props
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-md border p-2',
        props.mine && 'bg-highlight-soft',
      )}
    >
      {person && <ClubMark clubId={person.clubId} clubs={props.clubs} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">
          {person?.name ?? 'Jogador'}
          {props.captain && (
            <StarIcon className="ml-1 inline size-3.5 align-[-2px]" aria-label="Capitão" />
          )}
        </span>
        {person && (
          <span className="text-xs text-muted-foreground">
            {props.clubs[person.clubId]?.shortName} · {POSITION_NAMES[person.position]}
            {props.captain && ' · capitão, pontua 1,5 vez'}
          </span>
        )}
      </div>
      <span
        className={cn(
          'tabular-nums',
          points === undefined && 'text-muted-foreground',
          points !== undefined && points < 0 && 'text-destructive',
        )}
      >
        {points === undefined ? 'não jogou' : tenths.format(points)}
      </span>
    </li>
  )
}
