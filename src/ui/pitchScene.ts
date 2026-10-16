import type { MatchSide, Play, PlayDepth, PlayLane, TeamState } from '../engine/match/simulate.ts'
import { formationLines } from '../engine/match/lineup.ts'
import type { Position } from '../engine/model/types.ts'

/**
 * Geometry of the 2D pitch view, kept apart from the drawing so it can be
 * tested. Coordinates are fractions of the pitch: x runs from the home goal
 * line (0) to the away goal line (1), y from one touchline (0) to the other (1).
 */
export type Vec = { x: number; y: number }

export const CENTRE: Vec = { x: 0.5, y: 0.5 }

/** How far up the pitch each position stands, for the home side. */
const DEPTH_OF: Record<Position, number> = { G: 0.05, Z: 0.2, L: 0.24, M: 0.44, A: 0.64 }

/** A split midfield: the holding line drops back, the other pushes up. */
const MIDFIELD_LINE_DEPTHS = [0.34, 0.5]

/** Fraction of the move each play type takes, in units of the chosen speed. */
const DURATION: Record<Play['end'], number> = { lost: 1, foul: 1.5, wide: 2, saved: 2, goal: 4 }

export const playDuration = (play: Play | undefined) => (play ? DURATION[play.end] : 1)

/**
 * Share of the play's time the ball spends moving; the rest is a pause, long
 * enough after a goal to celebrate it before the next minute.
 */
export const movingShare = (play: Play | undefined) => (play?.end === 'goal' ? 0.55 : 0.9)

/**
 * The picture is drawn as `side` sees it: the home side attacks to the right,
 * the away side's picture is the home one turned round.
 */
const mirror = (side: MatchSide, p: Vec): Vec => (side === 'home' ? p : { x: 1 - p.x, y: 1 - p.y })

const other = (side: MatchSide): MatchSide => (side === 'home' ? 'away' : 'home')

/**
 * Which way a side faces at a minute, as the side whose picture it takes: in
 * the first half the home side attacks to the right, and from the 46th
 * minute the two swap ends.
 */
export const facing = (side: MatchSide, secondHalf: boolean): MatchSide =>
  secondHalf ? other(side) : side

const spread = (count: number, i: number) => (i + 1) / (count + 1)

/**
 * Where each player stands in the side's formation, before following the
 * ball. Laterais take the ends of the back line, the centre-backs the middle.
 */
export function formationSpots(team: TeamState, side: MatchSide): Map<string, Vec> {
  const spots = new Map<string, Vec>()
  const lines = formationLines(team.onPitch, team.formation)
  const midfield = lines.filter((line) => line[0].position === 'M')
  for (const line of lines) {
    const split = midfield.length > 1 ? midfield.indexOf(line) : -1
    line.forEach((p, i) => {
      const y = line.length === 1 ? 0.5 : 0.08 + 0.84 * spread(line.length, i)
      const x = split >= 0 ? MIDFIELD_LINE_DEPTHS[split] : DEPTH_OF[p.position]
      spots.set(p.player.id, mirror(side, { x, y }))
    })
  }
  return spots
}

const clamp = (v: number, min = 0.02, max = 0.98) => Math.min(max, Math.max(min, v))

/**
 * Where a player heads for, given the ball: the whole block slides with it,
 * the side with the ball pushes up and opens out, the other drops and closes in.
 */
export function followBall(
  spot: Vec,
  ball: Vec,
  side: MatchSide,
  inPossession: boolean,
  keeper: boolean,
): Vec {
  // Worked out as the home side sees it, attacking to the right.
  const own = mirror(side, spot)
  const at = mirror(side, ball)
  if (keeper) {
    return mirror(side, { x: own.x + (at.x - 0.5) * 0.06, y: 0.5 + (at.y - 0.5) * 0.25 })
  }
  // Pressed back, the block squeezes towards its goal; pushing on, it moves up.
  const x = at.x < 0.5 ? own.x * (0.55 + 0.9 * at.x) : own.x + (at.x - 0.5) * 0.5
  const y = inPossession ? 0.5 + (own.y - 0.5) * 1.1 : own.y + (at.y - own.y) * 0.3
  return mirror(side, {
    x: clamp(x + (inPossession ? 0.05 : -0.03), 0.08, 0.95),
    y: clamp(y),
  })
}

const DEPTH_REACHED: Record<PlayDepth, number> = { defense: 0.3, midfield: 0.55, attack: 0.8 }
const LANE_Y: Record<PlayLane, number> = { left: 0.2, center: 0.5, right: 0.8 }

/**
 * One stretch of the ball's route. `carry` is a player running with it,
 * `pass` and `shot` the ball travelling alone, `loose` the ball rolling on
 * after a save or a miss. `owner` says which side has it: the side making
 * the play or, after a tackle, the side defending. `weight` is the stretch's
 * share of the play's time.
 */
export type BallLeg = {
  to: Vec
  kind: 'carry' | 'pass' | 'shot' | 'loose'
  owner: 'attack' | 'defend'
  weight: number
  /** Sideways bend of a shot, as a fraction of its length. */
  curve?: number
}

const legOf = (
  to: Vec,
  kind: BallLeg['kind'],
  weight: number,
  owner: BallLeg['owner'] = 'attack',
) => ({ to, kind, owner, weight }) satisfies BallLeg

/** Saves pushed out for a corner rather than held; the rest the keeper keeps. */
const isCorner = (play: Play) => play.minute % 3 === 0

/**
 * The ball's route through a play, from where the last play left it. A
 * player carries it, passes to a teammate, who carries it on down the lane
 * to the depth the move reached. Then, by how the play ended:
 * - lost: a defender takes the ball and the other side moves off with it;
 * - foul: the ball stops where the move was fouled;
 * - a shot: the shooter stops at the edge of the box and only the ball goes
 *   on, quickly and with a slight bend, into the net, into the keeper's
 *   hands (sometimes pushed out for a corner) or past the post.
 * `end` is the side whose picture the play is drawn in (see `facing`).
 */
export function ballLegs(play: Play, from: Vec, end: MatchSide): BallLeg[] {
  const own = (p: Vec) => mirror(end, p)
  const start = mirror(end, from)
  const laneY = LANE_Y[play.lane]
  const reached = { x: DEPTH_REACHED[play.depth], y: laneY }
  const first = { x: start.x + (reached.x - start.x) * 0.3, y: start.y + (laneY - start.y) * 0.3 }
  const wide = laneY === 0.5 ? (first.y < 0.5 ? -0.1 : 0.1) : (laneY - 0.5) * 0.25
  const pass = {
    x: (first.x + reached.x) / 2,
    y: clamp((first.y + laneY) / 2 + wide, 0.06, 0.94),
  }
  const legs: BallLeg[] = [
    legOf(first, 'carry', 1),
    legOf(pass, 'pass', 0.45),
    legOf(reached, 'carry', 0.8),
  ]
  if (play.end === 'lost') {
    legs.push(legOf({ x: reached.x - 0.08, y: reached.y }, 'carry', 0.7, 'defend'))
  } else if (play.end !== 'foul') {
    const edge = { x: 0.8, y: 0.5 + (laneY - 0.5) * 0.45 }
    const bend = laneY < 0.5 ? 0.08 : -0.08
    legs.push(legOf(edge, 'carry', 0.6))
    if (play.end === 'goal') {
      const net = { x: 1.012, y: 0.5 + (laneY - 0.5) * 0.06 }
      legs.push({ ...legOf(net, 'shot', 0.4), curve: bend })
      legs.push(legOf({ x: 1.03, y: net.y }, 'loose', 0.15))
    } else if (play.end === 'saved') {
      const hands = { x: 0.965, y: 0.5 + (laneY - 0.5) * 0.04 }
      legs.push({ ...legOf(hands, 'shot', 0.4), curve: bend })
      if (isCorner(play)) legs.push(legOf({ x: 1.03, y: laneY < 0.5 ? 0.38 : 0.62 }, 'loose', 0.4))
    } else {
      const post = laneY < 0.5 ? 0.4 : 0.6
      legs.push({ ...legOf({ x: 1, y: post }, 'shot', 0.4), curve: bend })
      legs.push(legOf({ x: 1.04, y: post + (post - 0.5) * 0.4 }, 'loose', 0.3))
    }
  }
  return legs.map((leg) => ({ ...leg, to: own(leg.to) }))
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const easeOut = (t: number) => 1 - (1 - t) ** 2

/**
 * Where the ball is `t` (0 to 1) of the way through its legs, and which leg
 * it is on (`index` is the number of legs once it has stopped). A carried
 * ball eases in and out; a passed, shot or loose one leaves fast and slows.
 */
export function ballAt(
  legs: readonly BallLeg[],
  from: Vec,
  t: number,
): { pos: Vec; index: number; leg?: BallLeg } {
  if (legs.length === 0) return { pos: from, index: 0 }
  if (t >= 1) return { pos: legs[legs.length - 1].to, index: legs.length }
  const total = legs.reduce((sum, leg) => sum + leg.weight, 0)
  let left = Math.max(0, t) * total
  let start = from
  for (let index = 0; index < legs.length; index++) {
    const leg = legs[index]
    if (left <= leg.weight || index === legs.length - 1) {
      const u = Math.min(1, left / leg.weight)
      const k = leg.kind === 'carry' ? easeInOut(u) : easeOut(u)
      const end = leg.to
      // A bent shot follows a curve that peaks halfway, off to one side.
      const bend = (leg.curve ?? 0) * 4 * k * (1 - k)
      const dx = end.x - start.x
      const dy = end.y - start.y
      return {
        pos: { x: start.x + dx * k - dy * bend, y: start.y + dy * k + dx * bend },
        index,
        leg,
      }
    }
    left -= leg.weight
    start = leg.to
  }
  return { pos: legs[legs.length - 1].to, index: legs.length }
}

/** Where a leg starts: where the one before it ended. */
export const legStart = (legs: readonly BallLeg[], from: Vec, index: number) =>
  index === 0 ? from : legs[index - 1].to

/** Shirt numbers for the match: the keeper wears 1, the XI from the back up, then the bench. */
export function shirtNumbers(team: TeamState): Map<string, number> {
  const order: Position[] = ['G', 'L', 'Z', 'M', 'A']
  const starters = order.flatMap((pos) => team.onPitch.filter((p) => p.position === pos))
  const ids = [...starters.map((p) => p.player.id), ...team.bench.map((p) => p.id)]
  return new Map(ids.map((id, i) => [id, i + 1]))
}
