import { describe, expect, it } from 'vitest'
import { fairTicketPrice } from './finance/economy.ts'
import { wageFor } from './generate/player.ts'
import { addDays } from './season/calendar.ts'
import { newGame, playRound, roundDate, SAVE_VERSION } from './season/season.ts'
import { upgradeGame } from './save.ts'

/** A save as an older version left it in the database: whatever JSON it was. */
const upgradeOld = (saved: unknown) => upgradeGame(saved as Parameters<typeof upgradeGame>[0])

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
    const upgraded = upgradeOld(v1)
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
    const upgraded = upgradeOld({ ...rest, version: 2, season })
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.career.status).toBe('empregado')
    expect(upgraded.season.appearances).toEqual({})
    expect(upgraded.season.cup?.stages[0].ties).toHaveLength(8)
    const late = upgradeOld({ ...rest, version: 2, season: { ...season, round: 20 } })
    expect(late.season.cup).toBeUndefined()
    expect(playRound(upgraded).season.round).toBe(2)
  })

  it('gives a version 3 save dates, from its next round on', () => {
    const { today: _, ...rest } = current
    const undate = <T extends { date: string }>({ date: __, ...item }: T) => item
    const [hurt] = current.world.clubs.C10.playerIds
    const player = current.world.clubs.C10.playerIds[1]
    const v3 = {
      ...rest,
      version: 3,
      season: {
        ...current.season,
        fixtures: Object.fromEntries(
          Object.entries(current.season.fixtures).map(([id, rounds]) => [
            id,
            rounds.map((round) => round.map(undate)),
          ]),
        ),
        cup: {
          ...current.season.cup!,
          stages: current.season.cup!.stages.map((stage) => ({
            ...undate(stage),
            ties: stage.ties.map(undate),
          })),
        },
        injuries: { [hurt]: 2 },
      },
      ledger: [{ round: 1, category: 'vendas', amount: 1, note: '' }],
      market: {
        listed: {},
        offers: [{ id: 'x', playerId: player, clubId: 'C2', fee: 1, round: 1 }],
        news: [
          { season: 2027, round: 1, playerId: player, fromClubId: 'C2', toClubId: 'C10', fee: 1 },
        ],
      },
    }
    const upgraded = upgradeOld(v3)
    const day = roundDate(current.season)!
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.today).toBe(day)
    expect(upgraded.season.fixtures).toEqual(current.season.fixtures)
    expect(upgraded.season.cup).toEqual(current.season.cup)
    expect(upgraded.season.injuries[hurt] > day).toBe(true)
    expect(upgraded.ledger[0].date).toBe(day)
    expect(upgraded.market.offers[0].expires).toBe(addDays(day, 7))
    expect(upgraded.market.news[0].date).toBe(day)
    expect(playRound(upgraded).season.round).toBe(2)
  })
})
