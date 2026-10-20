import { SQUAD_SHAPE } from '../generate/world.ts'
import { FREE_AGENT, POSITIONS, RETIRED, type Player, type World } from '../model/types.ts'
import { createRng, mixSeed } from '../rng.ts'
import { seasonStart } from '../season/calendar.ts'
import {
  DEFAULT_ROOM_OPTIONS,
  ROOM_LIMITS,
  ROOM_RULES_VERSION,
  type DraftOrder,
  type RoomOptions,
  type RoomPhase,
  type RoomState,
  type RoomTeam,
  type SquadShape,
} from './types.ts'

/** Why a room can't be created with these teams and options, if it can't. */
export function checkRoomOptions(options: RoomOptions, teams: number): string | undefined {
  if (options.teams % 2 !== 0) return 'O número de times precisa ser par.'
  if (options.teams < ROOM_LIMITS.minTeams || options.teams > ROOM_LIMITS.maxTeams)
    return `A sala tem de ${ROOM_LIMITS.minTeams} a ${ROOM_LIMITS.maxTeams} times.`
  if (teams !== options.teams) return 'Faltam times para completar a sala.'
  return undefined
}

/**
 * A new room, before the draft: every active player of the world is free, and
 * the draft order is drawn from the seed. The world comes from a pack, built
 * by the caller with `applyPack(generateWorld(seed), pack)`.
 */
export function createRoom(
  seed: number,
  world: World,
  teams: readonly RoomTeam[],
  options: RoomOptions = DEFAULT_ROOM_OPTIONS,
): RoomState {
  const problem = checkRoomOptions(options, teams.length)
  if (problem) throw new Error(problem)
  const active = Object.values(world.players).filter(
    (p) => p.clubId !== FREE_AGENT && p.clubId !== RETIRED,
  )
  return {
    rulesVersion: ROOM_RULES_VERSION,
    seed,
    options,
    teams: [...teams],
    players: Object.fromEntries(active.map((p) => [p.id, { ...p, clubId: FREE_AGENT }])),
    origin: Object.fromEntries(active.map((p) => [p.id, world.clubs[p.clubId].shortName])),
    order: createRng(mixSeed(seed, 'ordem')).shuffle(teams.map((t) => t.id)),
    picks: [],
    squads: Object.fromEntries(teams.map((t) => [t.id, []])),
    released: {},
    round: 1,
    fixtures: [],
    today: seasonStart(world.season),
    lineups: {},
    discipline: { injuries: {}, suspensions: {}, yellowCards: {} },
    fitness: {},
    ratings: {},
  }
}

export const totalPicks = (state: RoomState) => state.teams.length * state.options.squadSize

export function roomPhase(state: RoomState): RoomPhase {
  if (state.picks.length < totalPicks(state) || state.fixtures.length === 0) return 'draft'
  return state.round > state.fixtures.length ? 'encerrada' : 'liga'
}

/**
 * Whose pick a pick number is, counted from 0: snake order, so the team that
 * picks last in a round picks first in the next. With the third round
 * reversed, it goes in the second round's order and the snake goes on from
 * there, which takes away most of the edge of picking first.
 */
export function teamForPick(
  order: readonly string[],
  pick: number,
  style: DraftOrder = 'serpentina',
): string {
  const round = Math.floor(pick / order.length)
  const index = pick % order.length
  const flipped = style === 'terceira-invertida' && round >= 2
  const forward = (round % 2 === 0) !== flipped
  return order[forward ? index : order.length - 1 - index]
}

/** The team on the clock, or undefined once the draft is over. */
export const teamOnTheClock = (state: RoomState) =>
  state.picks.length < totalPicks(state)
    ? teamForPick(state.order, state.picks.length, state.options.draftOrder)
    : undefined

/** Players nobody has, strongest first: the order the automatic picks go by. */
export function freePlayers(state: RoomState): Player[] {
  return Object.values(state.players)
    .filter((p) => p.clubId === FREE_AGENT)
    .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))
}

/**
 * How many of each position a squad of this size aims for: the career's squad
 * shape scaled down, with at least the minimum of keepers.
 */
export function squadShape(size: number): SquadShape {
  const total = POSITIONS.reduce((sum, p) => sum + SQUAD_SHAPE[p], 0)
  const shape = Object.fromEntries(
    POSITIONS.map((p) => [p, Math.floor((SQUAD_SHAPE[p] * size) / total)]),
  ) as SquadShape
  shape.G = Math.max(shape.G, ROOM_LIMITS.minKeepers)
  // What rounding left over goes to the outfield, biggest groups first.
  const outfield = POSITIONS.filter((p) => p !== 'G').sort(
    (a, b) => SQUAD_SHAPE[b] - SQUAD_SHAPE[a],
  )
  for (let i = 0; POSITIONS.reduce((sum, p) => sum + shape[p], 0) < size; i++) {
    shape[outfield[i % outfield.length]]++
  }
  return shape
}

const keepersIn = (state: RoomState, teamId: string) =>
  state.squads[teamId].filter((id) => state.players[id].position === 'G').length

/** Why a team can't pick this player now, or undefined when it can. */
export function checkPick(state: RoomState, teamId: string, playerId: string): string | undefined {
  if (teamOnTheClock(state) !== teamId) return 'Não é a vez deste time.'
  const player = state.players[playerId]
  if (!player) return 'Jogador desconhecido.'
  if (player.clubId !== FREE_AGENT) return 'Esse jogador já foi escolhido.'
  const left = state.options.squadSize - state.squads[teamId].length - 1
  const keepers = keepersIn(state, teamId) + (player.position === 'G' ? 1 : 0)
  if (ROOM_LIMITS.minKeepers - keepers > left) {
    return `Faltam goleiros: o elenco precisa de ${ROOM_LIMITS.minKeepers}.`
  }
  return undefined
}

/** Records a pick. Throws when the pick isn't allowed (see {@link checkPick}). */
export function makePick(state: RoomState, teamId: string, playerId: string): RoomState {
  const problem = checkPick(state, teamId, playerId)
  if (problem) throw new Error(problem)
  return {
    ...state,
    picks: [...state.picks, { teamId, playerId }],
    squads: { ...state.squads, [teamId]: [...state.squads[teamId], playerId] },
    players: { ...state.players, [playerId]: { ...state.players[playerId], clubId: teamId } },
  }
}

/**
 * The pick made for a team that isn't picking itself: the first player of its
 * queue still free and allowed, or else the best free player in the position
 * its squad lacks most. Robots pick the same way.
 */
export function autoPick(state: RoomState, teamId: string, queue: readonly string[] = []): string {
  const queued = queue.find((id) => checkPick(state, teamId, id) === undefined)
  if (queued) return queued

  const free = freePlayers(state).filter((p) => checkPick(state, teamId, p.id) === undefined)
  if (free.length === 0) throw new Error('Nobody left to pick')
  const shape = squadShape(state.options.squadSize)
  const have = Object.fromEntries(POSITIONS.map((p) => [p, 0])) as SquadShape
  for (const id of state.squads[teamId]) have[state.players[id].position]++
  // Lacking most is the biggest share of the position still missing; ties go to the best player.
  const lack = (p: Player) => (shape[p.position] - have[p.position]) / shape[p.position]
  const most = Math.max(...free.map(lack))
  return free.find((p) => lack(p) === most)!.id
}

/** Who picks on their own at this moment: robots, people on automatic, and the reserves if set so. */
export type DraftAuto = {
  /** People who switched to automatic, or missed two picks in a row. */
  auto: ReadonlySet<string>
  queues: Readonly<Record<string, readonly string[]>>
}

const picksOnItsOwn = (state: RoomState, teamId: string, auto: DraftAuto) =>
  state.teams.find((t) => t.id === teamId)!.robot ||
  auto.auto.has(teamId) ||
  (state.options.autoReserves && state.squads[teamId].length >= 11)

/**
 * Makes the picks of every team that picks on its own, until it is a person's
 * turn again or the draft is over. The server calls it after each pick and
 * when the clock runs out (with the late team in `auto` for that one pick).
 */
export function advanceDraft(state: RoomState, auto: DraftAuto): RoomState {
  let next = state
  for (let team = teamOnTheClock(next); team; team = teamOnTheClock(next)) {
    if (!picksOnItsOwn(next, team, auto)) break
    next = makePick(next, team, autoPick(next, team, auto.queues[team]))
  }
  return next
}

/** Makes the pick of the team whose clock ran out, then of everyone who picks on their own. */
export function timeoutPick(state: RoomState, auto: DraftAuto): RoomState {
  const team = teamOnTheClock(state)
  if (!team) return state
  return advanceDraft(makePick(state, team, autoPick(state, team, auto.queues[team])), auto)
}
