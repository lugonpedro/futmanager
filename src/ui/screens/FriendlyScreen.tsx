import { PlayIcon, RefreshCwIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { generateWorld } from '../../engine/generate/world.ts'
import { autoLineup, FORMATION_LIST } from '../../engine/match/lineup.ts'
import {
  createMatch,
  matchResult,
  playMinute,
  type MatchState,
} from '../../engine/match/simulate.ts'
import type { Formation, Posture, World } from '../../engine/model/types.ts'
import { createRng } from '../../engine/rng.ts'
import { useMatchViewStore, type MatchView } from '../../store/matchView.ts'
import { Choices } from '../components/Choices.tsx'
import { MatchFeed } from '../components/MatchFeed.tsx'
import { MatchPitch } from '../components/MatchPitch.tsx'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import { divisionName, POSTURE_NAMES } from '../format.ts'
import { playDuration } from '../pitchScene.ts'
import { useShownScore } from '../useShownScore.ts'

/** Milliseconds per minute in text only, and per shortest play on the pitch. */
const SPEEDS = { Lento: 400, Normal: 150, Rápido: 40 } as const
const PLAY_SPEEDS = { Lento: 1100, Normal: 650, Rápido: 300 } as const
const VIEWS: MatchView[] = ['Campo', 'Só texto']

const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

function squadOf(world: World, clubId: string) {
  return world.clubs[clubId].playerIds.map((id) => world.players[id])
}

/** A one-off match between any two clubs, to watch the engine narrate a game. */
export function FriendlyScreen() {
  const [seed, setSeed] = useState(randomSeed)
  const world = useMemo(() => generateWorld(seed), [seed])
  const clubs = useMemo(
    () => world.leagues.flatMap((league) => league.clubIds.map((id) => world.clubs[id])),
    [world],
  )
  const [homeId, setHomeId] = useState(world.leagues[0].clubIds[0])
  const [awayId, setAwayId] = useState(world.leagues[0].clubIds[1])
  const [formation, setFormation] = useState<Formation>('4-4-2')
  const [posture, setPosture] = useState<Posture>('normal')
  const [speed, setSpeed] = useState<keyof typeof SPEEDS>('Normal')
  const [match, setMatch] = useState<MatchState>()
  const [matchCount, setMatchCount] = useState(0)
  const [tick, setTick] = useState(0)
  const view = useMatchViewStore((s) => s.view)
  const setView = useMatchViewStore((s) => s.setView)
  const onPitch = view === 'Campo'

  const newWorld = () => {
    const next = randomSeed()
    const nextWorld = generateWorld(next)
    setSeed(next)
    setHomeId(nextWorld.leagues[0].clubIds[0])
    setAwayId(nextWorld.leagues[0].clubIds[1])
    setMatch(undefined)
  }

  const start = () => {
    const state = createMatch(
      {
        home: {
          club: world.clubs[homeId],
          lineup: autoLineup(squadOf(world, homeId), formation, posture),
        },
        away: { club: world.clubs[awayId], lineup: autoLineup(squadOf(world, awayId)) },
        players: world.players,
      },
      createRng(randomSeed()),
    )
    setMatch(state)
    setMatchCount((n) => n + 1)
  }

  // On the pitch the next minute waits for the last play to be acted out.
  useEffect(() => {
    if (!match || match.finished) return
    const delay = onPitch ? playDuration(match.plays.at(-1)) * PLAY_SPEEDS[speed] : SPEEDS[speed]
    const timer = setTimeout(() => {
      playMinute(match)
      setTick((t) => t + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [match, speed, onPitch, tick])

  const score = useShownScore(match, onPitch, PLAY_SPEEDS[speed])
  const result = match?.finished ? matchResult(match) : undefined

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Amistoso</h1>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Voltar</Link>
          </Button>
        </div>
      </header>

      <Card className="grid gap-3 px-4 sm:grid-cols-2">
        <Field label="Mandante (você)">
          <ClubSelect clubs={clubs} value={homeId} onChange={setHomeId} />
        </Field>
        <Field label="Visitante">
          <ClubSelect clubs={clubs} value={awayId} onChange={setAwayId} />
        </Field>
        <Field label="Formação">
          <Choices
            ariaLabel="Formação"
            options={FORMATION_LIST}
            value={formation}
            onChange={setFormation}
          />
        </Field>
        <Field label="Postura">
          <Choices
            ariaLabel="Postura"
            options={Object.keys(POSTURE_NAMES) as Posture[]}
            value={posture}
            onChange={setPosture}
            label={(p) => POSTURE_NAMES[p]}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button onClick={start} disabled={homeId === awayId || (match && !match.finished)}>
            <PlayIcon />
            Jogar
          </Button>
          <Button variant="outline" onClick={newWorld}>
            <RefreshCwIcon />
            Gerar outros times
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Choices ariaLabel="Visualização" options={VIEWS} value={view} onChange={setView} />
            <Choices
              ariaLabel="Velocidade"
              options={Object.keys(SPEEDS) as (keyof typeof SPEEDS)[]}
              value={speed}
              onChange={setSpeed}
            />
          </div>
        </div>
      </Card>

      {match && (
        <Card className="gap-3 px-4">
          <div className="flex items-center justify-center gap-4 text-xl font-bold">
            <span className="flex-1 text-right">{match.home.club.name}</span>
            <span
              className={`rounded-md bg-primary px-3 py-1 text-primary-foreground tabular-nums ${score.flash ? 'animate-pulse' : ''}`}
            >
              {score.home} x {score.away}
            </span>
            <span className="flex-1">{match.away.club.name}</span>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {match.finished ? 'Encerrado' : `${match.minute}'`}
          </p>
          {onPitch && <MatchPitch key={matchCount} state={match} unitMs={PLAY_SPEEDS[speed]} />}
          <MatchFeed events={match.events} className={onPitch ? 'max-h-48' : undefined} />
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
      )}
    </main>
  )
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{props.label}</span>
      {props.children}
    </div>
  )
}

function ClubSelect(props: {
  clubs: World['clubs'][string][]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {props.clubs.map((club) => (
          <SelectItem key={club.id} value={club.id}>
            {club.name} ({divisionName(club.division)}, rep. {club.reputation})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
