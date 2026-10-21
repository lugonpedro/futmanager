import type { DraftPick, LiveClock } from '../cloud/draft.ts'
import type { Room } from '../cloud/rooms.ts'
import type { Position } from '../engine/model/types.ts'
import { teamForPick } from '../engine/room/draft.ts'
import type { PoolPlayer } from '../engine/room/start.ts'
import { ROOM_LIMITS } from '../engine/room/types.ts'

export const draftTotal = (room: Room) => room.options.teams * room.options.squadSize

/** The place whose pick it is, or undefined before the draft is set up or once it is over. */
export function slotOnTheClock(room: Room): number | undefined {
  const draft = room.draft
  if (!draft || draft.pickNo >= draftTotal(room)) return undefined
  return Number(teamForPick(draft.order.map(String), draft.pickNo, room.options.draftOrder))
}

/** The round of a pick, 1-based, and its number within the round. */
export const roundOfPick = (pick: number, teams: number) => ({
  round: Math.floor(pick / teams) + 1,
  inRound: (pick % teams) + 1,
})

/** Each place's players, in the order they were picked. */
export function squadsOf(picks: readonly DraftPick[]): Map<number, string[]> {
  const squads = new Map<number, string[]>()
  for (const pick of [...picks].sort((a, b) => a.pick - b.pick)) {
    squads.set(pick.slot, [...(squads.get(pick.slot) ?? []), pick.playerId])
  }
  return squads
}

/**
 * Why this place can't take the player now, as the server would refuse it:
 * taken already, or a pick that would leave the squad short of keepers.
 */
export function pickProblem(
  room: Room,
  pool: ReadonlyMap<string, PoolPlayer>,
  picks: readonly DraftPick[],
  slot: number,
  playerId: string,
): string | undefined {
  const player = pool.get(playerId)
  if (!player) return 'Esse jogador não está na lista do draft.'
  if (picks.some((p) => p.playerId === playerId)) return 'Esse jogador já foi escolhido.'
  const mine = picks.filter((p) => p.slot === slot)
  const keepers =
    mine.filter((p) => pool.get(p.playerId)?.position === 'G').length +
    (player.position === 'G' ? 1 : 0)
  const left = room.options.squadSize - mine.length - 1
  if (ROOM_LIMITS.minKeepers - keepers > left)
    return `Faltam goleiros: o elenco precisa de ${ROOM_LIMITS.minKeepers}.`
  return undefined
}

/** How many of each position a squad has. */
export function positionCounts(
  ids: readonly string[],
  pool: ReadonlyMap<string, PoolPlayer>,
): Record<Position, number> {
  const counts: Record<Position, number> = { G: 0, Z: 0, L: 0, M: 0, A: 0 }
  for (const id of ids) {
    const position = pool.get(id)?.position
    if (position) counts[position]++
  }
  return counts
}

/** Whole seconds left on the clock, never below zero. */
export const secondsLeft = (deadline: Date | undefined, now: number) =>
  deadline ? Math.max(0, Math.ceil((deadline.getTime() - now) / 1000)) : 0

/** A queue with a player moved one place up (-1) or down (+1). */
export function moveInQueue(queue: readonly string[], id: string, step: -1 | 1): string[] {
  const from = queue.indexOf(id)
  const to = from + step
  if (from < 0 || to < 0 || to >= queue.length) return [...queue]
  const next = [...queue]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/** A name as typed in the search, without accents or case. */
export const searchKey = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * How many picks go by before this place picks again, counted from the pick
 * under way (0 when it is on the clock), or undefined if it doesn't pick again.
 */
export function picksUntil(room: Room, slot: number): number | undefined {
  const draft = room.draft
  if (!draft) return undefined
  const order = draft.order.map(String)
  for (let pick = draft.pickNo; pick < draftTotal(room); pick++) {
    if (Number(teamForPick(order, pick, room.options.draftOrder)) === slot)
      return pick - draft.pickNo
  }
  return undefined
}

/** The starting eleven a squad lines up as it is drafted, position by position. */
const XI: Record<Position, number> = { G: 1, Z: 2, L: 2, M: 4, A: 2 }
const XI_SIZE = 11
const ORDER: Record<Position, number> = { G: 0, Z: 1, L: 2, M: 3, A: 4 }

const byPosition = (a: PoolPlayer, b: PoolPlayer) =>
  ORDER[a.position] - ORDER[b.position] || b.overall - a.overall

/**
 * A squad split into its likely eleven (the best of each position in a
 * 4-4-2, gaps filled by the best outfielders left) and the reserves, both
 * keepers first and forwards last.
 */
export function startersAndReserves(players: readonly PoolPlayer[]): {
  starters: PoolPlayer[]
  reserves: PoolPlayer[]
} {
  const best = [...players].sort((a, b) => b.overall - a.overall)
  const starters = new Set<PoolPlayer>()
  for (const position of Object.keys(XI) as Position[]) {
    for (const player of best.filter((p) => p.position === position).slice(0, XI[position]))
      starters.add(player)
  }
  for (const player of best) {
    if (starters.size >= XI_SIZE) break
    if (player.position !== 'G') starters.add(player)
  }
  return {
    starters: [...starters].sort(byPosition),
    reserves: best.filter((p) => !starters.has(p)).sort(byPosition),
  }
}

/** The room with the newer of its own clock and the live one. */
export function withLiveClock(room: Room, live: LiveClock | undefined): Room {
  if (!room.draft || !live || live.pickNo <= room.draft.pickNo) return room
  return { ...room, draft: { ...room.draft, pickNo: live.pickNo, deadline: live.deadline } }
}

/** The places in the order they pick in the round under way (the last round once the draft is over). */
export function roundOrder(room: Room): number[] {
  const draft = room.draft
  if (!draft) return []
  const teams = room.options.teams
  const pick = Math.min(draft.pickNo, draftTotal(room) - 1)
  const first = Math.floor(pick / teams) * teams
  const order = draft.order.map(String)
  return Array.from({ length: teams }, (_, i) =>
    Number(teamForPick(order, first + i, room.options.draftOrder)),
  )
}
