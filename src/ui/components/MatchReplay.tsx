import { useEffect, useMemo, useState } from 'react'
import { PauseIcon, PlayIcon, RotateCcwIcon, SkipForwardIcon, StarIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  liveRatings,
  liveStats,
  matchResult,
  playMinute,
  replayMatch,
  type MatchReplay as Replay,
  type MatchSide,
} from '../../engine/match/simulate.ts'
import { useMatchViewStore, type MatchView } from '../../store/matchView.ts'
import { tenths } from '../format.ts'
import { matchKits, type Kit } from '../kits.ts'
import { PLAY_SPEEDS, SPEEDS, type Speed } from '../matchSpeeds.ts'
import { movingShare, playDuration } from '../pitchScene.ts'
import { useRevealed } from '../useRevealed.ts'
import { useShownScore } from '../useShownScore.ts'
import { Choices } from './Choices.tsx'
import { KitSwatch } from './KitSwatch.tsx'
import { MatchFeed } from './MatchFeed.tsx'
import { MatchPitch } from './MatchPitch.tsx'
import { MatchRatings } from './MatchRatings.tsx'
import { MatchStats } from './MatchStats.tsx'

const VIEWS: MatchView[] = ['Campo', 'Só texto']

/**
 * A match the server played, played again from its replay, minute by minute,
 * exactly as it went. Given fantasy points, it shows what everyone scored at
 * the final whistle; otherwise the ratings stay.
 */
export function MatchReplay(props: {
  replay: Replay
  title: string
  points?: Readonly<Record<string, number>>
  /** The player's own picks in the round, marked in the points list. */
  mine?: ReadonlySet<string>
  onClose: () => void
}) {
  const [run, setRun] = useState(0)
  return <Playback key={run} {...props} onRestart={() => setRun((r) => r + 1)} />
}

function Playback(props: {
  replay: Replay
  title: string
  points?: Readonly<Record<string, number>>
  mine?: ReadonlySet<string>
  onClose: () => void
  onRestart: () => void
}) {
  const [state] = useState(() => replayMatch(props.replay))
  const [speed, setSpeed] = useState<Speed>('Normal')
  const [paused, setPaused] = useState(false)
  const [tick, setTick] = useState(0)
  const view = useMatchViewStore((s) => s.view)
  const setView = useMatchViewStore((s) => s.setView)
  const onPitch = view === 'Campo'
  const { finished } = state
  const kits = useMemo(() => matchKits(state.home.club, state.away.club), [state])
  const kitsByClub = { [state.home.club.id]: kits.home, [state.away.club.id]: kits.away }
  const halftime = state.minute === 45 && paused

  useEffect(() => {
    if (paused || finished) return
    const delay = onPitch ? playDuration(state.plays.at(-1)) * PLAY_SPEEDS[speed] : SPEEDS[speed]
    const timer = setTimeout(() => {
      playMinute(state)
      if (state.minute === 45) setPaused(true)
      setTick((t) => t + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [state, speed, paused, finished, onPitch, tick])

  const skipToEnd = () => {
    while (!state.finished) playMinute(state)
    setPaused(false)
    setTick((t) => t + 1)
  }

  const result = finished ? matchResult(state) : undefined
  const score = useShownScore(state, onPitch, PLAY_SPEEDS[speed])
  const lastPlay = state.plays.at(-1)
  const reveal =
    onPitch && !finished ? playDuration(lastPlay) * PLAY_SPEEDS[speed] * movingShare(lastPlay) : 0
  const stats = useRevealed(liveStats(state), state.minute, reveal)
  const ratings = useRevealed(result?.ratings ?? liveRatings(state), state.minute, reveal)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Card className="gap-3 px-4">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-center text-sm text-muted-foreground">{props.title}</p>
          <Button size="icon" variant="ghost" aria-label="Fechar o jogo" onClick={props.onClose}>
            <XIcon />
          </Button>
        </div>
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
          {finished ? 'Encerrado' : halftime ? 'Intervalo' : `${state.minute}'`}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {finished ? (
            <Button variant="outline" onClick={props.onRestart}>
              <RotateCcwIcon />
              Ver de novo
            </Button>
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
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        <MatchStats
          stats={stats}
          names={{ home: state.home.club.shortName, away: state.away.club.shortName }}
          kits={kits}
        />
        {finished && props.points ? (
          <MatchPoints
            played={{ home: state.home.played, away: state.away.played }}
            names={props.replay.input.players}
            points={props.points}
            mine={props.mine ?? new Set()}
            clubs={{ home: state.home.club.shortName, away: state.away.club.shortName }}
            kits={kits}
          />
        ) : (
          <MatchRatings
            state={state}
            ratings={ratings}
            players={props.replay.input.players}
            side="home"
            kits={kits}
          />
        )}
      </div>
    </div>
  )
}

/** Everyone who played and what he scored, one side at a time; the player's picks stand out. */
function MatchPoints(props: {
  played: Record<MatchSide, Record<string, string>>
  names: Readonly<Record<string, { name: string }>>
  points: Readonly<Record<string, number>>
  mine: ReadonlySet<string>
  clubs: Record<MatchSide, string>
  kits: Record<MatchSide, Kit>
}) {
  const [side, setSide] = useState<MatchSide>(() =>
    Object.keys(props.played.away).some((id) => props.mine.has(id)) &&
    !Object.keys(props.played.home).some((id) => props.mine.has(id))
      ? 'away'
      : 'home',
  )
  const lines = Object.entries(props.played[side]).sort(
    (a, b) => (props.points[b[0]] ?? 0) - (props.points[a[0]] ?? 0),
  )
  return (
    <Card className="gap-3 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          Pontos
          <KitSwatch kit={props.kits[side]} />
        </h2>
        <Choices
          ariaLabel="Time"
          options={['home', 'away'] as const}
          label={(s) => props.clubs[s]}
          value={side}
          onChange={setSide}
        />
      </div>
      <ul className="flex flex-col text-sm">
        {lines.map(([id, position]) => {
          const points = props.points[id] ?? 0
          const mine = props.mine.has(id)
          return (
            <li
              key={id}
              className={cn(
                'flex items-center gap-2 rounded px-1 py-0.5',
                mine && 'bg-highlight-soft font-semibold',
              )}
            >
              <span className="w-4 text-xs text-muted-foreground">{position}</span>
              <span className="min-w-0 flex-1 truncate">{props.names[id]?.name}</span>
              {mine && <StarIcon className="size-3.5" aria-label="No seu time" />}
              <span
                className={cn(
                  'tabular-nums',
                  points < 0 && 'text-destructive',
                  points >= 8 && 'text-green-600 dark:text-green-400',
                )}
              >
                {tenths.format(points)}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
