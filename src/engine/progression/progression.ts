import { generateYouth, marketValueFor } from '../generate/player.ts'
import { SQUAD_SHAPE } from '../generate/world.ts'
import {
  ATTRIBUTES,
  FACE_PARTS,
  OVERALL_WEIGHTS,
  overallAt,
  type AnyFace,
} from '../player/attributes.ts'
import {
  FREE_AGENT,
  type Attribute,
  type Attributes,
  POSITIONS,
  RETIRED,
  type GameState,
  type IndividualFocus,
  type Player,
  type Position,
  type Training,
  type TrainingPlan,
  type World,
} from '../model/types.ts'
import { mixSeed, type Rng } from '../rng.ts'
import { canTrain, FOCUS_ATTRIBUTES, FOCUS_GROUP, keepOwnFocus, TRAINING } from './training.ts'
import { MARKET, squadOf, transferPlayer } from '../transfer/market.ts'

export const PROGRESSION = {
  /** Appearances that count as a full season of football. */
  fullSeason: 25,
  /**
   * The year's development comes in this many steps: on the 1st of May to
   * December, for the month before, and at the close of the season.
   */
  steps: 9,
  /** Share of a full season a player out on loan counts as playing, at least. */
  loanPlaying: 0.75,
  /** Each game counts this much more for the development of players under `youthUntil`. */
  youthGames: 1.5,
  youthUntil: 21,
  /** From this age a player may retire; at the last one he always does. */
  retireFrom: 35,
  retireBy: 38,
  /** Youngsters each club's academy sends up every season, at least and at most. */
  youth: { min: 1, max: 2 },
  /** AI clubs let their weakest spares go above this squad size. */
  aiSquadCap: 28,
}

export type Group = 'physical' | 'technical' | 'mental'

/** Body first to go, technique learnt young, reading of the game coming last. */
const GROUP: Record<Attribute, Group> = {
  acceleration: 'physical',
  sprintSpeed: 'physical',
  agility: 'physical',
  strength: 'physical',
  stamina: 'physical',
  jumping: 'physical',
  vision: 'mental',
  attackPositioning: 'mental',
  interceptions: 'mental',
  keeperPositioning: 'mental',
  aggression: 'mental',
  finishing: 'technical',
  shotPower: 'technical',
  penalties: 'technical',
  shortPassing: 'technical',
  longPassing: 'technical',
  crossing: 'technical',
  dribbling: 'technical',
  ballControl: 'technical',
  marking: 'technical',
  tackling: 'technical',
  heading: 'technical',
  diving: 'technical',
  handling: 'technical',
  kicking: 'technical',
  reflexes: 'technical',
}

/**
 * How a year's change spreads over the groups. Youngsters gain most in
 * technique; past 30 the body goes first while vision and positioning still
 * grow, until about 32.
 */
function groupWeights(age: number, growing: boolean): Record<Group, number> {
  if (growing) {
    if (age <= 21) return { technical: 1.3, physical: 1, mental: 0.6 }
    if (age <= 25) return { technical: 1.1, physical: 0.8, mental: 1.1 }
    return { technical: 1, physical: 0.8, mental: 1.2 }
  }
  if (age <= 29) return { technical: 1, physical: 1.2, mental: 0.6 }
  if (age <= 32) return { technical: 0.6, physical: 2, mental: -0.5 }
  return { technical: 1, physical: 1.8, mental: 0.3 }
}

/** How much each attribute counts towards the overall in a position. */
function overallShares(position: Position): Record<Attribute, number> {
  const shares = Object.fromEntries(ATTRIBUTES.map((a) => [a, 0])) as Record<Attribute, number>
  for (const [face, weight] of Object.entries(OVERALL_WEIGHTS[position])) {
    for (const [attribute, part] of Object.entries(FACE_PARTS[face as AnyFace])) {
      shares[attribute as Attribute] += weight! * part!
    }
  }
  return shares
}

/** Rounds up or down at random, in proportion, so small changes still add up over the years. */
const roundRandom = (value: number, rng: Rng) => Math.floor(value + rng.next())

/** How a step of training bends the development of one player. */
export type StepTraining = {
  /** Growth of each group against the usual. */
  groups?: Partial<Record<Group, number>>
  /** Growth as a whole against the usual. */
  growth?: number
  /** Attributes worked on individually, and the points each gains in this step. */
  focus?: { attributes: readonly Attribute[]; points: number }
}

/**
 * Moves the attributes so the overall changes by about `change`, spread over
 * the groups as the age says, each attribute with a little of its own
 * (`noise` points, for a whole year).
 */
export function developAttributes(
  attributes: Attributes,
  position: Position,
  age: number,
  change: number,
  rng: Rng,
  noise = 0.8,
  training: StepTraining = {},
): Attributes {
  const weights = { ...groupWeights(age, change > 0) }
  if (change > 0) {
    for (const [group, boost] of Object.entries(training.groups ?? {})) {
      weights[group as Group] *= boost
    }
  }
  const shares = overallShares(position)
  const spread = ATTRIBUTES.reduce((sum, a) => sum + shares[a] * weights[GROUP[a]], 0)
  const base = change / Math.max(0.3, spread)
  const focused = new Set(training.focus?.attributes ?? [])
  const next = { ...attributes }
  for (const attribute of ATTRIBUTES) {
    // Skills that don't count for his position just drift along.
    const step = shares[attribute] > 0 ? base : change
    const extra = focused.has(attribute) ? training.focus!.points : 0
    const delta = step * weights[GROUP[attribute]] + extra + rng.normal(0, noise)
    next[attribute] = Math.min(99, Math.max(1, attributes[attribute] + roundRandom(delta, rng)))
  }
  return next
}

/**
 * How much a player's overall moves in a year at `age` (the age he reaches at
 * the season's end): young players grow towards their potential, faster the
 * more they play; players in their prime hold steady; past 30 they decline.
 * `share` is the part of the year being played out, and the luck shrinks
 * with it so a year in steps spreads like a year in one go.
 */
function yearChange(player: Player, age: number, playing: number, share: number, rng: Rng) {
  const room = player.potential - player.overall
  const luck = rng.normal(0, 1.5 * Math.sqrt(share))
  let change: number
  if (age <= 21) change = room * (0.12 + 0.28 * playing) * share + luck
  else if (age <= 25) change = room * (0.1 + 0.2 * playing) * share + luck
  else if (age <= 29) change = (playing > 0.5 ? 0.3 : -0.5) * share + luck
  else if (age <= 32) change = -(1 + 2 * rng.next()) * share
  else change = -(2 + 3 * rng.next()) * share
  return Math.min(change, room)
}

/**
 * One step of a player's year: `share` of it, having played `playing` of a
 * full season's football so far (0 to 1), with the user's training if any.
 */
export function developStep(
  player: Player,
  playing: number,
  share: number,
  rng: Rng,
  training: StepTraining = {},
): Player {
  const age = player.age + 1
  const change = yearChange(player, age, Math.min(1, playing), share, rng) * (training.growth ?? 1)
  const growing = canTrain(player)
  const attributes = developAttributes(
    player.attributes,
    player.position,
    age,
    change,
    rng,
    0.8 * Math.sqrt(share),
    growing ? training : { ...training, focus: undefined },
  )
  const overall = overallAt(attributes, player.position)
  // Past the peak the ceiling comes down with the player.
  const potential =
    age >= 30
      ? Math.min(player.potential, Math.max(overall, player.overall))
      : Math.max(player.potential, overall)
  return {
    ...player,
    attributes,
    overall,
    potential: Math.max(potential, overall),
    marketValue: marketValueFor(overall, potential, player.age),
  }
}

/** A year older in one go: the whole year's development, then a birthday. */
export function developPlayer(player: Player, appearances: number, rng: Rng): Player {
  const grown = developStep(player, appearances / PROGRESSION.fullSeason, 1, rng)
  return birthday(grown)
}

/** A year older; past 30 the ceiling is where he is now. */
function birthday(player: Player): Player {
  const age = player.age + 1
  const potential = age >= 30 ? player.overall : player.potential
  return {
    ...player,
    age,
    potential,
    marketValue: marketValueFor(player.overall, potential, age),
  }
}

/**
 * The potential as scouts see it: a range around the true one, as wide as
 * the player is unknown. Young players who have hardly played get up to 7
 * either side; it narrows with every game and is exact from 28, or once he
 * has stopped growing. Where the
 * true value sits inside is fixed for each player, so the range never jumps.
 */
export function potentialRange(player: Player, games: number): { low: number; high: number } {
  const half =
    player.age >= 28 || player.overall >= player.potential
      ? 0
      : Math.max(1, Math.min(7, Math.round(7 - games / 12 - Math.max(0, player.age - 17) * 0.5)))
  const offset = (mixSeed(player.id, 'potencial') % (2 * half + 1)) - half
  const low = Math.max(player.overall, player.potential - half + offset)
  const high = Math.min(99, Math.max(low, player.potential + half + offset))
  return { low, high: Math.max(high, player.potential) }
}

/** Games a player has played, every season of his career including this one. */
export const careerGames = (player: Player, appearances: Record<string, number>) =>
  (player.history ?? []).reduce((sum, s) => sum + s.games, 0) + (appearances[player.id] ?? 0)

/** The attributes that count most towards the overall in a position, for a general plan. */
export function keyAttributes(position: Position): Attribute[] {
  const shares = overallShares(position)
  return [...ATTRIBUTES]
    .sort((a, b) => shares[b] - shares[a] || a.localeCompare(b))
    .slice(0, TRAINING.generalAttributes)
}

/** The attributes a plan works on, for a player in `position`. */
export const planAttributes = (plan: TrainingPlan, position: Position): readonly Attribute[] =>
  plan.focus === 'geral' ? keyAttributes(position) : FOCUS_ATTRIBUTES[plan.focus]

/**
 * How much a season of each plan, at the usual intensity, would add to a
 * player's overall from the plan alone: the points each worked attribute
 * gains, up to 99, times how much it counts in his position.
 */
export function focusGains(player: Player): Record<IndividualFocus, number> {
  const shares = overallShares(player.position)
  const points = TRAINING.perSeason.normal
  const gain = (focus: IndividualFocus) =>
    planAttributes({ focus, intensity: 'normal' }, player.position).reduce(
      (sum, a) => sum + shares[a] * Math.min(points, 99 - player.attributes[a]),
      0,
    )
  const foci = ['geral', ...Object.keys(FOCUS_ATTRIBUTES)] as IndividualFocus[]
  return Object.fromEntries(foci.map((focus) => [focus, gain(focus)])) as Record<
    IndividualFocus,
    number
  >
}

/** The plan that most raises his overall; the general one when it's a tie. */
export function recommendedFocus(player: Player): IndividualFocus {
  const gains = focusGains(player)
  return (Object.keys(gains) as IndividualFocus[]).reduce((best, focus) =>
    gains[focus] > gains[best] ? focus : best,
  )
}

/**
 * Puts every one of the user's players who can still grow on his recommended
 * plan, keeping the intensity he had; with `onlyIdle`, just those with no plan.
 */
export function setRecommendedPlans(game: GameState, onlyIdle = false): GameState {
  const individual = { ...game.training.individual }
  for (const id of game.world.clubs[game.userClubId].playerIds) {
    const player = game.world.players[id]
    if (!canTrain(player) || (onlyIdle && individual[id])) continue
    individual[id] = {
      focus: recommendedFocus(player),
      intensity: individual[id]?.intensity ?? 'normal',
    }
  }
  return { ...game, training: { ...game.training, individual } }
}

/** The training a step of the user's player gets. */
function stepTraining(training: Training, player: Player, share: number): StepTraining {
  const group = FOCUS_GROUP[training.focus]
  const plan = training.individual[player.id]
  return {
    ...(group && { groups: { [group]: TRAINING.groupBoost } }),
    ...(training.focus === 'descanso' && { growth: TRAINING.restGrowth }),
    ...(plan && {
      focus: {
        attributes: planAttributes(plan, player.position),
        points: TRAINING.perSeason[plan.intensity] * share,
      },
    }),
  }
}

/**
 * A monthly step for everyone in the game: how much each has played so far
 * this season against how much there has been to play decides how fast the
 * young grow. Players out on loan count as playing most of the time. The
 * user's players train as set; the step's changes to their overall are kept
 * for the player sheet, and plans of those who can no longer grow end.
 */
export function developWorld(game: GameState, rng: Rng): GameState {
  const { world, season } = game
  const share = 1 / PROGRESSION.steps
  const played = Math.max(0, Math.min(season.round, season.totalRounds + 1) - 1)
  const expected = (PROGRESSION.fullSeason * played) / season.totalRounds
  const onLoan = new Set(game.loans.map((l) => l.playerId))
  const players = { ...world.players }
  const growth: Record<string, number> = {}
  for (const old of Object.values(world.players).sort(byId)) {
    if (old.clubId === RETIRED) continue
    const games = season.appearances[old.id] ?? 0
    const apps = old.age < PROGRESSION.youthUntil ? games * PROGRESSION.youthGames : games
    let playing = expected > 0 ? apps / expected : 0
    if (onLoan.has(old.id)) playing = Math.max(playing, PROGRESSION.loanPlaying)
    const users = old.clubId === game.userClubId
    const player = developStep(
      old,
      playing,
      share,
      rng,
      users ? stepTraining(game.training, old, share) : {},
    )
    players[old.id] = player
    if (users || onLoan.has(old.id)) growth[old.id] = player.overall - old.overall
  }
  // Whoever reached his ceiling, or left, stops training on his own.
  return keepOwnFocus({
    ...game,
    world: { ...world, players },
    growth: { date: game.today, overall: growth },
  })
}

/** Chance a player hangs up his boots at the end of a season. */
export function retirementChance(player: Player): number {
  if (player.age >= PROGRESSION.retireBy) return 1
  if (player.clubId === FREE_AGENT && player.age >= 32) return 0.6
  if (player.age < PROGRESSION.retireFrom) return 0
  return 0.15 + 0.2 * (player.age - PROGRESSION.retireFrom)
}

const byId = (a: Player, b: Player) => a.id.localeCompare(b.id)

/**
 * Ages every active player by a season and retires the oldest. Returns the
 * new world and who retired, so the user can be told about his own. The
 * year's development has already happened, step by step (developWorld).
 */
export function ageWorld(world: World, rng: Rng): { world: World; retired: Player[] } {
  const players = { ...world.players }
  const clubs = { ...world.clubs }
  const retired: Player[] = []
  for (const old of Object.values(world.players).sort(byId)) {
    if (old.clubId === RETIRED) continue
    const player = birthday(old)
    if (rng.next() < retirementChance(player)) {
      if (player.clubId !== FREE_AGENT) {
        const club = clubs[player.clubId]
        clubs[club.id] = { ...club, playerIds: club.playerIds.filter((id) => id !== player.id) }
      }
      retired.push(player)
      players[player.id] = { ...player, clubId: RETIRED }
    } else {
      players[player.id] = player
    }
  }
  return { world: { ...world, players, clubs }, retired }
}

/** The position a club's squad is thinnest at, weighed against the usual squad shape. */
function thinnestPosition(squad: readonly Player[]): Position {
  const count = (position: Position) => squad.filter((p) => p.position === position).length
  return [...POSITIONS].sort((a, b) => count(a) / SQUAD_SHAPE[a] - count(b) / SQUAD_SHAPE[b])[0]
}

/**
 * Every club's academy sends up its youngsters, where the squad is thinnest.
 * The user's squad never goes past the market's limit; AI clubs then release
 * their weakest spares to stay at a sensible size.
 */
export function youthIntake(
  game: GameState,
  year: number,
  rng: Rng,
): { game: GameState; userYouth: Player[] } {
  let world = game.world
  const userYouth: Player[] = []
  for (const clubId of Object.keys(world.clubs).sort()) {
    const club = world.clubs[clubId]
    const count = rng.int(PROGRESSION.youth.min, PROGRESSION.youth.max)
    for (let i = 1; i <= count; i++) {
      const squad = squadOf(world, clubId)
      if (squad.length >= MARKET.maxSquad) break
      const youth = generateYouth(rng, {
        id: `B${year}-${clubId}-${i}`,
        clubId,
        position: thinnestPosition(squad),
        level: club.reputation,
        season: year,
      })
      world = {
        ...world,
        players: { ...world.players, [youth.id]: youth },
        clubs: {
          ...world.clubs,
          [clubId]: {
            ...world.clubs[clubId],
            playerIds: [...world.clubs[clubId].playerIds, youth.id],
          },
        },
      }
      if (clubId === game.userClubId) userYouth.push(youth)
    }
    if (clubId === game.userClubId) continue
    for (;;) {
      const squad = squadOf(world, clubId)
      if (squad.length <= PROGRESSION.aiSquadCap) break
      const count = (position: Position) => squad.filter((p) => p.position === position).length
      const spare = squad
        .filter((p) => count(p.position) > SQUAD_SHAPE[p.position] && p.age >= 20)
        .sort((a, b) => a.overall - b.overall || byId(a, b))[0]
      if (!spare) break
      world = transferPlayer(world, spare.id, FREE_AGENT, {
        fee: 0,
        wage: spare.wage,
        contractUntil: year,
      })
    }
  }
  return { game: { ...game, world }, userYouth }
}
