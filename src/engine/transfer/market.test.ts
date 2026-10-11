import { describe, expect, it } from 'vitest'
import { FREE_AGENT, type GameState, type Player } from '../model/types.ts'
import { createRng } from '../rng.ts'
import { newGame, playRound } from '../season/season.ts'
import {
  acceptOffer,
  askingPrice,
  canLeave,
  checkSigning,
  closeContracts,
  listPlayer,
  MARKET,
  marketRound,
  MIN_SHAPE,
  rejectOffer,
  renewalDemand,
  renewContract,
  signPlayer,
  squadOf,
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

  it('draws bids for listed players, which lapse after a round', () => {
    let game = listed
    let bids = 0
    for (let round = 0; round < 12 && bids === 0; round++) {
      game = marketRound(game, createRng(round))
      bids = game.market.offers.filter((o) => o.playerId === player.id).length
    }
    expect(bids).toBeGreaterThan(0)
    const offer = game.market.offers.find((o) => o.playerId === player.id)!
    expect(offer.fee).toBeGreaterThan(player.marketValue * 0.8)
    const later = marketRound(
      { ...game, season: { ...game.season, round: game.season.round + 1 } },
      createRng(999),
    )
    expect(later.market.offers.some((o) => o.id === offer.id)).toBe(false)
  })

  it('sells on accepting a bid and drops it on rejecting', () => {
    const offer = { id: 'x', playerId: player.id, clubId: 'C2', fee: 5_000_000, round: 1 }
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
    expect(game.market.offers.every((o) => o.round === game.season.round - 1)).toBe(true)
  })
})
