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
