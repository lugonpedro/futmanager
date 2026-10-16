import { marketValueFor, playerProfile, potentialRoom, wageFor } from '../generate/player.ts'
import { generateWorld } from '../generate/world.ts'
import type { Club, Player, Position, World } from '../model/types.ts'
import { POSITIONS } from '../model/types.ts'
import { createRng, mixSeed } from '../rng.ts'

/**
 * A data pack: names the user brings for the clubs and players of a generated
 * world, club by club and player by player. Whatever it leaves out stays as
 * generated. It never carries images, so crests stay the generic drawn ones.
 */
export type DataPack = {
  name: string
  /**
   * One entry per club slot, strongest first: the first 20 go to the Série A
   * clubs from the top down, the next 20 to the Série B. Empty entries keep
   * the generated club.
   */
  clubs: PackClub[]
}

export type PackClub = {
  name?: string
  shortName?: string
  city?: string
  colors?: { primary: string; secondary: string }
  /** Players in squad order: by position, best first; see applyPack(). */
  players?: PackPlayer[]
}

/** A player with no name keeps the generated one; he can still hold his place in the order. */
export type PackPlayer = {
  name?: string
  position?: Position
  age?: number
  overall?: number
}

export const PACK_LIMITS = {
  name: 40,
  shortName: 4,
  age: { min: 15, max: 45 },
  overall: { min: 1, max: 99 },
}

/** A short name of at least two characters, cleaned up, or nothing. */
const validShortName = (text?: string) => {
  const code = text && cleanShortName(text)
  return code && code.length >= 2 ? code : undefined
}

/** Keeps what can be a short name: up to four capital letters or digits. */
export const cleanShortName = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, PACK_LIMITS.shortName)

export const emptyPack = (name = ''): DataPack => ({ name, clubs: [] })

const clampTo = (value: number, limits: { min: number; max: number }) =>
  Math.min(limits.max, Math.max(limits.min, Math.round(value)))

const POSITION_INDEX = Object.fromEntries(POSITIONS.map((p, i) => [p, i])) as Record<
  Position,
  number
>

/** The clubs in the order pack slots refer to them: by division, then the biggest first. */
export function packSlots(world: World): Club[] {
  return Object.values(world.clubs).sort(
    (a, b) =>
      a.division - b.division ||
      b.reputation - a.reputation ||
      a.id.localeCompare(b.id, 'en', { numeric: true }),
  )
}

/** A club's squad in the order pack players are matched to it: by position, best first. */
export function squadOrder(world: World, club: Club): Player[] {
  return club.playerIds
    .map((id) => world.players[id])
    .sort(
      (a, b) =>
        POSITION_INDEX[a.position] - POSITION_INDEX[b.position] ||
        b.overall - a.overall ||
        a.id.localeCompare(b.id, 'en', { numeric: true }),
    )
}

/**
 * Pairs pack players with squad players. Each one with a position takes the
 * best squad player of that position still free, so an editor row keeps its
 * place; the rest, and those whose position is full, take whoever is left in
 * squad order and move to their position.
 */
export function matchSquad(
  squad: readonly Player[],
  players: readonly PackPlayer[],
): { pairs: [PackPlayer, Player][]; extra: PackPlayer[] } {
  const free = new Set(squad)
  const pairs: [PackPlayer, Player][] = []
  const waiting: PackPlayer[] = []
  for (const entry of players) {
    const slot = entry.position && squad.find((p) => free.has(p) && p.position === entry.position)
    if (slot) {
      free.delete(slot)
      pairs.push([entry, slot])
    } else waiting.push(entry)
  }
  const left = squad.filter((p) => free.has(p))
  return {
    pairs: [
      ...pairs,
      ...waiting.slice(0, left.length).map((e, i): [PackPlayer, Player] => [e, left[i]]),
    ],
    extra: waiting.slice(left.length),
  }
}

/**
 * The pack players lined up with the squad, one per squad player in squad
 * order, as the editor shows them; the ones a squad player got none from
 * just hold his position.
 */
export function alignToSquad(
  squad: readonly Player[],
  players: readonly PackPlayer[],
): PackPlayer[] {
  const paired = new Map(matchSquad(squad, players).pairs.map(([entry, p]) => [p.id, entry]))
  return squad.map((p) => ({ position: p.position, ...paired.get(p.id) }))
}

/** Only names and colours, for a career under way, where skills would upset the balance. */
export type ApplyMode = 'full' | 'names'

export type ApplyReport = { clubs: number; players: number; warnings: string[] }

function applyPlayer(world: World, player: Player, entry: PackPlayer, mode: ApplyMode): Player {
  const name = entry.name?.trim()
  const named = name ? { ...player, name } : player
  if (mode === 'names') return named
  const position = entry.position ?? player.position
  const age = entry.age === undefined ? player.age : clampTo(entry.age, PACK_LIMITS.age)
  const target =
    entry.overall === undefined ? undefined : clampTo(entry.overall, PACK_LIMITS.overall)
  if (position === player.position && target === undefined && age === player.age) {
    return named
  }
  // New skills come from a seed of his own, so the same pack always makes the same player.
  const reshaped: Partial<Player> =
    position !== player.position || target !== undefined
      ? playerProfile(
          createRng(mixSeed(world.seed, player.id, 'pacote')),
          position,
          target ?? player.overall,
        )
      : {}
  const overall = reshaped.overall ?? player.overall
  // A new age brings the growth room of that age, so a veteran from the pack has peaked.
  const room =
    entry.age === undefined
      ? player.potential - player.overall
      : potentialRoom(createRng(mixSeed(world.seed, player.id, 'pacote', 'potencial')), age)
  const potential = Math.min(99, Math.max(overall, overall + room))
  return {
    ...named,
    ...reshaped,
    position,
    age,
    potential,
    wage: wageFor(overall),
    marketValue: marketValueFor(overall, potential, age),
  }
}

/**
 * Puts a pack's names on a world. Club slots and squads are matched as
 * packSlots() and matchSquad() say; same world and pack, same result.
 */
export function applyPack(
  world: World,
  pack: DataPack,
  mode: ApplyMode = 'full',
): { world: World; report: ApplyReport } {
  const slots = packSlots(world)
  const clubs = { ...world.clubs }
  const players = { ...world.players }
  const report: ApplyReport = { clubs: 0, players: 0, warnings: [] }

  pack.clubs.slice(0, slots.length).forEach((entry, index) => {
    const club = slots[index]
    const { players: entries = [], ...given } = entry ?? {}
    const fields = definedOnly({
      ...given,
      name: given.name?.trim(),
      city: given.city?.trim(),
      shortName: validShortName(given.shortName),
    })
    const changed = Object.values(fields).some((value) => value)
    if (changed) {
      clubs[club.id] = { ...club, ...fields }
      report.clubs++
    }
    const { pairs, extra } = matchSquad(squadOrder(world, club), entries)
    for (const [entry, player] of pairs) {
      const updated = applyPlayer(world, player, entry, mode)
      if (updated !== player) {
        players[player.id] = updated
        report.players++
      }
    }
    if (extra.length > 0) {
      const label = clubs[club.id].name
      report.warnings.push(
        `${label}: ${extra.length} jogador(es) a mais que o elenco de ${squadSize(club)} ficaram de fora.`,
      )
    }
  })
  if (pack.clubs.length > slots.length) {
    report.warnings.push(
      `O pacote tem ${pack.clubs.length} clubes e o mundo tem ${slots.length}; os últimos ficaram de fora.`,
    )
  }
  return { world: { ...world, clubs, players }, report }
}

const squadSize = (club: Club) => club.playerIds.length

const definedOnly = <T extends object>(fields: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<T>

/** Every club and player name of a world as a pack, to hand to friends or edit elsewhere. */
export function packFromWorld(world: World, name: string): DataPack {
  return {
    name,
    clubs: packSlots(world).map((club) => ({
      name: club.name,
      shortName: club.shortName,
      city: club.city,
      colors: { ...club.colors },
      players: squadOrder(world, club).map((p) => ({ name: p.name, position: p.position })),
    })),
  }
}

/**
 * Puts back the names the world was generated with, on the clubs and players
 * it was generated with; academy players and the like keep theirs.
 */
export function restoreGeneratedNames(world: World): World {
  const original = generateWorld(world.seed, world.season)
  const clubs = Object.fromEntries(
    Object.entries(world.clubs).map(([id, club]) => {
      const first = original.clubs[id]
      if (!first) return [id, club]
      const { name, shortName, city, colors } = first
      return [id, { ...club, name, shortName, city, colors }]
    }),
  )
  const players = Object.fromEntries(
    Object.entries(world.players).map(([id, player]) => [
      id,
      original.players[id] ? { ...player, name: original.players[id].name } : player,
    ]),
  )
  return { ...world, clubs, players }
}

/** Whether a pack would change anything at all. */
export const packIsEmpty = (pack: DataPack) =>
  pack.clubs.every(
    (club) =>
      !club ||
      (club.name === undefined &&
        club.shortName === undefined &&
        club.city === undefined &&
        club.colors === undefined &&
        (club.players ?? []).every(
          (p) => p.name === undefined && p.age === undefined && p.overall === undefined,
        )),
  )
