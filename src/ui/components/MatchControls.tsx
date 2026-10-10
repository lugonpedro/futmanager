import { useState } from 'react'
import { FORMATION_LIST } from '../../engine/match/lineup.ts'
import { positionFit } from '../../engine/match/strength.ts'
import {
  setFormation,
  setPosture,
  substitute,
  type MatchSide,
  type MatchState,
} from '../../engine/match/simulate.ts'
import type { Posture } from '../../engine/model/types.ts'
import { POSTURE_NAMES } from '../format.ts'
import { Pitch } from './Pitch.tsx'

/**
 * The user's touchline: formation, posture and substitutions while the match
 * runs. Any touch pauses the match so changes happen between minutes.
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
  const selected = outId && team.onPitch.find((p) => p.player.id === outId)

  return (
    <section className="flex flex-col gap-3 rounded bg-green-950/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Seu time</h2>
        <span className="text-sm text-green-200">
          {team.subsLeft}{' '}
          {team.subsLeft === 1 ? 'substituição restante' : 'substituições restantes'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {FORMATION_LIST.map((f) => (
          <Choice
            key={f}
            active={team.formation === f}
            disabled={locked}
            onClick={() => act(() => setFormation(state, side, f))}
          >
            {f}
          </Choice>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {(Object.keys(POSTURE_NAMES) as Posture[]).map((p) => (
          <Choice
            key={p}
            active={team.posture === p}
            disabled={locked}
            onClick={() => act(() => setPosture(state, side, p))}
          >
            {POSTURE_NAMES[p]}
          </Choice>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Pitch
          slots={team.onPitch}
          selected={outId}
          onSelect={(id) => !locked && trySub(outId === id ? undefined : id, inId)}
        />
        <div className="flex flex-col gap-1">
          <h3 className="text-sm text-green-200">Banco</h3>
          {team.bench.length === 0 && <p className="text-sm text-green-300">Ninguém.</p>}
          <ul className="flex flex-col gap-0.5 text-sm">
            {team.bench.map((player) => {
              const fit = selected ? positionFit(player, selected.position) : 1
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    disabled={locked || team.subsLeft === 0}
                    onClick={() => trySub(outId, inId === player.id ? undefined : player.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left disabled:opacity-50 ${inId === player.id ? 'bg-yellow-400 text-green-950' : 'hover:bg-green-800'}`}
                  >
                    <span
                      className={`w-4 font-semibold ${fit < 1 && inId !== player.id ? 'text-orange-300' : ''}`}
                    >
                      {player.position}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{player.name}</span>
                    <span className="font-bold tabular-nums">{player.strength}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {!locked && team.subsLeft > 0 && (
            <p className="mt-1 text-xs text-green-300">
              {outId
                ? 'Agora escolha quem entra.'
                : inId
                  ? 'Agora escolha quem sai, no campo.'
                  : 'Para substituir, toque em quem sai e em quem entra. O jogo pausa enquanto você mexe.'}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function Choice(props: {
  active: boolean
  disabled: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`rounded px-2 py-1 disabled:opacity-50 ${props.active ? 'bg-green-600 font-semibold' : 'bg-green-800 hover:bg-green-700'}`}
    >
      {props.children}
    </button>
  )
}
