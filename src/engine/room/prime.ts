import type { Attributes, Player } from '../model/types.ts'

/**
 * Prime cards: now and then one of the five cards dealt for a pick comes out
 * boosted, for that room only. The database draws them (room_deal in
 * 20261106000000_cartas_prime.sql) with these numbers.
 */
export const PRIME = {
  /** One deal in this many has a prime card. */
  oneIn: 12,
  /** The prime is drawn among this many of the weakest cards of the deal. */
  amongWeakest: 3,
  /** Overall added, from the first to the second, both included. */
  boost: [8, 12],
  /** A prime never goes above this overall. */
  ceiling: 89,
} as const

/** The player as a prime card: every attribute and the overall `boost` higher. */
export function primePlayer(player: Player, boost: number): Player {
  if (boost <= 0) return player
  const attributes = Object.fromEntries(
    Object.entries(player.attributes).map(([name, value]) => [name, Math.min(99, value + boost)]),
  ) as Attributes
  const overall = Math.min(99, player.overall + boost)
  return { ...player, attributes, overall, potential: Math.max(player.potential, overall) }
}
