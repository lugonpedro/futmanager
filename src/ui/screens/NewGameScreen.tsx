import { useEffect, useMemo, useState } from 'react'
import { RefreshCwIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { generateWorld } from '../../engine/generate/world.ts'
import { applyPack, packIsEmpty, packSlots, type DataPack } from '../../engine/pack/pack.ts'
import { BUILT_IN_PACKS } from '../../packs/index.ts'
import { newGame } from '../../engine/season/season.ts'
import { useGameStore } from '../../store/game.ts'
import { usePackStore } from '../../store/pack.ts'
import { Choices } from '../components/Choices.tsx'
import { ClubName } from '../components/ClubName.tsx'
import {
  BuiltInPackNote,
  PackFileButton,
  PackLegalNote,
  PackMessage,
} from '../components/PackControls.tsx'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import { divisionName, formatMoney } from '../format.ts'
import { usePackMessage } from '../usePackMessage.ts'
import { confirmReplace } from '../usePackMessage.ts'

type Names = 'gerado' | 'pacote'
const NAME_LABELS: Record<Names, string> = { gerado: 'Mundo gerado', pacote: 'Usar pacote' }

/** The player's own pack, chosen alongside the ids of those that come with the game. */
const OWN_PACK = 'proprio'

const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

/** Pick a club from a freshly generated world to start a career with. */
export function NewGameScreen() {
  const [seed, setSeed] = useState(randomSeed)
  const { pack, setPack } = usePackStore()
  const hasPack = !packIsEmpty(pack)
  const [names, setNames] = useState<Names>('gerado')
  const [packChoice, setPackChoice] = useState(BUILT_IN_PACKS[0].id)
  const [loaded, setLoaded] = useState<Record<string, DataPack>>({})
  const [loadError, setLoadError] = useState<{ id: string; text: string }>()
  const builtInChoice = BUILT_IN_PACKS.find((p) => p.id === packChoice)
  const usingBuiltIn = names === 'pacote' && builtInChoice !== undefined
  const builtIn = builtInChoice && loaded[builtInChoice.id]
  const chosen =
    names !== 'pacote' ? undefined : builtInChoice ? builtIn : hasPack ? pack : undefined
  const message = usePackMessage()
  useEffect(() => {
    if (!usingBuiltIn || builtIn) return
    const id = builtInChoice.id
    builtInChoice.load().then(
      (data) => setLoaded((all) => ({ ...all, [id]: data })),
      () =>
        setLoadError({
          id,
          text: 'Não deu para carregar o pacote. Confira a conexão e tente de novo.',
        }),
    )
  }, [usingBuiltIn, builtIn, builtInChoice])
  const world = useMemo(() => {
    const generated = generateWorld(seed)
    return chosen ? applyPack(generated, chosen).world : generated
  }, [seed, chosen])
  const startGame = useGameStore((s) => s.startGame)
  const navigate = useNavigate()

  // Each new career gets its own save slot, so starting one never loses another.
  const choose = (clubId: string) => {
    if (usingBuiltIn && !builtIn) return
    startGame(newGame(seed, clubId, chosen))
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
            {names === 'gerado' && (
              <Button variant="outline" size="sm" onClick={() => setSeed(randomSeed())}>
                <RefreshCwIcon />
                Gerar outro mundo
              </Button>
            )}
          </div>
          {names === 'pacote' && (
            <>
              <ul className="flex flex-col gap-2" aria-label="Pacotes">
                {BUILT_IN_PACKS.map((built) => (
                  <PackOption
                    key={built.id}
                    selected={packChoice === built.id}
                    onSelect={() => setPackChoice(built.id)}
                    title={built.name}
                    detail={
                      loadError?.id === built.id && packChoice === built.id
                        ? loadError.text
                        : built.description
                    }
                  />
                ))}
                {hasPack && (
                  <PackOption
                    selected={packChoice === OWN_PACK}
                    onSelect={() => setPackChoice(OWN_PACK)}
                    title={pack.name || 'Seu pacote'}
                    detail="O pacote que você importou: os nomes dele entram no lugar dos gerados, clube por clube; o que faltar continua gerado."
                  />
                )}
              </ul>
              <div className="flex flex-wrap gap-2">
                <PackFileButton
                  size="sm"
                  onLoad={async ({ pack: loaded, warnings }) => {
                    if (
                      hasPack &&
                      !(await confirmReplace('Substituir o pacote importado pelo do arquivo?'))
                    ) {
                      return
                    }
                    setPack(loaded)
                    setPackChoice(OWN_PACK)
                    message.show(`Pacote "${loaded.name || 'sem nome'}" importado.`, warnings)
                  }}
                  onError={message.fail}
                />
              </div>
              <PackMessage warnings={message.warnings} />
              {builtInChoice ? <BuiltInPackNote /> : <PackLegalNote />}
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

/** One pack to start with, picked like a radio button. */
function PackOption(props: {
  selected: boolean
  onSelect: () => void
  title: string
  detail: string
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={props.selected}
        onClick={props.onSelect}
        className={cn(
          'flex w-full cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-left hover:bg-accent',
          props.selected && 'border-primary bg-accent',
        )}
      >
        <span className="text-sm font-semibold">{props.title}</span>
        <span className="text-xs text-muted-foreground">{props.detail}</span>
      </button>
    </li>
  )
}
