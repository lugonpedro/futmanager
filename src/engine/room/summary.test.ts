import { describe, expect, it } from 'vitest'
import { BUILT_IN_PACKS } from '../../packs/index.ts'
import { advanceDraft, roomPhase } from './draft.ts'
import { startDraft } from './start.ts'
import { leagueFromDraft, playAutoRound, roomSummary } from './summary.ts'
import { DEFAULT_ROOM_OPTIONS } from './types.ts'

const pack = await BUILT_IN_PACKS[0].load()
const options = { ...DEFAULT_ROOM_OPTIONS, teams: 4, legs: 1 as const }

describe('the room league', () => {
  it('rebuilds the draft from its picks and plays to the end', () => {
    const { state } = startDraft(6, pack, [], options)
    const drafted = advanceDraft(state, { auto: new Set(), queues: {} })
    let league = leagueFromDraft(state, drafted.picks)
    expect(league.squads).toEqual(drafted.squads)

    const start = roomSummary(league)
    expect(start.played).toBe(0)
    expect(start.next).toHaveLength(2)
    expect(start.last).toEqual([])

    for (let seed = 1; roomPhase(league) === 'liga'; seed++)
      league = playAutoRound(league, seed).state
    const end = roomSummary(league)
    expect(end.played).toBe(3)
    expect(end.totalRounds).toBe(3)
    expect(end.next).toEqual([])
    expect(end.last).toHaveLength(2)
    expect(end.standings.reduce((sum, row) => sum + row.played, 0)).toBe(12)
    const goals = end.standings.reduce((sum, row) => sum + row.goalsFor, 0)
    expect(end.scorers.reduce((sum, row) => sum + row.goals, 0)).toBeLessThanOrEqual(goals)
  })
})
