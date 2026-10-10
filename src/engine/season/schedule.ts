import type { Fixture } from '../model/types.ts'
import type { Rng } from '../rng.ts'

/**
 * Double round robin by the circle method: every club meets every other once
 * in the first half (turno) and again with home and away swapped in the second
 * (returno), in the same order. Clubs alternate home and away as much as the
 * method allows. Needs an even number of clubs.
 */
export function createSchedule(
  leagueId: string,
  clubIds: readonly string[],
  rng: Rng,
): Fixture[][] {
  if (clubIds.length % 2 !== 0) throw new Error('A league needs an even number of clubs')
  const n = clubIds.length
  const [fixed, ...rotating] = rng.shuffle(clubIds)
  const firstHalf: [string, string][][] = []

  for (let r = 0; r < n - 1; r++) {
    const circle = [fixed, ...rotating]
    const pairs: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = circle[i]
      const b = circle[n - 1 - i]
      // The fixed club swaps sides every round; the rest by their place in the circle.
      const aAtHome = i === 0 ? r % 2 === 0 : i % 2 === 1
      pairs.push(aAtHome ? [a, b] : [b, a])
    }
    firstHalf.push(pairs)
    rotating.unshift(rotating.pop()!)
  }

  const rounds = [...firstHalf, ...firstHalf.map((pairs) => pairs.map(([h, a]) => [a, h]))]
  return rounds.map((pairs, index) =>
    pairs.map(([homeId, awayId], i) => ({
      id: `${leagueId}-R${index + 1}-${i + 1}`,
      leagueId,
      round: index + 1,
      homeId,
      awayId,
    })),
  )
}
