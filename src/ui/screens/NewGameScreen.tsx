import { useMemo, useState } from 'react'
import { RefreshCwIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { generateWorld } from '../../engine/generate/world.ts'
import { newGame } from '../../engine/season/season.ts'
import { useGameStore } from '../../store/game.ts'
import { ClubName } from '../components/ClubName.tsx'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
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
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Escolha seu time</h1>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Voltar</Link>
          </Button>
        </div>
      </header>
      <p className="text-sm text-muted-foreground">
        Times maiores têm elencos mais fortes e mais dinheiro. Começar na Série B é o desafio
        clássico: subir entre os 4 primeiros.
      </p>
      <Button variant="outline" className="self-start" onClick={() => setSeed(randomSeed())}>
        <RefreshCwIcon />
        Gerar outro mundo
      </Button>
      <div className="grid gap-4 md:grid-cols-2">
        {world.leagues.map((league) => (
          <Card key={league.id} className="gap-2">
            <CardHeader>
              <CardTitle>{divisionName(league.division)}</CardTitle>
            </CardHeader>
            <CardContent className="px-2">
              <ul className="flex flex-col">
                {league.clubIds.map((id) => {
                  const club = world.clubs[id]
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => choose(id)}
                        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        <ClubName club={club} />
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          rep. {club.reputation} · {formatMoney(club.cash)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  )
}
