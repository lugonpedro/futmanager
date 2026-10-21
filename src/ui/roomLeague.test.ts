import { describe, expect, it } from 'vitest'
import type { DraftTeam } from '../cloud/draft.ts'
import { toRoom, type RoomRow } from '../cloud/rooms.ts'
import { forceAt, readiness, timeUntil } from './roomLeague.ts'

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

describe('forceAt', () => {
  const room = toRoom({
    id: 1,
    name: 'Sala',
    owner_id: 'dono',
    pack: 'brasileirao-2026',
    status: 'liga',
    invite_code: 'ABCDEFGH',
    teams: 4,
    squad_size: 18,
    draft_order: 'serpentina',
    pick_seconds: 45,
    auto_reserves: false,
    legs: 2,
    grace_hours: 12,
    injuries: 'normais',
    trades: 'ate-dois-tercos',
    draft_at: '2026-10-22T00:00:00Z',
    created_at: '2026-10-20T00:00:00Z',
    pick_order: null,
    squad_shape: null,
    pick_no: 0,
    pick_deadline: null,
    round_no: 2,
    round_opened_at: '2026-10-23T10:00:00Z',
    rematch_id: null,
    room_members: [{ count: 2 }],
  } satisfies RoomRow)

  it('gives the owner the grace period and everyone else twice that', () => {
    expect(forceAt(room, 'dono')).toEqual(new Date('2026-10-23T22:00:00Z'))
    expect(forceAt(room, 'outro')).toEqual(new Date('2026-10-24T10:00:00Z'))
    expect(forceAt({ ...room, round: undefined }, 'dono')).toBeUndefined()
  })
})

describe('timeUntil', () => {
  const now = new Date('2026-10-23T10:00:00Z')
  it('says hours and minutes', () => {
    expect(timeUntil(new Date('2026-10-23T13:20:00Z'), now)).toBe('em 3 h 20 min')
    expect(timeUntil(new Date('2026-10-23T12:00:00Z'), now)).toBe('em 2 h')
    expect(timeUntil(new Date('2026-10-23T10:11:30Z'), now)).toBe('em 12 min')
    expect(timeUntil(now, now)).toBe('agora')
  })
})
