import { describe, expect, it } from 'vitest'
import { FREE_AGENT } from '../engine/model/types.ts'
import { newGame } from '../engine/season/season.ts'
import { squadOf, transferPlayer } from '../engine/transfer/market.ts'
import { activeFilters, marketRows, NO_FILTERS } from './marketFilter.ts'

const start = newGame(5, 'C25')
const spare = squadOf(start.world, 'C4').filter((p) => p.position === 'A')[0]
const game = {
  ...start,
  world: transferPlayer(start.world, spare.id, FREE_AGENT, {
    fee: 0,
    wage: spare.wage,
    contractUntil: 2027,
  }),
}

describe('marketRows', () => {
  it('lists other clubs’ players, strongest first', () => {
    const rows = marketRows(game, NO_FILTERS)
    expect(rows.length).toBeGreaterThan(100)
    expect(rows.some((r) => r.player.clubId === game.userClubId)).toBe(false)
    const overalls = rows.map((r) => r.player.overall)
    expect(overalls).toEqual([...overalls].sort((a, b) => b - a))
  })

  it('finds free agents and contracts in their last season', () => {
    const free = marketRows(game, { ...NO_FILTERS, situation: 'Sem clube' })
    expect(free.map((r) => r.player.id)).toEqual([spare.id])
    expect(free[0].price).toBe(0)
    const ending = marketRows(game, { ...NO_FILTERS, situation: 'Contrato no fim' })
    expect(ending.length).toBeGreaterThan(0)
    for (const { player } of ending) {
      expect(player.contractUntil).toBeLessThanOrEqual(game.season.year)
      expect(player.clubId).not.toBe(FREE_AGENT)
    }
  })

  it('keeps to the starred players', () => {
    const starred = { ...game, favorites: [spare.id] }
    const rows = marketRows(starred, { ...NO_FILTERS, situation: 'Favoritos' })
    expect(rows.map((r) => r.player.id)).toEqual([spare.id])
  })

  it('filters by age, division, overall and potential', () => {
    const rows = marketRows(game, {
      ...NO_FILTERS,
      age: 'Até 21',
      division: 2,
      minOverall: 40,
      minPotential: 60,
      sort: 'Potencial',
    })
    expect(rows.length).toBeGreaterThan(0)
    for (const { player, potential } of rows) {
      expect(player.age).toBeLessThanOrEqual(21)
      expect(game.world.clubs[player.clubId].division).toBe(2)
      expect(player.overall).toBeGreaterThanOrEqual(40)
      expect(potential.high).toBeGreaterThanOrEqual(60)
    }
    const highs = rows.map((r) => r.potential.high)
    expect(highs).toEqual([...highs].sort((a, b) => b - a))
  })

  it('counts the filters that are on', () => {
    expect(activeFilters(NO_FILTERS)).toBe(0)
    expect(activeFilters({ ...NO_FILTERS, situation: 'Sem clube', minOverall: 70 })).toBe(2)
  })
})
