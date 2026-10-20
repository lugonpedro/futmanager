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
})
