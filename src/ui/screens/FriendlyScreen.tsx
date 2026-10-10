import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { generateWorld } from '../../engine/generate/world.ts'
import { autoLineup, FORMATIONS } from '../../engine/match/lineup.ts'
import {
  createMatch,
  matchResult,
  playMinute,
  type MatchState,
} from '../../engine/match/simulate.ts'
import type { Formation, MatchEvent, Posture, World } from '../../engine/model/types.ts'
import { createRng } from '../../engine/rng.ts'

const SPEEDS = { Lento: 400, Normal: 150, Rápido: 40 } as const
const POSTURES: Posture[] = ['defensiva', 'normal', 'ofensiva']

const EVENT_STYLE: Partial<Record<MatchEvent['type'], string>> = {
  gol: 'font-bold text-yellow-300',
  amarelo: 'text-yellow-100',
  vermelho: 'font-semibold text-red-300',
  lesao: 'text-orange-200',
  inicio: 'italic text-green-200',
  intervalo: 'italic text-green-200',
  fim: 'font-semibold text-green-100',
}

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
  const [, setTick] = useState(0)
  const feedRef = useRef<HTMLOListElement>(null)

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
  }

  useEffect(() => {
    if (!match || match.finished) return
    const timer = setInterval(() => {
      playMinute(match)
      setTick((t) => t + 1)
      if (match.finished) clearInterval(timer)
    }, SPEEDS[speed])
    return () => clearInterval(timer)
  }, [match, speed])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  })

  const result = match?.finished ? matchResult(match) : undefined

  return (
    <main className="min-h-screen bg-green-900 p-4 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Amistoso</h1>
          <Link to="/" className="text-sm text-green-200 underline">
            Voltar
          </Link>
        </header>

        <section className="grid gap-3 rounded bg-green-950/60 p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Mandante (você)
            <ClubSelect clubs={clubs} value={homeId} onChange={setHomeId} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Visitante
            <ClubSelect clubs={clubs} value={awayId} onChange={setAwayId} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Formação
            <select
              className="rounded bg-green-800 p-2"
              value={formation}
              onChange={(e) => setFormation(e.target.value as Formation)}
            >
              {Object.keys(FORMATIONS).map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Postura
            <select
              className="rounded bg-green-800 p-2"
              value={posture}
              onChange={(e) => setPosture(e.target.value as Posture)}
            >
              {POSTURES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={start}
              disabled={homeId === awayId || (match && !match.finished)}
              className="rounded bg-yellow-400 px-4 py-2 font-semibold text-green-950 disabled:opacity-50"
            >
              Jogar
            </button>
            <button
              type="button"
              onClick={newWorld}
              className="rounded border border-green-400 px-4 py-2 text-green-100"
            >
              Gerar outros times
            </button>
            <div className="ml-auto flex items-center gap-1 text-sm">
              {(Object.keys(SPEEDS) as (keyof typeof SPEEDS)[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`rounded px-2 py-1 ${s === speed ? 'bg-green-600' : 'bg-green-800'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </section>

        {match && (
          <section className="flex flex-col gap-3 rounded bg-green-950/60 p-4">
            <div className="flex items-center justify-center gap-4 text-xl font-bold">
              <span className="flex-1 text-right">{match.home.club.name}</span>
              <span className="rounded bg-black/40 px-3 py-1 tabular-nums">
                {match.home.stats.goals} x {match.away.stats.goals}
              </span>
              <span className="flex-1">{match.away.club.name}</span>
            </div>
            <p className="text-center text-sm text-green-200">
              {match.finished ? 'Encerrado' : `${match.minute}'`}
            </p>
            <ol ref={feedRef} className="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm">
              {match.events.map((event, i) => (
                <li key={i} className={EVENT_STYLE[event.type] ?? 'text-green-50'}>
                  <span className="mr-2 inline-block w-8 text-right text-green-300 tabular-nums">
                    {event.minute}'
                  </span>
                  {event.text}
                </li>
              ))}
            </ol>
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
                      <td className="px-3 text-center text-green-200">{label}</td>
                      <td className="px-3">{result.stats.away[key]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>
    </main>
  )
}

function ClubSelect(props: {
  clubs: World['clubs'][string][]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <select
      className="rounded bg-green-800 p-2"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {props.clubs.map((club) => (
        <option key={club.id} value={club.id}>
          {club.name} (Série {club.division === 1 ? 'A' : 'B'}, rep. {club.reputation})
        </option>
      ))}
    </select>
  )
}
