import type { DraftPick } from '../cloud/draft.ts'
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
