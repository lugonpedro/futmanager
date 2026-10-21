import { describe, expect, it } from 'vitest'
import { BUILT_IN_PACKS } from '../../packs/index.ts'
import { advanceDraft, freePlayers } from './draft.ts'
import { robotTeams, startDraft } from './start.ts'
import { DEFAULT_ROOM_OPTIONS } from './types.ts'

const pack = await BUILT_IN_PACKS[0].load()
const people = [
  { name: 'Time da Ana', shortName: 'RFC', colors: { primary: '#112233', secondary: '#ffffff' } },
  {
    name: 'Atlético Circuito',
    shortName: 'BIA',
    colors: { primary: '#000000', secondary: '#ffffff' },
  },
]

describe('startDraft', () => {
  it('puts the people first and fills the room with robots', () => {
    const { state } = startDraft(3, pack, people, DEFAULT_ROOM_OPTIONS)
    expect(state.teams.map((t) => t.id)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7'])
    expect(state.teams.map((t) => t.robot)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
    ])
    expect(state.teams[0].name).toBe('Time da Ana')
  })

  it("never gives a robot a person's name or short name", () => {
    const robots = robotTeams(10, people)
    expect(robots.map((t) => t.shortName)).not.toContain('RFC')
    expect(robots.map((t) => t.name)).not.toContain('Atlético Circuito')
    expect(new Set(robots.map((t) => t.shortName)).size).toBe(10)
  })

  it('lists the same pool in every room, in the order the automatic picks go by', () => {
    const a = startDraft(1, pack, people, DEFAULT_ROOM_OPTIONS)
    const b = startDraft(999, pack, [], { ...DEFAULT_ROOM_OPTIONS, teams: 12 })
    expect(b.pool).toEqual(a.pool)
    expect(a.pool.map((p) => p.id)).toEqual(freePlayers(a.state).map((p) => p.id))
    expect(a.pool[0].rank).toBe(0)
    expect(a.pool.length).toBeGreaterThan(900)
  })

  it('draws a different order for another seed', () => {
    const orders = [1, 2, 3, 4].map((seed) =>
      startDraft(seed, pack, people, DEFAULT_ROOM_OPTIONS).state.order.join(),
    )
    expect(new Set(orders).size).toBeGreaterThan(1)
  })

  it('drafts to the end with robots only', () => {
    const { state } = startDraft(8, pack, [], DEFAULT_ROOM_OPTIONS)
    const done = advanceDraft(state, { auto: new Set(), queues: {} })
    expect(done.picks).toHaveLength(8 * DEFAULT_ROOM_OPTIONS.squadSize)
  })

  it('fills the biggest room, 18 squads of 20, with keepers for all and players to spare', () => {
    const options = { ...DEFAULT_ROOM_OPTIONS, teams: 18, squadSize: 20 as const }
    const { state, pool } = startDraft(8, pack, [], options)
    expect(new Set(state.teams.map((t) => t.shortName)).size).toBe(18)
    expect(state.teams.every((t) => !/^R\d/.test(t.shortName))).toBe(true)
    const done = advanceDraft(state, { auto: new Set(), queues: {} })
    expect(done.picks).toHaveLength(18 * 20)
    const byId = new Map(pool.map((p) => [p.id, p]))
    for (const squad of Object.values(done.squads)) {
      expect(squad.filter((id) => byId.get(id)?.position === 'G').length).toBeGreaterThanOrEqual(2)
    }
    // The cards still free: the pool less what was picked, never the pack's own free agents.
    const picked = new Set(done.picks.map((p) => p.playerId))
    const left = pool.filter((p) => !picked.has(p.id))
    for (const position of ['G', 'Z', 'L', 'M', 'A'] as const)
      expect(left.filter((p) => p.position === position).length).toBeGreaterThan(20)
  })
})
