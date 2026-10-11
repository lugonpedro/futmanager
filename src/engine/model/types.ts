/** G = goleiro, Z = zagueiro, L = lateral, M = meio-campo, A = atacante. */
export type Position = 'G' | 'Z' | 'L' | 'M' | 'A'

export const POSITIONS: readonly Position[] = ['G', 'Z', 'L', 'M', 'A']

/** Brasfoot-style traits: a player has a strength plus a few standout skills. */
export type Trait =
  | 'reflexo'
  | 'colocacao'
  | 'saida'
  | 'marcacao'
  | 'desarme'
  | 'cabeceio'
  | 'cruzamento'
  | 'velocidade'
  | 'passe'
  | 'armacao'
  | 'drible'
  | 'finalizacao'

export type Player = {
  id: string
  name: string
  age: number
  position: Position
  /** Current ability, 1 to 99. */
  strength: number
  /** Ability the player can grow into, never below strength. */
  potential: number
  traits: Trait[]
  /** Monthly wage. */
  wage: number
  marketValue: number
  /** Last season covered by the contract. */
  contractUntil: number
  /** FREE_AGENT when the player has no club. */
  clubId: string
}

/** clubId of a player without a club, free to sign for wages alone. */
export const FREE_AGENT = ''

export type Club = {
  id: string
  name: string
  shortName: string
  city: string
  colors: { primary: string; secondary: string }
  /** How big the club is, 1 to 99; drives squad strength, crowds and money. */
  reputation: number
  stadiumCapacity: number
  /** Price of a ticket for home matches, in reais. */
  ticketPrice: number
  cash: number
  division: number
  playerIds: string[]
}

export type League = {
  id: string
  name: string
  /** 1 is the top division. */
  division: number
  clubIds: string[]
}

export type World = {
  seed: number
  season: number
  leagues: League[]
  clubs: Record<string, Club>
  players: Record<string, Player>
}

export type Formation = '4-4-2' | '4-3-3' | '3-5-2' | '4-5-1' | '5-3-2'

export type Posture = 'defensiva' | 'normal' | 'ofensiva'

/** A starter and the position they play in this match (may differ from their own). */
export type LineupSlot = { playerId: string; position: Position }

export type Lineup = {
  formation: Formation
  posture: Posture
  starters: LineupSlot[]
  bench: string[]
}

export type MatchEventType =
  | 'inicio'
  | 'intervalo'
  | 'fim'
  | 'gol'
  | 'chance'
  | 'defesa'
  | 'amarelo'
  | 'vermelho'
  | 'lesao'
  | 'substituicao'

export type MatchEvent = {
  minute: number
  type: MatchEventType
  clubId?: string
  playerId?: string
  /** Player coming on, for substitutions. */
  otherPlayerId?: string
  text: string
}

export type TeamStats = {
  goals: number
  shots: number
  shotsOnTarget: number
  /** Share of minutes in possession, 0 to 100. */
  possession: number
  yellowCards: number
  redCards: number
}

export type MatchResult = {
  homeId: string
  awayId: string
  homeGoals: number
  awayGoals: number
  events: MatchEvent[]
  stats: { home: TeamStats; away: TeamStats }
  /** Players sent off or injured, for the season to turn into suspensions. */
  sentOff: string[]
  injured: string[]
}

/** A goal as the season remembers it, for the top scorers list. */
export type GoalRecord = { playerId: string; clubId: string; minute: number }

/** What a played fixture keeps: the score, the scorers and the cards for tiebreakers. */
export type FixtureResult = {
  homeGoals: number
  awayGoals: number
  goals: GoalRecord[]
  cards: { home: { yellow: number; red: number }; away: { yellow: number; red: number } }
}

export type Fixture = {
  id: string
  leagueId: string
  /** 1-based. */
  round: number
  homeId: string
  awayId: string
  result?: FixtureResult
}

export type Season = {
  year: number
  /** Next round to play, 1-based; past the last round once the season is over. */
  round: number
  totalRounds: number
  /** Fixtures per league id, indexed by round - 1. */
  fixtures: Record<string, Fixture[][]>
  /** Rounds each player still has to miss. */
  injuries: Record<string, number>
  suspensions: Record<string, number>
  /** Yellow cards building up towards a suspension. */
  yellowCards: Record<string, number>
}

export type LeagueOutcome = {
  leagueId: string
  division: number
  /** Club ids in final order. */
  table: string[]
  promoted: string[]
  relegated: string[]
  topScorer?: { playerId: string; clubId: string; goals: number }
}

export type SeasonSummary = {
  year: number
  leagues: LeagueOutcome[]
  /** Prize money paid per club. */
  prizes: Record<string, number>
  /** The user's season totals per category, filled in once the season closes. */
  userFinances?: Partial<Record<LedgerCategory, number>>
}

export type LedgerCategory =
  'bilheteria' | 'patrocinio' | 'premiacao' | 'vendas' | 'salarios' | 'compras'

/** One movement of the user's club money; incomes positive, costs negative. */
export type LedgerEntry = {
  round: number
  category: LedgerCategory
  amount: number
  note: string
}

/** A club wanting to buy one of the user's players; it lapses after a round. */
export type TransferOffer = {
  id: string
  playerId: string
  clubId: string
  fee: number
  round: number
}

/** A completed transfer, for the market news. */
export type TransferNews = {
  season: number
  round: number
  playerId: string
  fromClubId: string
  toClubId: string
  fee: number
}

export type Market = {
  /** User players up for sale, with the asking price. */
  listed: Record<string, number>
  offers: TransferOffer[]
  /** Latest transfers, newest first. */
  news: TransferNews[]
}

/** Everything a career needs; plain JSON so it can be saved as is. */
export type GameState = {
  /** Save format, so older careers can be upgraded on load. */
  version: number
  world: World
  userClubId: string
  /** The user's lineup and tactics as last set; patched up before each match. */
  userLineup?: Lineup
  season: Season
  /** The user's money movements this season. */
  ledger: LedgerEntry[]
  market: Market
  history: SeasonSummary[]
}
