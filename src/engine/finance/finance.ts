import type {
  Club,
  Fixture,
  GameState,
  LedgerCategory,
  LedgerEntry,
  World,
} from '../model/types.ts'
import { standings } from '../season/standings.ts'
import { ECONOMY, monthlySponsorship, attendance } from './economy.ts'

/** Money moved by one step of the calendar: per-club cash changes and the user's ledger lines. */
export type Payments = { cash: Record<string, number>; entries: LedgerEntry[] }

const emptyPayments = (): Payments => ({ cash: {}, entries: [] })

function add(payments: Payments, clubId: string, amount: number) {
  payments.cash[clubId] = (payments.cash[clubId] ?? 0) + amount
}

export const wageBill = (world: World, club: Club) =>
  club.playerIds.reduce((sum, id) => sum + world.players[id].wage, 0)

/** Each club's place in its table, from 0 (top) to 1 (bottom). */
export function standingsShare(game: GameState): Record<string, number> {
  const share: Record<string, number> = {}
  for (const league of game.world.leagues) {
    const table = standings(league.clubIds, game.season.fixtures[league.id].flat())
    table.forEach((row, i) => (share[row.clubId] = i / Math.max(1, table.length - 1)))
  }
  return share
}

/** Gate money for every home side in the round, from the table as it stood before kick-off. */
export function matchdayPayments(game: GameState, fixtures: readonly Fixture[]): Payments {
  const { world, userClubId } = game
  const payments = emptyPayments()
  const standing = standingsShare(game)
  for (const fixture of fixtures) {
    const home = world.clubs[fixture.homeId]
    const crowd = attendance(home, standing[home.id] ?? 0.5)
    const revenue = crowd * home.ticketPrice
    add(payments, home.id, revenue)
    if (home.id === userClubId) {
      payments.entries.push({
        round: game.season.round,
        category: 'bilheteria',
        amount: revenue,
        note: `Público de ${crowd.toLocaleString('pt-BR')} contra ${world.clubs[fixture.awayId].name}`,
      })
    }
  }
  return payments
}

/** Wages out and sponsorship in, for every club, for the given number of months. */
export function payday(game: GameState, months: number, note: string): Payments {
  const { world, userClubId } = game
  const payments = emptyPayments()
  for (const club of Object.values(world.clubs)) {
    const wages = wageBill(world, club) * months
    const sponsor = monthlySponsorship(club) * months
    add(payments, club.id, sponsor - wages)
    if (club.id === userClubId) {
      const round = game.season.round
      payments.entries.push(
        { round, category: 'salarios', amount: -wages, note },
        { round, category: 'patrocinio', amount: sponsor, note },
      )
    }
  }
  return payments
}

export const isPayday = (round: number) => round % ECONOMY.roundsPerMonth === 0

/** Months a season's paydays cover, so the close can pay the rest of the year. */
export const monthsInSeason = (totalRounds: number) =>
  Math.floor(totalRounds / ECONOMY.roundsPerMonth)

export function mergePayments(...all: Payments[]): Payments {
  const merged = emptyPayments()
  for (const payments of all) {
    for (const [id, amount] of Object.entries(payments.cash)) add(merged, id, amount)
    merged.entries.push(...payments.entries)
  }
  return merged
}

/** The game with the payments' cash applied and their lines added to the ledger. */
export function applyPayments(game: GameState, payments: Payments): GameState {
  const clubs = { ...game.world.clubs }
  for (const [id, amount] of Object.entries(payments.cash)) {
    clubs[id] = { ...clubs[id], cash: clubs[id].cash + amount }
  }
  return {
    ...game,
    world: { ...game.world, clubs },
    ledger: [...game.ledger, ...payments.entries],
  }
}

export function ledgerTotals(entries: readonly LedgerEntry[]) {
  const totals: Partial<Record<LedgerCategory, number>> = {}
  for (const entry of entries) {
    totals[entry.category] = (totals[entry.category] ?? 0) + entry.amount
  }
  return totals
}

export const MAX_TICKET_PRICE = 1000

/** Sets the user's ticket price, in whole reais between 1 and MAX_TICKET_PRICE. */
export function setTicketPrice(game: GameState, price: number): GameState {
  const ticketPrice = Math.min(MAX_TICKET_PRICE, Math.max(1, Math.round(price)))
  const club = game.world.clubs[game.userClubId]
  return {
    ...game,
    world: { ...game.world, clubs: { ...game.world.clubs, [club.id]: { ...club, ticketPrice } } },
  }
}
