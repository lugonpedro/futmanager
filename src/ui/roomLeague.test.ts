import { describe, expect, it } from 'vitest'
import type { DraftTeam } from '../cloud/draft.ts'
import type { Room } from '../cloud/rooms.ts'
import { canPlayRound, readiness } from './roomLeague.ts'

const team = (slot: number, more: Partial<DraftTeam>): DraftTeam => ({
  slot,
  name: `Time ${slot}`,
  shortName: `T${slot}`,
  colors: { primary: '#000000', secondary: '#ffffff' },
  robot: false,
  auto: false,
  ...more,
})

describe('readiness', () => {
  it('counts only people, and only for the coming round', () => {
    const teams = [
      team(0, { userId: 'a', readyRound: 3 }),
      team(1, { userId: 'b', readyRound: 2 }),
      team(2, { robot: true }),
      team(3, {}),
    ]
    const { people, ready, waiting } = readiness(teams, 3)
    expect(people.map((t) => t.slot)).toEqual([0, 1])
    expect(ready.map((t) => t.slot)).toEqual([0])
    expect(waiting.map((t) => t.slot)).toEqual([1])
  })
})

describe('canPlayRound', () => {
  it('lets the owner play at any time, and anyone once everyone is ready', () => {
    const room = { ownerId: 'dono' } as Room
    expect(canPlayRound(room, 'dono', false)).toBe(true)
    expect(canPlayRound(room, 'outro', false)).toBe(false)
    expect(canPlayRound(room, 'outro', true)).toBe(true)
  })
})
