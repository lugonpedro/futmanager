import { describe, expect, it } from 'vitest'
import { FREE_AGENT, type GameState } from '../model/types.ts'
import { isSeasonOver, newGame, playRound, startNextSeason } from '../season/season.ts'
import { attendance, fairTicketPrice, ECONOMY } from './economy.ts'
import { ledgerTotals, wageBill } from './finance.ts'

const start = newGame(11, 'C25')
const club = start.world.clubs.C25

describe('attendance', () => {
  it('drops as tickets get dearer and never overflows the stadium', () => {
    const fair = fairTicketPrice(club.reputation)
    const crowds = [fair / 4, fair / 2, fair, fair * 2, fair * 4].map((price) =>
      attendance(club, 0.5, price),
    )
    for (let i = 1; i < crowds.length; i++) expect(crowds[i]).toBeLessThanOrEqual(crowds[i - 1])
    expect(crowds[4]).toBeLessThan(crowds[2])
    expect(crowds[0]).toBeLessThanOrEqual(club.stadiumCapacity)
  })

  it('is bigger for a club at the top of the table', () => {
    expect(attendance(club, 0)).toBeGreaterThan(attendance(club, 1))
  })

  it('fills more of the stadium for bigger clubs', () => {
    const big = { ...club, reputation: 85, ticketPrice: fairTicketPrice(85) }
    const small = { ...club, reputation: 35, ticketPrice: fairTicketPrice(35) }
    expect(attendance(big, 0.5)).toBeGreaterThan(attendance(small, 0.5))
  })
})

describe('a season of money', () => {
  let game: GameState = start
  while (!isSeasonOver(game.season)) game = playRound(game)
  const closed = startNextSeason(game)

  it('pays wages on every fourth round and the rest of the year at the close', () => {
    const paydays = game.ledger.filter((e) => e.category === 'salarios')
    expect(paydays.map((e) => e.round)).toEqual([4, 8, 12, 16, 20, 24, 28, 32, 36])
    const totals = closed.history[0].userFinances!
    expect(-totals.salarios! / wageBill(start.world, club)).toBeCloseTo(ECONOMY.monthsPerYear, 0)
  })

  it('takes gate money for each home match', () => {
    expect(game.ledger.filter((e) => e.category === 'bilheteria')).toHaveLength(19)
  })

  it("keeps the user's ledger in step with the club's cash", () => {
    const totals = Object.values(closed.history[0].userFinances!).reduce((a, b) => a + b, 0)
    expect(closed.world.clubs.C25.cash - club.cash).toBe(totals)
    expect(ledgerTotals(game.ledger).bilheteria).toBeGreaterThan(0)
  })

  it('lets a typical club roughly pay its way', () => {
    // Net result over the year against the wage bill: neither ruin nor runaway riches.
    const ratios = Object.values(start.world.clubs)
      .map((c) => (closed.world.clubs[c.id].cash - c.cash) / (12 * wageBill(start.world, c)))
      .sort((a, b) => a - b)
    const median = ratios[Math.floor(ratios.length / 2)]
    expect(median).toBeGreaterThan(-0.1)
    expect(median).toBeLessThan(0.4)
    expect(ratios[0]).toBeGreaterThan(-0.6)
  })

  it('keeps AI squads full across the close of the season', () => {
    for (const c of Object.values(closed.world.clubs)) {
      if (c.id === closed.userClubId) continue
      expect(c.playerIds.length, c.name).toBeGreaterThanOrEqual(20)
      for (const id of c.playerIds) expect(closed.world.players[id].clubId).toBe(c.id)
    }
    const all = Object.values(closed.world.players)
    // Nobody is lost: the youngsters come in and the retired stay on file.
    const youth = all.filter((p) => !start.world.players[p.id])
    expect(all).toHaveLength(Object.keys(start.world.players).length + youth.length)
    expect(youth.length).toBeGreaterThanOrEqual(Object.keys(closed.world.clubs).length)
    expect(all.some((p) => p.clubId === FREE_AGENT)).toBe(true)
  })
})
