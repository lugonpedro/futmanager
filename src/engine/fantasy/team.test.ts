import { describe, expect, it } from 'vitest'
import type { Position } from '../model/types.ts'
import { SCORING } from './scoring.ts'
import {
  BUDGET,
  checkTeam,
  marketClosesAt,
  scoreLineups,
  teamCost,
  teamPoints,
  type FantasyTeam,
  type Lineup,
  type Pick,
} from './team.ts'

const shape: Position[] = ['G', 'Z', 'Z', 'L', 'L', 'M', 'M', 'M', 'A', 'A', 'A']
const pool: Record<string, Pick> = Object.fromEntries([
  ...shape.map((position, i) => [`p${i}`, { position, price: 8 }]),
  ['star', { position: 'A', price: 30 }],
  ['keeper', { position: 'G', price: 2 }],
])
const team: FantasyTeam = {
  formation: '4-3-3',
  playerIds: shape.map((_, i) => `p${i}`),
  captainId: 'p8',
}

describe('fantasy team', () => {
  it('accepts eleven players who fit the formation and the budget', () => {
    expect(teamCost(team, pool)).toBe(88)
    expect(checkTeam(team, pool)).toEqual({ ok: true })
  })

  it('turns down teams that break a rule', () => {
    const swap = (from: string, to: string) => ({
      ...team,
      playerIds: team.playerIds.map((id) => (id === from ? to : id)),
    })
    expect(checkTeam({ ...team, playerIds: team.playerIds.slice(1) }, pool).ok).toBe(false)
    expect(checkTeam(swap('p1', 'p0'), pool).ok).toBe(false)
    expect(checkTeam(swap('p1', 'ghost'), pool).ok).toBe(false)
    expect(checkTeam(swap('p0', 'star'), pool).ok).toBe(false)
    expect(checkTeam({ ...team, formation: '4-4-2' }, pool).ok).toBe(false)
    expect(checkTeam({ ...team, captainId: 'star' }, pool).ok).toBe(false)
    expect(checkTeam(swap('p9', 'star'), pool)).toEqual({
      ok: false,
      reason: 'O time passa do orçamento.',
    })
    expect(checkTeam(swap('p9', 'star'), pool, 200).ok).toBe(true)
    expect(BUDGET).toBe(100)
  })

  it('adds up the round, the captain counting more', () => {
    const points = { p0: 5, p8: 10, p9: -2, star: 40 }
    expect(teamPoints(team, points)).toBe(13 + (SCORING.captain - 1) * 10)
  })
})

describe('fantasy market and rounds', () => {
  it('closes at 23h30 UTC after the last round', () => {
    expect(marketClosesAt(new Date('2027-05-01T00:00:40Z')).toISOString()).toBe(
      '2027-05-01T23:30:00.000Z',
    )
    expect(marketClosesAt(new Date('2027-05-01T23:45:00Z')).toISOString()).toBe(
      '2027-05-02T23:30:00.000Z',
    )
  })

  it('scores the team sent for the round, or else the last one sent', () => {
    const lineup = (userId: string, round: number, captainId = 'p8'): Lineup => ({
      ...team,
      captainId,
      userId,
      round,
    })
    const points = { p8: 10, p9: 2 }
    const scored = scoreLineups(
      [lineup('ana', 3), lineup('ana', 5, 'p9'), lineup('bia', 2), lineup('caio', 6)],
      5,
      points,
    )
    expect(scored).toHaveLength(2)
    const by = Object.fromEntries(scored.map((l) => [l.userId, l]))
    expect(by.ana).toMatchObject({ round: 5, captainId: 'p9', points: teamPoints(by.ana, points) })
    expect(by.bia).toMatchObject({ round: 5, captainId: 'p8', points: 12 + 5 })
  })
})
