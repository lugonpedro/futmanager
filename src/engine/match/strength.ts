import type { Player, Position, Posture } from '../model/types.ts'

export type Sectors = { defense: number; midfield: number; attack: number }

/** How much a player in each position adds to each sector. */
const WEIGHTS: Record<keyof Sectors, Record<Position, number>> = {
  defense: { G: 1.5, Z: 1, L: 0.7, M: 0.25, A: 0 },
  midfield: { G: 0, Z: 0.2, L: 0.5, M: 1, A: 0.3 },
  attack: { G: 0, Z: 0.1, L: 0.3, M: 0.5, A: 1 },
}

/** Total weight of a full 4-4-2, so a balanced XI rates close to its players' average. */
const REFERENCE: Record<Position, number> = { G: 1, Z: 2, L: 2, M: 4, A: 2 }
const NORMALIZER = Object.fromEntries(
  (Object.keys(WEIGHTS) as (keyof Sectors)[]).map((sector) => [
    sector,
    (Object.keys(REFERENCE) as Position[]).reduce(
      (sum, position) => sum + WEIGHTS[sector][position] * REFERENCE[position],
      0,
    ),
  ]),
) as Sectors

const NEIGHBOURS: Record<Position, Position[]> = {
  G: [],
  Z: ['L'],
  L: ['Z', 'M'],
  M: ['L', 'A'],
  A: ['M'],
}

/** 1 in their own position, a bit less next to it, much less elsewhere; anyone in goal is a disaster. */
export function positionFit(player: Player, position: Position): number {
  if (player.position === position) return 1
  if (position === 'G' || player.position === 'G') return 0.35
  return NEIGHBOURS[player.position].includes(position) ? 0.88 : 0.72
}

/** Match-day ability: strength, a small bonus per trait, position fit and tiredness. */
export function effectiveStrength(player: Player, position: Position, energy: number): number {
  const base = player.strength + 2 * player.traits.length
  return base * positionFit(player, position) * (0.8 + (0.2 * energy) / 100)
}

export const POSTURE_EFFECT: Record<Posture, { attack: number; defense: number; tiring: number }> =
  {
    defensiva: { attack: 0.9, defense: 1.08, tiring: 0.9 },
    normal: { attack: 1, defense: 1, tiring: 1 },
    ofensiva: { attack: 1.1, defense: 0.92, tiring: 1.15 },
  }

/**
 * Sector ratings of the players on the pitch. Missing players (sent off, injured
 * with no subs left) simply add nothing, so the sectors drop.
 */
export function sectorStrength(
  onPitch: readonly { player: Player; position: Position; energy: number }[],
  posture: Posture,
): Sectors {
  const totals: Sectors = { defense: 0, midfield: 0, attack: 0 }
  for (const { player, position, energy } of onPitch) {
    const value = effectiveStrength(player, position, energy)
    for (const sector of Object.keys(totals) as (keyof Sectors)[]) {
      totals[sector] += WEIGHTS[sector][position] * value
    }
  }
  const effect = POSTURE_EFFECT[posture]
  return {
    defense: (totals.defense / NORMALIZER.defense) * effect.defense,
    midfield: totals.midfield / NORMALIZER.midfield,
    attack: (totals.attack / NORMALIZER.attack) * effect.attack,
  }
}
