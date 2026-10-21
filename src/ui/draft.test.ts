import { describe, expect, it } from 'vitest'
import type { DraftPick } from '../cloud/draft.ts'
import type { Room } from '../cloud/rooms.ts'
import type { PoolPlayer } from '../engine/room/start.ts'
import { DEFAULT_ROOM_OPTIONS } from '../engine/room/types.ts'
import {
  draftPlayers,
  moveInQueue,
  pickProblem,
  picksUntil,
  roundOrder,
  startersAndReserves,
  withLiveClock,
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

describe('the draft screen', () => {
  const serpent = { ...four, draftOrder: 'serpentina' as const }

  it('counts the picks until a place picks again', () => {
    // Order 2, 0, 1, 3 then back: 3, 1, 0, 2.
    expect(picksUntil(room(0, serpent), 2)).toBe(0)
    expect(picksUntil(room(1, serpent), 2)).toBe(6)
    expect(picksUntil(room(1, serpent), 3)).toBe(2)
    expect(picksUntil(room(15, serpent), 1)).toBeUndefined()
  })

  it('splits a squad into eleven and reserves, keepers first', () => {
    const rated = (id: string, position: PoolPlayer['position'], overall: number) => ({
      ...player(id, position),
      overall,
    })
    const squad = [
      rated('g1', 'G', 80),
      rated('g2', 'G', 70),
      rated('z1', 'Z', 75),
      rated('z2', 'Z', 74),
      rated('z3', 'Z', 60),
      rated('l1', 'L', 72),
      rated('m1', 'M', 79),
      rated('m2', 'M', 78),
      rated('m3', 'M', 77),
      rated('a1', 'A', 85),
      rated('a2', 'A', 84),
      rated('a3', 'A', 83),
      rated('a4', 'A', 50),
    ]
    const { starters, reserves } = startersAndReserves(squad)
    // One full-back and three midfielders short: the best outfielders left fill in.
    expect(starters.map((p) => p.id)).toEqual(
      ['g1', 'z1', 'z2', 'l1', 'm1', 'm2', 'm3', 'a1', 'a2', 'a3', 'z3'].sort(
        (a, b) => 'GZLMA'.indexOf(a[0].toUpperCase()) - 'GZLMA'.indexOf(b[0].toUpperCase()),
      ),
    )
    expect(reserves.map((p) => p.id)).toEqual(['g2', 'a4'])
  })

  it('lists the order of the round under way', () => {
    expect(roundOrder(room(1, serpent))).toEqual([2, 0, 1, 3])
    expect(roundOrder(room(5, serpent))).toEqual([3, 1, 0, 2])
    expect(roundOrder(room(16, serpent))).toEqual([3, 1, 0, 2])
  })

  it('takes the newer clock', () => {
    const deadline = new Date('2026-10-21T21:00:30Z')
    expect(withLiveClock(room(3), { pickNo: 4, deadline }).draft?.pickNo).toBe(4)
    expect(withLiveClock(room(5), { pickNo: 4, deadline }).draft?.pickNo).toBe(5)
  })
})

describe('draftPlayers', () => {
  const pool = [player('a', 'M'), player('b', 'M'), player('c', 'A')]
  const picks: DraftPick[] = [{ pick: 0, slot: 0, playerId: 'a', auto: false, primeBoost: 9 }]

  it('boosts the primes taken and the one dealt now, and no one else', () => {
    const byId = draftPlayers(pool, picks, {
      pick: 1,
      slot: 1,
      slotIndex: 3,
      playerIds: ['b', 'c'],
      prime: { playerId: 'c', boost: 11 },
    })
    expect(byId.get('a')).toMatchObject({ overall: pool[0].overall + 9, prime: 9 })
    expect(byId.get('b')).toBe(pool[1])
    expect(byId.get('c')).toMatchObject({ overall: pool[2].overall + 11, prime: 11 })
  })
})
