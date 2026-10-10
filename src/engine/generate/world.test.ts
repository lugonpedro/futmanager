import { describe, expect, it } from 'vitest'
import { POSITIONS } from '../model/types.ts'
import { CLUBS_PER_DIVISION, generateWorld, SQUAD_SHAPE } from './world.ts'

const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

describe('generateWorld', () => {
  const world = generateWorld(2027)
  const clubs = Object.values(world.clubs)
  const players = Object.values(world.players)

  it('produces the same world for the same seed', () => {
    expect(generateWorld(2027)).toEqual(world)
  })

  it('produces a different world for a different seed', () => {
    expect(generateWorld(2028).clubs).not.toEqual(world.clubs)
  })

  it('builds two divisions of 20 clubs each', () => {
    expect(world.leagues.map((league) => league.division)).toEqual([1, 2])
    for (const league of world.leagues) {
      expect(league.clubIds).toHaveLength(CLUBS_PER_DIVISION)
      for (const id of league.clubIds) expect(world.clubs[id].division).toBe(league.division)
    }
    expect(clubs).toHaveLength(2 * CLUBS_PER_DIVISION)
  })

  it('gives every club a unique name, city and short name', () => {
    expect(new Set(clubs.map((club) => club.name)).size).toBe(clubs.length)
    expect(new Set(clubs.map((club) => club.city)).size).toBe(clubs.length)
    expect(new Set(clubs.map((club) => club.shortName)).size).toBe(clubs.length)
  })

  it('gives every club a full squad in the expected shape', () => {
    for (const club of clubs) {
      const squad = club.playerIds.map((id) => world.players[id])
      for (const position of POSITIONS) {
        const count = squad.filter((player) => player.position === position).length
        expect(count, `${club.name} ${position}`).toBe(SQUAD_SHAPE[position])
      }
      for (const player of squad) expect(player.clubId).toBe(club.id)
    }
  })

  it('keeps every player within valid ranges', () => {
    for (const player of players) {
      expect(player.strength).toBeGreaterThanOrEqual(1)
      expect(player.strength).toBeLessThanOrEqual(99)
      expect(player.potential).toBeGreaterThanOrEqual(player.strength)
      expect(player.potential).toBeLessThanOrEqual(99)
      expect(player.age).toBeGreaterThanOrEqual(17)
      expect(player.age).toBeLessThanOrEqual(37)
      expect(player.contractUntil).toBeGreaterThanOrEqual(world.season)
      expect(player.wage).toBeGreaterThan(0)
    }
  })

  it('makes Série A squads stronger than Série B squads', () => {
    const strengthOf = (division: number) =>
      average(
        players.filter((p) => world.clubs[p.clubId].division === division).map((p) => p.strength),
      )
    expect(strengthOf(1)).toBeGreaterThan(strengthOf(2) + 10)
  })

  it('makes bigger clubs field stronger squads', () => {
    const [top, bottom] = [world.leagues[0].clubIds[0], world.leagues[1].clubIds.at(-1)!]
    const squadStrength = (id: string) =>
      average(world.clubs[id].playerIds.map((pid) => world.players[pid].strength))
    expect(squadStrength(top)).toBeGreaterThan(squadStrength(bottom))
  })
})
