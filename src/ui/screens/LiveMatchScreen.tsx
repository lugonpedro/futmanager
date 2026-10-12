import { useEffect, useState } from 'react'
import { PauseIcon, PlayIcon, SkipForwardIcon } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { matchResult, playMinute, type MatchState } from '../../engine/match/simulate.ts'
import type { GameState } from '../../engine/model/types.ts'
import { CUP_ID, CUP_NAME } from '../../engine/season/cup.ts'
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
import { ClubName } from '../components/ClubName.tsx'
import { MatchControls } from '../components/MatchControls.tsx'
import { MatchFeed } from '../components/MatchFeed.tsx'
import { MatchPitch } from '../components/MatchPitch.tsx'
import { divisionName, formatDayDate } from '../format.ts'
import { playDuration } from '../pitchScene.ts'
import { useShownScore } from '../useShownScore.ts'

/** Milliseconds per minute in text only, and per shortest play on the pitch. */
const SPEEDS = { Lento: 500, Normal: 200, Rápido: 50 } as const
const PLAY_SPEEDS = { Lento: 1100, Normal: 650, Rápido: 300 } as const
type Speed = keyof typeof SPEEDS
const VIEWS: MatchView[] = ['Campo', 'Só texto']

/** The user's match narrated minute by minute, with the rest of the match day alongside. */
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
    setGame(
      applyMatchDay(
        game,
        matches.map((m) => matchResult(m.state)),
      ),
    )
    navigate('/jogo')
  }

  // The rest of the day: each division's round, or the other ties of the cup stage.
  const groups =
    day.kind === 'copa'
      ? [{ id: CUP_ID, name: CUP_NAME }]
      : [...game.world.leagues]
          .sort(
            (a, b) =>
              Number(b.clubIds.includes(game.userClubId)) -
                Number(a.clubIds.includes(game.userClubId)) || a.division - b.division,
          )
          .map((league) => ({ id: league.id, name: divisionName(league.division) }))
  const title =
    day.kind === 'copa'
      ? `${CUP_NAME} · ${game.season.cup!.stages[day.stage].name}`
      : `${divisionName(game.world.clubs[game.userClubId].division)} · rodada ${game.season.round}`
  const result = finished ? matchResult(state) : undefined
  const score = useShownScore(state, onPitch, PLAY_SPEEDS[speed])

  return (
    <main className="min-h-screen p-4">
      <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="gap-3 px-4">
          <p className="text-center text-sm text-muted-foreground">
            {title} · {formatDayDate(game.today)}
          </p>
          <div className="flex items-center justify-center gap-2 text-base font-bold sm:gap-4 sm:text-xl">
            <span className="flex min-w-0 flex-1 justify-end text-right">
              <ClubName club={state.home.club} />
            </span>
            <span
              className={`shrink-0 rounded-md bg-primary px-3 py-1 whitespace-nowrap text-primary-foreground tabular-nums ${score.flash ? 'animate-pulse' : ''}`}
            >
              {score.home} x {score.away}
            </span>
            <span className="flex min-w-0 flex-1">
              <ClubName club={state.away.club} />
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

          {onPitch && <MatchPitch state={state} unitMs={PLAY_SPEEDS[speed]} />}

          <MatchFeed
            events={state.events}
            className={onPitch ? 'max-h-48 min-h-32' : 'max-h-[50vh] min-h-48'}
          />

          <MatchControls
            state={state}
            side={side}
            onPause={() => setPaused(true)}
            onChange={() => setTick((t) => t + 1)}
          />

          {result && (
            <table className="mx-auto text-sm tabular-nums">
              <tbody>
                {(
                  [
                    ['Posse de bola (%)', 'possession'],
                    ['Finalizações', 'shots'],
                    ['No gol', 'shotsOnTarget'],
                    ['Amarelos', 'yellowCards'],
                    ['Vermelhos', 'redCards'],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key}>
                    <td className="px-3 text-right">{result.stats.home[key]}</td>
                    <td className="px-3 text-center text-muted-foreground">{label}</td>
                    <td className="px-3">{result.stats.away[key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <aside className="flex flex-col gap-4">
          {groups.map((group) => (
            <Card key={group.id} className="gap-2 px-3 py-3">
              <h2 className="text-sm font-semibold">{group.name}</h2>
              <ul className="flex flex-col gap-1">
                {matches
                  .filter((m) => m.fixture.leagueId === group.id && m !== own)
                  .map((m) => (
                    <OtherMatch key={m.fixture.id} state={m.state} />
                  ))}
              </ul>
            </Card>
          ))}
        </aside>
      </div>
    </main>
  )
}

/** One line of the round's scoreboard; flashes for a couple of minutes after a goal. */
function OtherMatch({ state }: { state: MatchState }) {
  const lastGoal = state.events.findLast((e) => e.type === 'gol')
  const recent = lastGoal && !state.finished && state.minute - lastGoal.minute < 3
  const scorer = (clubId: string) =>
    recent && lastGoal.clubId === clubId ? 'font-bold text-highlight' : ''
  return (
    <li
      className={`grid grid-cols-[1fr_auto_1fr] gap-2 rounded px-1 text-sm tabular-nums ${recent ? 'bg-highlight-soft' : ''}`}
    >
      <span className={`text-right ${scorer(state.home.club.id)}`}>
        {state.home.club.shortName}
      </span>
      <span>
        {state.home.stats.goals} x {state.away.stats.goals}
      </span>
      <span className={scorer(state.away.club.id)}>{state.away.club.shortName}</span>
    </li>
  )
}
