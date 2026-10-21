import type { DraftTeam } from '../cloud/draft.ts'
import type { Room } from '../cloud/rooms.ts'

/** The people's teams of a room, split by whether they marked "Pronto" for the round. */
export function readiness(teams: readonly DraftTeam[], round: number) {
  const people = teams.filter((t) => !t.robot && t.userId)
  const ready = people.filter((t) => t.readyRound === round)
  return { people, ready, waiting: people.filter((t) => t.readyRound !== round) }
}

/**
 * Whether the player may play the round now, as the database decides in
 * `can_play_round`: anyone once everyone is ready, the owner at any time.
 */
export const canPlayRound = (room: Room, userId: string, everyoneReady: boolean) =>
  everyoneReady || room.ownerId === userId
