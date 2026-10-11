import { generateYouth, marketValueFor } from '../generate/player.ts'
import { SQUAD_SHAPE } from '../generate/world.ts'
import {
  FREE_AGENT,
  POSITIONS,
  RETIRED,
  type GameState,
  type Player,
  type Position,
  type World,
} from '../model/types.ts'
import type { Rng } from '../rng.ts'
import { MARKET, squadOf, transferPlayer } from '../transfer/market.ts'

export const PROGRESSION = {
  /** Appearances that count as a full season of football. */
  fullSeason: 25,
  /** From this age a player may retire; at the last one he always does. */
  retireFrom: 34,
  retireBy: 38,
  /** Youngsters each club's academy sends up every season, at least and at most. */
  youth: { min: 1, max: 2 },
  /** AI clubs let their weakest spares go above this squad size. */
  aiSquadCap: 28,
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)))

/**
 * A year older: young players grow towards their potential, faster the more
 * they play; players in their prime hold steady; past 30 they decline.
 */
export function developPlayer(player: Player, appearances: number, rng: Rng): Player {
  const age = player.age + 1
  const playing = Math.min(1, appearances / PROGRESSION.fullSeason)
  const room = player.potential - player.strength
  let change: number
  if (age <= 21) change = room * (0.12 + 0.28 * playing) + rng.normal(0, 1.5)
  else if (age <= 25) change = room * (0.1 + 0.2 * playing) + rng.normal(0, 1.5)
  else if (age <= 29) change = rng.normal(playing > 0.5 ? 0.3 : -0.5, 1.5)
  else if (age <= 32) change = -rng.int(1, 3)
  else change = -rng.int(2, 5)

  const strength = clamp(player.strength + Math.min(change, room), 1, 99)
  // Past the peak the ceiling comes down with the player.
  const potential = age >= 30 ? strength : Math.max(player.potential, strength)
  return {
    ...player,
    age,
    strength,
    potential,
    marketValue: marketValueFor(strength, potential, age),
  }
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
 * new world and who retired, so the user can be told about his own.
 */
export function ageWorld(
  world: World,
  appearances: Record<string, number>,
  rng: Rng,
): { world: World; retired: Player[] } {
  const players = { ...world.players }
  const clubs = { ...world.clubs }
  const retired: Player[] = []
  for (const old of Object.values(world.players).sort(byId)) {
    if (old.clubId === RETIRED) continue
    const player = developPlayer(old, appearances[old.id] ?? 0, rng)
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
        .sort((a, b) => a.strength - b.strength || byId(a, b))[0]
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
