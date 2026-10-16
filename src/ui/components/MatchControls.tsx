import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { positionFit } from '../../engine/match/strength.ts'
import {
  setFormation,
  setPosture,
  substitute,
  swapPositions,
  type MatchSide,
  type MatchState,
} from '../../engine/match/simulate.ts'
import type { Posture } from '../../engine/model/types.ts'
import { POSTURE_NAMES } from '../format.ts'
import { Choices } from './Choices.tsx'
import { FormationSelect } from './FormationSelect.tsx'
import { Pitch } from './Pitch.tsx'

/**
 * The user's touchline: formation, posture, substitutions and players
 * swapping places while the match runs. Any touch pauses the match so
 * changes happen between minutes.
 */
export function MatchControls(props: {
  state: MatchState
  side: MatchSide
  onPause: () => void
  onChange: () => void
}) {
  const { state, side } = props
  const team = state[side]
  const [outId, setOutId] = useState<string>()
  const [inId, setInId] = useState<string>()
  const locked = state.finished

  const act = (change: () => void) => {
    if (locked) return
    change()
    props.onChange()
  }
  const trySub = (out?: string, on?: string) => {
    setOutId(out)
    setInId(on)
    if (!out || !on) return props.onPause()
    act(() => substitute(state, side, out, on))
    setOutId(undefined)
    setInId(undefined)
  }
  // A second starter tapped after the first: the two swap places.
  const pick = (id: string) => {
    if (locked) return
    if (outId === id) return trySub(undefined, inId)
    if (outId && !inId) {
      act(() => swapPositions(state, side, outId, id))
      setOutId(undefined)
      return
    }
    trySub(id, inId)
  }
  const selected = outId && team.onPitch.find((p) => p.player.id === outId)

  return (
    <Card className="gap-3 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Seu time</h2>
        <span className="text-sm text-muted-foreground">
          {team.subsLeft}{' '}
          {team.subsLeft === 1 ? 'substituição restante' : 'substituições restantes'}
        </span>
      </div>
      <FormationSelect
        value={team.formation}
        disabled={locked}
        onChange={(f) => act(() => setFormation(state, side, f))}
      />
      <Choices
        ariaLabel="Postura"
        options={Object.keys(POSTURE_NAMES) as Posture[]}
        value={team.posture}
        disabled={locked}
        onChange={(p) => act(() => setPosture(state, side, p))}
        label={(p) => POSTURE_NAMES[p]}
      />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Pitch slots={team.onPitch} formation={team.formation} selected={outId} onSelect={pick} />
        <div className="flex flex-col gap-1">
          <h3 className="text-sm text-muted-foreground">Banco</h3>
          {team.bench.length === 0 && <p className="text-sm text-muted-foreground">Ninguém.</p>}
          <ul className="flex flex-col gap-0.5 text-sm">
            {team.bench.map((player) => {
              const fit = selected ? positionFit(player, selected.position) : 1
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    disabled={locked || team.subsLeft === 0}
                    onClick={() => trySub(outId, inId === player.id ? undefined : player.id)}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left disabled:cursor-not-allowed disabled:opacity-50 ${inId === player.id ? 'bg-yellow-300 text-green-950' : 'hover:bg-accent'}`}
                  >
                    <span
                      className={`w-4 font-semibold ${fit < 1 && inId !== player.id ? 'text-orange-600 dark:text-orange-300' : ''}`}
                    >
                      {player.position}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{player.name}</span>
                    <span className="font-bold tabular-nums">{player.overall}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {!locked && (
            <p className="mt-1 text-xs text-muted-foreground">
              {outId
                ? team.subsLeft > 0
                  ? 'Agora toque em quem entra, ou em outro titular para os dois trocarem de posição.'
                  : 'Agora toque em outro titular para os dois trocarem de posição.'
                : inId
                  ? 'Agora escolha quem sai, no campo.'
                  : 'Toque num titular e depois num reserva para substituir, ou em outro titular para trocar os dois de posição. O jogo pausa enquanto você mexe.'}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}
