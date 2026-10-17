import { ListChecksIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  POSITIONS,
  type Player,
  type SquadFocus,
  type TrainingIntensity,
} from '../../../engine/model/types.ts'
import { setRecommendedPlans } from '../../../engine/progression/progression.ts'
import {
  setSquadFocus,
  setSquadIntensity,
  setSquadPlans,
  squadIntensity,
  TRAINING,
  trainingBlock,
} from '../../../engine/progression/training.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { Choices } from '../../components/Choices.tsx'
import { LearnLink } from '../../components/LearnLink.tsx'
import { INTENSITY_NAMES, SQUAD_FOCUS_NAMES } from '../../format.ts'

const SQUAD_FOCUSES = Object.keys(SQUAD_FOCUS_NAMES) as SquadFocus[]
const INTENSITIES = Object.keys(INTENSITY_NAMES) as TrainingIntensity[]

/** Goalkeepers first, then defenders and on up the pitch; the best first in each. */
const byPosition = (a: Player, b: Player) =>
  POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) ||
  b.overall - a.overall ||
  a.name.localeCompare(b.name, 'pt-BR')

/**
 * What the whole squad trains: the focus, and the individual plans all at
 * once. Each player's own plan is picked in the squad list or on his card.
 */
export function TrainingPanel(props: { onPickOneByOne: () => void }) {
  const game = useGame()
  const setGame = useGameStore((s) => s.setGame)
  const { world, userClubId, training } = game
  const squad = world.clubs[userClubId].playerIds.map((id) => world.players[id]).sort(byPosition)
  const trainable = squad.filter((p) => !trainingBlock(p))
  const atCeiling = squad.filter((p) => trainingBlock(p) === 'potencial')
  const tooOld = squad.filter((p) => trainingBlock(p) === 'idade')
  const planned = trainable.filter((p) => training.individual[p.id]).length
  const intensity = squadIntensity(training)

  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Treino</CardTitle>
        <LearnLink tab="carreira" section="treino" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Choices
            ariaLabel="Foco do elenco"
            options={SQUAD_FOCUSES}
            value={training.focus}
            onChange={(focus) => setGame(setSquadFocus(game, focus))}
            label={(focus) => SQUAD_FOCUS_NAMES[focus].name}
          />
          <p className="text-sm text-muted-foreground">
            {SQUAD_FOCUS_NAMES[training.focus].detail} Os jogadores evoluem no dia 1 de cada mês, de
            maio a dezembro, e quem joga mais cresce mais.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">
            Treino individual ({planned} de {trainable.length})
          </h3>
          <p className="text-sm text-muted-foreground">
            Quem ainda não chegou ao potencial e tem até {TRAINING.individualUntil} anos pode ter um
            plano próprio. O recomendado é o que mais sobe o geral de cada um. No intenso ele cresce
            mais rápido, mas chega cansado aos jogos.
          </p>

          {trainable.length === 0 ? (
            <p className="text-sm">Ninguém no elenco pode mais evoluir com treino individual.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGame(setRecommendedPlans(game))}
                >
                  Todos no recomendado
                </Button>
                {planned > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGame(setSquadPlans(game, undefined))}
                  >
                    Tirar todos
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={props.onPickOneByOne}>
                  <ListChecksIcon />
                  Escolher um por um
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Intensidade de todos</span>
                <Choices
                  ariaLabel="Intensidade de todos"
                  options={INTENSITIES}
                  value={intensity}
                  disabled={planned === 0}
                  onChange={(next) => setGame(setSquadIntensity(game, next))}
                  label={(i) => INTENSITY_NAMES[i].name}
                  title={(i) => INTENSITY_NAMES[i].detail}
                />
                {planned > 0 && !intensity && (
                  <span className="text-xs text-muted-foreground">intensidades variadas</span>
                )}
              </div>
            </>
          )}

          {(atCeiling.length > 0 || tooOld.length > 0) && (
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              {atCeiling.length > 0 && (
                <p>
                  <span className="font-medium text-foreground">Já no potencial:</span>{' '}
                  {atCeiling.map((p) => `${p.name} (${p.overall})`).join(', ')}.
                </p>
              )}
              {tooOld.length > 0 && (
                <p>
                  <span className="font-medium text-foreground">
                    Acima de {TRAINING.individualUntil} anos:
                  </span>{' '}
                  {tooOld.map((p) => `${p.name} (${p.age})`).join(', ')}.
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
