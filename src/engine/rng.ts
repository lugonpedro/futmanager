/**
 * Seeded pseudo-random generator (mulberry32). The engine never calls
 * Math.random, so the same seed always produces the same world and matches.
 */
export type Rng = {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number
  /** Normally distributed float (Box-Muller). */
  normal(mean: number, stdDev: number): number
  pick<T>(items: readonly T[]): T
  /** New array with the items in random order; the input is left untouched. */
  shuffle<T>(items: readonly T[]): T[]
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    normal: (mean, stdDev) => {
      // 1 - next() keeps the log argument in (0, 1].
      const u = 1 - next()
      const v = next()
      return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() from an empty list')
      return items[Math.floor(next() * items.length)]
    },
    shuffle: (items) => {
      const result = [...items]
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
      }
      return result
    },
  }
}

/** Turns any mix of numbers and labels into a 32-bit seed (FNV-1a). */
export function mixSeed(...parts: (number | string)[]): number {
  let hash = 0x811c9dc5
  for (const char of parts.join(':')) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
