import { useMemo, useState } from 'react'
import { PencilIcon, RefreshCwIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { generateWorld } from '../../engine/generate/world.ts'
import { applyPack, packIsEmpty, packSlots } from '../../engine/pack/pack.ts'
import { newGame } from '../../engine/season/season.ts'
import { useGameStore } from '../../store/game.ts'
import { usePackStore } from '../../store/pack.ts'
import { Choices } from '../components/Choices.tsx'
import { ClubName } from '../components/ClubName.tsx'
import { PackFileButton, PackLegalNote, PackMessage } from '../components/PackControls.tsx'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import { divisionName, formatMoney } from '../format.ts'
import { usePackMessage } from '../usePackMessage.ts'

type Names = 'gerado' | 'pacote'
const NAME_LABELS: Record<Names, string> = { gerado: 'Mundo gerado', pacote: 'Usar pacote' }

const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

/** Pick a club from a freshly generated world to start a career with. */
export function NewGameScreen() {
  const [seed, setSeed] = useState(randomSeed)
  const { pack, setPack } = usePackStore()
  const hasPack = !packIsEmpty(pack)
  const [names, setNames] = useState<Names>(hasPack ? 'pacote' : 'gerado')
  const usePack = names === 'pacote' && hasPack
  const message = usePackMessage()
  const world = useMemo(() => {
    const generated = generateWorld(seed)
    return usePack ? applyPack(generated, pack).world : generated
  }, [seed, usePack, pack])
  const startGame = useGameStore((s) => s.startGame)
  const navigate = useNavigate()

  // Each new career gets its own save slot, so starting one never loses another.
  const choose = (clubId: string) => {
    startGame(newGame(seed, clubId, usePack ? pack : undefined))
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
      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Nomes dos times</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Choices
              ariaLabel="Nomes dos times"
              options={['gerado', 'pacote'] as const}
              value={names}
              label={(value) => NAME_LABELS[value]}
              onChange={setNames}
            />
            <Button variant="outline" size="sm" onClick={() => setSeed(randomSeed())}>
              <RefreshCwIcon />
              Gerar outro mundo
            </Button>
          </div>
          {names === 'pacote' && (
            <>
              <p className="text-sm">
                {hasPack
                  ? `Pacote "${pack.name || 'sem nome'}": os nomes dele entram no lugar dos gerados, clube por clube; o que faltar continua gerado.`
                  : 'Nenhum pacote ainda. Importe um arquivo .json ou uma planilha .csv, ou monte o seu no editor.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <PackFileButton
                  size="sm"
                  onLoad={({ pack: loaded, warnings }) => {
                    if (hasPack && !window.confirm('Substituir o pacote atual pelo do arquivo?')) {
                      return
                    }
                    setPack(loaded)
                    message.show(`Pacote "${loaded.name || 'sem nome'}" importado.`, warnings)
                  }}
                  onError={(error) => message.show(error)}
                />
                <Button asChild variant="outline" size="sm">
                  <Link to="/editor">
                    <PencilIcon />
                    {hasPack ? 'Editar o pacote' : 'Abrir o editor'}
                  </Link>
                </Button>
              </div>
              <PackMessage message={message.message} warnings={message.warnings} />
              <PackLegalNote />
            </>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {world.leagues.map((league) => (
          <Card key={league.id} className="gap-2">
            <CardHeader>
              <CardTitle>{divisionName(league.division)}</CardTitle>
            </CardHeader>
            <CardContent className="px-2">
              <ul className="flex flex-col">
                {packSlots(world)
                  .filter((club) => club.division === league.division)
                  .map(({ id }) => {
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
