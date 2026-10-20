import { describe, expect, it } from 'vitest'
import { newGame } from '../engine/season/season.ts'
import {
  activePlayerFilters,
  matchesPlayer,
  NO_PLAYER_FILTERS,
  reachesPotential,
} from './playerFilter.ts'

const players = Object.values(newGame(5, 'C25').world.players)

describe('matchesPlayer', () => {
  it('lets everyone through with no filters', () => {
    expect(players.every((p) => matchesPlayer(p, NO_PLAYER_FILTERS))).toBe(true)
  })

  it('keeps to the position, age band, minimum overall and name', () => {
    const filters = { ...NO_PLAYER_FILTERS, position: 'G' as const, age: 'Até 21' as const }
    const kept = players.filter((p) => matchesPlayer(p, filters))
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.every((p) => p.position === 'G' && p.age <= 21)).toBe(true)

    const strong = players.filter((p) => matchesPlayer(p, { ...NO_PLAYER_FILTERS, minOverall: 70 }))
    expect(strong.every((p) => p.overall >= 70)).toBe(true)

    const named = players[0]
    const search = named.name.slice(0, 4).toLocaleUpperCase('pt-BR')
    const found = players.filter((p) => matchesPlayer(p, { ...NO_PLAYER_FILTERS, search }))
    expect(found).toContain(named)
  })
})

describe('reachesPotential and activePlayerFilters', () => {
  it('checks the top of the range and counts the hidden filters', () => {
    expect(reachesPotential({ high: 80 }, { ...NO_PLAYER_FILTERS, minPotential: 80 })).toBe(true)
    expect(reachesPotential({ high: 79 }, { ...NO_PLAYER_FILTERS, minPotential: 80 })).toBe(false)
    expect(activePlayerFilters(NO_PLAYER_FILTERS)).toBe(0)
    expect(
      activePlayerFilters({ ...NO_PLAYER_FILTERS, age: '30 ou mais', minOverall: 60, search: 'x' }),
    ).toBe(2)
  })
})
