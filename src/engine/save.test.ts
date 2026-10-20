import { describe, expect, it } from 'vitest'
import { fairTicketPrice, monthlySponsorship } from './finance/economy.ts'
import { wageFor } from './generate/player.ts'
import { addDays } from './season/calendar.ts'
import { NO_TRAINING } from './progression/training.ts'
import { newGame, playRound, roundDate, SAVE_VERSION } from './season/season.ts'
import type { World } from './model/types.ts'
import { upgradeGame } from './save.ts'
import { autoLineup } from './match/lineup.ts'

/** A save as an older version left it in the database: whatever JSON it was. */
const upgradeOld = (saved: unknown) => upgradeGame(saved as Parameters<typeof upgradeGame>[0])

/** Players as they were before version 5: a strength and some traits. */
function oldPlayers(world: World) {
  return Object.fromEntries(
    Object.values(world.players).map(
      ({ overall, attributes: _a, secondary: _s, styles: _y, foot: _f, weakFoot: _w, ...p }) => [
        p.id,
        { ...p, strength: overall, traits: overall > 60 ? ['passe', 'cabeceio'] : [] },
      ],
    ),
  )
}

describe('upgradeGame', () => {
  const fresh = newGame(3, 'C10')
  const { fitness: _f, ratings: _r, roundStars: _s, ...v4Season } = fresh.season
  /** The same career as version 4 stored it, the starting point for the older versions. */
  const current = {
    ...fresh,
    world: { ...fresh.world, players: oldPlayers(fresh.world) },
    season: v4Season,
  } as unknown as typeof fresh

  it('leaves a current save alone', () => {
    expect(upgradeGame(fresh)).toBe(fresh)
  })

  it('gives a version 12 save no favorites and the asking price on bids for listed players', () => {
    const [listed, unlisted] = fresh.world.clubs.C10.playerIds
    const offer = (playerId: string) => ({
      id: playerId,
      playerId,
      clubId: 'C2',
      fee: 1_000_000,
      date: fresh.today,
      expires: fresh.today,
    })
    const { favorites: _, ...v12 } = fresh
    const upgraded = upgradeOld({
      ...v12,
      version: 12,
      market: {
        ...fresh.market,
        listed: { [listed]: 900_000 },
        offers: [offer(listed), offer(unlisted)],
      },
    })
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.favorites).toEqual([])
    expect(upgraded.market.offers.map((o) => o.askingPrice)).toEqual([900_000, undefined])
  })

  it('gives the lineup of a version 11 save the roles of its formation', () => {
    const lineup = autoLineup(
      fresh.world.clubs.C10.playerIds.map((id) => fresh.world.players[id]),
      '4-1-4-1',
    )
    const plain = {
      ...lineup,
      starters: lineup.starters.map(({ playerId, position }) => ({ playerId, position })),
    }
    const upgraded = upgradeOld({ ...fresh, version: 11, userLineup: plain })
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.userLineup!.starters.every((slot) => slot.role)).toBe(true)
    expect(upgraded.userLineup!.starters.filter((s) => s.role === 'VOL')).toHaveLength(1)
    expect(upgradeOld({ ...fresh, version: 11 }).userLineup).toBeUndefined()
  })

  it('gives a version 10 save no smaller sponsors', () => {
    const { secondary: _, secondaryOffers: __, ...shirt } = fresh.sponsorship
    const upgraded = upgradeOld({ ...fresh, version: 10, sponsorship: shirt })
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.sponsorship).toEqual(fresh.sponsorship)
  })

  it('turns the individual focus of a version 9 save into plans at the usual intensity', () => {
    const id = fresh.world.clubs.C10.playerIds[0]
    const upgraded = upgradeOld({
      ...fresh,
      version: 9,
      training: { focus: 'tecnico', individual: { [id]: 'passe' } },
    })
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.training).toEqual({
      focus: 'tecnico',
      individual: { [id]: { focus: 'passe', intensity: 'normal' } },
    })
  })

  it('gives a version 8 save balanced training and no loans', () => {
    const { training: _, loans: __, ...v8 } = fresh
    const upgraded = upgradeOld({ ...v8, version: 8 })
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.training).toEqual(NO_TRAINING)
    expect(upgraded.loans).toEqual([])
  })

  it('turns the fixed sponsorship of a version 7 save into a deal to the end of the season', () => {
    const { sponsorship: _, training: __, loans: ___, ...v7 } = fresh
    const upgraded = upgradeOld({ ...v7, version: 7 })
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.sponsorship.offers).toEqual([])
    expect(upgraded.sponsorship.master).toMatchObject({
      monthly: monthlySponsorship(fresh.world.clubs.C10),
      bonus: 0,
      lastSeason: fresh.season.year,
    })
  })

  it('drops the old best XI of a version 6 save, which had no ratings', () => {
    const upgraded = upgradeOld({
      ...fresh,
      version: 6,
      season: { ...fresh.season, roundStars: ['a', 'b'] },
    })
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.season.roundStars).toEqual([])
    expect(upgraded.world).toBe(fresh.world)
  })

  it('marks the names of a version 5 save as generated', () => {
    const { names: _, ...v5 } = fresh
    const upgraded = upgradeOld({ ...v5, version: 5 })
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.names).toEqual({})
    expect(upgraded.world).toBe(fresh.world)
  })

  it('gives a version 4 save attributes that keep each overall at the old strength', () => {
    const upgraded = upgradeOld({ ...current, version: 4 })
    expect(upgraded.version).toBe(SAVE_VERSION)
    expect(upgraded.season).toMatchObject({ fitness: {}, ratings: {}, roundStars: [] })
    const old = oldPlayers(fresh.world)
    for (const player of Object.values(upgraded.world.players)) {
      expect(Math.abs(player.overall - old[player.id].strength)).toBeLessThanOrEqual(1)
      expect(player.potential).toBeGreaterThanOrEqual(player.overall)
      expect(player.attributes.finishing).toBeGreaterThanOrEqual(1)
      if (old[player.id].traits.length > 0) expect(player.styles).toHaveLength(2)
    }
    // The same save always upgrades to the same players.
    expect(upgradeOld({ ...current, version: 4 }).world.players).toEqual(upgraded.world.players)
    expect(playRound(upgraded).season.round).toBe(2)
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
    expect(player.wage).toBe(wageFor(player.overall))
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
