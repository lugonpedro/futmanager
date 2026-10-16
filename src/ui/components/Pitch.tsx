import { Fragment, type ReactNode } from 'react'
import { formationLines } from '../../engine/match/lineup.ts'
import type { Formation, Player, Position } from '../../engine/model/types.ts'
import { positionFit } from '../../engine/match/strength.ts'
import { fitClass } from '../format.ts'

export type PitchSlot = { player: Player; position: Position; energy?: number; booked?: boolean }

const SLOT_CLASS = 'flex max-w-20 min-w-0 flex-1'

/**
 * The XI drawn on a pitch; tapping a player selects them. `wrap` lets a
 * screen put each player inside its own element, such as a drag handle,
 * as long as that element keeps {@link SLOT_CLASS}.
 */
export function Pitch(props: {
  slots: PitchSlot[]
  formation: Formation
  selected?: string
  onSelect?: (playerId: string) => void
  wrap?: (playerId: string, className: string, player: ReactNode) => ReactNode
}) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border-2 border-white/40 bg-gradient-to-b from-pitch to-pitch-dark p-3 text-white">
      {/* Attack at the top, down to the keeper. */}
      {formationLines(props.slots, props.formation)
        .reverse()
        .map((row, i) => (
          // Lines keep their place as players swap, so the index is the stable key.
          <div key={i} className="flex min-h-12 justify-around gap-1">
            {row.map((slot) => {
              const player = (
                <PitchPlayer
                  slot={slot}
                  selected={props.selected === slot.player.id}
                  onSelect={props.onSelect}
                />
              )
              return props.wrap ? (
                <Fragment key={slot.player.id}>
                  {props.wrap(slot.player.id, SLOT_CLASS, player)}
                </Fragment>
              ) : (
                <div key={slot.player.id} className={SLOT_CLASS}>
                  {player}
                </div>
              )
            })}
          </div>
        ))}
    </div>
  )
}

function PitchPlayer(props: {
  slot: PitchSlot
  selected: boolean
  onSelect?: (playerId: string) => void
}) {
  const { player, position, energy, booked } = props.slot
  const fit = positionFit(player, position)
  const lastName = player.name.split(' ').slice(-1)[0]
  return (
    <button
      type="button"
      onClick={() => props.onSelect?.(player.id)}
      title={`${player.name} (${player.position}), geral ${player.overall}`}
      className={`flex w-full min-w-0 flex-col items-center rounded px-1 py-1 text-xs ${props.selected ? 'bg-yellow-300 text-green-950' : 'bg-black/30 hover:bg-black/50'}`}
    >
      <span className="w-full truncate text-center font-semibold">
        {booked && (
          <span
            aria-label="amarelo"
            className="mr-1 inline-block h-2.5 w-2 rounded-sm bg-yellow-300 align-middle"
          />
        )}
        {lastName}
      </span>
      <span className="tabular-nums">
        <span className={props.selected ? '' : fitClass(fit, true)}>{player.position}</span>{' '}
        {player.overall}
        {energy !== undefined && ` · ${Math.round(energy)}%`}
      </span>
    </button>
  )
}
