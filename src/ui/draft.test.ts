import { describe, expect, it } from 'vitest'
import type { DraftPick } from '../cloud/draft.ts'
import type { Room } from '../cloud/rooms.ts'
import type { PoolPlayer } from '../engine/room/start.ts'
import { DEFAULT_ROOM_OPTIONS } from '../engine/room/types.ts'
import {
  moveInQueue,
  pickProblem,
  positionCounts,
  roundOfPick,
  searchKey,
  secondsLeft,
  slotOnTheClock,
  squadsOf,
} from './draft.ts'

const room = (pickNo: number, options = DEFAULT_ROOM_OPTIONS): Room => ({
  id: 1,
  name: 'Sala',
  ownerId: 'u',
  pack: 'brasileirao-2026',
  status: 'draft',
  inviteCode: 'ABCD2345',
  options,
  draftAt: new Date(),
  createdAt: new Date(),
  members: 1,
  draft: { order: [2, 0, 1, 3], shape: { G: 2, Z: 1, L: 0, M: 0, A: 1 }, pickNo },
})
const four = { ...DEFAULT_ROOM_OPTIONS, teams: 4, squadSize: 4 as never }

const player = (id: string, position: PoolPlayer['position']): PoolPlayer => ({
  id,
  name: id,
  position,
  overall: 70,
  age: 25,
  origin: 'FLA',
  rank: 0,
})
const pool = new Map(
  [
    player('g1', 'G'),
    player('g2', 'G'),
    player('a1', 'A'),
    player('a2', 'A'),
    player('a3', 'A'),
  ].map((p) => [p.id, p]),
)

describe('the clock', () => {
  it('follows the snake order from the room', () => {
    expect([0, 3, 4, 7].map((n) => slotOnTheClock(room(n, four)))).toEqual([2, 3, 3, 2])
    expect(slotOnTheClock(room(16, four))).toBeUndefined()
  })

  it('counts rounds and seconds', () => {
    expect(roundOfPick(9, 4)).toEqual({ round: 3, inRound: 2 })
    expect(secondsLeft(new Date(10_500), 0)).toBe(11)
    expect(secondsLeft(new Date(0), 5000)).toBe(0)
    expect(secondsLeft(undefined, 0)).toBe(0)
  })
})

describe('pickProblem', () => {
  const picks: DraftPick[] = [
    { pick: 0, slot: 2, playerId: 'a1', auto: false },
    { pick: 7, slot: 2, playerId: 'a2', auto: false },
  ]

  it('refuses a player taken already', () => {
    expect(pickProblem(room(8, four), pool, picks, 0, 'a1')).toMatch(/já foi escolhido/)
  })

  it('keeps two places for keepers, as the server does', () => {
    // Two attackers in a squad of four: only keepers now.
    expect(pickProblem(room(8, four), pool, picks, 2, 'a3')).toMatch(/goleiros/)
    expect(pickProblem(room(8, four), pool, picks, 2, 'g1')).toBeUndefined()
    expect(pickProblem(room(8, four), pool, picks, 0, 'a3')).toBeUndefined()
  })

  it('splits squads and counts positions', () => {
    expect(squadsOf(picks).get(2)).toEqual(['a1', 'a2'])
    expect(positionCounts(['a1', 'g1', 'a2'], pool)).toEqual({ G: 1, Z: 0, L: 0, M: 0, A: 2 })
  })
})

describe('queue and search', () => {
  it('moves a player within the queue', () => {
    expect(moveInQueue(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b'])
    expect(moveInQueue(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
  })

  it('ignores accents and case', () => {
    expect(searchKey(' Gérson ')).toBe('gerson')
  })
})
