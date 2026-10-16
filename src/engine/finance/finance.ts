import type {
  Club,
  Fixture,
  GameState,
  LedgerCategory,
  LedgerEntry,
  World,
} from '../model/types.ts'
import { dateParts } from '../season/calendar.ts'
import { standings } from '../season/standings.ts'
import { monthlySponsorship, attendance } from './economy.ts'

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
        date: game.today,
        category: 'bilheteria',
        amount: revenue,
        note: `Público de ${crowd.toLocaleString('pt-BR')} contra ${world.clubs[fixture.awayId].name}`,
      })
    }
  }
  return payments
}

/** Wages out and sponsorship in, for every club, for the month starting today. */
export function payday(game: GameState, note: string): Payments {
  const { world, userClubId } = game
  const payments = emptyPayments()
  for (const club of Object.values(world.clubs)) {
    const wages = wageBill(world, club)
    const sponsor = monthlySponsorship(club)
    add(payments, club.id, sponsor - wages)
    if (club.id === userClubId) {
      const date = game.today
      payments.entries.push(
        { date, category: 'salarios', amount: -wages, note },
        { date, category: 'patrocinio', amount: sponsor, note },
      )
    }
  }
  return payments
}

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

/** Money in and out of the user's club in one calendar month. */
export type MonthTotals = { year: number; month: number; income: number; costs: number }

/**
 * The ledger month by month, oldest first, with the quiet months in between
 * filled with zeros so a chart of the season keeps its spacing.
 */
export function monthlyTotals(entries: readonly LedgerEntry[]): MonthTotals[] {
  const byMonth = new Map<number, MonthTotals>()
  const key = (year: number, month: number) => year * 12 + month - 1
  for (const entry of entries) {
    const { year, month } = dateParts(entry.date)
    const totals = byMonth.get(key(year, month)) ?? { year, month, income: 0, costs: 0 }
    if (entry.amount >= 0) totals.income += entry.amount
    else totals.costs -= entry.amount
    byMonth.set(key(year, month), totals)
  }
  if (byMonth.size === 0) return []
  const keys = [...byMonth.keys()]
  const months: MonthTotals[] = []
  for (let k = Math.min(...keys); k <= Math.max(...keys); k++) {
    months.push(
      byMonth.get(k) ?? { year: Math.floor(k / 12), month: (k % 12) + 1, income: 0, costs: 0 },
    )
  }
  return months
}

/** The average gate of the user's home games so far this season, or undefined before the first. */
export function averageGate(entries: readonly LedgerEntry[]): number | undefined {
  const gates = entries.filter((e) => e.category === 'bilheteria')
  if (gates.length === 0) return undefined
  return Math.round(gates.reduce((sum, e) => sum + e.amount, 0) / gates.length)
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
