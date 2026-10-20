import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM_OPTIONS } from '../engine/room/types.ts'
import { roomError, toRoom, type RoomRow } from './rooms.ts'

const row: RoomRow = {
  id: 7,
  name: 'Amigos',
  owner_id: 'u1',
  pack: 'brasileirao-2026',
  status: 'espera',
  invite_code: 'ABCD2345',
  teams: 8,
  squad_size: 18,
  draft_order: 'serpentina',
  pick_seconds: 45,
  auto_reserves: false,
  legs: 2,
  grace_hours: 24,
  injuries: 'normais',
  trades: 'ate-dois-tercos',
  draft_at: '2026-10-22T00:00:00+00:00',
  created_at: '2026-10-20T12:00:00+00:00',
  pick_order: null,
  squad_shape: null,
  pick_no: 0,
  pick_deadline: null,
  room_members: [{ count: 3 }],
}

describe('toRoom', () => {
  it('reads the options back as the engine has them', () => {
    const room = toRoom(row)
    expect(room.options).toEqual(DEFAULT_ROOM_OPTIONS)
    expect(room.members).toBe(3)
    expect(room.draftAt.toISOString()).toBe('2026-10-22T00:00:00.000Z')
  })

  it('has a column for every option', () => {
    // A new option needs its column in the rooms table and in toRoom.
    expect(Object.keys(toRoom(row).options).sort()).toEqual(
      Object.keys(DEFAULT_ROOM_OPTIONS).sort(),
    )
  })
})

describe('toRoom in the draft', () => {
  it('reads the clock once the draft is set up', () => {
    const shape = { G: 2, Z: 3, L: 2, M: 6, A: 5 }
    const room = toRoom({
      ...row,
      status: 'draft',
      pick_order: [2, 0, 1],
      squad_shape: shape,
      pick_no: 4,
      pick_deadline: '2026-10-22T00:00:45+00:00',
    })
    expect(room.draft).toEqual({
      order: [2, 0, 1],
      shape,
      pickNo: 4,
      deadline: new Date('2026-10-22T00:00:45Z'),
    })
    expect(toRoom(row).draft).toBeUndefined()
  })
})

describe('roomError', () => {
  it('turns the hint into a message, and anything else into a generic one', () => {
    expect(roomError({ hint: 'cheia' }).message).toBe('Essa sala já está cheia.')
    expect(roomError({ hint: null }).message).toMatch(/servidor/)
  })
})
