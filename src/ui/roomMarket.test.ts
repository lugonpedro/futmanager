import { describe, expect, it } from 'vitest'
import { toRoom, type RoomRow } from '../cloud/rooms.ts'
import type { PoolPlayer } from '../engine/room/start.ts'
import { feedLine, freePlayers, squadIds, tradesOpen } from './roomMarket.ts'

const row: RoomRow = {
  id: 1,
  name: 'Sala',
  owner_id: 'dono',
  pack: 'brasileirao-2026',
  status: 'liga',
  invite_code: 'ABCDEFGH',
  teams: 10,
  squad_size: 18,
  draft_order: 'serpentina',
  pick_seconds: 45,
  auto_reserves: false,
  legs: 2,
  injuries: 'normais',
  trades: 'ate-dois-tercos',
  created_at: '2026-10-20T00:00:00Z',
  pick_order: null,
  squad_shape: null,
  pick_no: 0,
  pick_deadline: null,
  round_no: 12,
  round_opened_at: '2026-10-23T10:00:00Z',
  rematch_id: null,
  room_members: [{ count: 2 }],
}

describe('tradesOpen', () => {
  it('follows the room option, up to two thirds of the rounds by default', () => {
    // 10 teams, two legs: 18 rounds, so trades close after round 12.
    expect(tradesOpen(toRoom(row))).toBe(true)
    expect(tradesOpen(toRoom({ ...row, round_no: 13 }))).toBe(false)
    expect(tradesOpen(toRoom({ ...row, round_no: 13, trades: 'temporada' }))).toBe(true)
    expect(tradesOpen(toRoom({ ...row, trades: 'desligadas' }))).toBe(false)
    expect(tradesOpen(toRoom({ ...row, status: 'encerrada', round_no: null }))).toBe(false)
  })
})

describe('free players', () => {
  const pool = ['a', 'b', 'c', 'd'].map(
    (id, rank) =>
      ({ id, name: id, position: 'M', overall: 70, age: 25, origin: 'X', rank }) as PoolPlayer,
  )
  const rosters = [
    { playerId: 'a', slot: 0 },
    { playerId: 'b', slot: 1 },
    { playerId: 'c', claimableFrom: 5 },
  ]

  it('leaves out the players on a team and says when a released one can be claimed', () => {
    expect(freePlayers(pool, rosters, 4)).toEqual([{ ...pool[2], from: 5 }, pool[3]])
    expect(freePlayers(pool, rosters, 5)).toEqual([pool[2], pool[3]])
    expect(squadIds(rosters, 1)).toEqual(['b'])
  })
})

describe('feedLine', () => {
  const team = (slot: number) => ['Ana FC', 'Bia FC'][slot]
  const player = (id: string) => id.toUpperCase()
  const base = { id: 1, round: 3, slot: 0 }

  it('tells each kind of move', () => {
    expect(
      feedLine(
        { ...base, kind: 'troca', otherSlot: 1, playersIn: ['x'], playersOut: ['y', 'z'] },
        team,
        player,
      ),
    ).toBe('Ana FC trocou Y e Z por X, do Bia FC.')
    expect(
      feedLine({ ...base, kind: 'dispensa', playersIn: [], playersOut: ['y'] }, team, player),
    ).toBe('Ana FC dispensou Y.')
    expect(
      feedLine({ ...base, kind: 'livre', playersIn: ['x'], playersOut: [] }, team, player),
    ).toBe('Ana FC contratou X.')
    expect(
      feedLine({ ...base, kind: 'livre', playersIn: ['x'], playersOut: ['y'] }, team, player),
    ).toBe('Ana FC contratou X e dispensou Y.')
  })
})
