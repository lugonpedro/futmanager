import type { DraftTeam } from '../cloud/draft.ts'
import type { Room } from '../cloud/rooms.ts'

/** The people's teams of a room, split by whether they marked "Pronto" for the round. */
export function readiness(teams: readonly DraftTeam[], round: number) {
  const people = teams.filter((t) => !t.robot && t.userId)
  const ready = people.filter((t) => t.readyRound === round)
  return { people, ready, waiting: people.filter((t) => t.readyRound !== round) }
}

/**
 * When the player may play the round without everyone ready, as the database
 * decides in `can_play_round`: the owner after the grace period, anyone
 * after twice that. Undefined outside the league.
 */
export function forceAt(room: Room, userId: string): Date | undefined {
  if (!room.round) return undefined
  const hours = room.options.graceHours * (room.ownerId === userId ? 1 : 2)
  return new Date(room.round.openedAt.getTime() + hours * 3_600_000)
}

/** "em 3 h 20 min", "em 12 min", or "agora", for how long until a time. */
export function timeUntil(at: Date, now: Date): string {
  const minutes = Math.ceil((at.getTime() - now.getTime()) / 60_000)
  if (minutes <= 0) return 'agora'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `em ${rest} min`
  return rest === 0 ? `em ${hours} h` : `em ${hours} h ${rest} min`
}
