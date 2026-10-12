import { newCareer } from './career/board.ts'
import { fairTicketPrice, startingCash } from './finance/economy.ts'
import { marketValueFor, wageFor } from './generate/player.ts'
import type {
  Club,
  CupStage,
  Fixture,
  GameState,
  LedgerEntry,
  Player,
  Season,
  TransferNews,
  TransferOffer,
} from './model/types.ts'
import { addDays, seasonDates, type GameDate } from './season/calendar.ts'
import { createCup, CUP_ROUNDS } from './season/cup.ts'
import { mixSeed, SAVE_VERSION } from './season/season.ts'
import { MARKET } from './transfer/market.ts'
import { createRng } from './rng.ts'

type Undated<T> = Omit<T, 'date'> & { round: number }
type V3Fixture = Omit<Fixture, 'date'>

/** A career as stored before version 4 (phase 9), counting time in rounds instead of days. */
type V3Game = Omit<GameState, 'version' | 'today' | 'season' | 'ledger' | 'market'> & {
  version: 3
  season: Omit<Season, 'injuries' | 'fixtures' | 'cup'> & {
    /** Rounds each player still had to miss. */
    injuries: Record<string, number>
    fixtures: Record<string, V3Fixture[][]>
    cup?: { stages: (Omit<CupStage, 'date' | 'ties'> & { ties: V3Fixture[] })[]; byes: string[] }
  }
  ledger: Undated<LedgerEntry>[]
  market: {
    listed: Record<string, number>
    offers: Undated<Omit<TransferOffer, 'expires'>>[]
    news: Undated<TransferNews>[]
  }
}

/** A career as stored before version 3 (phase 6), without the board, cup and appearances. */
type V2Game = Omit<V3Game, 'version' | 'career' | 'season'> & {
  version: 2
  season: Omit<V3Game['season'], 'appearances' | 'cup'>
}

/** A career as stored before version 2 (phase 5), without money and market fields. */
type V1Game = Omit<V2Game, 'version' | 'ledger' | 'market' | 'world'> & {
  version?: 1
  world: Omit<GameState['world'], 'clubs'> & {
    clubs: Record<string, Omit<Club, 'ticketPrice'> & { ticketPrice?: number }>
  }
}

const mapValues = <T, U>(record: Record<string, T>, fn: (value: T) => U): Record<string, U> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fn(value)]))

function fromV1(saved: V1Game): V2Game {
  // Version 1 money was on a 30 times smaller scale and had no tickets, ledger or market.
  const { world } = saved
  const clubs = mapValues(world.clubs, (club) => ({
    ...club,
    ticketPrice: club.ticketPrice ?? fairTicketPrice(club.reputation),
    cash: Math.round(
      (club.cash * startingCash(club.reputation, 0.5)) / (club.reputation ** 2 * 1000),
    ),
  }))
  const players = mapValues(world.players, (player: Player) => ({
    ...player,
    wage: wageFor(player.strength),
    marketValue: marketValueFor(player.strength, player.potential, player.age),
  }))
  return {
    ...saved,
    version: 2,
    world: { ...world, clubs, players },
    ledger: [],
    market: { listed: {}, offers: [], news: [] },
  }
}

function fromV2(saved: V2Game): V3Game {
  // A season already under way joins the cup only if its first stage is still to come.
  const { world, season } = saved
  const cup =
    season.round <= CUP_ROUNDS[0]
      ? createCup(
          Object.values(world.clubs),
          createRng(mixSeed(world.seed, season.year, 'copa')),
          seasonDates(season.year, season.totalRounds, CUP_ROUNDS).cup,
        )
      : undefined
  return {
    ...saved,
    version: 3,
    season: { ...season, appearances: {}, ...(cup && { cup }) },
    career: newCareer(world, saved.userClubId),
  }
}

function fromV3(saved: V3Game): GameState {
  // The rounds get the days the calendar gives them, and the career goes to the next one.
  const { season, ledger, market } = saved
  const { cup: undatedCup, ...rest } = season
  const datesOf = (year: number) => seasonDates(year, season.totalRounds, CUP_ROUNDS)
  const dates = datesOf(season.year)
  const dayOf = (round: number, league: GameDate[] = dates.league) =>
    league[Math.min(Math.max(round, 1), league.length) - 1]
  const today = dayOf(Math.min(season.round, season.totalRounds))
  const fixtures = Object.fromEntries(
    Object.entries(season.fixtures).map(([id, rounds]) => [
      id,
      rounds.map((round) => round.map((f) => ({ ...f, date: dayOf(f.round) }))),
    ]),
  )
  const cup = undatedCup && {
    ...undatedCup,
    stages: undatedCup.stages.map((stage) => {
      const date = dates.cup[CUP_ROUNDS.indexOf(stage.round)]
      return { ...stage, date, ties: stage.ties.map((tie) => ({ ...tie, date })) }
    }),
  }
  // An injury of one round kept the player out of the next match, three days off.
  const injuries = mapValues(season.injuries, (rounds) => addDays(today, 7 * rounds - 3))
  return {
    ...saved,
    version: SAVE_VERSION,
    today,
    season: { ...rest, fixtures, injuries, ...(cup && { cup }) },
    ledger: ledger.map(({ round, ...entry }) => ({ ...entry, date: dayOf(round) })),
    market: {
      ...market,
      offers: market.offers.map(({ round, ...offer }) => ({
        ...offer,
        date: dayOf(round),
        expires: addDays(today, MARKET.offerDays),
      })),
      news: market.news.map(({ round, ...news }) => ({
        ...news,
        date: dayOf(round, datesOf(news.season).league),
      })),
    },
  }
}

/** Brings a saved career up to the current format, so old saves keep working. */
export function upgradeGame(saved: GameState | V3Game | V2Game | V1Game): GameState {
  const version = saved.version ?? 1
  if (version >= SAVE_VERSION) return saved as GameState
  const v2 = version < 2 ? fromV1(saved as V1Game) : (saved as V2Game)
  const v3 = version < 3 ? fromV2(v2) : (saved as V3Game)
  return fromV3(v3)
}
