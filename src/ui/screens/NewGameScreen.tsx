import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { generateWorld } from '../../engine/generate/world.ts'
import { newGame } from '../../engine/season/season.ts'
import { useGameStore } from '../../store/game.ts'
import { ClubName } from '../components/ClubName.tsx'
import { divisionName, formatMoney } from '../format.ts'

const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

/** Pick a club from a freshly generated world to start a career with. */
export function NewGameScreen() {
  const [seed, setSeed] = useState(randomSeed)
  const world = useMemo(() => generateWorld(seed), [seed])
  const existing = useGameStore((s) => s.game)
  const setGame = useGameStore((s) => s.setGame)
  const navigate = useNavigate()

  const choose = (clubId: string) => {
    const club = world.clubs[clubId]
    if (existing && !window.confirm(`Começar com ${club.name}? A carreira atual será perdida.`)) {
      return
    }
    setGame(newGame(seed, clubId))
    navigate('/jogo')
  }

  return (
    <main className="min-h-screen bg-green-900 p-4 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Escolha seu time</h1>
          <Link to="/" className="text-sm text-green-200 underline">
            Voltar
          </Link>
        </header>
        <p className="text-sm text-green-100">
          Times maiores têm elencos mais fortes e mais dinheiro. Começar na Série B é o desafio
          clássico: subir entre os 4 primeiros.
        </p>
        <button
          type="button"
          onClick={() => setSeed(randomSeed())}
          className="self-start rounded border border-green-400 px-4 py-2 text-green-100"
        >
          Gerar outro mundo
        </button>
        <div className="grid gap-4 md:grid-cols-2">
          {world.leagues.map((league) => (
            <section key={league.id} className="rounded bg-green-950/60 p-3">
              <h2 className="mb-2 font-semibold">{divisionName(league.division)}</h2>
              <ul className="flex flex-col">
                {league.clubIds.map((id) => {
                  const club = world.clubs[id]
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => choose(id)}
                        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-green-800"
                      >
                        <ClubName club={club} />
                        <span className="shrink-0 text-xs text-green-300 tabular-nums">
                          rep. {club.reputation} · {formatMoney(club.cash)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
