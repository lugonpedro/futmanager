import { BUDGET, teamCost, type FantasyTeam, type Pick } from '../engine/fantasy/team.ts'
import { FORMATIONS } from '../engine/match/lineup.ts'
import type { Formation, Position } from '../engine/model/types.ts'

/** A team being put together on the fantasy screen; it may still have gaps. */
export type Draft = FantasyTeam

type Pool = Readonly<Record<string, Pick>>

export const emptyDraft = (formation: Formation = '4-3-3'): Draft => ({
  formation,
  playerIds: [],
  captainId: '',
})

/** Places left for each position in the draft's formation. */
export function openSlots(draft: Draft, pool: Pool): Record<Position, number> {
  const open = { ...FORMATIONS[draft.formation] }
  for (const id of draft.playerIds) open[pool[id].position]--
  return open
}

/**
 * The draft in another formation: players are kept in order while their
 * position still has room, and anyone no longer on the market drops out.
 */
export function withFormation(draft: Draft, formation: Formation, pool: Pool): Draft {
  const room = { ...FORMATIONS[formation] }
  const playerIds = draft.playerIds.filter((id) => {
    const position = pool[id]?.position
    if (!position || room[position] === 0) return false
    room[position]--
    return true
  })
  const captainId = playerIds.includes(draft.captainId) ? draft.captainId : ''
  return { formation, playerIds, captainId }
}

/** Why the player can't join the draft, or undefined if he can. */
export function cannotAdd(
  draft: Draft,
  playerId: string,
  pool: Pool,
  budget = BUDGET,
): string | undefined {
  const player = pool[playerId]
  if (draft.playerIds.includes(playerId)) return 'Já está no time.'
  if (openSlots(draft, pool)[player.position] <= 0) return 'Não há vaga para essa posição.'
  if (teamCost(draft, pool) + player.price > budget + 1e-9) return 'Passa do orçamento.'
  return undefined
}

export function addPlayer(draft: Draft, playerId: string): Draft {
  return { ...draft, playerIds: [...draft.playerIds, playerId] }
}

export function removePlayer(draft: Draft, playerId: string): Draft {
  return {
    ...draft,
    playerIds: draft.playerIds.filter((id) => id !== playerId),
    captainId: draft.captainId === playerId ? '' : draft.captainId,
  }
}
