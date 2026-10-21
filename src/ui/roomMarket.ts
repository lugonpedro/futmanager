import type { Room } from '../cloud/rooms.ts'
import type { FeedEntry, RosterEntry } from '../cloud/roomMarket.ts'
import type { PoolPlayer } from '../engine/room/start.ts'

/** Whether trades are open in the coming round, as the database decides in `room_trades_open`. */
export function tradesOpen(room: Room): boolean {
  if (room.status !== 'liga' || !room.round) return false
  const { trades, legs, teams } = room.options
  if (trades === 'desligadas') return false
  if (trades === 'temporada') return true
  return room.round.no <= Math.ceil((legs * (teams - 1) * 2) / 3)
}

/** The players of a team, by its place. */
export const squadIds = (rosters: readonly RosterEntry[], slot: number) =>
  rosters.filter((r) => r.slot === slot).map((r) => r.playerId)

/**
 * The players nobody has, strongest first. A player released this round can
 * only be claimed from the next one on, so he says from when.
 */
export function freePlayers(
  pool: readonly PoolPlayer[],
  rosters: readonly RosterEntry[],
  round: number,
): (PoolPlayer & { from?: number })[] {
  const where = new Map(rosters.map((r) => [r.playerId, r]))
  return pool
    .filter((p) => where.get(p.id)?.slot === undefined)
    .map((p) => {
      const from = where.get(p.id)?.claimableFrom
      return from !== undefined && from > round ? { ...p, from } : p
    })
}

const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`

/** A line of the market's feed, in words. */
export function feedLine(
  entry: FeedEntry,
  team: (slot: number) => string,
  player: (id: string) => string,
): string {
  const ins = list(entry.playersIn.map(player))
  const outs = list(entry.playersOut.map(player))
  if (entry.kind === 'troca')
    return `${team(entry.slot)} trocou ${outs} por ${ins}, do ${team(entry.otherSlot!)}.`
  if (entry.kind === 'dispensa') return `${team(entry.slot)} dispensou ${outs}.`
  return outs
    ? `${team(entry.slot)} contratou ${ins} e dispensou ${outs}.`
    : `${team(entry.slot)} contratou ${ins}.`
}
