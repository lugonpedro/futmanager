import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { IndividualFocus, Position, SquadFocus } from '../../../engine/model/types.ts'
import {
  setIndividualFocus,
  setSquadFocus,
  TRAINING,
} from '../../../engine/progression/training.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { Choices } from '../../components/Choices.tsx'
import { INDIVIDUAL_FOCUS_NAMES, SQUAD_FOCUS_NAMES } from '../../format.ts'

const SQUAD_FOCUSES = Object.keys(SQUAD_FOCUS_NAMES) as SquadFocus[]
const INDIVIDUAL_FOCUSES = Object.keys(INDIVIDUAL_FOCUS_NAMES) as IndividualFocus[]

/** A sensible first focus for each position, which the user can change. */
const FIRST_FOCUS: Record<Position, IndividualFocus> = {
  G: 'goleiro',
  Z: 'defesa',
  L: 'cruzamento',
  M: 'passe',
  A: 'finalizacao',
}

/** The squad's training focus, and up to five players with a focus of their own. */
export function TrainingPanel() {
  const game = useGame()
  const setGame = useGameStore((s) => s.setGame)
  const { world, userClubId, training } = game
  const squad = world.clubs[userClubId].playerIds
    .map((id) => world.players[id])
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const focused = squad.filter((p) => training.individual[p.id])
  const free = squad.filter((p) => !training.individual[p.id])
  const full = focused.length >= TRAINING.maxIndividual
  const setFocus = (playerId: string, focus: IndividualFocus | undefined) =>
    setGame(setIndividualFocus(game, playerId, focus))

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
          <h3 className="text-sm font-semibold">
            Foco individual ({focused.length} de {TRAINING.maxIndividual})
          </h3>
          {focused.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Escolha até {TRAINING.maxIndividual} jogadores para treinar uma qualidade a mais. Só
              rende para quem ainda não chegou ao potencial e tem até {TRAINING.individualUntil}{' '}
              anos.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {focused.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-40 text-sm">
                  <span className="text-muted-foreground">{p.position}</span> {p.name}
                </span>
                <FocusSelect
                  value={training.individual[p.id]}
                  onChange={(focus) => setFocus(p.id, focus)}
                  label={`Foco de ${p.name}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Tirar o foco de ${p.name}`}
                  onClick={() => setFocus(p.id, undefined)}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
          {!full && free.length > 0 && (
            <Select
              value=""
              onValueChange={(id) => setFocus(id, FIRST_FOCUS[world.players[id].position])}
            >
              <SelectTrigger size="sm" className="w-full sm:w-64" aria-label="Escolher jogador">
                <SelectValue placeholder="Escolher jogador" />
              </SelectTrigger>
              <SelectContent>
                {free.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.position} {p.name}
                    <span className="text-xs text-muted-foreground">
                      {p.age} anos, {p.overall}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function FocusSelect(props: {
  value: IndividualFocus | undefined
  onChange: (focus: IndividualFocus) => void
  label: string
}) {
  return (
    <Select value={props.value} onValueChange={(v) => props.onChange(v as IndividualFocus)}>
      <SelectTrigger size="sm" className="min-w-36" aria-label={props.label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {INDIVIDUAL_FOCUSES.map((focus) => (
          <SelectItem key={focus} value={focus}>
            {INDIVIDUAL_FOCUS_NAMES[focus]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
