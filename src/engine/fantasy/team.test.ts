import { describe, expect, it } from 'vitest'
import type { Position } from '../model/types.ts'
import { SCORING } from './scoring.ts'
import { BUDGET, checkTeam, teamCost, teamPoints, type FantasyTeam, type Pick } from './team.ts'

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
