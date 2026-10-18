import { useEffect, useRef, useState } from 'react'
import type { MatchSide, MatchState, Play } from '../../engine/match/simulate.ts'
import { textOn, type Kit } from '../kits.ts'
import {
  BASE_UNIT_MS,
  CONTROL,
  metres,
  offBallTarget,
  PACE,
  planRunners,
  pressTarget,
  steer,
  traitsOf,
  type Traits,
} from '../pitchMotion.ts'
import {
  ballAt,
  ballLegs,
  CENTRE,
  facing,
  formationSpots,
  legStart,
  movingShare,
  playDuration,
  shirtNumbers,
  type BallLeg,
  type Vec,
} from '../pitchScene.ts'

/** Below this width the pitch stands upright, home goal at the bottom. */
const UPRIGHT_BELOW = 520
/** Real pitch proportions, 105 m by 68 m. */
const ASPECT = 68 / 105
/** How long a player who left the pitch takes to walk off, in seconds. */
const WALK_OFF = 1.6

type Dot = {
  pos: Vec
  /** Metres per second. */
  vel: Vec
  /** Where the player believes the ball is: he reads it a little late. */
  seen: Vec
  traits: Traits
  side: MatchSide
  leftAt?: number
  from?: Vec
}

type Scene = {
  play?: Play
  legs: BallLeg[]
  /** Where the ball was when the play began. */
  from: Vec
  /**
   * Who has the ball on each leg, chosen as the play starts so a receiver,
   * or the defender who will win the ball, makes his run early.
   */
  runners: Map<number, string>
  start: number
  duration: number
  /** How much faster than normal play speed the players move. */
  tempo: number
  ball: Vec
  dots: Map<string, Dot>
  last: number
  kickedOff?: boolean
}

const other = (side: MatchSide): MatchSide => (side === 'home' ? 'away' : 'home')
const near = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * The match acted out on a 2D pitch: 22 dots and a ball replaying, minute by
 * minute, the plays the engine already decided. `unitMs` is how long the
 * shortest play lasts at the chosen speed; the screen waits the same time
 * before playing the next minute, so the picture and the commentary stay in step.
 */
export function MatchPitch(props: {
  state: MatchState
  unitMs: number
  kits: Record<MatchSide, Kit>
}) {
  const { state, unitMs, kits } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [numbers] = useState(
    () => new Map([...shirtNumbers(state.home), ...shirtNumbers(state.away)]),
  )
  const sceneRef = useRef<Scene>({
    legs: [],
    from: CENTRE,
    runners: new Map(),
    start: 0,
    duration: 1,
    tempo: 1,
    ball: CENTRE,
    dots: new Map(),
    last: 0,
  })

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // A new minute was played: start acting out its play from where the ball is.
  const plays = state.plays.length
  useEffect(() => {
    const scene = sceneRef.current
    const play = state.plays.at(-1)
    if (!play || play === scene.play) return
    scene.play = play
    scene.from = scene.ball
    scene.legs = ballLegs(play, scene.ball, facing(play.side, play.minute > 45))
    scene.runners = planRunners(
      play,
      scene.legs,
      scene.from,
      state[play.side].onPitch,
      (id) => scene.dots.get(id)?.pos,
    )
    // A move that breaks down: the defender nearest where it will be lost
    // goes to win the ball.
    const tackle = scene.legs.findIndex((leg) => leg.owner === 'defend')
    if (tackle >= 0) {
      const spot = legStart(scene.legs, scene.from, tackle)
      let best = Infinity
      for (const p of state[other(play.side)].onPitch) {
        const dot = scene.dots.get(p.player.id)
        if (!dot || p.position === 'G' || near(dot.pos, spot) >= best) continue
        best = near(dot.pos, spot)
        scene.runners.set(tackle, p.player.id)
      }
    }
    // Nobody near enough to carry the ball off: it is played on to the
    // first runner instead, who goes to meet it.
    const first = scene.runners.get(0)
    const firstAt = first ? scene.dots.get(first)?.pos : undefined
    if (scene.legs[0]?.kind === 'carry' && firstAt && metres(firstAt, scene.from) > 2 * CONTROL) {
      scene.legs[0] = { ...scene.legs[0], kind: 'pass' }
    }
    scene.start = performance.now()
    scene.duration = playDuration(play) * unitMs
    scene.tempo = BASE_UNIT_MS / unitMs
  }, [state, plays, unitMs])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || width === 0) return
    const upright = width < UPRIGHT_BELOW
    const pad = Math.max(8, width * 0.025)
    // Upright on a phone, but never taller than most of the screen.
    let fieldW = width - 2 * pad
    let fieldH = upright ? fieldW / ASPECT : fieldW * ASPECT
    if (upright && fieldH > window.innerHeight * 0.6) {
      fieldH = window.innerHeight * 0.6
      fieldW = fieldH * ASPECT
    }
    const padX = (width - fieldW) / 2
    const height = fieldH + 2 * pad
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    canvas.style.height = `${height}px`
    context.setTransform(ratio, 0, 0, ratio, 0, 0)

    // Pitch fractions to canvas pixels; upright, the home side attacks upwards.
    const toScreen = (p: Vec): [number, number] =>
      upright
        ? [padX + (1 - p.y) * fieldW, pad + (1 - p.x) * fieldH]
        : [padX + p.x * fieldW, pad + p.y * fieldH]
    const across = upright ? fieldW : fieldH
    const radius = Math.max(6, Math.min(12, across * 0.032))

    let frame = 0
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const match = state
      const scene = sceneRef.current
      const dt = Math.min(0.1, (now - (scene.last || now)) / 1000)
      scene.last = now
      const play = scene.play
      const t = play ? (now - scene.start) / scene.duration / movingShare(play) : 0
      const { pos, index, leg } = ballAt(scene.legs, scene.from, t)
      // After the 45th minute's play, half-time: the ball goes back to the
      // centre and the sides walk over to the other end.
      const halftime = match.minute === 45 && !match.finished && t >= 1
      const lastBall = scene.ball
      scene.ball = halftime
        ? {
            x: pos.x + (CENTRE.x - pos.x) * Math.min(1, dt * 2),
            y: pos.y + (CENTRE.y - pos.y) * Math.min(1, dt * 2),
          }
        : pos
      if (halftime) {
        scene.legs = []
        scene.from = scene.ball
      }
      const secondHalf = match.minute > 45 || halftime

      context.clearRect(0, 0, width, height)
      drawMarkings(context, toScreen, upright ? fieldH : fieldW)
      const onPitch = new Set<string>()
      const lastLeg = leg ?? scene.legs.at(-1)
      const owner = play && lastLeg && (lastLeg.owner === 'attack' ? play.side : other(play.side))
      const shotAt = scene.legs.findIndex((l) => l.kind === 'shot')
      const shooting = shotAt >= 0 && index >= shotAt

      // The player on the ball on this leg, or the one a pass is going to.
      // Nobody chases a shot.
      let runner: string | undefined
      if (leg && owner && (leg.kind === 'carry' || leg.kind === 'pass')) {
        runner = scene.runners.get(index)
        if (!runner) {
          const goal = leg.kind === 'carry' ? legStart(scene.legs, scene.from, index) : leg.to
          const passer = scene.runners.get(index - 1)
          let best = Infinity
          for (const p of match[owner].onPitch) {
            const dot = scene.dots.get(p.player.id)
            if (!dot || p.position === 'G' || (leg.kind === 'pass' && p.player.id === passer)) {
              continue
            }
            const d = near(dot.pos, goal)
            if (d < best) [best, runner] = [d, p.player.id]
          }
          if (runner) scene.runners.set(index, runner)
        }
      }
      // Whoever a pass still to come is meant for is already making his run,
      // and so is the defender who is going to win the ball.
      const runs = new Map<string, Vec>()
      if (play && t < 1) {
        for (let i = scene.legs.length - 1; i >= index; i--) {
          const receiver = scene.runners.get(i)
          if (!receiver) continue
          if (scene.legs[i].kind === 'pass') runs.set(receiver, scene.legs[i].to)
          else if (scene.legs[i].owner === 'defend' && i > index) {
            runs.set(receiver, legStart(scene.legs, scene.from, i))
          }
        }
      }
      // The shooter stays where the shot was struck.
      const shooter = shooting ? scene.runners.get(shotAt - 1) : undefined
      // On a save the keeper goes to the ball.
      const saving = shooting && play?.end === 'saved' ? scene.legs[shotAt].to : undefined
      const tempo = scene.tempo
      const time = now / 1000

      for (const side of ['home', 'away'] as const) {
        const team = match[side]
        const end = facing(side, secondHalf)
        const spots = formationSpots(team, end)
        const inPossession = owner === side && t < 1
        // Without the ball, the nearest two go at it: one presses, one covers.
        const pressing =
          owner && owner !== side && t < 1 && !shooting
            ? team.onPitch
                .filter((p) => p.position !== 'G' && scene.dots.has(p.player.id))
                .map((p) => p.player.id)
                .sort(
                  (a, b) =>
                    near(scene.dots.get(a)!.pos, scene.ball) -
                    near(scene.dots.get(b)!.pos, scene.ball),
                )
                .slice(0, 2)
            : []
        for (const p of team.onPitch) {
          const id = p.player.id
          const keeper = p.position === 'G'
          onPitch.add(id)
          const spot = spots.get(id) ?? CENTRE
          const dot = scene.dots.get(id)
          if (!dot) {
            // At kick-off everyone starts in place; a substitute runs on from the touchline.
            scene.dots.set(id, {
              pos: scene.kickedOff ? { x: spot.x, y: -0.04 } : spot,
              vel: { x: 0, y: 0 },
              seen: scene.ball,
              traits: traitsOf(p),
              side,
            })
            continue
          }
          const { traits } = dot
          dot.seen = {
            x: dot.seen.x + (scene.ball.x - dot.seen.x) * Math.min(1, dt * traits.reaction),
            y: dot.seen.y + (scene.ball.y - dot.seen.y) * Math.min(1, dt * traits.reaction),
          }
          const sprint = {
            top: PACE.sprint.top * traits.speed * tempo,
            accel: PACE.sprint.accel * traits.burst * tempo * tempo,
          }
          const jog = {
            top: PACE.jog.top * traits.speed * tempo,
            accel: PACE.jog.accel * traits.burst * tempo * tempo,
          }
          if (id === runner && leg!.kind === 'carry' && metres(dot.pos, scene.ball) < CONTROL) {
            // Ball at his feet: he goes where it goes.
            const step = { x: scene.ball.x - lastBall.x, y: scene.ball.y - lastBall.y }
            dot.pos = {
              x: dot.pos.x + step.x + (scene.ball.x - dot.pos.x - step.x) * Math.min(1, dt * 8),
              y: dot.pos.y + step.y + (scene.ball.y - dot.pos.y - step.y) * Math.min(1, dt * 8),
            }
            dot.vel = dt > 0 ? { x: (step.x * 105) / dt, y: (step.y * 68) / dt } : dot.vel
            continue
          }
          let target: Vec
          let pace = jog
          if (id === runner && leg!.kind === 'carry') {
            ;[target, pace] = [scene.ball, sprint]
          } else if (runs.has(id)) {
            ;[target, pace] = [runs.get(id)!, sprint]
          } else if (id === shooter) {
            target = dot.pos
          } else if (keeper && saving && side !== play?.side) {
            ;[target, pace] = [saving, sprint]
          } else if (pressing.includes(id)) {
            const cover = pressing.indexOf(id) === 1
            target = pressTarget(scene.ball, end, cover)
            if (!cover) pace = sprint
          } else {
            target = offBallTarget({
              player: p,
              spot,
              seen: dot.seen,
              end,
              inPossession,
              traits,
              time,
            })
          }
          const moved = steer(dot, target, dt, pace.top, pace.accel)
          dot.pos = moved.pos
          dot.vel = moved.vel
        }
      }

      scene.kickedOff = true

      // Substituted and sent-off players walk off to the touchline and fade out.
      for (const [id, dot] of scene.dots) {
        if (onPitch.has(id)) continue
        if (dot.leftAt === undefined) {
          dot.leftAt = now
          dot.from = dot.pos
        }
        const gone = (now - dot.leftAt) / 1000 / WALK_OFF
        if (gone >= 1) {
          scene.dots.delete(id)
          continue
        }
        dot.pos = { x: dot.from!.x, y: dot.from!.y + (-0.06 - dot.from!.y) * gone }
      }

      const marks = markers(match, scene.play)
      const keepers = new Set(
        [...match.home.onPitch, ...match.away.onPitch]
          .filter((p) => p.position === 'G')
          .map((p) => p.player.id),
      )
      for (const [id, dot] of scene.dots) {
        const [x, y] = toScreen(dot.pos)
        const kit = keepers.has(id)
          ? { fill: kits[dot.side].keeper, line: '#111111' }
          : kits[dot.side]
        context.globalAlpha =
          dot.leftAt === undefined ? 1 : Math.max(0, 1 - (now - dot.leftAt) / 1000 / WALK_OFF)
        context.beginPath()
        context.arc(x, y, radius, 0, Math.PI * 2)
        context.fillStyle = kit.fill
        context.fill()
        context.lineWidth = 2
        context.strokeStyle = kit.line
        context.stroke()
        context.fillStyle = textOn(kit.fill)
        context.font = `bold ${Math.round(radius * 1.05)}px system-ui, sans-serif`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(String(numbers.get(id) ?? ''), x, y + 0.5)
        const mark = marks.get(id)
        if (mark) drawMark(context, mark, x, y - radius * 1.9, radius)
      }
      context.globalAlpha = 1

      const [bx, by] = toScreen(scene.ball)
      context.beginPath()
      context.arc(bx, by, Math.max(3, radius * 0.45), 0, Math.PI * 2)
      context.fillStyle = '#fff'
      context.fill()
      context.lineWidth = 1
      context.strokeStyle = '#111'
      context.stroke()

      if (play?.end === 'goal' && t >= 1) {
        const scorer = match[play.side].onPitch.find((p) => p.player.id === play.playerId)
        drawBanner(context, width, height, scorer ? `GOL! ${scorer.player.name}` : 'GOL!', now)
      } else if (halftime) {
        drawBanner(context, width, height, 'Intervalo: troca de lado', now)
      }
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [state, width, numbers, kits])

  return (
    <div
      ref={boxRef}
      className="overflow-hidden rounded-lg border-2 border-white/40 bg-gradient-to-b from-pitch to-pitch-dark"
    >
      <canvas
        ref={canvasRef}
        className="block w-full"
        role="img"
        aria-label={`Campo: ${state.home.club.name} ${state.home.stats.goals} x ${state.away.stats.goals} ${state.away.club.name}`}
      />
    </div>
  )
}

type Mark = 'amarelo' | 'vermelho' | 'lesao'

/** Cards and injuries of the play's minute, to show over the players' heads. */
function markers(state: MatchState, play: Play | undefined): Map<string, Mark> {
  const marks = new Map<string, Mark>()
  if (!play) return marks
  for (const event of state.events) {
    if (event.minute !== play.minute || !event.playerId) continue
    if (event.type === 'amarelo' || event.type === 'vermelho' || event.type === 'lesao') {
      marks.set(event.playerId, event.type)
    }
  }
  return marks
}

function drawMark(context: CanvasRenderingContext2D, mark: Mark, x: number, y: number, r: number) {
  if (mark === 'lesao') {
    context.fillStyle = '#fff'
    context.fillRect(x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2)
    context.fillStyle = '#dc2626'
    context.fillRect(x - r * 0.15, y - r * 0.45, r * 0.3, r * 0.9)
    context.fillRect(x - r * 0.45, y - r * 0.15, r * 0.9, r * 0.3)
    return
  }
  context.fillStyle = mark === 'amarelo' ? '#facc15' : '#dc2626'
  context.fillRect(x - r * 0.35, y - r * 0.5, r * 0.7, r)
  context.lineWidth = 1
  context.strokeStyle = '#111'
  context.strokeRect(x - r * 0.35, y - r * 0.5, r * 0.7, r)
}

function drawBanner(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  now: number,
) {
  const size = Math.max(16, Math.min(32, width * 0.05))
  context.font = `800 ${size}px system-ui, sans-serif`
  const textWidth = context.measureText(text).width
  context.globalAlpha = 0.75 + 0.25 * Math.sin(now / 90)
  context.fillStyle = 'rgba(0, 0, 0, 0.55)'
  context.fillRect(
    width / 2 - textWidth / 2 - size,
    height / 2 - size,
    textWidth + 2 * size,
    2 * size,
  )
  context.fillStyle = '#fde047'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, width / 2, height / 2)
  context.globalAlpha = 1
}

/** Touchlines, halfway line, centre circle, boxes and goals. */
function drawMarkings(
  context: CanvasRenderingContext2D,
  toScreen: (p: Vec) => [number, number],
  length: number,
) {
  const metre = length / 105
  context.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  context.lineWidth = Math.max(1, metre * 0.25)
  const line = (a: Vec, b: Vec) => {
    context.beginPath()
    context.moveTo(...toScreen(a))
    context.lineTo(...toScreen(b))
    context.stroke()
  }
  line({ x: 0, y: 0 }, { x: 1, y: 0 })
  line({ x: 1, y: 0 }, { x: 1, y: 1 })
  line({ x: 1, y: 1 }, { x: 0, y: 1 })
  line({ x: 0, y: 1 }, { x: 0, y: 0 })
  const box = (x0: number, x1: number, halfWidth: number) => {
    const [y0, y1] = [0.5 - halfWidth, 0.5 + halfWidth]
    line({ x: x0, y: y0 }, { x: x1, y: y0 })
    line({ x: x1, y: y0 }, { x: x1, y: y1 })
    line({ x: x1, y: y1 }, { x: x0, y: y1 })
  }
  line({ x: 0.5, y: 0 }, { x: 0.5, y: 1 })
  context.beginPath()
  context.arc(...toScreen(CENTRE), 9.15 * metre, 0, Math.PI * 2)
  context.stroke()

  // Penalty and goal areas in metres turned into pitch fractions.
  const penalty = { depth: 16.5 / 105, half: 20.16 / 68 }
  const goalArea = { depth: 5.5 / 105, half: 9.16 / 68 }
  const goal = { depth: 1.6 / 105, half: 3.66 / 68 }
  for (const end of [0, 1]) {
    const at = (d: number) => (end === 0 ? d : 1 - d)
    box(at(0), at(penalty.depth), penalty.half)
    box(at(0), at(goalArea.depth), goalArea.half)
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    box(at(0), at(-goal.depth), goal.half)
    context.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  }
}
