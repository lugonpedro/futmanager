import { describe, expect, it } from 'vitest'
import { generateWorld } from '../generate/world.ts'
import { RETIRED, type Player } from '../model/types.ts'
import { createRng } from '../rng.ts'
import { newGame } from '../season/season.ts'
import { MARKET, squadOf } from '../transfer/market.ts'
import {
  ageWorld,
  developPlayer,
  PROGRESSION,
  retirementChance,
  youthIntake,
} from './progression.ts'

const player = (overrides: Partial<Player>): Player => ({
  id: 'X1',
  name: 'Fulano',
  age: 19,
  position: 'M',
  strength: 50,
  potential: 80,
  traits: [],
  wage: 10_000,
  marketValue: 1_000_000,
  contractUntil: 2028,
  clubId: 'C1',
  ...overrides,
})

describe('developing players', () => {
  it('grows young players faster the more they play, never past their potential', () => {
    const young = player({})
    const benched = developPlayer(young, 0, createRng(1))
    const starter = developPlayer(young, 30, createRng(1))
    expect(benched.age).toBe(20)
    expect(starter.strength).toBeGreaterThan(benched.strength)
    expect(starter.strength).toBeLessThanOrEqual(young.potential)
    const capped = developPlayer(player({ strength: 79, potential: 80 }), 30, createRng(2))
    expect(capped.strength).toBeLessThanOrEqual(80)
  })

  it('declines veterans and brings their ceiling down with them', () => {
    const veteran = developPlayer(
      player({ age: 33, strength: 70, potential: 75 }),
      30,
      createRng(3),
    )
    expect(veteran.strength).toBeLessThan(70)
    expect(veteran.potential).toBe(veteran.strength)
  })

  it('retires players from their mid thirties and always by the limit', () => {
    expect(retirementChance(player({ age: 25 }))).toBe(0)
    expect(retirementChance(player({ age: PROGRESSION.retireFrom }))).toBeGreaterThan(0)
    expect(retirementChance(player({ age: PROGRESSION.retireBy }))).toBe(1)
  })
})

describe('the close of a season', () => {
  const world = generateWorld(9)

  it('ages everyone a year and takes the retired out of their squads', () => {
    const { world: aged, retired } = ageWorld(world, {}, createRng(4))
    expect(retired.length).toBeGreaterThan(0)
    for (const p of retired) {
      expect(aged.players[p.id].clubId).toBe(RETIRED)
      expect(aged.clubs[world.players[p.id].clubId].playerIds).not.toContain(p.id)
    }
    const stayed = Object.values(aged.players).filter((p) => p.clubId !== RETIRED)
    for (const p of stayed) expect(p.age).toBe(world.players[p.id].age + 1)
  })

  it('brings up one or two youngsters per club and keeps squads in bounds', () => {
    const game = newGame(9, 'C3')
    const full = {
      ...game,
      world: {
        ...game.world,
        clubs: {
          ...game.world.clubs,
          C3: {
            ...game.world.clubs.C3,
            // The user's squad padded to the limit with other clubs' players' ids.
            playerIds: Object.keys(game.world.players).slice(0, MARKET.maxSquad),
          },
        },
      },
    }
    const { game: next, userYouth } = youthIntake(full, 2028, createRng(5))
    expect(userYouth).toEqual([])
    const youth = Object.values(next.world.players).filter((p) => !game.world.players[p.id])
    expect(youth.length).toBeGreaterThanOrEqual(39)
    for (const p of youth) {
      expect(p.age).toBeGreaterThanOrEqual(16)
      expect(p.age).toBeLessThanOrEqual(18)
      expect(p.potential).toBeGreaterThan(p.strength)
      expect(p.contractUntil).toBe(2030)
    }
    for (const id of Object.keys(next.world.clubs)) {
      if (id === 'C3') continue
      expect(squadOf(next.world, id).length).toBeLessThanOrEqual(PROGRESSION.aiSquadCap)
    }
  })
})
