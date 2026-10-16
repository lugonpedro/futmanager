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

/** The home side attacks to the right; the away side's picture is the home one turned round. */
const mirror = (side: MatchSide, p: Vec): Vec => (side === 'home' ? p : { x: 1 - p.x, y: 1 - p.y })

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
 * The ball's route through a play, as points to pass through in order. It
 * starts where the last play left it, goes down the lane to the depth the
 * move reached and, if there was a shot, finishes in the net, in the keeper's
 * hands or past the post.
 */
export function ballPath(play: Play, from: Vec): Vec[] {
  const own = (p: Vec) => mirror(play.side, p)
  const start = own(from)
  const depth = DEPTH_REACHED[play.depth]
  const laneY = LANE_Y[play.lane]
  const reached = { x: depth, y: laneY }
  const points = [start, { x: (start.x + depth) / 2, y: (start.y + laneY) / 2 }, reached]
  if (play.end === 'goal' || play.end === 'saved' || play.end === 'wide') {
    // Cut inside for the shot, from the edge of the box.
    points.push({ x: 0.83, y: 0.5 + (laneY - 0.5) * 0.4 })
    const post = laneY < 0.5 ? 0.39 : 0.61
    points.push(
      play.end === 'goal'
        ? { x: 1.015, y: 0.5 + (laneY - 0.5) * 0.06 }
        : play.end === 'saved'
          ? { x: 0.965, y: 0.5 + (laneY - 0.5) * 0.04 }
          : { x: 1.02, y: post },
    )
  }
  return [from, ...points.slice(1).map(own)]
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/** The point `t` (0 to 1) of the way along a path, easing in and out of each pass. */
export function along(path: readonly Vec[], t: number): Vec {
  if (path.length === 1 || t <= 0) return path[0]
  if (t >= 1) return path[path.length - 1]
  const scaled = t * (path.length - 1)
  const i = Math.floor(scaled)
  const k = ease(scaled - i)
  const a = path[i]
  const b = path[i + 1]
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}

/** Shirt numbers for the match: the keeper wears 1, the XI from the back up, then the bench. */
export function shirtNumbers(team: TeamState): Map<string, number> {
  const order: Position[] = ['G', 'L', 'Z', 'M', 'A']
  const starters = order.flatMap((pos) => team.onPitch.filter((p) => p.position === pos))
  const ids = [...starters.map((p) => p.player.id), ...team.bench.map((p) => p.id)]
  return new Map(ids.map((id, i) => [id, i + 1]))
}
