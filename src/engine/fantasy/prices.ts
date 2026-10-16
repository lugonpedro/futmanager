/**
 * Prices of the online fantasy game, in coins. A player starts at a price set
 * by his overall and then moves with his recent points, a little at a time,
 * so one good or bad match never decides his price alone.
 */
export const PRICES = {
  min: 1,
  /** Starting price of the best player there is (overall 90 or more). */
  top: 25,
  /** Overall at which the starting price leaves the minimum. */
  floorOverall: 50,
  topOverall: 90,
  /** Points a player is expected to score at each price: base + perCoin × price. */
  expectedBase: 2.3,
  expectedPerCoin: 0.14,
  /** Coins gained per point above what was expected, averaged over `recent` matches. */
  change: 0.35,
  /** Most a price moves in one round, as a share of it. */
  maxChange: 0.15,
  recent: 3,
}

const tenth = (x: number) => Math.round(x * 10) / 10

/** Price at the start of the season, from the player's overall. */
export function startingPrice(overall: number): number {
  const share = Math.min(
    1,
    Math.max(0, (overall - PRICES.floorOverall) / (PRICES.topOverall - PRICES.floorOverall)),
  )
  return tenth(PRICES.min + (PRICES.top - PRICES.min) * share ** 2)
}

/** Points a player at this price should score in a match. */
export const expectedPoints = (price: number) =>
  PRICES.expectedBase + PRICES.expectedPerCoin * price

/**
 * The price after a round the player played in. `recent` holds his points in
 * the last matches he played, newest last; only the last few count.
 */
export function nextPrice(price: number, recent: readonly number[]): number {
  const last = recent.slice(-PRICES.recent)
  if (last.length === 0) return price
  const average = last.reduce((a, b) => a + b, 0) / last.length
  const limit = PRICES.maxChange * price
  const change = Math.min(
    limit,
    Math.max(-limit, PRICES.change * (average - expectedPoints(price))),
  )
  return Math.max(PRICES.min, tenth(price + change))
}
