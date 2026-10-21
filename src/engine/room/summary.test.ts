import { describe, expect, it } from 'vitest'
import { BUILT_IN_PACKS } from '../../packs/index.ts'
import { advanceDraft, roomPhase } from './draft.ts'
import { startDraft } from './start.ts'
import { checkLineup } from './league.ts'
import { leagueFromDraft, playSavedRound, roomSummary, slimReplay, teamSheet } from './summary.ts'
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
      league = playSavedRound(league, {}, seed).state
    const end = roomSummary(league)
    expect(end.played).toBe(3)
    expect(end.totalRounds).toBe(3)
    expect(end.next).toEqual([])
    expect(end.last).toHaveLength(2)
    expect(end.standings.reduce((sum, row) => sum + row.played, 0)).toBe(12)
    const goals = end.standings.reduce((sum, row) => sum + row.goalsFor, 0)
    expect(end.best?.average).toBeGreaterThan(0)
    expect(end.scorers.reduce((sum, row) => sum + row.goals, 0)).toBeLessThanOrEqual(goals)
  })
})

describe('saved lineups', () => {
  const me = {
    name: 'Meu Time',
    shortName: 'MEU',
    colors: { primary: '#112233', secondary: '#ffffff' },
  }
  const { state } = startDraft(9, pack, [me], options)
  const league = leagueFromDraft(
    state,
    advanceDraft(state, { auto: new Set(['0']), queues: {} }).picks,
  )

  it('gives each team a sheet with a lineup it may play', () => {
    const sheet = teamSheet(league, '0')
    expect(sheet.players).toHaveLength(options.squadSize)
    expect(sheet.players.every((p) => p.history === undefined)).toBe(true)
    expect(checkLineup(league, '0', sheet.lineup)).toBeUndefined()
    const odd = (change: object) =>
      checkLineup(league, '0', { ...sheet.lineup, ...change } as never)
    expect(odd({ formation: '1-1-8' })).toBe('Formação inválida.')
    expect(odd({ posture: 'louca' })).toBe('Postura inválida.')
    expect(odd({ starters: 'x' })).toBe('Escalação inválida.')
    expect(odd({ starters: [{ playerId: 'x', position: 'Q' }] })).toBe('Posição inválida.')
    expect(Object.keys(sheet.condition)).toHaveLength(options.squadSize)
  })

  it('plays the lineup a person saved, and ignores one that breaks the rules', () => {
    const sheet = teamSheet(league, '0')
    const [first, second] = sheet.lineup.starters
    const swapped = {
      ...sheet.lineup,
      starters: sheet.lineup.starters.map((s) =>
        s === first ? { ...s, playerId: sheet.lineup.bench[0] } : s,
      ),
      bench: [first.playerId, ...sheet.lineup.bench.slice(1)],
    }
    const played = playSavedRound(league, { '0': swapped }, 4)
    expect(played.state.lineups['0'].starters.map((s) => s.playerId)).toContain(
      sheet.lineup.bench[0],
    )
    const foreign = { ...swapped, starters: [{ ...second, playerId: 'nobody' }] }
    const ignored = playSavedRound(league, { '0': foreign }, 4)
    expect(ignored.state.lineups['0'].starters).toHaveLength(11)
  })

  it('keeps only the players a replay needs', () => {
    const played = playSavedRound(league, {}, 2)
    const slim = slimReplay(played.replays[0])
    expect(Object.keys(slim.input.players).length).toBeLessThan(Object.keys(league.players).length)
  })
})
