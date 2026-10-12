import { describe, expect, it } from 'vitest'
import type { MatchResult, Season } from '../model/types.ts'
import { newGame, playRound } from './season.ts'
import { conditionOn, formOf, recordMatchDay, roundStars } from './form.ts'

const game = newGame(4, 'C10')
const player = game.world.players[game.world.clubs.C10.playerIds[0]]

const withSeason = (patch: Partial<Season>): Season => ({ ...game.season, ...patch })

describe('fitness and form', () => {
  it('gets players back to full energy with rest, faster with stamina', () => {
    const season = withSeason({ fitness: { [player.id]: { energy: 70, date: '2027-04-10' } } })
    expect(conditionOn(season, player, '2027-04-10')).toBe(70)
    expect(conditionOn(season, player, '2027-04-13')).toBeGreaterThan(70)
    expect(conditionOn(season, player, '2027-04-13')).toBeLessThan(100)
    expect(conditionOn(season, player, '2027-04-24')).toBe(100)
    const tireless = { ...player, attributes: { ...player.attributes, stamina: 99 } }
    const fragile = { ...player, attributes: { ...player.attributes, stamina: 10 } }
    expect(conditionOn(season, tireless, '2027-04-13')).toBeGreaterThan(
      conditionOn(season, fragile, '2027-04-13'),
    )
    expect(conditionOn(game.season, player, '2027-04-13')).toBe(100)
  })

  it('reads form from the last five ratings', () => {
    const rate = (ratings: number[]) => {
      let season = game.season
      for (const r of ratings) {
        const result = { ratings: { [player.id]: r }, energy: {} } as unknown as MatchResult
        season = { ...season, ...recordMatchDay(season, [result], '2027-04-10') }
      }
      return season
    }
    expect(formOf(game.season, player.id)).toBe(0)
    expect(formOf(rate([9, 9, 9]), player.id)).toBe(2)
    expect(formOf(rate([4.5, 5, 5]), player.id)).toBe(-2)
    const recovered = rate([4, 4, 4, 4, 4, 6.2, 6.2, 6.2, 6.2, 6.2])
    expect(recovered.ratings[player.id]).toMatchObject({
      games: 10,
      last: [6.2, 6.2, 6.2, 6.2, 6.2],
    })
    expect(formOf(recovered, player.id)).toBe(0)
  })
})

describe('a round of football', () => {
  const played = playRound(game)

  it('rates everyone who played and leaves them a little tired', () => {
    const ids = Object.keys(played.season.ratings)
    expect(ids.length).toBeGreaterThanOrEqual(22 * 10)
    const energy = ids.map((id) => played.season.fitness[id].energy)
    for (const id of ids) expect(played.season.fitness[id].date).toBe(played.today)
    expect(energy.reduce((a, b) => a + b, 0) / energy.length).toBeLessThan(90)
    expect(Math.min(...energy)).toBeGreaterThan(40)
  })

  it('picks a best XI of the round in a 4-3-3', () => {
    const stars = played.season.roundStars.map((id) => played.world.players[id])
    expect(stars).toHaveLength(11)
    expect(stars.filter((p) => p.position === 'G')).toHaveLength(1)
    expect(stars.filter((p) => p.position === 'A')).toHaveLength(3)
    expect(new Set(stars.map((p) => p.id)).size).toBe(11)
  })

  it('takes the best rating for each place', () => {
    const results = [{ ratings: { a: 7, b: 9, c: 8 } }] as unknown as MatchResult[]
    const players = {
      a: { position: 'G' },
      b: { position: 'G' },
      c: { position: 'A' },
    } as unknown as Parameters<typeof roundStars>[1]
    expect(roundStars(results, players)).toEqual(['b', 'c'])
  })
})
