import { fairTicketPrice, startingCash } from './finance/economy.ts'
import { marketValueFor, wageFor } from './generate/player.ts'
import type { Club, GameState, Player } from './model/types.ts'
import { SAVE_VERSION } from './season/season.ts'

/** A career as stored before version 2 (phase 5), without money and market fields. */
type V1Game = Omit<GameState, 'version' | 'ledger' | 'market' | 'world'> & {
  version?: number
  world: Omit<GameState['world'], 'clubs'> & {
    clubs: Record<string, Omit<Club, 'ticketPrice'> & { ticketPrice?: number }>
  }
}

const mapValues = <T, U>(record: Record<string, T>, fn: (value: T) => U): Record<string, U> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fn(value)]))

/** Brings a saved career up to the current format, so old saves keep working. */
export function upgradeGame(saved: GameState | V1Game): GameState {
  if ((saved.version ?? 1) >= SAVE_VERSION) return saved as GameState
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
    version: SAVE_VERSION,
    world: { ...world, clubs, players },
    ledger: [],
    market: { listed: {}, offers: [], news: [] },
  }
}
