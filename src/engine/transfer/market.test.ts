import { describe, expect, it } from 'vitest'
import { FREE_AGENT, type GameState, type Player } from '../model/types.ts'
import { createRng } from '../rng.ts'
import { addDays } from '../season/calendar.ts'
import { newGame, playRound } from '../season/season.ts'
import {
  acceptOffer,
  askingPrice,
  bidForPlayer,
  canLeave,
  checkSigning,
  closeContracts,
  dropLapsedOffers,
  listPlayer,
  MARKET,
  marketRound,
  MIN_SHAPE,
  rejectOffer,
  renewalDemand,
  renewContract,
  sellerFloor,
  sellerLeverage,
  signPlayer,
  squadOf,
  toggleFavorite,
  transferPlayer,
  wageDemand,
} from './market.ts'

const start = newGame(5, 'C25')
const user = start.userClubId
const target = squadOf(start.world, 'C38').find((p) => p.position === 'M')!
const fairBid = (game: GameState, player: Player, years = 2) => ({
  fee: askingPrice(game, player),
  wage: wageDemand(game.world, player, user),
  years,
})

/** The start, with a free agent made out of one of C4's spare forwards. */
function withFreeAgent(): { game: GameState; free: Player } {
  const spare = squadOf(start.world, 'C4').filter((p) => p.position === 'A')[0]
  const world = transferPlayer(start.world, spare.id, FREE_AGENT, {
    fee: 0,
    wage: spare.wage,
    contractUntil: 2027,
  })
  return { game: { ...start, world }, free: world.players[spare.id] }
}

describe('haggling over a fee', () => {
  const asking = askingPrice(start, target)
  const floor = sellerFloor(start, target)
  const bidOf = (fee: number) => ({ ...fairBid(start, target), fee })

  it('has the club take less than it asks, but not much less', () => {
    expect(floor).toBeLessThan(asking)
    expect(floor).toBeGreaterThanOrEqual(asking * (1 - MARKET.maxDiscount))
    expect(sellerFloor(start, target)).toBe(floor)
  })

  it('signs at a fee the club would take', () => {
    const reply = bidForPlayer(start, target.id, bidOf(floor))
    expect(reply.outcome).toBe('assinou')
    expect(reply.game.world.players[target.id].clubId).toBe(user)
    expect(reply.game.world.clubs[user].cash).toBe(start.world.clubs[user].cash - floor)
  })

  it('counters a fair bid, and the counter then closes the deal', () => {
    const fee = floor - 10_000
    const reply = bidForPlayer(start, target.id, bidOf(fee))
    expect(reply.outcome).toBe('contraproposta')
    const talk = reply.game.market.talks[target.id]
    expect(talk.ask).toBeGreaterThanOrEqual(floor)
    expect(talk.ask).toBeLessThanOrEqual(asking)
    expect(checkSigning(reply.game, target.id, bidOf(talk.ask)).ok).toBe(true)
    expect(bidForPlayer(reply.game, target.id, bidOf(talk.ask)).outcome).toBe('assinou')
  })

  it('ignores an insulting bid and breaks off after too many', () => {
    const insult = bidForPlayer(start, target.id, bidOf(10_000))
    expect(insult.outcome).toBe('recusou')
    expect(insult.game.market.talks[target.id].ask).toBe(asking)
    const fed = bidForPlayer(insult.game, target.id, bidOf(floor - 10_000))
    expect(fed.outcome).toBe('rompeu')
    expect(checkSigning(fed.game, target.id, bidOf(asking)).ok).toBe(false)
    const later = addDays(fed.game.market.talks[target.id].until, 1)
    expect(dropLapsedOffers(fed.game.market, later).talks).toEqual({})
  })

  it('leaves the game alone when the bid itself is not valid', () => {
    const reply = bidForPlayer(start, target.id, { ...bidOf(floor), wage: 0 })
    expect(reply.outcome).toBe('invalida')
    expect(reply.game).toBe(start)
  })

  it('comes down further for a club in debt', () => {
    const club = start.world.clubs[target.clubId]
    const broke = {
      ...start,
      world: { ...start.world, clubs: { ...start.world.clubs, [club.id]: { ...club, cash: -1 } } },
    }
    expect(sellerLeverage(broke, target).map((l) => l.note)).toContain('O clube está endividado.')
    expect(sellerFloor(broke, target)).toBeLessThan(floor)
  })
})

describe('signing a player', () => {
  it('needs the asking price, the wage he wants and the cash to pay', () => {
    const bid = fairBid(start, target)
    expect(checkSigning(start, target.id, bid).ok).toBe(true)
    expect(checkSigning(start, target.id, { ...bid, fee: bid.fee - 10_000 }).ok).toBe(false)
    expect(checkSigning(start, target.id, { ...bid, wage: bid.wage - 1000 }).ok).toBe(false)
    expect(checkSigning(start, target.id, { ...bid, years: 0 }).ok).toBe(false)
    const broke = {
      ...start,
      world: {
        ...start.world,
        clubs: { ...start.world.clubs, [user]: { ...start.world.clubs[user], cash: 0 } },
      },
    }
    expect(checkSigning(broke, target.id, bid).ok).toBe(false)
  })

  it('moves the player, the money and writes it down', () => {
    const bid = fairBid(start, target, 3)
    const game = signPlayer(start, target.id, bid)
    const player = game.world.players[target.id]
    expect(player).toMatchObject({ clubId: user, wage: bid.wage, contractUntil: 2029 })
    expect(game.world.clubs[user].playerIds).toContain(target.id)
    expect(game.world.clubs.C38.playerIds).not.toContain(target.id)
    expect(game.world.clubs[user].cash).toBe(start.world.clubs[user].cash - bid.fee)
    expect(game.world.clubs.C38.cash).toBe(start.world.clubs.C38.cash + bid.fee)
    expect(game.ledger.at(-1)).toMatchObject({ category: 'compras', amount: -bid.fee })
    expect(game.market.news[0]).toMatchObject({ playerId: target.id, toClubId: user })
  })

  it('asks no fee for a free agent', () => {
    const { game, free } = withFreeAgent()
    expect(askingPrice(game, free)).toBe(0)
    const signed = signPlayer(game, free.id, fairBid(game, free))
    expect(signed.world.clubs[user].cash).toBe(game.world.clubs[user].cash)
    expect(signed.ledger).toEqual(game.ledger)
  })

  it('signs club players only in a transfer window, free agents any day', () => {
    const { game, free } = withFreeAgent()
    const may = { ...game, today: '2027-05-10' }
    const verdict = checkSigning(may, target.id, fairBid(may, target))
    expect(verdict).toMatchObject({ ok: false, reason: expect.stringContaining('Janela') })
    expect(checkSigning(may, free.id, fairBid(may, free)).ok).toBe(true)
    const july = { ...game, today: '2027-07-20' }
    expect(checkSigning(july, target.id, fairBid(july, target)).ok).toBe(true)
  })

  it("draws no bids for the user's players with the window shut", () => {
    const cheap = squadOf(start.world, user)[0]
    let game = listPlayer({ ...start, today: '2027-05-10' }, cheap.id, 10_000)
    for (let round = 0; round < 12; round++) game = marketRound(game, createRng(round))
    expect(game.market.offers).toEqual([])
  })

  it('wants more to step down to a smaller club', () => {
    const clubs = Object.values(start.world.clubs).sort((a, b) => a.reputation - b.reputation)
    const player = squadOf(start.world, clubs[20].id)[0]
    expect(wageDemand(start.world, player, clubs[0].id)).toBeGreaterThan(
      wageDemand(start.world, player, clubs.at(-1)!.id),
    )
  })
})

describe('squad limits', () => {
  it(`won't let a club drop below ${MARKET.minSquad} players or ${MARKET.minKeepers} keepers`, () => {
    let world = start.world
    const squad = squadOf(world, 'C3')
    const keepers = squad.filter((p) => p.position === 'G')
    expect(canLeave(world, keepers[0])).toBe(true)
    for (const keeper of keepers.slice(1)) {
      world = transferPlayer(world, keeper.id, FREE_AGENT, { fee: 0, wage: 0, contractUntil: 2027 })
    }
    expect(canLeave(world, world.players[keepers[0].id])).toBe(false)
    for (const p of squad
      .filter((p) => p.position !== 'G')
      .slice(0, squad.length - MARKET.minSquad)) {
      world = transferPlayer(world, p.id, FREE_AGENT, { fee: 0, wage: 0, contractUntil: 2027 })
    }
    expect(world.clubs.C3.playerIds.length).toBeLessThanOrEqual(MARKET.minSquad)
    expect(canLeave(world, world.players[world.clubs.C3.playerIds[1]])).toBe(false)
  })
})

describe('selling', () => {
  const player = squadOf(start.world, user).find((p) => p.position === 'M')!
  const listed = listPlayer(start, player.id, player.marketValue)

  it('draws bids for listed players, which lapse after a week', () => {
    let game = listed
    let bids = 0
    for (let round = 0; round < 12 && bids === 0; round++) {
      game = marketRound(game, createRng(round))
      bids = game.market.offers.filter((o) => o.playerId === player.id).length
    }
    expect(bids).toBeGreaterThan(0)
    const offer = game.market.offers.find((o) => o.playerId === player.id)!
    expect(offer.fee).toBeGreaterThan(player.marketValue * 0.8)
    expect(offer.askingPrice).toBe(game.market.listed[player.id])
    expect(offer.expires).toBe(addDays(game.today, MARKET.offerDays))
    expect(dropLapsedOffers(game.market, offer.expires).offers).toContain(offer)
    const later = dropLapsedOffers(game.market, addDays(offer.expires, 1))
    expect(later.offers.some((o) => o.id === offer.id)).toBe(false)
  })

  it('sells on accepting a bid and drops it on rejecting', () => {
    const offer = {
      id: 'x',
      playerId: player.id,
      clubId: 'C2',
      fee: 5_000_000,
      date: start.today,
      expires: addDays(start.today, MARKET.offerDays),
    }
    const game = { ...listed, market: { ...listed.market, offers: [offer] } }
    const sold = acceptOffer(game, 'x')
    expect(sold.world.players[player.id].clubId).toBe('C2')
    expect(sold.world.clubs[user].cash).toBe(game.world.clubs[user].cash + 5_000_000)
    expect(sold.market.listed[player.id]).toBeUndefined()
    expect(sold.ledger.at(-1)).toMatchObject({ category: 'vendas', amount: 5_000_000 })
    expect(rejectOffer(game, 'x').market.offers).toEqual([])
  })
})

describe('contracts', () => {
  it('renews for what the player asks', () => {
    const player = squadOf(start.world, user)[0]
    const demand = renewalDemand(start.world, player)
    expect(() => renewContract(start, player.id, demand - 1000, 2)).toThrow()
    const renewed = renewContract(start, player.id, demand, 2)
    expect(renewed.world.players[player.id]).toMatchObject({
      wage: demand,
      contractUntil: Math.max(player.contractUntil, 2027) + 2,
    })
  })

  it("lets the user's expiring players go and refills AI squads", () => {
    const expiring = squadOf(start.world, user).filter((p) => p.contractUntil < 2028)
    expect(expiring.length).toBeGreaterThan(0)
    const closed = closeContracts(start, 2028, createRng(1))
    for (const p of expiring) expect(closed.world.players[p.id].clubId).not.toBe(user)
    for (const club of Object.values(closed.world.clubs)) {
      if (club.id === user) continue
      const squad = squadOf(closed.world, club.id)
      for (const [position, min] of Object.entries(MIN_SHAPE)) {
        expect(
          squad.filter((p) => p.position === position).length,
          club.name,
        ).toBeGreaterThanOrEqual(min)
      }
      for (const p of squad) expect(p.contractUntil, p.name).toBeGreaterThanOrEqual(2028)
    }
  })

  it('keeps the market going through a season of rounds', () => {
    let game = listPlayer(start, squadOf(start.world, user)[3].id, 1_000_000)
    for (let i = 0; i < 6; i++) game = playRound(game)
    // In May the window is shut: no bids, and the ones from January are long gone.
    expect(game.market.offers).toEqual([])
  })
})

describe('favorites', () => {
  it('stars a player and takes the star off again', () => {
    const id = target.id
    const starred = toggleFavorite(start, id)
    expect(starred.favorites).toEqual([id])
    expect(toggleFavorite(starred, id).favorites).toEqual([])
    expect(() => toggleFavorite(start, 'nobody')).toThrow()
  })
})
