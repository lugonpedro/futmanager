import type { MatchSide, OnPitch, Play } from '../engine/match/simulate.ts'
import { followBall, legStart, type BallLeg, type Vec } from './pitchScene.ts'

/**
 * How the dots on the 2D pitch move, apart from the drawing so it can be
 * tested. Each player runs on his own: he has a top speed and acceleration
 * of his own, reads the ball a little late, and heads for a spot that depends
 * on his role and on where the ball is relative to him, not only on the
 * formation.
 */

/** The pitch in metres, so a step across it costs the same as one along it. */
const LENGTH = 105
const WIDTH = 68

/** The play speed the speeds below are tuned for (`PLAY_SPEEDS.Normal`). */
export const BASE_UNIT_MS = 650

/**
 * Speeds and accelerations in metres per second (squared) at normal play
 * speed. They are far above real ones because a whole minute is acted out
 * in about a second.
 */
export const PACE = {
  /** Off the ball, keeping shape. */
  jog: { top: 24, accel: 130 },
  /** Making a run: to receive a pass, to press, or the keeper to a save. */
  sprint: { top: 55, accel: 260 },
}

/** Within this distance of the ball, in metres, the carrier has it at his feet. */
export const CONTROL = 2.5

export type Motion = { pos: Vec; vel: Vec }

/**
 * One step of a player towards `target`: he speeds up and slows down at no
 * more than `accel`, never goes faster than `top`, and brakes in time to stop
 * on the spot rather than overshoot it. `vel` is in metres per second.
 */
export function steer(
  { pos, vel }: Motion,
  target: Vec,
  dt: number,
  top: number,
  accel: number,
): Motion {
  const dx = (target.x - pos.x) * LENGTH
  const dy = (target.y - pos.y) * WIDTH
  const dist = Math.hypot(dx, dy)
  // The speed from which he can still stop in the distance left.
  const want = Math.min(top, Math.sqrt(2 * accel * dist))
  const desired = dist > 1e-6 ? { x: (dx / dist) * want, y: (dy / dist) * want } : { x: 0, y: 0 }
  let ax = desired.x - vel.x
  let ay = desired.y - vel.y
  const change = Math.hypot(ax, ay)
  const most = accel * dt
  if (change > most) [ax, ay] = [(ax / change) * most, (ay / change) * most]
  const next = { x: vel.x + ax, y: vel.y + ay }
  let sx = next.x * dt
  let sy = next.y * dt
  // Never past the spot in one step.
  if (Math.hypot(sx, sy) > dist) [sx, sy] = [dx, dy]
  return { pos: { x: pos.x + sx / LENGTH, y: pos.y + sy / WIDTH }, vel: next }
}

/** Distance between two points of the pitch, in metres. */
export const metres = (a: Vec, b: Vec) => Math.hypot((a.x - b.x) * LENGTH, (a.y - b.y) * WIDTH)

/** A small, steady number from a player's id, so each one moves a little differently. */
function hash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export type Traits = {
  /** Multiplies his top speed. */
  speed: number
  /** Multiplies his acceleration. */
  burst: number
  /** How quickly he reads where the ball is, per second. */
  reaction: number
  /** Where he is in his drift around his spot. */
  phase: number
}

/**
 * How a player moves: the quick and the sharp faster, the tired slower, and
 * the ones who read the game well quicker to react.
 */
export function traitsOf(p: OnPitch): Traits {
  const a = p.player.attributes
  const tired = 0.8 + 0.2 * Math.min(1, Math.max(0, p.energy / 100))
  const read = Math.max(a.vision, a.attackPositioning, a.interceptions) / 99
  return {
    speed: (0.8 + 0.35 * (a.sprintSpeed / 99)) * tired,
    burst: (0.8 + 0.35 * (a.acceleration / 99)) * tired,
    reaction: 2 + 3 * read + hash(p.player.id),
    phase: hash(`${p.player.id}:phase`) * Math.PI * 2,
  }
}

const mirror = (side: MatchSide, p: Vec): Vec => (side === 'home' ? p : { x: 1 - p.x, y: 1 - p.y })
const clamp = (v: number, min = 0.02, max = 0.98) => Math.min(max, Math.max(min, v))

/**
 * Where a player off the ball heads for. The block still slides with the ball
 * (`followBall`), but each player then adjusts by his role and by how close
 * the ball is to him: the near ones squeeze towards it, forwards attack the
 * box, a lateral on the ball's side overlaps, defenders stay goal side.
 * `seen` is where he believes the ball is, `time` in seconds keeps him from
 * standing perfectly still.
 */
export function offBallTarget(args: {
  player: OnPitch
  spot: Vec
  seen: Vec
  end: MatchSide
  inPossession: boolean
  traits: Traits
  time: number
}): Vec {
  const { player, spot, seen, end, inPossession, traits, time } = args
  const keeper = player.position === 'G'
  const base = followBall(spot, seen, end, inPossession, keeper)
  if (keeper) return base
  // Worked out as the home side sees it, attacking to the right.
  const at = mirror(end, seen)
  const own = mirror(end, spot)
  let { x, y } = mirror(end, base)
  const role = player.role
  const closeness = 1 - Math.min(1, Math.abs(at.x - x) / 0.35)
  const ballSide = own.y < 0.5 === at.y < 0.5

  if (inPossession) {
    // Close teammates come towards the ball to offer a pass.
    y += (at.y - y) * 0.15 * closeness
    if (player.position === 'A' && at.x > 0.5) {
      // Forwards run in behind, into the box.
      x = Math.max(x, Math.min(0.87, at.x + 0.06 + 0.04 * Math.sin(traits.phase)))
      y = 0.5 + (y - 0.5) * 0.7
    } else if ((player.position === 'L' || role === 'ALA') && ballSide && at.x > 0.4) {
      // The lateral on the ball's side overlaps.
      x += 0.12 * Math.min(1, (at.x - 0.4) / 0.3)
      y = own.y < 0.5 ? Math.min(y, 0.1) : Math.max(y, 0.9)
    } else if (role === 'MEI' || role === 'MC') {
      x += (at.x - 0.05 - x) * 0.25
    }
  } else {
    // Without the ball the side closes in on it, the near ones most.
    y += (at.y - y) * 0.3 * closeness
    if (player.position === 'Z' || player.position === 'L') {
      // Defenders stay between the ball and their goal.
      x = Math.min(x, at.x - 0.04)
    } else if (player.position === 'M' && at.x < 0.5) {
      x = Math.min(x, at.x + 0.02)
    }
  }
  // Nobody stands still: a slow drift of a metre or two around the spot.
  x += 0.012 * Math.sin(time * 0.9 + traits.phase)
  y += 0.02 * Math.sin(time * 0.7 + traits.phase * 1.7)
  return mirror(end, { x: clamp(x, 0.04, 0.96), y: clamp(y) })
}

/**
 * Where a defender pressing the ball heads for: just goal side of it. The
 * nearest one goes to the ball, the next covers a few metres behind.
 */
export function pressTarget(ball: Vec, end: MatchSide, cover: boolean): Vec {
  const at = mirror(end, ball)
  const back = cover ? 0.08 : 0.015
  return mirror(end, { x: clamp(at.x - back, 0.04, 0.96), y: clamp(at.y + (0.5 - at.y) * 0.15) })
}

/** How far from where a pass lands the shooter can be and still get to it in time, in metres. */
const REACH = 22

/**
 * Who has the ball on each leg of the attacking side's move, decided as the
 * play starts so a receiver can already be making his run while the ball is
 * on its way: the player nearest the ball carries it, the pass goes to the
 * teammate nearest where it lands, and he carries it on. In a move that ends
 * in a shot the shooter receives it, if he is near enough to get there. Legs the defending side has
 * are left out and picked as they start.
 */
export function planRunners(
  play: Play,
  legs: readonly BallLeg[],
  from: Vec,
  team: readonly OnPitch[],
  at: (id: string) => Vec | undefined,
): Map<number, string> {
  const runners = new Map<number, string>()
  const outfield = team.filter((p) => p.position !== 'G' && at(p.player.id))
  const nearest = (spot: Vec, not?: string) => {
    let best: string | undefined
    let bestDist = Infinity
    for (const p of outfield) {
      if (p.player.id === not) continue
      const d = metres(at(p.player.id)!, spot)
      if (d < bestDist) [bestDist, best] = [d, p.player.id]
    }
    return best
  }
  const shot = play.end === 'goal' || play.end === 'saved' || play.end === 'wide'
  const shooter = shot ? outfield.find((p) => p.player.id === play.playerId)?.player.id : undefined
  let carrier: string | undefined
  for (let index = 0; index < legs.length; index++) {
    const leg = legs[index]
    if (leg.owner !== 'attack' || leg.kind === 'shot' || leg.kind === 'loose') break
    if (leg.kind === 'pass') {
      const close = shooter && shooter !== carrier && metres(at(shooter)!, leg.to) < REACH
      const receiver = close ? shooter : (nearest(leg.to, carrier) ?? carrier)
      if (receiver) runners.set(index, receiver)
      carrier = receiver
    } else {
      carrier ??= nearest(legStart(legs, from, index))
      if (carrier) runners.set(index, carrier)
    }
  }
  return runners
}
