import type {
  Club,
  Lineup,
  MatchEvent,
  MatchResult,
  Player,
  Position,
  Posture,
  TeamStats,
} from '../model/types.ts'
import type { Rng } from '../rng.ts'
import { narrate, type GoalKind } from './narration.ts'
import { effectiveStrength, positionFit, POSTURE_EFFECT, sectorStrength } from './strength.ts'

export const MATCH_MINUTES = 90
export const MAX_SUBSTITUTIONS = 5

/**
 * Tuning knobs. The balance tests in simulate.test.ts pin the results they
 * produce: about 2.5 goals a game and the home side winning about 45%.
 */
export const BALANCE = {
  /** Points added to every sector of the home side. */
  homeAdvantage: 4,
  /**
   * Points of difference between two sectors that make one e times "better" than
   * the other. Using differences, not ratios, keeps Série B as balanced as Série A.
   */
  strengthScale: 90,
  /** How sharply a midfield edge turns into possession: share = edge^k / (edge^k + 1). */
  possessionPower: 1,
  /** Chance per minute that the side in possession creates a shot, at equal strength. */
  shotRate: 0.24,
  /** The attack-over-defense edge raised to these powers scales shot rate and shot quality. */
  chancePower: 0.7,
  qualityPower: 0.5,
  onTarget: 0.4,
  /** Chance that a shot on target beats the keeper, at equal strength. */
  conversion: 0.25,
  yellowPerMinute: 0.019,
  redPerMinute: 0.0003,
  injuryPerMinute: 0.0012,
  /** Energy lost per minute at normal posture, out of 100. */
  tiring: 0.22,
}

export type MatchSide = 'home' | 'away'

export type MatchTeamInput = { club: Club; lineup: Lineup }

export type MatchInput = {
  home: MatchTeamInput
  away: MatchTeamInput
  players: Readonly<Record<string, Player>>
}

type OnPitch = { player: Player; position: Position; energy: number; booked: boolean }

type TeamState = {
  club: Club
  posture: Posture
  onPitch: OnPitch[]
  bench: Player[]
  subsLeft: number
  stats: TeamStats
  possessionMinutes: number
}

export type MatchState = {
  minute: number
  finished: boolean
  home: TeamState
  away: TeamState
  events: MatchEvent[]
  sentOff: string[]
  injured: string[]
  rng: Rng
}

const emptyStats = (): TeamStats => ({
  goals: 0,
  shots: 0,
  shotsOnTarget: 0,
  possession: 0,
  yellowCards: 0,
  redCards: 0,
})

function teamState(input: MatchTeamInput, players: MatchInput['players']): TeamState {
  return {
    club: input.club,
    posture: input.lineup.posture,
    onPitch: input.lineup.starters.map(({ playerId, position }) => ({
      player: players[playerId],
      position,
      energy: 100,
      booked: false,
    })),
    bench: input.lineup.bench.map((id) => players[id]),
    subsLeft: MAX_SUBSTITUTIONS,
    stats: emptyStats(),
    possessionMinutes: 0,
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
const FOUL_WEIGHT: Record<Position, number> = { G: 0.2, Z: 1.6, L: 1.2, M: 1.2, A: 0.6 }

/** Sets up a match ready to be played minute by minute with playMinute(). */
export function createMatch(input: MatchInput, rng: Rng): MatchState {
  const home = teamState(input.home, input.players)
  const away = teamState(input.away, input.players)
  return {
    minute: 0,
    finished: false,
    home,
    away,
    events: [{ minute: 0, type: 'inicio', text: narrate.kickoff(home.club.name, away.club.name) }],
    sentOff: [],
    injured: [],
    rng,
  }
}

function addEvent(state: MatchState, event: Omit<MatchEvent, 'minute'>): MatchEvent {
  const full = { minute: state.minute, ...event }
  state.events.push(full)
  return full
}

function sectors(state: MatchState, side: MatchSide) {
  const team = state[side]
  const raw = sectorStrength(team.onPitch, team.posture)
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

function goalKind(rng: Rng, scorer: OnPitch): GoalKind {
  const roll = rng.next()
  if (roll < 0.08) return 'penalti'
  const header = scorer.player.traits.includes('cabeceio') || scorer.position === 'Z' ? 0.55 : 0.2
  if (roll < 0.08 + header) return 'cabeca'
  if (roll < 0.8) return rng.next() < 0.5 ? 'chute' : 'jogada'
  return 'fora'
}

function attack(state: MatchState, side: MatchSide) {
  const { rng } = state
  const team = state[side]
  const opponent = state[side === 'home' ? 'away' : 'home']
  const ratio = edge(
    sectors(state, side).attack,
    sectors(state, side === 'home' ? 'away' : 'home').defense,
  )
  if (rng.next() >= BALANCE.shotRate * ratio ** BALANCE.chancePower) return
  const quality = ratio ** BALANCE.qualityPower

  const outfield = team.onPitch.filter((p) => p.position !== 'G')
  if (outfield.length === 0) return
  const shooter = weightedPick(rng, outfield, (p) => {
    const finisher = p.player.traits.includes('finalizacao') ? 1.5 : 1
    return SCORING_WEIGHT[p.position] * finisher * effectiveStrength(p.player, p.position, p.energy)
  })
  team.stats.shots++

  if (rng.next() >= Math.min(0.85, BALANCE.onTarget * quality)) {
    addEvent(state, {
      type: 'chance',
      clubId: team.club.id,
      playerId: shooter.player.id,
      text: narrate.miss(rng, shooter.player.name),
    })
    return
  }
  team.stats.shotsOnTarget++

  if (rng.next() < Math.min(0.75, BALANCE.conversion * quality)) {
    team.stats.goals++
    addEvent(state, {
      type: 'gol',
      clubId: team.club.id,
      playerId: shooter.player.id,
      text: narrate.goal(rng, goalKind(rng, shooter), shooter.player.name),
    })
  } else {
    addEvent(state, {
      type: 'defesa',
      clubId: team.club.id,
      playerId: shooter.player.id,
      text: narrate.save(rng, shooter.player.name, keeperName(opponent)),
    })
  }
}

function removeFromPitch(team: TeamState, leaving: OnPitch) {
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
  team.onPitch[team.onPitch.indexOf(leaving)] = {
    player: coming,
    position: leaving.position,
    energy: 100,
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

export function setPosture(state: MatchState, side: MatchSide, posture: Posture) {
  state[side].posture = posture
}

/** The bench player who best fills a position, if any. */
function bestReplacement(team: TeamState, position: Position): Player | undefined {
  const value = (p: Player) => p.strength * positionFit(p, position)
  return [...team.bench].sort((a, b) => value(b) - value(a))[0]
}

function injuries(state: MatchState, side: MatchSide) {
  const { rng } = state
  const team = state[side]
  if (team.onPitch.length === 0 || rng.next() >= BALANCE.injuryPerMinute) return
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
    const weakest = outfield.reduce((a, b) => (a.player.strength <= b.player.strength ? a : b))
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

function tire(team: TeamState, rng: Rng) {
  const rate = BALANCE.tiring * POSTURE_EFFECT[team.posture].tiring
  for (const p of team.onPitch) p.energy = Math.max(0, p.energy - rate * (0.7 + 0.6 * rng.next()))
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
  attack(state, side)

  for (const s of ['home', 'away'] as const) {
    discipline(state, s)
    injuries(state, s)
    tire(state[s], rng)
  }

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
  }
}

/** Plays a whole match at once. Same input and seed, same match. */
export function simulateMatch(input: MatchInput, rng: Rng): MatchResult {
  const state = createMatch(input, rng)
  while (!state.finished) playMinute(state)
  return matchResult(state)
}
