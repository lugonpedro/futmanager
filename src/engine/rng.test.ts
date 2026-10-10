import { describe, expect, it } from 'vitest'
import { createRng } from './rng.ts'

describe('createRng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    expect(Array.from({ length: 5 }, a.next)).toEqual(Array.from({ length: 5 }, b.next))
  })

  it('produces different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toEqual(createRng(2).next())
  })

  it('keeps int() within the inclusive range', () => {
    const rng = createRng(7)
    const values = Array.from({ length: 1000 }, () => rng.int(1, 6))
    expect(Math.min(...values)).toBe(1)
    expect(Math.max(...values)).toBe(6)
  })

  it('throws when picking from an empty list', () => {
    expect(() => createRng(1).pick([])).toThrow()
  })
})

describe('normal', () => {
  it('centres on the mean with roughly the requested spread', () => {
    const rng = createRng(3)
    const values = Array.from({ length: 5000 }, () => rng.normal(50, 10))
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
    expect(mean).toBeCloseTo(50, 0)
    expect(Math.sqrt(variance)).toBeGreaterThan(9)
    expect(Math.sqrt(variance)).toBeLessThan(11)
  })
})

describe('shuffle', () => {
  it('keeps every item and leaves the input untouched', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const result = createRng(9).shuffle(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...result].sort((a, b) => a - b)).toEqual(input)
  })
})
