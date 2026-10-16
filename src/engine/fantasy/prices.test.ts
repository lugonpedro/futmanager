import { describe, expect, it } from 'vitest'
import { expectedPoints, nextPrice, PRICES, startingPrice } from './prices.ts'

describe('fantasy prices', () => {
  it('start from the overall, dearer for the best', () => {
    expect(startingPrice(40)).toBe(PRICES.min)
    expect(startingPrice(PRICES.floorOverall)).toBe(PRICES.min)
    expect(startingPrice(PRICES.topOverall)).toBe(PRICES.top)
    expect(startingPrice(99)).toBe(PRICES.top)
    for (let overall = 50; overall < 90; overall++) {
      expect(startingPrice(overall + 1)).toBeGreaterThanOrEqual(startingPrice(overall))
    }
  })

  it('move with the average of the last matches, a little at a time', () => {
    const price = 10
    const par = expectedPoints(price)
    expect(nextPrice(price, [])).toBe(price)
    expect(nextPrice(price, [par])).toBe(price)
    expect(nextPrice(price, [par + 2])).toBeGreaterThan(price)
    expect(nextPrice(price, [par - 2])).toBeLessThan(price)
    // One great match after two poor ones barely helps.
    expect(nextPrice(price, [par - 3, par - 3, par + 6])).toBe(price)
    // Only the last few matches count.
    expect(nextPrice(price, [-50, par, par, par])).toBe(price)
    expect(nextPrice(price, [par + 100])).toBe(price * (1 + PRICES.maxChange))
    expect(nextPrice(price, [par - 100])).toBe(price * (1 - PRICES.maxChange))
    expect(nextPrice(PRICES.min, [-20])).toBe(PRICES.min)
  })
})
