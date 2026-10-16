import type { GameDate } from '../season/calendar.ts'

/** G = goleiro, Z = zagueiro, L = lateral, M = meio-campo, A = atacante. */
export type Position = 'G' | 'Z' | 'L' | 'M' | 'A'

export const POSITIONS: readonly Position[] = ['G', 'Z', 'L', 'M', 'A']

/**
 * A player's skills, 1 to 99. Everyone has every one of them: a centre-back
 * has keeping numbers too, they are just very low.
 */
export type Attributes = {
  acceleration: number
  sprintSpeed: number
  finishing: number
  shotPower: number
  attackPositioning: number
  penalties: number
  shortPassing: number
  longPassing: number
  vision: number
  crossing: number
  dribbling: number
  ballControl: number
  agility: number
  marking: number
  tackling: number
  interceptions: number
  heading: number
  strength: number
  stamina: number
  jumping: number
  aggression: number
  diving: number
  handling: number
  kicking: number
  reflexes: number
  keeperPositioning: number
}

export type Attribute = keyof Attributes

/** Named play styles, the standout skills of a player; the best have the "+" version. */
export type PlayStyle =
  | 'paredao'
  | 'colocacao'
  | 'saida'
  | 'muralha'
  | 'desarmador'
  | 'cabeceador'
  | 'cruzador'
  | 'velocista'
  | 'passador'
  | 'armador'
  | 'driblador'
  | 'finalizador'

export type Foot = 'direito' | 'esquerdo'

/** One season of a player's career, kept once the season closes. */
export type PlayerSeason = {
  year: number
  clubId: string
  games: number
  goals: number
  /** Average match rating, 0 to 10. */
  rating: number
}

export type Player = {
  id: string
  name: string
  age: number
  position: Position
  /** Positions he also plays well in. */
  secondary: Position[]
  /** Current ability, 1 to 99, worked out from the attributes for his position. */
  overall: number
  /** Overall the player can grow into, never below it. */
  potential: number
  attributes: Attributes
  foot: Foot
  /** How good the other foot is, 1 to 5 stars. */
  weakFoot: number
  styles: PlayStyle[]
  /** Monthly wage. */
  wage: number
  marketValue: number
  /** Last season covered by the contract. */
  contractUntil: number
  /** FREE_AGENT when the player has no club. */
  clubId: string
  /** Past seasons, oldest first; only the ones he played in. */
  history?: PlayerSeason[]
}

/** clubId of a player without a club, free to sign for wages alone. */
export const FREE_AGENT = ''
/** clubId of a player who has hung up his boots; he stays on file for the history. */
export const RETIRED = 'aposentado'

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

export type Formation =
  | '4-4-2'
  | '4-3-3'
  | '3-5-2'
  | '4-5-1'
  | '5-3-2'
  | '3-4-3'
  | '4-2-4'
  | '5-4-1'
  | '4-1-4-1'
  | '4-2-3-1'

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
  /** Match rating, 0 to 10, of everyone who played. */
  ratings: Record<string, number>
  /** Energy left at the final whistle, out of 100, of everyone who played. */
  energy: Record<string, number>
}

/** A goal as the season remembers it, for the top scorers list. */
export type GoalRecord = { playerId: string; clubId: string; minute: number }

/** What a played fixture keeps: the score, the scorers and the cards for tiebreakers. */
export type FixtureResult = {
  homeGoals: number
  awayGoals: number
  goals: GoalRecord[]
  cards: { home: { yellow: number; red: number }; away: { yellow: number; red: number } }
  /** Shootout score, for a cup tie level after 90 minutes. */
  penalties?: { home: number; away: number }
}

export type Fixture = {
  id: string
  leagueId: string
  /** 1-based; for a cup tie, the league round its stage follows. */
  round: number
  date: GameDate
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
  /** Day each injured player is fit again. */
  injuries: Record<string, GameDate>
  /** League rounds each player still has to miss. */
  suspensions: Record<string, number>
  /** Yellow cards building up towards a suspension. */
  yellowCards: Record<string, number>
  /** Matches each player started or came on in, which drives his development. */
  appearances: Record<string, number>
  /** The national cup, played in midweek after some league rounds. */
  cup?: Cup
  /** Energy each player was left with after his last match, and when; missing means fresh. */
  fitness: Record<string, Fitness>
  /** Match ratings this season: how many, their sum and the latest five, newest last. */
  ratings: Record<string, SeasonRatings>
  /** Best XI of the last league round, every division together. */
  roundStars: RoundStar[]
}

/** One of the round's best XI, with what put him there. */
export type RoundStar = { playerId: string; rating: number; goals: number; saves: number }

export type Fitness = { energy: number; date: GameDate }

export type SeasonRatings = { games: number; total: number; last: number[] }

/** One knockout round of the cup; its ties are drawn once the round before is over. */
export type CupStage = {
  name: string
  /** League round after which this stage is played. */
  round: number
  /** The Wednesday it is played on. */
  date: GameDate
  ties: Fixture[]
}

export type Cup = {
  stages: CupStage[]
  /** Clubs that skip the first stage and join in the second. */
  byes: string[]
}

export type LeagueOutcome = {
  leagueId: string
  division: number
  /** Club ids in final order. */
  table: string[]
  promoted: string[]
  relegated: string[]
  topScorer?: { playerId: string; clubId: string; goals: number }
  /** Best average rating of the season among regular starters. */
  bestPlayer?: { playerId: string; clubId: string; rating: number }
}

/** How the user's job is going, and the seasons behind it. */
export type Career = {
  status: 'empregado' | 'demitido'
  /** Final position the board expects this season. */
  target: number
  /** Board confidence, 0 to 100; at 0 the manager is sacked. */
  confidence: number
  /** Clubs inviting the manager, when sacked or after a good season. */
  jobOffers: string[]
  history: CareerSeason[]
}

export type CareerSeason = {
  year: number
  clubId: string
  division: number
  position: number
  target: number
  /** How far the club went in the cup. */
  cup?: string
  fired?: boolean
}

export type SeasonSummary = {
  year: number
  leagues: LeagueOutcome[]
  /** Prize money paid per club. */
  prizes: Record<string, number>
  /** The user's season totals per category, filled in once the season closes. */
  userFinances?: Partial<Record<LedgerCategory, number>>
  cupWinnerId?: string
  /** The user's players who retired, and the youngsters who came up, as the next season began. */
  userRetired?: string[]
  userYouth?: string[]
}

export type LedgerCategory =
  'bilheteria' | 'patrocinio' | 'premiacao' | 'vendas' | 'salarios' | 'compras'

/** One movement of the user's club money; incomes positive, costs negative. */
export type LedgerEntry = {
  date: GameDate
  category: LedgerCategory
  amount: number
  note: string
}

/** A club wanting to buy one of the user's players; it lapses after a week, or with the window. */
export type TransferOffer = {
  id: string
  playerId: string
  clubId: string
  fee: number
  date: GameDate
  /** Last day it can be accepted. */
  expires: GameDate
}

/** A completed transfer, for the market news. */
export type TransferNews = {
  season: number
  date: GameDate
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

/** Where a career's club and player names came from, so the game knows what it can put back. */
export type NameOrigin = {
  /** The data pack the career started with or took names from. */
  pack?: string
  /** Whether names were changed in the editor along the way. */
  edited?: boolean
}

/**
 * What a sponsor asks for its bonus: finishing the league at `position` or
 * better (1 is the title; in Série B and below, the promotion places are the
 * acesso), or reaching the cup final.
 */
export type SponsorGoal = { kind: 'posicao'; position: number } | { kind: 'final-copa' }

/** A shirt sponsorship of the user's club, offered or signed. Fictional companies only. */
export type SponsorDeal = {
  id: string
  company: string
  /** Paid on the 1st of each month. */
  monthly: number
  /** Paid at the end of each season the goal is met. */
  bonus: number
  goal?: SponsorGoal
  /** 'segura' pays more each month, 'ousada' more for the goal. */
  style: 'segura' | 'equilibrada' | 'ousada'
  /** Seasons the deal covers, both included. */
  firstSeason: number
  lastSeason: number
}

export type Sponsorship = {
  /** The shirt sponsor, once signed. */
  master?: SponsorDeal
  /** Open offers for the shirt, while there is no sponsor. */
  offers: SponsorDeal[]
  /** If no offer is taken by this day, the board signs the safest. */
  deadline?: GameDate
}

/** Everything a career needs; plain JSON so it can be saved as is. */
export type GameState = {
  /** Save format, so older careers can be upgraded on load. */
  version: number
  /** The day the career is on. */
  today: GameDate
  world: World
  userClubId: string
  /** The user's lineup and tactics as last set; patched up before each match. */
  userLineup?: Lineup
  season: Season
  /** The user's money movements this season. */
  ledger: LedgerEntry[]
  market: Market
  sponsorship: Sponsorship
  career: Career
  history: SeasonSummary[]
  /** Generated names unless this says otherwise. */
  names: NameOrigin
}
