import type { Fitness, Fixture, Lineup, Player, Position, SeasonRatings } from '../model/types.ts'
import type { GameDate } from '../season/calendar.ts'
import type { Discipline } from '../season/discipline.ts'

/**
 * Bumped when a rule of the rooms changes in a way that would play a round
 * differently. A room keeps the version it was created with, so a fix in the
 * middle of a league never changes results already played.
 */
export const ROOM_RULES_VERSION = 1

export type InjuryRule = 'normais' | 'curtas' | 'desligadas'
export type TradeRule = 'ate-dois-tercos' | 'temporada' | 'desligadas'
/** Snake order, or snake with the third round in the second's order, which evens out picking first. */
export type DraftOrder = 'serpentina' | 'terceira-invertida'

/** What the owner picks when creating a room (pesquisa/13-draft-online.md). */
export type RoomOptions = {
  /** Teams in the league, people and robots together; always even. */
  teams: number
  squadSize: 16 | 18 | 20
  draftOrder: DraftOrder
  /** Seconds each person has for a pick. */
  pickSeconds: 30 | 45 | 60 | 90
  /** Picks after the 11th are made automatically, for a quicker draft. */
  autoReserves: boolean
  /** 1 only the first half, 2 home and away, 3 a third leg on top (no longer offered). */
  legs: 1 | 2 | 3
  injuries: InjuryRule
  trades: TradeRule
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = {
  teams: 8,
  squadSize: 16,
  draftOrder: 'terceira-invertida',
  pickSeconds: 45,
  autoReserves: false,
  legs: 2,
  injuries: 'normais',
  trades: 'temporada',
}

export const ROOM_LIMITS = {
  minTeams: 2,
  maxTeams: 18,
  /** Keepers every squad needs; the draft refuses a pick that would make it impossible. */
  minKeepers: 2,
  /** Longest injury, in days, with short injuries on. */
  shortInjuryDays: 14,
  /** Free agents each team can claim per round. */
  claimsPerRound: 2,
  /** Players on each side of a trade. */
  maxTradePlayers: 3,
} as const

/** A team of the room: a person's or a robot's. */
export type RoomTeam = {
  id: string
  name: string
  shortName: string
  colors: { primary: string; secondary: string }
  /** Robots pick and set their lineup on their own. */
  robot: boolean
}

export type DraftPick = {
  teamId: string
  playerId: string
  /** Overall added when the pick was a prime card (see prime.ts). */
  prime?: number
}

export type RoomPhase = 'draft' | 'liga' | 'encerrada'

/**
 * Everything a room needs to run its draft and its league, apart from the
 * career's `GameState`: no money, no AI market, no ageing. Lives only on the
 * server, with the seed.
 */
export type RoomState = {
  rulesVersion: number
  seed: number
  options: RoomOptions
  teams: RoomTeam[]
  /** Every player of the pack, the drafted ones with `clubId` set to their team. */
  players: Record<string, Player>
  /** The short name of each player's club in the pack, to show where he came from. */
  origin: Record<string, string>
  /** Team ids in the order of the first round of the draft. */
  order: string[]
  picks: DraftPick[]
  /** Each team's players, in the order they joined. */
  squads: Record<string, string[]>
  /** Released players and the first round in which they can be claimed. */
  released: Record<string, number>
  /** Next round to play, 1-based; past the last one once the league is over. */
  round: number
  /** Fixtures by round - 1; empty until the draft is over. */
  fixtures: Fixture[][]
  /** Day of the next round. */
  today: GameDate
  lineups: Record<string, Lineup>
  discipline: Discipline
  fitness: Record<string, Fitness>
  ratings: Record<string, SeasonRatings>
}

/** How many of each position the automatic picks aim for, by squad size. */
export type SquadShape = Record<Position, number>
