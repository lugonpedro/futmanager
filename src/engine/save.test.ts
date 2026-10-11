import { describe, expect, it } from 'vitest'
import { fairTicketPrice } from './finance/economy.ts'
import { wageFor } from './generate/player.ts'
import { newGame, playRound, SAVE_VERSION } from './season/season.ts'
import { upgradeGame } from './save.ts'

describe('upgradeGame', () => {
  const current = newGame(3, 'C10')

  it('leaves a current save alone', () => {
    expect(upgradeGame(current)).toBe(current)
  })

  it('brings a version 1 save up to date and playable', () => {
    const { version: _, ledger: __, market: ___, ...rest } = current
    const v1 = {
      ...rest,
      world: {
        ...current.world,
        clubs: Object.fromEntries(
          Object.entries(current.world.clubs).map(([id, { ticketPrice: _t, ...club }]) => [
            id,
            { ...club, cash: club.reputation ** 2 * 1000 },
          ]),
        ),
      },
    }
    const upgraded = upgradeGame(v1)
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.ledger).toEqual([])
    expect(upgraded.market).toEqual({ listed: {}, offers: [], news: [] })
    const club = upgraded.world.clubs.C10
    expect(club.ticketPrice).toBe(fairTicketPrice(club.reputation))
    expect(club.cash).toBeGreaterThan(1_000_000)
    const player = upgraded.world.players[club.playerIds[0]]
    expect(player.wage).toBe(wageFor(player.strength))
    expect(playRound(upgraded).season.round).toBe(2)
  })

  it('gives a version 2 save a board, appearances and, early on, the cup', () => {
    const { career: _, ...rest } = current
    const { appearances: __, cup: ___, ...season } = current.season
    const upgraded = upgradeGame({ ...rest, version: 2, season })
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.career.status).toBe('empregado')
    expect(upgraded.season.appearances).toEqual({})
    expect(upgraded.season.cup?.stages[0].ties).toHaveLength(8)
    const late = upgradeGame({ ...rest, version: 2, season: { ...season, round: 20 } })
    expect(late.season.cup).toBeUndefined()
    expect(playRound(upgraded).season.round).toBe(2)
  })
})
