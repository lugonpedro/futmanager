import { FORMATIONS } from '../match/lineup.ts'
import type { Formation, Position } from '../model/types.ts'
import type { Verdict } from '../transfer/market.ts'
import { SCORING } from './scoring.ts'

/** Coins everyone starts the season with; paying never adds to it. */
export const BUDGET = 100

/** A fantasy side for one round: eleven players in a formation, one of them captain. */
export type FantasyTeam = {
  formation: Formation
  playerIds: string[]
  captainId: string
}

/** What the fantasy game needs to know of a player to pick him. */
export type Pick = { position: Position; price: number }

const tenth = (x: number) => Math.round(x * 10) / 10

export function teamCost(team: FantasyTeam, pool: Readonly<Record<string, Pick>>): number {
  return tenth(team.playerIds.reduce((sum, id) => sum + (pool[id]?.price ?? 0), 0))
}

/**
 * Whether a team can be sent for the round: eleven different players from the
 * pool, each in his own position as the formation asks, a captain among them,
 * and within the budget.
 */
export function checkTeam(
  team: FantasyTeam,
  pool: Readonly<Record<string, Pick>>,
  budget = BUDGET,
): Verdict {
  const ids = new Set(team.playerIds)
  if (team.playerIds.length !== 11 || ids.size !== 11) {
    return { ok: false, reason: 'Escale 11 jogadores diferentes.' }
  }
  if (team.playerIds.some((id) => !pool[id])) {
    return { ok: false, reason: 'Há jogador que não está disponível nesta rodada.' }
  }
  const slots = FORMATIONS[team.formation]
  for (const position of Object.keys(slots) as Position[]) {
    const count = team.playerIds.filter((id) => pool[id].position === position).length
    if (count !== slots[position]) {
      return { ok: false, reason: `A formação ${team.formation} não fecha com esses jogadores.` }
    }
  }
  if (!ids.has(team.captainId)) return { ok: false, reason: 'Escolha um capitão do time.' }
  if (teamCost(team, pool) > budget) return { ok: false, reason: 'O time passa do orçamento.' }
  return { ok: true }
}

/** The team's points in a round; whoever did not play scores nothing. */
export function teamPoints(team: FantasyTeam, points: Readonly<Record<string, number>>): number {
  const sum = team.playerIds.reduce((total, id) => total + (points[id] ?? 0), 0)
  return tenth(sum + (SCORING.captain - 1) * (points[team.captainId] ?? 0))
}

/** The market closes at 23h30 UTC (20h30 in Brasília), half an hour before the round. */
export const MARKET_CLOSE_UTC = { hour: 23, minute: 30 }

/**
 * When the market for the next round closes: the first 23h30 UTC after the
 * last round was played. It opens again as soon as that round is published.
 */
export function marketClosesAt(lastPlayedAt: Date): Date {
  const close = new Date(lastPlayedAt)
  close.setUTCHours(MARKET_CLOSE_UTC.hour, MARKET_CLOSE_UTC.minute, 0, 0)
  if (close <= lastPlayedAt) close.setUTCDate(close.getUTCDate() + 1)
  return close
}

/** A saved team: the round it was sent for and, once that round is played, its points. */
export type Lineup = FantasyTeam & { userId: string; round: number; points?: number }

/**
 * Everyone's team for a round just played, scored. Whoever did not send a new
 * one plays with the last team they sent, as it was.
 */
export function scoreLineups(
  lineups: readonly Lineup[],
  round: number,
  points: Readonly<Record<string, number>>,
): Lineup[] {
  const latest = new Map<string, Lineup>()
  for (const lineup of lineups) {
    if (lineup.round > round) continue
    const current = latest.get(lineup.userId)
    if (!current || lineup.round > current.round) latest.set(lineup.userId, lineup)
  }
  return [...latest.values()].map((lineup) => ({
    ...lineup,
    round,
    points: teamPoints(lineup, points),
  }))
}
