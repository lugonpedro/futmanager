import { useEffect, useMemo, useState } from 'react'
import { PauseIcon, PlayIcon, SkipForwardIcon } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { liveRatings, liveStats, matchResult, playMinute } from '../../engine/match/simulate.ts'
import type { GameState } from '../../engine/model/types.ts'
import { CUP_NAME } from '../../engine/season/cup.ts'
import {
  applyMatchDay,
  createMatchDayMatches,
  todaysMatchDay,
  type LiveMatch,
  type MatchDay,
} from '../../engine/season/season.ts'
import { useGameStore } from '../../store/game.ts'
import { useMatchViewStore, type MatchView } from '../../store/matchView.ts'
import { Choices } from '../components/Choices.tsx'
import { KitSwatch } from '../components/KitSwatch.tsx'
import { MatchControls } from '../components/MatchControls.tsx'
import { MatchFeed } from '../components/MatchFeed.tsx'
import { MatchPitch } from '../components/MatchPitch.tsx'
import { MatchRatings } from '../components/MatchRatings.tsx'
import { MatchStats } from '../components/MatchStats.tsx'
import { divisionName, formatDayDate } from '../format.ts'
import { matchKits } from '../kits.ts'
import { movingShare, playDuration } from '../pitchScene.ts'
import { useRevealed } from '../useRevealed.ts'
import { useShownScore } from '../useShownScore.ts'
import { announceChanges } from '../announce.ts'

/** Milliseconds per minute in text only, and per shortest play on the pitch. */
const SPEEDS = { Normal: 200, Rápido: 50 } as const
const PLAY_SPEEDS = { Normal: 650, Rápido: 300 } as const
type Speed = keyof typeof SPEEDS
const VIEWS: MatchView[] = ['Campo', 'Só texto']

/**
 * The user's match narrated minute by minute, with its numbers and ratings
 * alongside. The rest of the match day is played behind it, unseen.
 */
export function LiveMatchScreen() {
  const game = useGameStore((s) => s.game)
  const loading = useGameStore((s) => s.loading)
  if (loading) return null
  const day = game && todaysMatchDay(game)
  if (!game || !day) return <Navigate to="/jogo" replace />
  return <LiveRound key={`${game.today}-${day.kind}`} game={game} day={day} />
}

const involves = (match: LiveMatch, clubId: string) =>
  match.fixture.homeId === clubId || match.fixture.awayId === clubId

function LiveRound({ game, day }: { game: GameState; day: MatchDay }) {
  const setGame = useGameStore((s) => s.setGame)
  const navigate = useNavigate()
  const [matches] = useState(() => createMatchDayMatches(game))
  const [speed, setSpeed] = useState<Speed>('Normal')
  const [paused, setPaused] = useState(false)
  const [tick, setTick] = useState(0)
  const view = useMatchViewStore((s) => s.view)
  const setView = useMatchViewStore((s) => s.setView)
  const onPitch = view === 'Campo'

  const own = matches.find((m) => involves(m, game.userClubId))!
  const { state } = own
  const side = own.fixture.homeId === game.userClubId ? 'home' : 'away'
  const finished = matches.every((m) => m.state.finished)
  const kits = useMemo(() => matchKits(state.home.club, state.away.club), [state])
  const kitsByClub = { [state.home.club.id]: kits.home, [state.away.club.id]: kits.away }
  const halftime = state.minute === 45 && paused

  // On the pitch the next minute waits for the last play to be acted out.
  useEffect(() => {
    if (paused || finished) return
    const delay = onPitch ? playDuration(state.plays.at(-1)) * PLAY_SPEEDS[speed] : SPEEDS[speed]
    const timer = setTimeout(() => {
      for (const { state } of matches) playMinute(state)
      // Stop at half-time, like the radio going to the studio.
      if (matches[0].state.minute === 45) setPaused(true)
      setTick((t) => t + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [matches, state, speed, paused, finished, onPitch, tick])

  const skipToEnd = () => {
    for (const { state } of matches) while (!state.finished) playMinute(state)
    setPaused(false)
    setTick((t) => t + 1)
  }

  const finish = () => {
    const next = applyMatchDay(
      game,
      matches.map((m) => matchResult(m.state)),
    )
    setGame(next)
    navigate('/jogo')
    announceChanges(game, next, navigate)
  }

  const title =
    day.kind === 'copa'
      ? `${CUP_NAME} · ${game.season.cup!.stages[day.stage].name}`
      : `${divisionName(game.world.clubs[game.userClubId].division)} · rodada ${game.season.round}`
  const result = finished ? matchResult(state) : undefined
  const score = useShownScore(state, onPitch, PLAY_SPEEDS[speed])
  // Beside the pitch the numbers change once the play has been seen.
  const lastPlay = state.plays.at(-1)
  const reveal =
    onPitch && !finished ? playDuration(lastPlay) * PLAY_SPEEDS[speed] * movingShare(lastPlay) : 0
  const stats = useRevealed(liveStats(state), state.minute, reveal)
  const ratings = useRevealed(result?.ratings ?? liveRatings(state), state.minute, reveal)
  const best = result && bestPlayer(result.ratings)

  return (
    <main className="min-h-screen p-4">
      <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="gap-3 px-4">
          <p className="text-center text-sm text-muted-foreground">
            {title} · {formatDayDate(game.today)}
          </p>
          <div className="flex items-center justify-center gap-2 text-base font-bold sm:gap-4 sm:text-xl">
            <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
              <span className="truncate">{state.home.club.name}</span>
              <KitSwatch kit={kits.home} className="size-4" />
            </span>
            <span
              className={`shrink-0 rounded-md bg-primary px-3 py-1 whitespace-nowrap text-primary-foreground tabular-nums ${score.flash ? 'animate-pulse' : ''}`}
            >
              {score.home} x {score.away}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <KitSwatch kit={kits.away} className="size-4" />
              <span className="truncate">{state.away.club.name}</span>
            </span>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {finished
              ? day.kind === 'copa' && state.home.stats.goals === state.away.stats.goals
                ? 'Encerrado: a vaga sai nos pênaltis'
                : 'Encerrado'
              : halftime
                ? 'Intervalo'
                : `${state.minute}'`}
          </p>
          {best && (
            <p className="text-center text-sm">
              Melhor em campo: <strong>{game.world.players[best[0]].name}</strong> (
              {best[1].toFixed(1)})
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {finished ? (
              <Button onClick={finish}>Continuar</Button>
            ) : (
              <>
                <Button onClick={() => setPaused(!paused)}>
                  {paused ? <PlayIcon /> : <PauseIcon />}
                  {halftime ? 'Começar 2º tempo' : paused ? 'Continuar' : 'Pausar'}
                </Button>
                <Button variant="outline" onClick={skipToEnd}>
                  <SkipForwardIcon />
                  Pular para o fim
                </Button>
              </>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <Choices ariaLabel="Visualização" options={VIEWS} value={view} onChange={setView} />
              <Choices
                ariaLabel="Velocidade"
                options={Object.keys(SPEEDS) as Speed[]}
                value={speed}
                onChange={setSpeed}
              />
            </div>
          </div>

          {onPitch && <MatchPitch state={state} unitMs={PLAY_SPEEDS[speed]} kits={kits} />}

          <MatchFeed
            events={state.events}
            kits={kitsByClub}
            className={onPitch ? 'max-h-48 min-h-32' : 'max-h-[50vh] min-h-48'}
          />

          <MatchControls
            state={state}
            side={side}
            onPause={() => setPaused(true)}
            onChange={() => setTick((t) => t + 1)}
          />
        </Card>

        <aside className="flex flex-col gap-4">
          <MatchStats
            stats={stats}
            names={{ home: state.home.club.shortName, away: state.away.club.shortName }}
            kits={kits}
          />
          <MatchRatings
            state={state}
            ratings={ratings}
            players={game.world.players}
            side={side}
            kits={kits}
            best={best?.[0]}
          />
        </aside>
      </div>
    </main>
  )
}

/** The highest rating of the match and whose it is; the first listed wins a tie. */
function bestPlayer(ratings: Record<string, number>): [string, number] | undefined {
  let best: [string, number] | undefined
  for (const entry of Object.entries(ratings)) if (!best || entry[1] > best[1]) best = entry
  return best
}
