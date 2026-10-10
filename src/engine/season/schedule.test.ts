import { describe, expect, it } from 'vitest'
import { createRng } from '../rng.ts'
import { createSchedule } from './schedule.ts'

const clubs = Array.from({ length: 20 }, (_, i) => `C${i + 1}`)
const rounds = createSchedule('L1', clubs, createRng(1))

describe('createSchedule', () => {
  it('has 38 rounds of 10 matches with every club playing once per round', () => {
    expect(rounds).toHaveLength(38)
    for (const [index, round] of rounds.entries()) {
      expect(round).toHaveLength(10)
      const playing = round.flatMap((f) => [f.homeId, f.awayId])
      expect(new Set(playing).size).toBe(20)
      for (const fixture of round) expect(fixture.round).toBe(index + 1)
    }
  })

  it('has every club host every other club exactly once', () => {
    const pairs = rounds.flat().map((f) => `${f.homeId}>${f.awayId}`)
    expect(new Set(pairs).size).toBe(20 * 19)
  })

  it('plays the returno in the turno order with home and away swapped', () => {
    for (let r = 0; r < 19; r++) {
      expect(rounds[r + 19].map((f) => [f.awayId, f.homeId])).toEqual(
        rounds[r].map((f) => [f.homeId, f.awayId]),
      )
    }
  })

  it('gives each club 19 home games and few long home or away runs', () => {
    for (const club of clubs) {
      const venues = rounds.map((round) => (round.some((f) => f.homeId === club) ? 'H' : 'A'))
      expect(venues.filter((v) => v === 'H')).toHaveLength(19)
      const longestRun = Math.max(
        ...venues
          .join('')
          .match(/H+|A+/g)!
          .map((run) => run.length),
      )
      // Runs of three only happen where the turno meets the returno.
      expect(longestRun).toBeLessThanOrEqual(3)
    }
  })

  it('is reproducible from the seed and varies between seeds', () => {
    expect(createSchedule('L1', clubs, createRng(1))).toEqual(rounds)
    expect(createSchedule('L1', clubs, createRng(2))).not.toEqual(rounds)
  })
})
