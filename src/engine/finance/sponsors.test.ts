import { describe, expect, it } from 'vitest'
import type { GameState, SponsorDeal, Sponsorship } from '../model/types.ts'
import { createRng } from '../rng.ts'
import { passDays, newGame, playRound, isSeasonOver, startNextSeason } from '../season/season.ts'
import { addDays, dateOf } from '../season/calendar.ts'
import { monthlySponsorship } from './economy.ts'
import {
  closeSponsorSeason,
  declineSecondary,
  goalMet,
  secondaryOffers,
  signSecondary,
  signSponsor,
  SPONSOR,
  sponsorOffers,
  userSponsorPayment,
  userSponsorTotal,
} from './sponsors.ts'

const start = newGame(5, 'C3')
/** A sponsorship with just this shirt deal. */
const only = (master: SponsorDeal): Sponsorship => ({
  master,
  offers: [],
  secondary: [],
  secondaryOffers: [],
})
const club = start.world.clubs.C3

describe('sponsorOffers', () => {
  const offers = sponsorOffers(club, 6, 2027, createRng(1))

  it('offers a safe, a balanced and a bold deal from different companies', () => {
    expect(offers.map((o) => o.style)).toEqual(['segura', 'equilibrada', 'ousada'])
    expect(new Set(offers.map((o) => o.company)).size).toBe(3)
    const [safe, , bold] = offers
    expect(safe.monthly).toBeGreaterThan(bold.monthly)
    expect(bold.bonus).toBeGreaterThan(safe.bonus)
    expect(bold.goal).toEqual({ kind: 'posicao', position: 1 })
    expect(safe.goal).toEqual({ kind: 'posicao', position: 6 })
    for (const o of offers) {
      expect(o.lastSeason - o.firstSeason).toBeGreaterThanOrEqual(0)
      expect(o.lastSeason - o.firstSeason).toBeLessThan(SPONSOR.longest)
    }
  })

  it('pays more after a title and less after going down', () => {
    const won = sponsorOffers(club, 6, 2027, createRng(1), {
      champion: true,
      promoted: false,
      relegated: false,
    })
    const down = sponsorOffers(club, 6, 2027, createRng(1), {
      champion: false,
      promoted: false,
      relegated: true,
    })
    expect(won[0].monthly).toBeGreaterThan(offers[0].monthly)
    expect(down[0].monthly).toBeLessThan(offers[0].monthly)
  })

  it('is the same for the same seed', () => {
    expect(sponsorOffers(club, 6, 2027, createRng(1))).toEqual(offers)
  })
})

describe('the shirt deal in a career', () => {
  it('starts with offers open until the first round and half pay meanwhile', () => {
    expect(start.sponsorship.master).toBeUndefined()
    expect(start.sponsorship.offers).toHaveLength(3)
    expect(start.sponsorship.deadline).toBe(
      start.season.fixtures[Object.keys(start.season.fixtures)[0]][0][0].date,
    )
    expect(userSponsorPayment(start).amount).toBeCloseTo(
      monthlySponsorship(club) * SPONSOR.standIn,
      -5,
    )
  })

  it('pays the signed deal each month', () => {
    const bold = start.sponsorship.offers[2]
    const signed = signSponsor(start, bold.id)
    expect(signed.sponsorship).toEqual({
      master: bold,
      offers: [],
      secondary: [],
      secondaryOffers: [],
    })
    const paid = passDays(signed, addDays(signed.today, 40)).game
    const lines = paid.ledger.filter((e) => e.category === 'patrocinio')
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line.amount).toBe(bold.monthly)
    expect(lines[0].note).toContain(bold.company)
    expect(signSponsor(signed, start.sponsorship.offers[0].id)).toBe(signed)
  })

  it('has the board sign the safest offer when the first round comes', () => {
    const played = playRound(start)
    expect(played.sponsorship.master?.style).toBe('segura')
    expect(played.sponsorship.offers).toEqual([])
  })
})

describe('closing the season', () => {
  const deal = { ...start.sponsorship.offers[0], goal: { kind: 'posicao', position: 4 } as const }
  const result = { division: 1, position: 3, promoted: false, cupFinal: false }
  const ends = { relegated: false, moving: false, nextYear: deal.firstSeason + 1 }

  it('pays the bonus when the goal is met', () => {
    expect(goalMet(deal.goal, result)).toBe(true)
    expect(goalMet(deal.goal, { ...result, position: 5 })).toBe(false)
    expect(goalMet({ kind: 'final-copa' }, { ...result, cupFinal: true })).toBe(true)
    const closed = closeSponsorSeason(only(deal), result, '2027-12-31', ends)
    expect(closed.bonus?.amount).toBe(deal.bonus)
  })

  it('ends the deal after its last season, on relegation or when the manager moves', () => {
    const long = { ...deal, lastSeason: deal.firstSeason + 2 }
    const close = (e: Partial<typeof ends>, master = long) =>
      closeSponsorSeason(only(master), result, '2027-12-31', { ...ends, ...e }).master
    expect(close({})).toBe(long)
    expect(close({}, { ...deal, lastSeason: deal.firstSeason })).toBeUndefined()
    expect(close({ relegated: true })).toBeUndefined()
    expect(close({ moving: true })).toBeUndefined()
  })

  it('brings new offers when the deal runs out', () => {
    let game: GameState = signSponsor(start, start.sponsorship.offers[0].id)
    const master = { ...game.sponsorship.master!, lastSeason: game.season.year }
    game = { ...game, sponsorship: only(master) }
    while (!isSeasonOver(game.season)) game = playRound(game)
    const next = startNextSeason(game)
    expect(next.sponsorship.master).toBeUndefined()
    expect(next.sponsorship.offers.map((o) => o.firstSeason)).toEqual([2028, 2028, 2028])
  })
})

describe('smaller sponsors', () => {
  /** A month gone by with every slot asked for, so offers are sure to come. */
  const asked = (game: GameState, seed = 1) => {
    let next = game
    for (let i = 0; i < 20 && next.sponsorship.secondaryOffers.length < 3; i++) {
      next = secondaryOffers(next, createRng(seed + i))
    }
    return next
  }
  const signed = signSponsor(start, start.sponsorship.offers[0].id)
  const offered = asked(signed)

  it('offers one deal per slot, from companies not already on the kit', () => {
    const offers = offered.sponsorship.secondaryOffers
    expect(offers.map((o) => o.slot).sort()).toEqual(['calcao', 'costas', 'manga'])
    const companies = new Set([signed.sponsorship.master!.company, ...offers.map((o) => o.company)])
    expect(companies.size).toBe(4)
    for (const o of offers) {
      expect(o.monthly).toBeLessThan(signed.sponsorship.master!.monthly)
      expect(o.expires! > offered.today).toBe(true)
    }
  })

  it('pays each signed deal on its own line, next to the master', () => {
    const offer = offered.sponsorship.secondaryOffers[0]
    const taken = signSecondary(offered, offer.id)
    expect(taken.sponsorship.secondary).toEqual([
      expect.objectContaining({ company: offer.company, slot: offer.slot }),
    ])
    expect(taken.sponsorship.secondary[0].expires).toBeUndefined()
    expect(userSponsorTotal(taken)).toBe(signed.sponsorship.master!.monthly + offer.monthly)
    const paid = passDays(taken, addDays(taken.today, 40)).game
    const notes = paid.ledger.filter((e) => e.category === 'patrocinio').map((e) => e.note)
    expect(notes.some((n) => n.includes(offer.company))).toBe(true)
    expect(notes.some((n) => n.includes(signed.sponsorship.master!.company))).toBe(true)
  })

  it('keeps a slot for one sponsor and lets offers be turned down or lapse', () => {
    const offer = offered.sponsorship.secondaryOffers[0]
    const declined = declineSecondary(offered, offer.id)
    expect(declined.sponsorship.secondaryOffers).toHaveLength(2)
    const again = asked(signSecondary(offered, offer.id), 50)
    expect(again.sponsorship.secondaryOffers.some((o) => o.slot === offer.slot)).toBe(false)
    const later = passDays(offered, addDays(offered.today, SPONSOR.offerDays + 1)).game
    expect(later.sponsorship.secondaryOffers.map((o) => o.id)).not.toContain(offer.id)
  })

  it('come on their own over a season', () => {
    let game = signed
    const seen = new Set<string>()
    for (let month = 2; month <= 8; month++) {
      game = passDays(game, dateOf(game.season.year, month, 2)).game
      for (const o of game.sponsorship.secondaryOffers) seen.add(o.id)
    }
    expect(seen.size).toBeGreaterThan(0)
  })

  it('end with the season they run to, on relegation or when the manager moves', () => {
    const offer = offered.sponsorship.secondaryOffers[0]
    const deal = { ...offer, lastSeason: offer.firstSeason + 1 }
    const sponsorship = { ...only(signed.sponsorship.master!), secondary: [deal] }
    const result = { division: 1, position: 10, promoted: false, cupFinal: false }
    const close = (e: { relegated?: boolean; moving?: boolean; nextYear?: number }) =>
      closeSponsorSeason(sponsorship, result, '2027-12-31', {
        relegated: false,
        moving: false,
        nextYear: offer.firstSeason + 1,
        ...e,
      }).secondary
    expect(close({})).toEqual([deal])
    expect(close({ nextYear: offer.firstSeason + 2 })).toEqual([])
    expect(close({ relegated: true })).toEqual([])
    expect(close({ moving: true })).toEqual([])
  })
})
