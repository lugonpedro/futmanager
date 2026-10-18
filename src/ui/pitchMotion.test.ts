import { describe, expect, it } from 'vitest'
import { generateWorld } from '../engine/generate/world.ts'
import { autoLineup } from '../engine/match/lineup.ts'
import { createMatch, type Play } from '../engine/match/simulate.ts'
import { createRng } from '../engine/rng.ts'
import { metres, offBallTarget, planRunners, steer, traitsOf, type Motion } from './pitchMotion.ts'
import { ballLegs, CENTRE, formationSpots, type Vec } from './pitchScene.ts'

const world = generateWorld(2027)
const lineup = (id: string) =>
  autoLineup(
    world.clubs[id].playerIds.map((pid) => world.players[pid]),
    '4-4-2',
  )
const match = createMatch(
  {
    home: { club: world.clubs.C1, lineup: lineup('C1') },
    away: { club: world.clubs.C2, lineup: lineup('C2') },
    players: world.players,
  },
  createRng(1),
)

const speed = (m: Motion) => Math.hypot(m.vel.x, m.vel.y)

describe('steer', () => {
  it('speeds up gradually, never past the top speed', () => {
    let m: Motion = { pos: { x: 0.1, y: 0.5 }, vel: { x: 0, y: 0 } }
    const dt = 1 / 60
    let last = 0
    for (let i = 0; i < 30; i++) {
      m = steer(m, { x: 0.9, y: 0.5 }, dt, 20, 100)
      expect(speed(m) - last).toBeLessThanOrEqual(100 * dt + 1e-9)
      expect(speed(m)).toBeLessThanOrEqual(20 + 1e-9)
      last = speed(m)
    }
    // A tenth of a second in, still well short of full speed: no jump.
    m = steer({ pos: { x: 0.1, y: 0.5 }, vel: { x: 0, y: 0 } }, { x: 0.9, y: 0.5 }, 0.1, 20, 100)
    expect(metres(m.pos, { x: 0.1, y: 0.5 })).toBeLessThan(1.5)
  })

  it('brakes and stops on the spot', () => {
    const target = { x: 0.6, y: 0.3 }
    let m: Motion = { pos: { x: 0.4, y: 0.6 }, vel: { x: 0, y: 0 } }
    for (let i = 0; i < 600; i++) m = steer(m, target, 1 / 60, 20, 100)
    expect(metres(m.pos, target)).toBeLessThan(0.05)
    expect(speed(m)).toBeLessThan(0.5)
  })
})

describe('offBallTarget', () => {
  const spots = formationSpots(match.home, 'home')
  const at = (id: string, ball: Vec, inPossession: boolean) => {
    const player = match.home.onPitch.find((p) => p.player.id === id)!
    return offBallTarget({
      player,
      spot: spots.get(id)!,
      seen: ball,
      end: 'home',
      inPossession,
      traits: { ...traitsOf(player), phase: 0 },
      time: 0,
    })
  }
  const shift = (id: string, from: Vec, to: Vec, inPossession: boolean) => {
    const a = at(id, from, inPossession)
    const b = at(id, to, inPossession)
    return { x: b.x - a.x, y: b.y - a.y }
  }
  const ids = (position: string) =>
    match.home.onPitch.filter((p) => p.position === position).map((p) => p.player.id)

  it('does not move the whole side as one block', () => {
    // The ball goes from the middle out to one wing: players react by role
    // and distance, so they do not all shift alike.
    const moves = match.home.onPitch
      .filter((p) => p.position !== 'G')
      .map((p) => shift(p.player.id, { x: 0.5, y: 0.5 }, { x: 0.35, y: 0.1 }, false))
    const ys = moves.map((m) => m.y.toFixed(3))
    expect(new Set(ys).size).toBeGreaterThan(3)
  })

  it('sends the forwards into the box when the side attacks', () => {
    for (const id of ids('A')) {
      expect(at(id, { x: 0.75, y: 0.5 }, true).x).toBeGreaterThan(0.75)
    }
  })

  it('keeps the defenders goal side of the ball', () => {
    for (const id of [...ids('Z'), ...ids('L')]) {
      expect(at(id, { x: 0.3, y: 0.5 }, false).x).toBeLessThan(0.3)
    }
  })
})

describe('planRunners', () => {
  const spots = formationSpots(match.home, 'home')
  const where = (id: string) => spots.get(id)

  it('has the receiver of the pass carry the ball on', () => {
    const play: Play = { minute: 10, side: 'home', lane: 'left', depth: 'midfield', end: 'lost' }
    const legs = ballLegs(play, CENTRE, 'home')
    const runners = planRunners(play, legs, CENTRE, match.home.onPitch, where)
    const pass = legs.findIndex((leg) => leg.kind === 'pass')
    expect(runners.get(pass)).toBeDefined()
    expect(runners.get(pass)).not.toBe(runners.get(pass - 1))
    expect(runners.get(pass + 1)).toBe(runners.get(pass))
    // The tackle belongs to the other side and is picked when it happens.
    expect(runners.has(legs.length - 1)).toBe(false)
  })

  it('gives the shot to the shooter', () => {
    const striker = match.home.onPitch.find((p) => p.position === 'A')!.player.id
    const play: Play = {
      minute: 10,
      side: 'home',
      lane: 'center',
      depth: 'attack',
      end: 'goal',
      playerId: striker,
    }
    const legs = ballLegs(play, CENTRE, 'home')
    const runners = planRunners(play, legs, CENTRE, match.home.onPitch, where)
    const shot = legs.findIndex((leg) => leg.kind === 'shot')
    expect(runners.get(shot - 1)).toBe(striker)
  })
})
