import { describe, expect, it } from 'vitest'
import { teamPoints, type FantasyTeam } from '../engine/fantasy/team.ts'
import { roundLeaders, scoredTeam } from './fantasyRound.ts'

const team: FantasyTeam = {
  formation: '4-4-2',
  playerIds: ['g', 'z1', 'z2', 'l1', 'l2', 'm1', 'm2', 'm3', 'm4', 'a1', 'a2'],
  captainId: 'a1',
}
const points = { g: 4, z1: 2.5, z2: -1, l1: 3, l2: 0, m1: 6, m2: 1.2, m3: 2, m4: 3.3, a1: 8 }

describe('scoredTeam', () => {
  it('counts the captain one and a half times and adds up to the team points', () => {
    const picks = scoredTeam(team, points)
    expect(picks[0]).toEqual({ id: 'a1', points: 8, captain: true, counted: 12 })
    const total = picks.reduce((sum, p) => sum + p.counted, 0)
    expect(Math.round(total * 10) / 10).toBe(teamPoints(team, points))
  })

  it('leaves who did not play without points, counting nothing', () => {
    const a2 = scoredTeam(team, points).find((p) => p.id === 'a2')!
    expect(a2.points).toBeUndefined()
    expect(a2.counted).toBe(0)
  })
})

describe('roundLeaders', () => {
  it('lists the best of the round first', () => {
    expect(roundLeaders(points, 3)).toEqual([
      ['a1', 8],
      ['m1', 6],
      ['g', 4],
    ])
  })

  it('breaks ties by id', () => {
    expect(roundLeaders({ b: 2, a: 2 }, 2)).toEqual([
      ['a', 2],
      ['b', 2],
    ])
  })
})
