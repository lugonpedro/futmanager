import type { Formation, Lineup, LineupSlot, Player, Position, Posture } from '../model/types.ts'

/** How many players each formation puts in each position. Laterais count as defenders. */
export const FORMATIONS: Record<Formation, Record<Position, number>> = {
  '4-4-2': { G: 1, Z: 2, L: 2, M: 4, A: 2 },
  '4-3-3': { G: 1, Z: 2, L: 2, M: 3, A: 3 },
  '3-5-2': { G: 1, Z: 3, L: 0, M: 5, A: 2 },
  '4-5-1': { G: 1, Z: 2, L: 2, M: 5, A: 1 },
  '5-3-2': { G: 1, Z: 3, L: 2, M: 3, A: 2 },
}

export const BENCH_SIZE = 7

/** Order to fill positions in, scarce ones first, and who can cover each one. */
const FILL_ORDER: Position[] = ['G', 'Z', 'L', 'A', 'M']
const COVER: Record<Position, Position[]> = {
  G: ['G'],
  Z: ['Z', 'L', 'M'],
  L: ['L', 'Z', 'M'],
  M: ['M', 'L', 'A'],
  A: ['A', 'M'],
}

/**
 * Picks the strongest available players for a formation, covering a missing
 * position with the closest one. Bench gets a keeper plus the best of the rest.
 */
export function autoLineup(
  squad: readonly Player[],
  formation: Formation = '4-4-2',
  posture: Posture = 'normal',
  unavailable: ReadonlySet<string> = new Set(),
): Lineup {
  const available = squad
    .filter((player) => !unavailable.has(player.id))
    .sort((a, b) => b.strength - a.strength)
  const used = new Set<string>()
  const starters: LineupSlot[] = []

  for (const position of FILL_ORDER) {
    for (let i = 0; i < FORMATIONS[formation][position]; i++) {
      const player =
        COVER[position]
          .map((cover) => available.find((p) => p.position === cover && !used.has(p.id)))
          .find(Boolean) ??
        // Nobody fits: anyone left will do, rather than playing a man short.
        available.find((p) => !used.has(p.id) && p.position !== 'G')
      if (!player) continue
      used.add(player.id)
      starters.push({ playerId: player.id, position })
    }
  }

  const rest = available.filter((player) => !used.has(player.id))
  const reserveKeeper = rest.find((player) => player.position === 'G')
  const bench = [
    ...(reserveKeeper ? [reserveKeeper] : []),
    ...rest.filter((player) => player !== reserveKeeper),
  ]
    .slice(0, BENCH_SIZE)
    .map((player) => player.id)

  return { formation, posture, starters, bench }
}
