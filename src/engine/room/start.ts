import { generateWorld } from '../generate/world.ts'
import { FREE_AGENT, RETIRED, type Position, type World } from '../model/types.ts'
import { applyPack, type DataPack } from '../pack/pack.ts'
import { createRoom, squadShape } from './draft.ts'
import type { TeamIdentity } from './team.ts'
import type { RoomOptions, RoomState, RoomTeam, SquadShape } from './types.ts'

/** A player as the draft lists him: what it takes to choose, and his place in the automatic order. */
export type PoolPlayer = {
  id: string
  name: string
  position: Position
  overall: number
  age: number
  /** Short name of his club in the pack. */
  origin: string
  /** 0 for the best: the order the automatic picks go by, ties broken by id. */
  rank: number
}

/** The teams robots play, in the order they fill the free places. Generic names, never a real club. */
const ROBOT_TEAMS: TeamIdentity[] = [
  {
    name: 'Robô Futebol Clube',
    shortName: 'RFC',
    colors: { primary: '#4a4e69', secondary: '#9ad1d4' },
  },
  {
    name: 'Atlético Circuito',
    shortName: 'ACI',
    colors: { primary: '#0f8b8d', secondary: '#f2e8cf' },
  },
  {
    name: 'Esporte Clube Byte',
    shortName: 'ECB',
    colors: { primary: '#e36414', secondary: '#1b1b1b' },
  },
  {
    name: 'Parafuso United',
    shortName: 'PAU',
    colors: { primary: '#6b2c91', secondary: '#f5f5f5' },
  },
  {
    name: 'Real Engrenagem',
    shortName: 'REN',
    colors: { primary: '#8a1c1c', secondary: '#e9d8a6' },
  },
  {
    name: 'Sociedade Chip',
    shortName: 'SCH',
    colors: { primary: '#1f3f8f', secondary: '#f2c230' },
  },
  {
    name: 'Grêmio Algoritmo',
    shortName: 'GAL',
    colors: { primary: '#111111', secondary: '#f5f5f5' },
  },
  {
    name: 'Unidos do Servidor',
    shortName: 'USE',
    colors: { primary: '#1d7a41', secondary: '#f5f5f5' },
  },
  {
    name: 'Clube Atlético Bit',
    shortName: 'CAB',
    colors: { primary: '#d1495b', secondary: '#f5f5f5' },
  },
  {
    name: 'Nacional Pixel',
    shortName: 'NPX',
    colors: { primary: '#f2c230', secondary: '#1d7a41' },
  },
  {
    name: 'Ferroviário Wi-Fi',
    shortName: 'FWF',
    colors: { primary: '#f5f5f5', secondary: '#1f3f8f' },
  },
  {
    name: 'Ypiranga Turbo',
    shortName: 'YTU',
    colors: { primary: '#b3202a', secondary: '#111111' },
  },
  {
    name: 'Botafogo do Teclado',
    shortName: 'BTE',
    colors: { primary: '#222222', secondary: '#f5f5f5' },
  },
  {
    name: 'Associação Cache',
    shortName: 'ACA',
    colors: { primary: '#3a86ff', secondary: '#ffbe0b' },
  },
  {
    name: 'Juventude Joystick',
    shortName: 'JJO',
    colors: { primary: '#2a9d8f', secondary: '#e9c46a' },
  },
  {
    name: 'Operário Pendrive',
    shortName: 'OPE',
    colors: { primary: '#e76f51', secondary: '#264653' },
  },
  {
    name: 'Comercial Modem',
    shortName: 'CMO',
    colors: { primary: '#7b2cbf', secondary: '#ffd60a' },
  },
  {
    name: 'Independente Antena',
    shortName: 'IAN',
    colors: { primary: '#ef476f', secondary: '#073b4c' },
  },
  {
    name: 'Tupi Bluetooth',
    shortName: 'TBL',
    colors: { primary: '#118ab2', secondary: '#f5f5f5' },
  },
  {
    name: 'Vila Nova Laser',
    shortName: 'VNL',
    colors: { primary: '#06d6a0', secondary: '#1b1b1b' },
  },
]

/**
 * The robots that fill a room up to its number of teams, skipping a name or
 * a short name a person already took.
 */
export function robotTeams(count: number, taken: readonly TeamIdentity[]): TeamIdentity[] {
  const names = new Set(taken.map((t) => t.name.trim().toLowerCase()))
  const codes = new Set(taken.map((t) => t.shortName))
  const free = ROBOT_TEAMS.filter(
    (t) => !names.has(t.name.toLowerCase()) && !codes.has(t.shortName),
  )
  // Twelve robots and at most eleven people: there are always enough, numbered if it ever comes short.
  return Array.from(
    { length: count },
    (_, i) =>
      free[i] ?? { name: `Robô ${i + 1}`, shortName: `R${i + 1}`, colors: ROBOT_TEAMS[0].colors },
  )
}

/**
 * The world every room of a pack drafts from. Its seed is fixed, so a player
 * is the same in every room, and the app can list the pool for the queue
 * before the draft, from the pack alone.
 */
const WORLD_SEED = 2026

export const roomWorld = (pack: DataPack): World => applyPack(generateWorld(WORLD_SEED), pack).world

/** Everyone the draft can pick from, strongest first: the order of `freePlayers`. */
export function draftPool(world: World): PoolPlayer[] {
  return Object.values(world.players)
    .filter((p) => p.clubId !== FREE_AGENT && p.clubId !== RETIRED)
    .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))
    .map((p, rank) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      overall: p.overall,
      age: p.age,
      origin: world.clubs[p.clubId].shortName,
      rank,
    }))
}

export type StartedDraft = {
  state: RoomState
  pool: PoolPlayer[]
  /** How many of each position the automatic picks aim for. */
  shape: SquadShape
}

/**
 * Sets a room up for its draft: the people's teams in the order they joined
 * followed by the robots, and the draft order drawn from the seed. Team ids
 * are their places, "0" onwards.
 */
export function startDraft(
  seed: number,
  pack: DataPack,
  people: readonly TeamIdentity[],
  options: RoomOptions,
): StartedDraft {
  const world = roomWorld(pack)
  const identities = [...people, ...robotTeams(options.teams - people.length, people)]
  const teams: RoomTeam[] = identities.map((team, i) => ({
    ...team,
    id: String(i),
    robot: i >= people.length,
  }))
  return {
    state: createRoom(seed, world, teams, options),
    pool: draftPool(world),
    shape: squadShape(options.squadSize),
  }
}
