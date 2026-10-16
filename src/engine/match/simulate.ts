import type {
  Club,
  Formation,
  Lineup,
  MatchEvent,
  MatchResult,
  Player,
  Position,
  Posture,
  TeamStats,
} from '../model/types.ts'
import { createRng, mixSeed, type Rng } from '../rng.ts'
import { fillSlots, formationSlots } from './lineup.ts'
import { narrate, type GoalKind } from './narration.ts'
import {
  finishingSkill,
  headingSkill,
  keeperSkill,
  matchShape,
  paceSkill,
  positionFit,
  POSTURE_EFFECT,
  sectorStrength,
  styleBonus,
} from './strength.ts'
import { styleLevel } from '../player/attributes.ts'

export const MATCH_MINUTES = 90
export const MAX_SUBSTITUTIONS = 5

/**
 * Tuning knobs. The balance tests in simulate.test.ts pin the results they
 * produce: about 2.5 goals a game and the home side winning about 45%.
 */
export const BALANCE = {
  /** Points added to every sector of the home side. */
  homeAdvantage: 9,
  /**
   * Points of difference between two sectors that make one e times "better" than
   * the other. Using differences, not ratios, keeps Série B as balanced as Série A.
   */
  strengthScale: 115,
  /** How sharply a midfield edge turns into possession: share = edge^k / (edge^k + 1). */
  possessionPower: 1,
  /** Chance per minute that the side in possession creates a shot, at equal strength. */
  shotRate: 0.25,
  /** The attack-over-defense edge raised to these powers scales shot rate and shot quality. */
  chancePower: 0.7,
  qualityPower: 0.3,
  onTarget: 0.4,
  /** Chance that a shot on target beats the keeper, at equal strength. */
  conversion: 0.27,
  yellowPerMinute: 0.019,
  redPerMinute: 0.0003,
  injuryPerMinute: 0.0012,
  /** Energy lost per minute at normal posture, out of 100, for a player of average stamina. */
  tiring: 0.22,
  /** How much stamina changes that: 1.35 - staminaEffect * stamina / 100. */
  staminaEffect: 0.7,
  /** Points of attack per point of pace the forwards have over the defenders, when countering. */
  paceWeight: 0.25,
  /** Share of chances that come in the air: crosses, corners, free kicks. */
  aerialShare: 0.22,
  /** Points of shooter-over-keeper difference that make a shot e times likelier to go in. */
  finishScale: 300,
}

export type MatchSide = 'home' | 'away'

export type MatchTeamInput = { club: Club; lineup: Lineup }

export type MatchInput = {
  home: MatchTeamInput
  away: MatchTeamInput
  players: Readonly<Record<string, Player>>
  /** Energy each player starts with, out of 100; missing means fresh. */
  condition?: Readonly<Record<string, number>>
  /** Form from -2 to +2; missing means 0. */
  form?: Readonly<Record<string, number>>
  /** Injury chance of each side against the usual; missing means 1. */
  injuryRisk?: Partial<Record<MatchSide, number>>
}

/** Side of the pitch a move goes down, as the attacking side sees it. */
export type PlayLane = 'left' | 'center' | 'right'
/** Third of the pitch a move reaches, counted from the attacking side's own goal. */
export type PlayDepth = 'defense' | 'midfield' | 'attack'
export type PlayEnd = 'lost' | 'foul' | 'wide' | 'saved' | 'goal'

/**
 * One minute's move, for the pitch view to act out: who had the ball, where it
 * went and how it ended. The engine has already decided the minute; this only
 * describes it, so drawing it can never change a result.
 */
export type Play = {
  minute: number
  side: MatchSide
  lane: PlayLane
  depth: PlayDepth
  end: PlayEnd
  /** The shooter, or the defender who gave away the foul. */
  playerId?: string
}

export type OnPitch = {
  player: Player
  position: Position
  energy: number
  form: number
  booked: boolean
}

export type TeamState = {
  club: Club
  formation: Formation
  posture: Posture
  onPitch: OnPitch[]
  bench: Player[]
  subsLeft: number
  stats: TeamStats
  possessionMinutes: number
  /** Everyone who played, in the order they came on, with the slot they last played in. */
  played: Record<string, Position>
  /** Energy of the players who left the pitch, as they left it. */
  energyLeft: Record<string, number>
  /** Injury chance against the usual, from the club's training. */
  injuryRisk: number
}

export type MatchState = {
  minute: number
  finished: boolean
  home: TeamState
  away: TeamState
  events: MatchEvent[]
  sentOff: string[]
  injured: string[]
  plays: Play[]
  /** Rating points earned or lost in play: goals, saves, cards. */
  marks: Record<string, number>
  condition: Readonly<Record<string, number>>
  form: Readonly<Record<string, number>>
  rng: Rng
  /**
   * Draws the details of each play. Kept apart from `rng` so describing the
   * moves leaves the results exactly as they were.
   */
  playRng: Rng
}

const emptyStats = (): TeamStats => ({
  goals: 0,
  shots: 0,
  shotsOnTarget: 0,
  possession: 0,
  yellowCards: 0,
  redCards: 0,
})

function teamState(input: MatchTeamInput, match: MatchInput, side: MatchSide): TeamState {
  return {
    club: input.club,
    formation: input.lineup.formation,
    posture: input.lineup.posture,
    onPitch: input.lineup.starters.map(({ playerId, position }) => ({
      player: match.players[playerId],
      position,
      energy: match.condition?.[playerId] ?? 100,
      form: match.form?.[playerId] ?? 0,
      booked: false,
    })),
    bench: input.lineup.bench.map((id) => match.players[id]),
    subsLeft: MAX_SUBSTITUTIONS,
    stats: emptyStats(),
    possessionMinutes: 0,
    played: Object.fromEntries(input.lineup.starters.map((s) => [s.playerId, s.position])),
    energyLeft: {},
    injuryRisk: match.injuryRisk?.[side] ?? 1,
  }
}

function weightedPick<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  const weights = items.map(weight)
  let roll = rng.next() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]
    if (roll < 0) return items[i]
  }
  return items[items.length - 1]
}

const SCORING_WEIGHT: Record<Position, number> = { G: 0, Z: 0.6, L: 0.6, M: 2.2, A: 5 }
/** Who gets on the end of a cross or a corner. */
const AERIAL_WEIGHT: Record<Position, number> = { G: 0, Z: 2.2, L: 0.4, M: 0.8, A: 3 }
const FOUL_WEIGHT: Record<Position, number> = { G: 0.2, Z: 1.6, L: 1.2, M: 1.2, A: 0.6 }

/** Sets up a match ready to be played minute by minute with playMinute(). */
export function createMatch(input: MatchInput, rng: Rng): MatchState {
  const home = teamState(input.home, input, 'home')
  const away = teamState(input.away, input, 'away')
  return {
    minute: 0,
    finished: false,
    home,
    away,
    events: [{ minute: 0, type: 'inicio', text: narrate.kickoff(home.club.name, away.club.name) }],
    sentOff: [],
    injured: [],
    plays: [],
    marks: {},
    condition: input.condition ?? {},
    form: input.form ?? {},
    rng,
    playRng: createRng(
      mixSeed(
        home.club.id,
        away.club.id,
        ...input.home.lineup.starters.map((s) => s.playerId),
        ...input.away.lineup.starters.map((s) => s.playerId),
        'lances',
      ),
    ),
  }
}

function addEvent(state: MatchState, event: Omit<MatchEvent, 'minute'>): MatchEvent {
  const full = { minute: state.minute, ...event }
  state.events.push(full)
  return full
}

function sectors(state: MatchState, side: MatchSide) {
  const team = state[side]
  const raw = sectorStrength(team.onPitch, team.posture, team.formation)
  if (side === 'away') return raw
  const boost = BALANCE.homeAdvantage
  return {
    defense: raw.defense + boost,
    midfield: raw.midfield + boost,
    attack: raw.attack + boost,
  }
}

/** How many times better one rating is than another, from their difference. */
const edge = (rating: number, opposing: number) =>
  Math.exp((rating - opposing) / BALANCE.strengthScale)

function keeperName(team: TeamState): string {
  return team.onPitch.find((p) => p.position === 'G')?.player.name ?? 'o goleiro improvisado'
}

function goalKind(rng: Rng, aerial: boolean): GoalKind {
  if (aerial) return 'cabeca'
  const roll = rng.next()
  if (roll < 0.1) return 'penalti'
  if (roll < 0.75) return rng.next() < 0.5 ? 'chute' : 'jogada'
  return 'fora'
}

const shape = (p: OnPitch) => matchShape(p.player, p.position, p.energy, p.form)
/** Forwards are usually this much quicker for their level than defenders. */
const PACE_GAP = 6
const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/**
 * Extra attack from forwards quicker than their level would say against
 * defenders slower than theirs. It counts most for the side seeing less of
 * the ball, which plays on the counter.
 */
function paceEdge(team: TeamState, opponent: TeamState, possession: number): number {
  const runners = team.onPitch.filter((p) => p.position === 'A' || p.position === 'L')
  const chasers = opponent.onPitch.filter((p) => p.position === 'Z' || p.position === 'L')
  if (runners.length === 0 || chasers.length === 0) return 0
  const quickness = (p: OnPitch) => (paceSkill(p.player) - p.player.overall) * shape(p)
  const gap = average(runners.map(quickness)) - average(chasers.map(quickness)) - PACE_GAP
  return BALANCE.paceWeight * gap * 2 * (1 - possession)
}

/** The keeper's shot-stopping right now; an outfield player in goal barely has any. */
function keeperValue(team: TeamState): number {
  const keeper = team.onPitch.find((p) => p.position === 'G')
  if (!keeper) return 10
  const skill = keeper.player.position === 'G' ? keeperSkill(keeper.player) : 15
  return skill * shape(keeper)
}

const mark = (state: MatchState, playerId: string, points: number) => {
  state.marks[playerId] = (state.marks[playerId] ?? 0) + points
}

type AttackOutcome = { end: 'none' | 'wide' | 'saved' | 'goal'; shooterId?: string }

function attack(state: MatchState, side: MatchSide, possession: number): AttackOutcome {
  const { rng } = state
  const team = state[side]
  const opponent = state[side === 'home' ? 'away' : 'home']
  const ratio = edge(
    sectors(state, side).attack + paceEdge(team, opponent, possession),
    sectors(state, side === 'home' ? 'away' : 'home').defense,
  )
  if (rng.next() >= BALANCE.shotRate * ratio ** BALANCE.chancePower) return { end: 'none' }
  const quality = ratio ** BALANCE.qualityPower

  const outfield = team.onPitch.filter((p) => p.position !== 'G')
  if (outfield.length === 0) return { end: 'none' }
  const crossers = outfield.reduce((sum, p) => sum + styleBonus(p.player, 'cruzador'), 0)
  const aerial = rng.next() < BALANCE.aerialShare * (1 + crossers / 20)
  const shooter = aerial
    ? weightedPick(
        rng,
        outfield,
        (p) =>
          AERIAL_WEIGHT[p.position] *
          (1 + 0.25 * styleLevel(p.player, 'cabeceador')) *
          Math.max(1, headingSkill(p.player)) *
          shape(p),
      )
    : weightedPick(
        rng,
        outfield,
        (p) =>
          SCORING_WEIGHT[p.position] *
          (1 + 0.25 * styleLevel(p.player, 'finalizador')) *
          Math.max(1, finishingSkill(p.player)) *
          shape(p),
      )
  const skill =
    (aerial ? headingSkill(shooter.player) : finishingSkill(shooter.player)) * shape(shooter)
  const finish = Math.exp((skill - keeperValue(opponent)) / BALANCE.finishScale)
  team.stats.shots++

  if (rng.next() >= Math.min(0.85, BALANCE.onTarget * quality)) {
    addEvent(state, {
      type: 'chance',
      clubId: team.club.id,
      playerId: shooter.player.id,
      text: narrate.miss(rng, shooter.player.name),
    })
    return { end: 'wide', shooterId: shooter.player.id }
  }
  team.stats.shotsOnTarget++
  mark(state, shooter.player.id, 0.15)

  if (rng.next() < Math.min(0.75, BALANCE.conversion * quality * finish)) {
    team.stats.goals++
    mark(state, shooter.player.id, 1)
    addEvent(state, {
      type: 'gol',
      clubId: team.club.id,
      playerId: shooter.player.id,
      text: narrate.goal(rng, goalKind(rng, aerial), shooter.player.name),
    })
    return { end: 'goal', shooterId: shooter.player.id }
  } else {
    const keeper = opponent.onPitch.find((p) => p.position === 'G')
    if (keeper) mark(state, keeper.player.id, 0.3)
    addEvent(state, {
      type: 'defesa',
      clubId: team.club.id,
      playerId: shooter.player.id,
      text: narrate.save(rng, shooter.player.name, keeperName(opponent)),
    })
    return { end: 'saved', shooterId: shooter.player.id }
  }
}

const LANES: readonly PlayLane[] = ['left', 'center', 'right']
const BUILD_UP: readonly PlayDepth[] = ['defense', 'midfield', 'midfield', 'attack']

/** Share of the moves that break down without a shot that end in a foul, booked or not. */
const FOUL_SHARE = 0.3

/**
 * Describes the minute as a move. A shot always reaches the attacking third; a
 * move that broke down stops at a foul when the defending side was booked this
 * minute, or now and then at a foul nobody was booked for, or is simply lost
 * somewhere up the pitch. All of it is drawn from `playRng`, so it never
 * changes the match.
 */
function recordPlay(state: MatchState, side: MatchSide, outcome: AttackOutcome, from: number) {
  const { playRng } = state
  const defending = state[side === 'home' ? 'away' : 'home']
  const card = state.events
    .slice(from)
    .find((e) => (e.type === 'amarelo' || e.type === 'vermelho') && e.clubId === defending.club.id)
  const lane = playRng.pick(LANES)
  if (outcome.end !== 'none') {
    const play: Play = { minute: state.minute, side, lane, depth: 'attack', end: outcome.end }
    state.plays.push(outcome.shooterId ? { ...play, playerId: outcome.shooterId } : play)
    return
  }
  const depth = playRng.pick(BUILD_UP)
  const fouler = card?.playerId ?? uncardedFouler(playRng, defending)
  state.plays.push(
    fouler
      ? { minute: state.minute, side, lane, depth, end: 'foul', playerId: fouler }
      : { minute: state.minute, side, lane, depth, end: 'lost' },
  )
}

/** Now and then a move is stopped by a foul with no card: who gave it away. */
function uncardedFouler(playRng: Rng, defending: TeamState): string | undefined {
  const outfield = defending.onPitch.filter((p) => p.position !== 'G')
  if (outfield.length === 0 || playRng.next() >= FOUL_SHARE) return undefined
  return weightedPick(playRng, outfield, (p) => FOUL_WEIGHT[p.position]).player.id
}

function removeFromPitch(team: TeamState, leaving: OnPitch) {
  team.energyLeft[leaving.player.id] = leaving.energy
  team.onPitch = team.onPitch.filter((p) => p !== leaving)
}

/** Swaps a starter for a bench player in the same slot. Returns false if not allowed. */
export function substitute(
  state: MatchState,
  side: MatchSide,
  outId: string,
  inId: string,
): boolean {
  const team = state[side]
  const leaving = team.onPitch.find((p) => p.player.id === outId)
  const coming = team.bench.find((p) => p.id === inId)
  if (!leaving || !coming || team.subsLeft <= 0 || state.finished) return false
  team.subsLeft--
  team.bench = team.bench.filter((p) => p !== coming)
  team.energyLeft[outId] = leaving.energy
  team.played[inId] = leaving.position
  team.onPitch[team.onPitch.indexOf(leaving)] = {
    player: coming,
    position: leaving.position,
    energy: state.condition[inId] ?? 100,
    form: state.form[inId] ?? 0,
    booked: false,
  }
  addEvent(state, {
    type: 'substituicao',
    clubId: team.club.id,
    playerId: outId,
    otherPlayerId: inId,
    text: narrate.substitution(leaving.player.name, coming.name),
  })
  return true
}

/**
 * Two players on the pitch swap places without using a substitution. Each
 * takes the other's position and spot in the line, so swapping two forwards
 * only changes the side each one plays on. Returns false if not allowed.
 */
export function swapPositions(state: MatchState, side: MatchSide, aId: string, bId: string) {
  const team = state[side]
  const i = team.onPitch.findIndex((p) => p.player.id === aId)
  const j = team.onPitch.findIndex((p) => p.player.id === bId)
  if (i < 0 || j < 0 || i === j || state.finished) return false
  const [a, b] = [team.onPitch[i], team.onPitch[j]]
  ;[a.position, b.position] = [b.position, a.position]
  team.onPitch[i] = b
  team.onPitch[j] = a
  team.played[aId] = a.position
  team.played[bId] = b.position
  return true
}

export function setPosture(state: MatchState, side: MatchSide, posture: Posture) {
  state[side].posture = posture
}

/**
 * Redraws the side in a new formation. Whoever is in goal stays there; everyone
 * else moves to the slot they fit best. Down to ten, the midfield gives way first.
 */
export function setFormation(state: MatchState, side: MatchSide, formation: Formation) {
  const team = state[side]
  team.formation = formation
  const keeper = team.onPitch.find((p) => p.position === 'G')
  const outfield = team.onPitch.filter((p) => p !== keeper)
  const positions = formationSlots(formation)
  if (keeper) positions.splice(positions.indexOf('G'), 1)
  const slots = fillSlots(
    outfield.map((p) => p.player),
    positions,
  )
  for (const p of outfield) {
    const slot = slots.find((s) => s.playerId === p.player.id)
    if (slot) p.position = slot.position
  }
}

/** The bench player who best fills a position, if any. */
function bestReplacement(team: TeamState, position: Position): Player | undefined {
  const value = (p: Player) => p.overall * positionFit(p, position)
  return [...team.bench].sort((a, b) => value(b) - value(a))[0]
}

function injuries(state: MatchState, side: MatchSide) {
  const { rng } = state
  const team = state[side]
  if (team.onPitch.length === 0 || rng.next() >= BALANCE.injuryPerMinute * team.injuryRisk) return
  const hurt = rng.pick(team.onPitch)
  state.injured.push(hurt.player.id)
  addEvent(state, {
    type: 'lesao',
    clubId: team.club.id,
    playerId: hurt.player.id,
    text: narrate.injury(hurt.player.name),
  })
  const replacement = bestReplacement(team, hurt.position)
  if (!replacement || !substitute(state, side, hurt.player.id, replacement.id)) {
    removeFromPitch(team, hurt)
  }
}

function sendOff(state: MatchState, side: MatchSide, offender: OnPitch) {
  const team = state[side]
  team.stats.redCards++
  state.sentOff.push(offender.player.id)
  removeFromPitch(team, offender)
  // Without a keeper the side gives up an outfield player to put one in goal.
  if (offender.position !== 'G') return
  const keeper = team.bench.find((p) => p.position === 'G')
  const outfield = team.onPitch.filter((p) => p.position !== 'G')
  if (keeper && outfield.length > 0 && team.subsLeft > 0) {
    const weakest = outfield.reduce((a, b) => (a.player.overall <= b.player.overall ? a : b))
    weakest.position = 'G'
    substitute(state, side, weakest.player.id, keeper.id)
  } else if (outfield.length > 0) {
    outfield[0].position = 'G'
  }
}

function discipline(state: MatchState, side: MatchSide) {
  const { rng } = state
  const team = state[side]
  if (team.onPitch.length === 0) return
  const roll = rng.next()
  if (roll >= BALANCE.yellowPerMinute + BALANCE.redPerMinute) return
  // Booked players hold back, so second yellows stay rare.
  const offender = weightedPick(
    rng,
    team.onPitch,
    (p) => FOUL_WEIGHT[p.position] * (p.booked ? 0.35 : 1),
  )
  const base = { clubId: team.club.id, playerId: offender.player.id }

  mark(state, offender.player.id, roll < BALANCE.redPerMinute || offender.booked ? -1.5 : -0.3)
  if (roll < BALANCE.redPerMinute) {
    addEvent(state, { ...base, type: 'vermelho', text: narrate.red(rng, offender.player.name) })
    sendOff(state, side, offender)
  } else if (offender.booked) {
    team.stats.yellowCards++
    addEvent(state, { ...base, type: 'vermelho', text: narrate.secondYellow(offender.player.name) })
    sendOff(state, side, offender)
  } else {
    offender.booked = true
    team.stats.yellowCards++
    addEvent(state, { ...base, type: 'amarelo', text: narrate.yellow(rng, offender.player.name) })
  }
}

/** Everyone tires each minute; stamina decides how fast. */
function tire(team: TeamState, rng: Rng) {
  const rate = BALANCE.tiring * POSTURE_EFFECT[team.posture].tiring
  for (const p of team.onPitch) {
    const stamina = 1.35 - (BALANCE.staminaEffect * p.player.attributes.stamina) / 100
    p.energy = Math.max(0, p.energy - rate * stamina * (0.7 + 0.6 * rng.next()))
  }
}

/** Plays the next minute and returns the events it produced. */
export function playMinute(state: MatchState): MatchEvent[] {
  if (state.finished) return []
  const before = state.events.length
  state.minute++
  const { rng } = state

  const homeMid = sectors(state, 'home').midfield
  const awayMid = sectors(state, 'away').midfield
  const homeEdge = edge(homeMid, awayMid) ** BALANCE.possessionPower
  const homeShare = homeEdge / (homeEdge + 1)
  const side: MatchSide = rng.next() < homeShare ? 'home' : 'away'
  state[side].possessionMinutes++
  const outcome = attack(state, side, side === 'home' ? homeShare : 1 - homeShare)

  for (const s of ['home', 'away'] as const) {
    discipline(state, s)
    injuries(state, s)
    tire(state[s], rng)
  }
  recordPlay(state, side, outcome, before)

  const { home, away } = state
  if (state.minute === 45) {
    addEvent(state, {
      type: 'intervalo',
      text: narrate.halftime(home.club.name, home.stats.goals, away.stats.goals, away.club.name),
    })
  }
  if (state.minute === MATCH_MINUTES) {
    state.finished = true
    addEvent(state, {
      type: 'fim',
      text: narrate.fulltime(home.club.name, home.stats.goals, away.stats.goals, away.club.name),
    })
  }
  return state.events.slice(before)
}

/** Rating swing for the result, and for each goal let in by a keeper or a defender. */
const RESULT_POINTS = { win: 0.6, draw: 0.1, loss: -0.4 }
const CONCEDED_POINTS: Record<Position, number> = { G: 0.3, Z: 0.2, L: 0.15, M: 0.05, A: 0 }
const CLEAN_SHEET_POINTS: Record<Position, number> = { G: 0.6, Z: 0.4, L: 0.3, M: 0.1, A: 0 }

/**
 * Everyone's rating out of 10: 6 to start, the result, goals and saves and
 * cards, goals let in at the back, and with `luck` a little of what the
 * numbers miss.
 */
function ratings(state: MatchState, luck: boolean): Record<string, number> {
  const out: Record<string, number> = {}
  for (const side of ['home', 'away'] as const) {
    const team = state[side]
    const scored = team.stats.goals
    const conceded = state[side === 'home' ? 'away' : 'home'].stats.goals
    const result =
      scored > conceded
        ? RESULT_POINTS.win
        : scored < conceded
          ? RESULT_POINTS.loss
          : RESULT_POINTS.draw
    for (const [id, position] of Object.entries(team.played)) {
      const back =
        conceded === 0 ? CLEAN_SHEET_POINTS[position] : -CONCEDED_POINTS[position] * conceded
      const noise = luck
        ? (mixSeed(team.club.id, id, state.events.length, 'nota') % 1000) / 1000 - 0.5
        : 0
      const rating = 6 + result + back + (state.marks[id] ?? 0) + 0.8 * noise
      out[id] = Math.round(10 * Math.min(10, Math.max(3, rating))) / 10
    }
  }
  return out
}

/**
 * Ratings as the match stands, for everyone who has played so far: the same
 * sum as the final rating, the score so far counting as the result, without
 * the touch of luck added at the end.
 */
export function liveRatings(state: MatchState): Record<string, number> {
  return ratings(state, false)
}

/** One side's numbers as the match stands; possession in percent. */
export type LiveStats = TeamStats & { fouls: number }

/**
 * Both sides' numbers so far. Fouls are the moves that ended in a foul by the
 * side defending them; counting them changes nothing in the match.
 */
export function liveStats(state: MatchState): Record<MatchSide, LiveStats> {
  const total = state.home.possessionMinutes + state.away.possessionMinutes
  const homePossession = total ? Math.round((100 * state.home.possessionMinutes) / total) : 50
  const fouls = (side: MatchSide) =>
    state.plays.filter((p) => p.end === 'foul' && p.side !== side).length
  return {
    home: { ...state.home.stats, possession: homePossession, fouls: fouls('home') },
    away: { ...state.away.stats, possession: 100 - homePossession, fouls: fouls('away') },
  }
}

/** Energy everyone who played was left with. */
function energyLeft(state: MatchState): Record<string, number> {
  const out: Record<string, number> = {}
  for (const side of ['home', 'away'] as const) {
    const team = state[side]
    Object.assign(out, team.energyLeft)
    for (const p of team.onPitch) out[p.player.id] = p.energy
  }
  for (const [id, energy] of Object.entries(out)) out[id] = Math.round(energy)
  return out
}

export function matchResult(state: MatchState): MatchResult {
  const total = state.home.possessionMinutes + state.away.possessionMinutes || 1
  const homePossession = Math.round((100 * state.home.possessionMinutes) / total)
  return {
    homeId: state.home.club.id,
    awayId: state.away.club.id,
    homeGoals: state.home.stats.goals,
    awayGoals: state.away.stats.goals,
    events: state.events,
    stats: {
      home: { ...state.home.stats, possession: homePossession },
      away: { ...state.away.stats, possession: 100 - homePossession },
    },
    sentOff: state.sentOff,
    injured: state.injured,
    ratings: ratings(state, true),
    energy: energyLeft(state),
    played: { home: { ...state.home.played }, away: { ...state.away.played } },
  }
}

/** Plays a whole match at once. Same input and seed, same match. */
/** What it takes to play a finished match again, minute by minute, exactly as it went. */
export type MatchReplay = { input: MatchInput; seed: number }

/** The match of a replay at kick-off, ready for playMinute(). */
export const replayMatch = (replay: MatchReplay): MatchState =>
  createMatch(replay.input, createRng(replay.seed))

export function simulateMatch(input: MatchInput, rng: Rng): MatchResult {
  const state = createMatch(input, rng)
  while (!state.finished) playMinute(state)
  return matchResult(state)
}
