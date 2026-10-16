import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  POSITIONS,
  type IndividualFocus,
  type Player,
  type SquadFocus,
  type TrainingIntensity,
  type TrainingPlan,
} from '../../../engine/model/types.ts'
import { careerGames, potentialRange } from '../../../engine/progression/progression.ts'
import {
  FIRST_PLAN,
  setSquadFocus,
  setSquadPlans,
  setTrainingPlan,
  TRAINING,
  trainingBlock,
} from '../../../engine/progression/training.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { Choices } from '../../components/Choices.tsx'
import {
  INDIVIDUAL_FOCUS_NAMES,
  INTENSITY_NAMES,
  SQUAD_FOCUS_NAMES,
  signedChange,
} from '../../format.ts'

const SQUAD_FOCUSES = Object.keys(SQUAD_FOCUS_NAMES) as SquadFocus[]
const INDIVIDUAL_FOCUSES = Object.keys(INDIVIDUAL_FOCUS_NAMES) as IndividualFocus[]
const INTENSITIES = Object.keys(INTENSITY_NAMES) as TrainingIntensity[]
/** The select's value for a player with no plan of his own. */
const NONE = 'nenhum'

/** Goalkeepers first, then defenders and on up the pitch; the best first in each. */
const byPosition = (a: Player, b: Player) =>
  POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) ||
  b.overall - a.overall ||
  a.name.localeCompare(b.name, 'pt-BR')

/** The squad's training focus, and a plan of his own for every player who can still grow. */
export function TrainingPanel() {
  const game = useGame()
  const setGame = useGameStore((s) => s.setGame)
  const { world, userClubId, training, season } = game
  const squad = world.clubs[userClubId].playerIds.map((id) => world.players[id]).sort(byPosition)
  const trainable = squad.filter((p) => !trainingBlock(p))
  const atCeiling = squad.filter((p) => trainingBlock(p) === 'potencial')
  const tooOld = squad.filter((p) => trainingBlock(p) === 'idade')
  const planned = trainable.filter((p) => training.individual[p.id]).length
  const setPlan = (playerId: string, plan: TrainingPlan | undefined) =>
    setGame(setTrainingPlan(game, playerId, plan))

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Treino</CardTitle>
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

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Treino individual ({planned} de {trainable.length})
            </h3>
            <div className="flex gap-2">
              {planned < trainable.length && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGame(setSquadPlans(game, FIRST_PLAN))}
                >
                  Todos no geral
                </Button>
              )}
              {planned > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setGame(setSquadPlans(game, undefined))}
                >
                  Tirar todos
                </Button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Quem ainda não chegou ao potencial e tem até {TRAINING.individualUntil} anos pode ter um
            plano próprio. O geral trabalha o que mais conta para a posição e é o que mais sobe o
            geral; os outros puxam uma qualidade. No intenso ele cresce mais rápido, mas chega
            cansado aos jogos.
          </p>

          {trainable.length === 0 ? (
            <p className="text-sm">Ninguém no elenco pode mais evoluir com treino individual.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {trainable.map((p) => (
                <PlanRow
                  key={p.id}
                  player={p}
                  potential={potentialRange(p, careerGames(p, season.appearances)).high}
                  growth={game.growth?.overall[p.id]}
                  plan={training.individual[p.id]}
                  onChange={(plan) => setPlan(p.id, plan)}
                />
              ))}
            </ul>
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

/** One player's line: where he is against his potential, and his plan. */
function PlanRow(props: {
  player: Player
  potential: number
  growth: number | undefined
  plan: TrainingPlan | undefined
  onChange: (plan: TrainingPlan | undefined) => void
}) {
  const { player, potential, growth, plan, onChange } = props
  const reached = Math.round((100 * player.overall) / Math.max(1, potential))
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <span className="text-sm">
          <span className="text-muted-foreground">{player.position}</span> {player.name}{' '}
          <span className="text-xs text-muted-foreground">{player.age} anos</span>
        </span>
        <div className="flex items-center gap-2" title={`Geral ${player.overall} de ${potential}`}>
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', plan ? 'bg-primary' : 'bg-muted-foreground/50')}
              style={{ width: `${Math.min(100, reached)}%` }}
            />
          </div>
          <span className="text-xs whitespace-nowrap">
            <span className="font-semibold">{player.overall}</span>
            <span className="text-muted-foreground">/{potential}</span>
            {growth !== undefined && growth !== 0 && (
              <span
                className={cn(
                  'ml-1',
                  growth > 0
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
                title="No último mês"
              >
                {signedChange(growth)}
              </span>
            )}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={plan?.focus ?? NONE}
          onValueChange={(v) =>
            onChange(
              v === NONE
                ? undefined
                : { focus: v as IndividualFocus, intensity: plan?.intensity ?? 'normal' },
            )
          }
        >
          <SelectTrigger size="sm" className="w-28 sm:w-36" aria-label={`Treino de ${player.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sem treino</SelectItem>
            {INDIVIDUAL_FOCUSES.map((focus) => (
              <SelectItem key={focus} value={focus}>
                {INDIVIDUAL_FOCUS_NAMES[focus]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Choices
          ariaLabel={`Intensidade de ${player.name}`}
          options={INTENSITIES}
          value={plan?.intensity}
          disabled={!plan}
          onChange={(intensity) => plan && onChange({ ...plan, intensity })}
          label={(intensity) => INTENSITY_NAMES[intensity].name}
          title={(intensity) => INTENSITY_NAMES[intensity].detail}
        />
      </div>
    </li>
  )
}
