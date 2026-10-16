import { newCareer } from './career/board.ts'
import { fairTicketPrice, monthlySponsorship, startingCash } from './finance/economy.ts'
import { marketValueFor, playerProfile, wageFor } from './generate/player.ts'
import type {
  Club,
  CupStage,
  Fixture,
  GameState,
  LedgerEntry,
  Player,
  PlayStyle,
  Season,
  SponsorDeal,
  Sponsorship,
  TransferNews,
  TransferOffer,
  World,
} from './model/types.ts'
import { addDays, seasonDates, type GameDate } from './season/calendar.ts'
import { NO_TRAINING } from './progression/training.ts'
import { createCup, CUP_ROUNDS } from './season/cup.ts'
import { mixSeed, SAVE_VERSION } from './season/season.ts'
import { MARKET } from './transfer/market.ts'
import { createRng } from './rng.ts'

/** A career as stored before version 10, with only the shirt sponsor. */
type V9Game = Omit<GameState, 'version' | 'sponsorship'> & {
  version: 9
  sponsorship: Omit<Sponsorship, 'secondary' | 'secondaryOffers'>
}

/** A career as stored before version 9 (M8), without training or loans. */
type V8Game = Omit<V9Game, 'version' | 'training' | 'loans' | 'growth'> & { version: 8 }

/** A career as stored before version 8 (M7), when sponsorship was a fixed monthly sum. */
type V7Game = Omit<V8Game, 'version' | 'sponsorship'> & { version: 7 }

/** A career as stored before version 7 (M3), when the round's best XI was a list of ids. */
type V6Game = Omit<V7Game, 'version' | 'season'> & {
  version: 6
  season: Omit<Season, 'roundStars'> & { roundStars: string[] }
}

/** A career as stored before version 6 (phase 11), before data packs and the editor. */
type V5Game = Omit<V6Game, 'version' | 'names'> & { version: 5 }

/** Brasfoot-style skills a player had before version 5 (phase 10), now play styles. */
type Trait =
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

const TRAIT_STYLES: Record<Trait, PlayStyle> = {
  reflexo: 'paredao',
  colocacao: 'colocacao',
  saida: 'saida',
  marcacao: 'muralha',
  desarme: 'desarmador',
  cabeceio: 'cabeceador',
  cruzamento: 'cruzador',
  velocidade: 'velocista',
  passe: 'passador',
  armacao: 'armador',
  drible: 'driblador',
  finalizacao: 'finalizador',
}

/** A player before version 5: one strength number and a few traits. */
type V4Player = Omit<
  Player,
  'overall' | 'attributes' | 'secondary' | 'styles' | 'foot' | 'weakFoot' | 'history'
> & { strength: number; traits: Trait[] }

/** A career as stored before version 5 (phase 10), before attributes, form and fitness. */
type V4Game = Omit<V5Game, 'version' | 'world' | 'season'> & {
  version: 4
  world: Omit<World, 'players'> & { players: Record<string, V4Player> }
  season: Omit<Season, 'fitness' | 'ratings' | 'roundStars'>
}

type Undated<T> = Omit<T, 'date'> & { round: number }
type V3Fixture = Omit<Fixture, 'date'>

/** A career as stored before version 4 (phase 9), counting time in rounds instead of days. */
type V3Game = Omit<V4Game, 'version' | 'today' | 'season' | 'ledger' | 'market'> & {
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
  world: Omit<V4Game['world'], 'clubs'> & {
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
  const players = mapValues(world.players, (player: V4Player) => ({
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
    // The board only looks at the clubs.
    career: newCareer({ ...world, players: {} }, saved.userClubId),
  }
}

function fromV3(saved: V3Game): V4Game {
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
    version: 4,
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

/**
 * Every player gets attributes worked out from his strength, position and
 * traits, from a seed of his own, so the overall lands on the old strength
 * and careers under way stay as balanced as they were.
 */
function fromV4(saved: V4Game): V5Game {
  const { world, season } = saved
  const players = mapValues(world.players, ({ strength, traits, ...player }): Player => {
    const rng = createRng(mixSeed(world.seed, player.id))
    const profile = playerProfile(
      rng,
      player.position,
      strength,
      traits.map((t) => TRAIT_STYLES[t]),
    )
    return { ...player, ...profile, potential: Math.max(player.potential, profile.overall) }
  })
  return {
    ...saved,
    version: 5,
    world: { ...world, players },
    season: { ...season, fitness: {}, ratings: {}, roundStars: [] },
  }
}

/** Every career before data packs had generated names. */
function fromV5(saved: V5Game): V6Game {
  return { ...saved, version: 6, names: {} }
}

/**
 * The old best XI kept no ratings or goals, so it is left out; the next league
 * round picks a new one.
 */
function fromV6(saved: V6Game): V7Game {
  return { ...saved, version: 7, season: { ...saved.season, roundStars: [] } }
}

/**
 * The fixed sponsorship becomes a shirt deal paying the same each month to
 * the end of the season, with no goal; new offers come with the next season.
 */
function fromV7(saved: V7Game): V8Game {
  const club = saved.world.clubs[saved.userClubId]
  const year = saved.season.year
  const master: SponsorDeal = {
    id: `${year}-atual`,
    company: 'Patrocinador atual',
    monthly: monthlySponsorship(club),
    bonus: 0,
    style: 'segura',
    firstSeason: year,
    lastSeason: year,
  }
  return { ...saved, version: 8, sponsorship: { master, offers: [] } }
}
function fromV8(saved: V8Game): V9Game {
  return { ...saved, version: 9, training: NO_TRAINING, loans: [] }
}

/** No smaller sponsors yet; offers come on the next 1st of a month. */
function fromV9(saved: V9Game): GameState {
  return {
    ...saved,
    version: SAVE_VERSION,
    sponsorship: { ...saved.sponsorship, secondary: [], secondaryOffers: [] },
  }
}

/** Brings a saved career up to the current format, so old saves keep working. */
export function upgradeGame(
  saved: GameState | V9Game | V8Game | V7Game | V6Game | V5Game | V4Game | V3Game | V2Game | V1Game,
): GameState {
  const version = saved.version ?? 1
  if (version >= SAVE_VERSION) return saved as GameState
  const v2 = version < 2 ? fromV1(saved as V1Game) : (saved as V2Game)
  const v3 = version < 3 ? fromV2(v2) : (saved as V3Game)
  const v4 = version < 4 ? fromV3(v3) : (saved as V4Game)
  const v5 = version < 5 ? fromV4(v4) : (saved as V5Game)
  const v6 = version < 6 ? fromV5(v5) : (saved as V6Game)
  const v7 = version < 7 ? fromV6(v6) : (saved as V7Game)
  const v8 = version < 8 ? fromV7(v7) : (saved as V8Game)
  const v9 = version < 9 ? fromV8(v8) : (saved as V9Game)
  return fromV9(v9)
}
