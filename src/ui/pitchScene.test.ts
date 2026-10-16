import { describe, expect, it } from 'vitest'
import { generateWorld } from '../engine/generate/world.ts'
import { autoLineup } from '../engine/match/lineup.ts'
import { createMatch, type Play } from '../engine/match/simulate.ts'
import { createRng } from '../engine/rng.ts'
import { ballAt, ballLegs, CENTRE, facing, formationSpots, shirtNumbers } from './pitchScene.ts'

const world = generateWorld(2027)
const lineup = (id: string) =>
  autoLineup(
    world.clubs[id].playerIds.map((pid) => world.players[pid]),
    '4-3-3',
  )
const match = createMatch(
  {
    home: { club: world.clubs.C1, lineup: lineup('C1') },
    away: { club: world.clubs.C2, lineup: lineup('C2') },
    players: world.players,
  },
  createRng(1),
)

const play = (side: Play['side'], end: Play['end']): Play => ({
  minute: 10,
  side,
  lane: 'left',
  depth: 'attack',
  end,
})

describe('formationSpots', () => {
  it('puts each side in its own half, keeper deepest', () => {
    const home = formationSpots(match.home, 'home')
    const away = formationSpots(match.away, 'away')
    expect(home.size).toBe(11)
    for (const spot of home.values()) expect(spot.x).toBeLessThan(0.7)
    for (const spot of away.values()) expect(spot.x).toBeGreaterThan(0.3)
    const keeper = match.home.onPitch.find((p) => p.position === 'G')!.player.id
    expect(Math.min(...[...home.values()].map((s) => s.x))).toBe(home.get(keeper)!.x)
  })
})

const last = (play: Play, secondHalf = false) =>
  ballLegs(play, CENTRE, facing(play.side, secondHalf)).at(-1)!.to

describe('ballLegs', () => {
  it('ends a goal in the net the side attacks, and the other one after half-time', () => {
    expect(last(play('home', 'goal')).x).toBeGreaterThan(1)
    expect(last(play('away', 'goal')).x).toBeLessThan(0)
    expect(last(play('home', 'goal'), true).x).toBeLessThan(0)
    expect(last(play('away', 'goal'), true).x).toBeGreaterThan(1)
  })

  it('lets only the ball go on from the edge of the box when there is a shot', () => {
    const legs = ballLegs(play('home', 'goal'), CENTRE, 'home')
    const shot = legs.findIndex((leg) => leg.kind === 'shot')
    expect(legs[shot - 1].kind).toBe('carry')
    expect(legs[shot - 1].to.x).toBeLessThan(0.85)
    expect(legs.some((leg) => leg.kind === 'pass')).toBe(true)
  })

  it('sends a miss wide of the posts and a save into the keeper', () => {
    const wide = last(play('home', 'wide'))
    expect(Math.abs(wide.y - 0.5)).toBeGreaterThan(3.66 / 68)
    expect(wide.x).toBeGreaterThan(1)
    const held = ballLegs({ ...play('home', 'saved'), minute: 10 }, CENTRE, 'home').at(-1)!
    expect(held.kind).toBe('shot')
    expect(held.to.x).toBeLessThan(1)
    expect(Math.abs(held.to.y - 0.5)).toBeLessThan(3.66 / 68)
    const corner = last({ ...play('home', 'saved'), minute: 12 })
    expect(corner.x).toBeGreaterThan(1)
    expect(Math.abs(corner.y - 0.5)).toBeGreaterThan(3.66 / 68)
  })

  it('hands the ball to the defending side when the move is lost', () => {
    const legs = ballLegs({ ...play('away', 'lost'), depth: 'midfield' }, CENTRE, 'away')
    expect(legs.at(-1)!.owner).toBe('defend')
    expect(legs.slice(0, -1).every((leg) => leg.owner === 'attack')).toBe(true)
  })
})

describe('ballAt', () => {
  it('starts where the ball was, ends at the last leg and walks the legs in order', () => {
    const from = { x: 0.3, y: 0.7 }
    const legs = ballLegs(play('home', 'goal'), from, 'home')
    expect(ballAt(legs, from, 0)).toMatchObject({ pos: from, index: 0 })
    expect(ballAt(legs, from, 1)).toEqual({ pos: legs.at(-1)!.to, index: legs.length })
    const indexes = [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => ballAt(legs, from, t).index)
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b))
  })
})

describe('shirtNumbers', () => {
  it('gives the keeper 1 and numbers the bench after the XI', () => {
    const numbers = shirtNumbers(match.home)
    const keeper = match.home.onPitch.find((p) => p.position === 'G')!.player.id
    expect(numbers.get(keeper)).toBe(1)
    expect(numbers.get(match.home.bench[0].id)).toBe(12)
  })
})
