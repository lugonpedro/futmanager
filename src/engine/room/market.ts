import { FREE_AGENT } from '../model/types.ts'
import { roomPhase } from './draft.ts'
import { roomStandings, totalRounds } from './league.ts'
import { ROOM_LIMITS, type RoomState } from './types.ts'

/** A request for a free player, giving one up in exchange or filling an open spot. */
export type Claim = { teamId: string; playerId: string; releaseId?: string }

/** One to three players from each side, the same number both ways. */
export type Trade = { fromId: string; toId: string; give: string[]; take: string[] }

const keepers = (state: RoomState, ids: readonly string[]) =>
  ids.filter((id) => state.players[id].position === 'G').length

/** Moves players between squads (or to the free list, with `teamId` empty), keeping `clubId` in step. */
function moveAll(state: RoomState, moves: readonly { id: string; teamId: string }[]): RoomState {
  const squads = { ...state.squads }
  const players = { ...state.players }
  for (const { id, teamId } of moves) {
    const from = players[id].clubId
    if (from !== FREE_AGENT) squads[from] = squads[from].filter((p) => p !== id)
    if (teamId !== FREE_AGENT) squads[teamId] = [...squads[teamId], id]
    players[id] = { ...players[id], clubId: teamId }
  }
  return { ...state, squads, players }
}

/** Why a team can't release this player, if it can't. */
export function checkRelease(
  state: RoomState,
  teamId: string,
  playerId: string,
): string | undefined {
  if (roomPhase(state) !== 'liga') return 'O mercado só abre durante a liga.'
  const squad = state.squads[teamId]
  if (!squad.includes(playerId)) return 'Esse jogador não é do seu elenco.'
  const left = squad.filter((id) => id !== playerId)
  if (left.length < 11) return 'O elenco não pode ficar com menos de 11 jogadores.'
  if (keepers(state, left) < ROOM_LIMITS.minKeepers)
    return `O elenco precisa de ${ROOM_LIMITS.minKeepers} goleiros.`
  return undefined
}

/**
 * Sends a player back to the free list. He can only be claimed from the next
 * closing on, so nobody releases and takes him back in the same window.
 */
export function releasePlayer(state: RoomState, teamId: string, playerId: string): RoomState {
  const problem = checkRelease(state, teamId, playerId)
  if (problem) throw new Error(problem)
  const moved = moveAll(state, [{ id: playerId, teamId: FREE_AGENT }])
  return { ...moved, released: { ...moved.released, [playerId]: state.round + 1 } }
}

/** Whether a free player can be claimed at this round's closing. */
export const claimable = (state: RoomState, playerId: string) =>
  state.players[playerId]?.clubId === FREE_AGENT && (state.released[playerId] ?? 0) <= state.round

/** Why a claim can't be granted right now, if it can't. */
export function checkClaim(state: RoomState, claim: Claim): string | undefined {
  if (!claimable(state, claim.playerId)) return 'Esse jogador não está livre.'
  const squad = state.squads[claim.teamId]
  if (claim.releaseId && !squad.includes(claim.releaseId)) return 'Quem sai não é do seu elenco.'
  const after = [...squad.filter((id) => id !== claim.releaseId), claim.playerId]
  if (after.length > state.options.squadSize) return 'O elenco está cheio: escolha quem sai.'
  if (keepers(state, after) < ROOM_LIMITS.minKeepers)
    return `O elenco precisa de ${ROOM_LIMITS.minKeepers} goleiros.`
  return undefined
}

/**
 * The order teams are served in at a closing: the worst placed first, and in
 * the first round the reverse of the draft order.
 */
export function claimOrder(state: RoomState): string[] {
  if (state.round === 1) return [...state.order].reverse()
  return roomStandings(state)
    .map((row) => row.clubId)
    .reverse()
}

export type ClaimsOutcome = { state: RoomState; granted: Claim[]; refused: Claim[] }

/**
 * Settles the claims at the closing of a round, before it is played. Teams
 * are served in {@link claimOrder}, one claim at a time: whoever gets a player
 * goes to the back of the line, up to two players each. Each team's claims are
 * tried in the order it listed them; one that no longer works is refused.
 */
export function resolveClaims(state: RoomState, claims: readonly Claim[]): ClaimsOutcome {
  const pending = new Map(state.teams.map((t) => [t.id, claims.filter((c) => c.teamId === t.id)]))
  const got = new Map<string, number>()
  const granted: Claim[] = []
  const refused: Claim[] = []
  const line = claimOrder(state)
  let next = state
  while (line.length > 0) {
    const teamId = line.shift()!
    const mine = pending.get(teamId)!
    while (mine.length > 0) {
      const claim = mine.shift()!
      if (checkClaim(next, claim)) {
        refused.push(claim)
        continue
      }
      next = moveAll(next, [
        ...(claim.releaseId ? [{ id: claim.releaseId, teamId: FREE_AGENT }] : []),
        { id: claim.playerId, teamId },
      ])
      if (claim.releaseId) {
        next = { ...next, released: { ...next.released, [claim.releaseId]: state.round + 1 } }
      }
      granted.push(claim)
      got.set(teamId, (got.get(teamId) ?? 0) + 1)
      if ((got.get(teamId) ?? 0) < ROOM_LIMITS.claimsPerRound) line.push(teamId)
      break
    }
    // Claims past the limit are refused too.
    if ((got.get(teamId) ?? 0) >= ROOM_LIMITS.claimsPerRound) refused.push(...mine.splice(0))
  }
  return { state: next, granted, refused }
}

/** Whether trades are still allowed at this round, by the room's option. */
export function tradesOpen(state: RoomState): boolean {
  if (roomPhase(state) !== 'liga') return false
  if (state.options.trades === 'desligadas') return false
  if (state.options.trades === 'temporada') return true
  return state.round <= Math.ceil((totalRounds(state) * 2) / 3)
}

/** Why two teams can't make this trade, if they can't. */
export function checkTrade(state: RoomState, trade: Trade): string | undefined {
  if (!tradesOpen(state)) return 'As trocas estão fechadas.'
  if (trade.fromId === trade.toId) return 'Uma troca precisa de dois times.'
  const { give, take } = trade
  if (give.length < 1 || give.length > ROOM_LIMITS.maxTradePlayers)
    return `De 1 a ${ROOM_LIMITS.maxTradePlayers} jogadores de cada lado.`
  if (give.length !== take.length) return 'Os dois lados precisam dar o mesmo número de jogadores.'
  if (new Set([...give, ...take]).size !== give.length + take.length)
    return 'Um jogador aparece duas vezes.'
  const from = state.squads[trade.fromId]
  const to = state.squads[trade.toId]
  if (give.some((id) => !from.includes(id)) || take.some((id) => !to.includes(id)))
    return 'Algum jogador já não está no elenco.'
  const fromAfter = [...from.filter((id) => !give.includes(id)), ...take]
  const toAfter = [...to.filter((id) => !take.includes(id)), ...give]
  if (
    keepers(state, fromAfter) < ROOM_LIMITS.minKeepers ||
    keepers(state, toAfter) < ROOM_LIMITS.minKeepers
  )
    return `Os dois elencos precisam continuar com ${ROOM_LIMITS.minKeepers} goleiros.`
  return undefined
}

/** Makes a trade both sides accepted. Throws when it isn't allowed (see {@link checkTrade}). */
export function applyTrade(state: RoomState, trade: Trade): RoomState {
  const problem = checkTrade(state, trade)
  if (problem) throw new Error(problem)
  return moveAll(state, [
    ...trade.give.map((id) => ({ id, teamId: trade.toId })),
    ...trade.take.map((id) => ({ id, teamId: trade.fromId })),
  ])
}
