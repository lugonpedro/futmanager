import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formationLines } from '../../engine/match/lineup.ts'
import type { Formation, Player, Position, TacticalRole } from '../../engine/model/types.ts'
import { roleOf } from '../../engine/match/roles.ts'
import { slotFit } from '../../engine/match/strength.ts'
import { fitClass, POSITION_NAMES, TACTICAL_ROLE_NAMES } from '../format.ts'

export type PitchSlot = {
  player: Player
  position: Position
  role?: TacticalRole
  duty?: TacticalRole
  energy?: number
  booked?: boolean
}

const SLOT_CLASS = 'flex max-w-20 min-w-0 flex-1'

/**
 * The XI drawn on a pitch; tapping a player selects them. `wrap` lets a
 * screen put each player inside its own element, such as a drag handle,
 * as long as that element keeps {@link SLOT_CLASS}.
 */
export function Pitch(props: {
  slots: PitchSlot[]
  formation: Formation
  /** Players who can't play, crossed out. */
  unavailable?: ReadonlySet<string>
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
                  out={props.unavailable?.has(slot.player.id) ?? false}
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
  out: boolean
  selected: boolean
  onSelect?: (playerId: string) => void
}) {
  const { player, energy, booked } = props.slot
  const role = roleOf(props.slot)
  const fit = slotFit(player, props.slot)
  const lastName = player.name.split(' ').slice(-1)[0]
  return (
    <button
      type="button"
      onClick={() => props.onSelect?.(player.id)}
      title={`${player.name}, ${POSITION_NAMES[player.position].toLowerCase()} de geral ${player.overall}, jogando de ${TACTICAL_ROLE_NAMES[role].toLowerCase()}${props.out ? '; não pode jogar' : ''}`}
      className={cn(
        'flex w-full min-w-0 flex-col items-center rounded px-1 py-1 text-xs',
        props.selected
          ? 'bg-yellow-300 text-green-950'
          : props.out
            ? 'bg-red-700/70 ring-2 ring-red-400 hover:bg-red-700/90'
            : 'bg-black/30 hover:bg-black/50',
      )}
    >
      <span
        className={cn('w-full truncate text-center font-semibold', props.out && 'line-through')}
      >
        {booked && (
          <span
            aria-label="amarelo"
            className="mr-1 inline-block h-2.5 w-2 rounded-sm bg-yellow-300 align-middle"
          />
        )}
        {lastName}
      </span>
      <span className="tabular-nums">
        <span className={cn('font-semibold', !props.selected && fitClass(fit, true))}>{role}</span>{' '}
        {player.overall}
        {energy !== undefined && ` · ${Math.round(energy)}%`}
      </span>
    </button>
  )
}
