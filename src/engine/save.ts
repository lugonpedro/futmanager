import { newCareer } from './career/board.ts'
import { fairTicketPrice, startingCash } from './finance/economy.ts'
import { marketValueFor, wageFor } from './generate/player.ts'
import type { Club, GameState, Player } from './model/types.ts'
import { createCup, CUP_ROUNDS } from './season/cup.ts'
import { mixSeed, SAVE_VERSION } from './season/season.ts'
import { createRng } from './rng.ts'

/** A career as stored before version 3 (phase 6), without the board, cup and appearances. */
type V2Game = Omit<GameState, 'version' | 'career' | 'season'> & {
  version: 2
  season: Omit<GameState['season'], 'appearances' | 'cup'>
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

function fromV2(saved: V2Game): GameState {
  // A season already under way joins the cup only if its first stage is still to come.
  const { world, season } = saved
  const cup =
    season.round <= CUP_ROUNDS[0]
      ? createCup(Object.values(world.clubs), createRng(mixSeed(world.seed, season.year, 'copa')))
      : undefined
  return {
    ...saved,
    version: SAVE_VERSION,
    season: { ...season, appearances: {}, ...(cup && { cup }) },
    career: newCareer(world, saved.userClubId),
  }
}

/** Brings a saved career up to the current format, so old saves keep working. */
export function upgradeGame(saved: GameState | V2Game | V1Game): GameState {
  if ((saved.version ?? 1) >= SAVE_VERSION) return saved as GameState
  const v2 = (saved.version ?? 1) < 2 ? fromV1(saved as V1Game) : (saved as V2Game)
  return fromV2(v2)
}
