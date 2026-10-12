import { describe, expect, it } from 'vitest'
import { generateWorld } from '../engine/generate/world.ts'
import { autoLineup } from '../engine/match/lineup.ts'
import { createMatch, type Play } from '../engine/match/simulate.ts'
import { createRng } from '../engine/rng.ts'
import { along, ballPath, CENTRE, formationSpots, shirtNumbers } from './pitchScene.ts'

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

describe('ballPath', () => {
  it('ends a goal in the net the side attacks', () => {
    expect(ballPath(play('home', 'goal'), CENTRE).at(-1)!.x).toBeGreaterThan(1)
    expect(ballPath(play('away', 'goal'), CENTRE).at(-1)!.x).toBeLessThan(0)
  })

  it('sends a miss wide of the posts and a save into the keeper', () => {
    const wide = ballPath(play('home', 'wide'), CENTRE).at(-1)!
    expect(Math.abs(wide.y - 0.5)).toBeGreaterThan(3.66 / 68)
    const saved = ballPath(play('home', 'saved'), CENTRE).at(-1)!
    expect(saved.x).toBeLessThan(1)
    expect(Math.abs(saved.y - 0.5)).toBeLessThan(3.66 / 68)
  })

  it('starts where the ball was and stops short when the move breaks down', () => {
    const from = { x: 0.3, y: 0.7 }
    const path = ballPath({ ...play('away', 'lost'), depth: 'midfield' }, from)
    expect(path[0]).toEqual(from)
    expect(path).toHaveLength(3)
    expect(along(path, 0)).toEqual(from)
    expect(along(path, 1)).toEqual(path.at(-1))
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
