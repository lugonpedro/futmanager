import { useEffect, useMemo, useState } from 'react'
import { ArrowRightIcon, FastForwardIcon, RadioIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { DraftTeam } from '../../cloud/draft.ts'
import type { MatchView } from '../../store/matchView.ts'
import {
  playMinute,
  replayMatch,
  type MatchReplay,
  type MatchState,
} from '../../engine/match/simulate.ts'
import { matchKits } from '../kits.ts'
import { LIVE, liveElapsed, liveFactor, minutesAt, roundOver } from '../liveRound.ts'
import { useShownScore } from '../useShownScore.ts'
import { Choices } from './Choices.tsx'
import { MatchFeed } from './MatchFeed.tsx'
import { MatchPitch } from './MatchPitch.tsx'
import { TeamCrest } from './RoomParts.tsx'

const VIEWS: MatchView[] = ['Só texto', 'Campo']

/**
 * The round just played, shown live to the whole room at once: the
 * player's match on the pitch (or any other they pick) and the scores of
 * the rest, minute by minute, on the clock everyone shares.
 */
export function RoomLiveRound(props: {
  round: number
  replays: readonly MatchReplay[]
  /** When everyone's kick-off is, in ms since the epoch. */
  kickOff: number
  timeline: readonly number[]
  teamOf: ReadonlyMap<string, DraftTeam>
  mine?: DraftTeam
  /** When the round sped up, everyone having asked, in ms since the epoch. */
  spedAt?: number
  /** The places of the people who asked to speed up. */
  asked: readonly number[]
  /** How many people have to ask before it speeds up. */
  people: number
  /** Asks to speed up; only for someone with a team in the room. */
  onSpeedUp?: () => void
  /** The player is done watching, with "Continuar" after the final whistle. */
  onDone: () => void
}) {
  const { replays, kickOff, timeline, teamOf, spedAt } = props
  const [states] = useState(() => replays.map(replayMatch))
  const [elapsed, setElapsed] = useState(() => liveElapsed(kickOff, Date.now(), spedAt))
  const [view, setView] = useState<MatchView>('Só texto')
  const onPitch = view === 'Campo'
  const [chosen, setChosen] = useState(() => {
    const slot = props.mine && String(props.mine.slot)
    return Math.max(
      0,
      states.findIndex((s) => s.home.club.id === slot || s.away.club.id === slot),
    )
  })

  // Each page plays the minutes the shared clock has reached, then waits for the next one.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const step = () => {
      const at = Date.now()
      const now = liveElapsed(kickOff, at, spedAt)
      const minutes = minutesAt(timeline, now)
      for (const state of states) while (state.minute < minutes) playMinute(state)
      setElapsed(now)
      if (roundOver(timeline, now)) return
      const next = minutes < timeline.length - 1 ? timeline[minutes] : timeline.at(-1)!
      const wait = (next - now) / liveFactor(at, spedAt)
      // Before kick-off the countdown ticks every second.
      timer = setTimeout(step, Math.min(1000, Math.max(0, wait)))
    }
    step()
    return () => clearTimeout(timer)
  }, [states, kickOff, timeline, spedAt])

  const state = states[chosen]
  const over = roundOver(timeline, elapsed)
  const sped = spedAt !== undefined && elapsed > spedAt - kickOff
  const unitMs = LIVE.unitMs / (sped ? LIVE.fastFactor : 1)
  const kits = useMemo(() => matchKits(state.home.club, state.away.club), [state])
  const kitsByClub = { [state.home.club.id]: kits.home, [state.away.club.id]: kits.away }
  const score = useShownScore(state, onPitch, unitMs)
  const askedMe = props.mine !== undefined && props.asked.includes(props.mine.slot)
  const count = props.people > 1 ? ` (${props.asked.length}/${props.people})` : ''
  const clock =
    elapsed < 0
      ? `Começa em ${Math.ceil(-elapsed / 1000)} s`
      : over
        ? 'Encerrado'
        : state.minute === 45 && elapsed >= timeline[45] - LIVE.halftimeMs
          ? 'Intervalo'
          : `${state.minute}'`

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card className="gap-3 px-4">
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <RadioIcon className={cn('size-4', !over && 'text-destructive')} />
          Rodada {props.round} {over ? 'encerrada' : 'ao vivo'}
        </p>
        <div className="flex items-center justify-center gap-2 text-base font-bold sm:gap-4 sm:text-xl">
          <Side state={state} side="home" teamOf={teamOf} />
          <span
            className={cn(
              'shrink-0 rounded-md bg-primary px-3 py-1 whitespace-nowrap text-primary-foreground tabular-nums',
              score.flash && 'animate-pulse',
            )}
          >
            {score.home} x {score.away}
          </span>
          <Side state={state} side="away" teamOf={teamOf} />
        </div>
        <p className="text-center text-sm text-muted-foreground">{clock}</p>

        <div className="flex flex-wrap items-center gap-2">
          {over ? (
            <Button onClick={props.onDone}>
              <ArrowRightIcon />
              Continuar
            </Button>
          ) : spedAt !== undefined ? (
            <Button variant="outline" disabled>
              <FastForwardIcon />
              Acelerado
            </Button>
          ) : (
            props.onSpeedUp && (
              <Button
                variant="outline"
                disabled={askedMe}
                onClick={props.onSpeedUp}
                title="Acelera a rodada quando todos da sala pedirem"
              >
                <FastForwardIcon />
                {askedMe ? `Esperando os outros${count}` : `Acelerar${count}`}
              </Button>
            )
          )}
          <div className="ml-auto">
            <Choices ariaLabel="Visualização" options={VIEWS} value={view} onChange={setView} />
          </div>
        </div>

        {/* Keys apart: two siblings with the same key left a stale pitch behind on "Só texto". */}
        {onPitch && (
          <MatchPitch key={`campo-${chosen}`} state={state} unitMs={unitMs} kits={kits} />
        )}
        <MatchFeed
          key={`lances-${chosen}`}
          events={state.events}
          kits={kitsByClub}
          className={onPitch ? 'max-h-40 min-h-24' : 'max-h-[50vh] min-h-48'}
        />
      </Card>

      {states.length > 1 && (
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Jogos da rodada</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              {states.map((s, i) => (
                <li key={s.home.club.id}>
                  <button
                    type="button"
                    onClick={() => setChosen(i)}
                    aria-pressed={i === chosen}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                      i === chosen && 'bg-highlight-soft font-semibold',
                    )}
                  >
                    <ShortName state={s} side="home" teamOf={teamOf} />
                    <span className="shrink-0 font-mono font-bold tabular-nums">
                      {i === chosen ? score.home : s.home.stats.goals} x{' '}
                      {i === chosen ? score.away : s.away.stats.goals}
                    </span>
                    <ShortName state={s} side="away" teamOf={teamOf} />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Side(props: {
  state: MatchState
  side: 'home' | 'away'
  teamOf: ReadonlyMap<string, DraftTeam>
}) {
  const club = props.state[props.side].club
  const team = props.teamOf.get(club.id)
  return (
    <span
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2',
        props.side === 'home' && 'flex-row-reverse text-right',
      )}
    >
      {team && <TeamCrest team={team} id={`vivo-${club.id}`} className="size-6 shrink-0" />}
      <span className="truncate">{club.name}</span>
    </span>
  )
}

function ShortName(props: {
  state: MatchState
  side: 'home' | 'away'
  teamOf: ReadonlyMap<string, DraftTeam>
}) {
  const club = props.state[props.side].club
  const team = props.teamOf.get(club.id)
  return (
    <span
      className={cn(
        'flex min-w-0 flex-1 items-center gap-1.5',
        props.side === 'away' && 'flex-row-reverse text-right',
      )}
    >
      {team && <TeamCrest team={team} id={`vivo-lista-${club.id}`} className="size-4 shrink-0" />}
      <span className="truncate">{club.shortName}</span>
    </span>
  )
}
