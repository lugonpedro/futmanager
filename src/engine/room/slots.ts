import { FORMATION_LINES } from '../match/roles.ts'
import type { Formation, Position } from '../model/types.ts'

/** A place in the draft: a position, or `D` for a defender, centre-back or full-back. */
export type DraftPlace = Position | 'D'

/**
 * The reserves' places, in the order a squad of 16, 18 or 20 takes them: the
 * second keeper first, then a defender, a midfielder and a forward, and again.
 */
export const RESERVE_PLACES: readonly DraftPlace[] = ['G', 'D', 'M', 'A', 'D', 'M', 'A', 'D', 'M']

/** Whether a player of `position` may fill a place of `place` (room_place_takes in the database). */
export const placeTakes = (place: DraftPlace, position: Position) =>
  place === position || (place === 'D' && (position === 'Z' || position === 'L'))

/** Places of the eleven: the formation's slots from the keeper forwards. */
export const STARTING_PLACES = 11

/**
 * The places a team fills in the draft, one card each: the formation's eleven
 * from the keeper forwards, then the reserves. The database keeps the same
 * list (room_formations and room_team_slots in the migrations).
 */
export function teamSlots(formation: Formation, squadSize: number): DraftPlace[] {
  const eleven = FORMATION_LINES[formation].flat().map((slot) => slot.position)
  return [...eleven, ...RESERVE_PLACES.slice(0, squadSize - STARTING_PLACES)]
}

/** The formations a team can pick before its first card. */
export const DRAFT_FORMATIONS = Object.keys(FORMATION_LINES) as Formation[]

/** Formations the robots pick from. */
export const ROBOT_FORMATIONS: readonly Formation[] = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2']

/** Cards dealt for each place. */
export const CARDS_PER_DEAL = 5
