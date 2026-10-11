import { wageFor } from '../generate/player.ts'
import type { Club } from '../model/types.ts'

/**
 * Money knobs, in reais. Squads cost about what a club of their size earns:
 * tickets cover roughly half the wage bill, sponsors a third, and prize money
 * and transfers decide who ends the year in profit. economy.test.ts pins it.
 */
export const ECONOMY = {
  /** Rounds between paydays; the rest of the year's months are paid when the season closes. */
  roundsPerMonth: 4,
  monthsPerYear: 12,
  /** Ticket price fans find fair, as base * e^(growth * reputation). */
  ticketBase: 8,
  ticketGrowth: 0.025,
  /** How strongly crowds shrink when tickets cost more than fair, and grow when cheaper. */
  priceElasticity: 1.3,
  /** Share of the stadium a club fills at a fair price: floor + reputation / divisor. */
  crowdFloor: 0.1,
  crowdDivisor: 150,
  /** A club at the top of the table draws this much more than one at the bottom. */
  formSwing: 0.3,
  /** Yearly sponsorship as a share of what a typical squad of the club's size earns. */
  sponsorShare: { 1: 0.3, 2: 0.25 } as Record<number, number>,
  /** A fresh club holds this many months of its wage bill in the bank. */
  startingMonthsOfWages: 4,
}

/** Players in a typical squad, for sizing money to a club. */
const SQUAD_SIZE = 25

/** What a club of this reputation pays its squad each month, roughly. */
export function typicalWageBill(reputation: number): number {
  return SQUAD_SIZE * wageFor(reputation)
}

export function fairTicketPrice(reputation: number): number {
  return Math.round(ECONOMY.ticketBase * Math.exp(ECONOMY.ticketGrowth * reputation))
}

/** Cash a newly generated club starts with; luck spreads it from 60% to 140% of normal. */
export function startingCash(reputation: number, luck: number): number {
  const cash = typicalWageBill(reputation) * ECONOMY.startingMonthsOfWages * (0.6 + 0.8 * luck)
  return Math.round(cash / 100_000) * 100_000
}

export function monthlySponsorship(club: Club): number {
  const share = ECONOMY.sponsorShare[club.division] ?? ECONOMY.sponsorShare[2]
  return Math.round((typicalWageBill(club.reputation) * share) / 10_000) * 10_000
}

/**
 * Crowd for a home match: bigger clubs fill more of their stadium, a good run
 * brings more fans, and dear tickets keep them away. `standing` is the club's
 * place in the table from 0 (top) to 1 (bottom).
 */
export function attendance(club: Club, standing: number, price = club.ticketPrice): number {
  const fair = fairTicketPrice(club.reputation)
  const base = ECONOMY.crowdFloor + club.reputation / ECONOMY.crowdDivisor
  const form = 1 - ECONOMY.formSwing / 2 + ECONOMY.formSwing * (1 - standing)
  const priceEffect = (fair / Math.max(1, price)) ** ECONOMY.priceElasticity
  const share = Math.min(1, base * form * priceEffect)
  return Math.round(club.stadiumCapacity * share)
}

export const ticketRevenue = (club: Club, standing: number) =>
  attendance(club, standing) * club.ticketPrice
