import { describe, expect, it } from 'vitest'
import { monthlySponsorship } from '../finance/economy.ts'
import { monthsInSeason, wageBill } from '../finance/finance.ts'
import { autoLineup } from '../match/lineup.ts'
import { matchResult, playMinute } from '../match/simulate.ts'
import type { GameState, MatchResult } from '../model/types.ts'
import {
  applyRound,
  clubLineup,
  createRoundMatches,
  isSeasonOver,
  leagueScorers,
  leagueStandings,
  matchInput,
  newGame,
  PROMOTION_SPOTS,
  playRound,
  prizeMoney,
  roundFixtures,
  seasonSummary,
  startNextSeason,
  unavailablePlayers,
  userFixture,
  YELLOWS_FOR_SUSPENSION,
} from './season.ts'

function playSeason(game: GameState): GameState {
  let state = game
  while (!isSeasonOver(state.season)) state = playRound(state)
  return state
}

const start = newGame(2027, 'C25')
const finished = playSeason(start)

describe('a season', () => {
  it('starts at round 1 of 38 with the user club in a fixture', () => {
    expect(start.season).toMatchObject({ year: 2027, round: 1, totalRounds: 38 })
    expect(roundFixtures(start.season)).toHaveLength(20)
    expect(userFixture(start)).toBeDefined()
  })

  it('plays every fixture once and gives each club 38 games', () => {
    expect(isSeasonOver(finished.season)).toBe(true)
    for (const league of finished.world.leagues) {
      const table = leagueStandings(finished, league.id)
      expect(table).toHaveLength(20)
      for (const row of table) expect(row.played).toBe(38)
      const goals = table.reduce((sum, row) => sum + row.goalsFor, 0)
      expect(goals).toBe(table.reduce((sum, row) => sum + row.goalsAgainst, 0))
      const scored = leagueScorers(finished, league.id).reduce((sum, row) => sum + row.goals, 0)
      expect(scored).toBe(goals)
    }
  })

  it('does not change the game it was given', () => {
    expect(start.season.round).toBe(1)
    expect(roundFixtures(start.season).every((f) => !f.result)).toBe(true)
  })

  it('gives the same results whether a round is watched live or simulated', () => {
    const live = createRoundMatches(start)
    for (const { state } of live) while (!state.finished) playMinute(state)
    const watched = applyRound(
      start,
      live.map(({ state }) => matchResult(state)),
    )
    expect(watched.season).toEqual(playRound(start).season)
  })

  it('is reproducible from the seed', () => {
    expect(playSeason(newGame(2027, 'C25')).season).toEqual(finished.season)
  })

  it('lets stronger clubs finish higher on average', () => {
    const table = leagueStandings(finished, 'L1')
    const reputation = (ids: string[]) =>
      ids.reduce((sum, id) => sum + finished.world.clubs[id].reputation, 0) / ids.length
    const ids = table.map((row) => row.clubId)
    expect(reputation(ids.slice(0, 5))).toBeGreaterThan(reputation(ids.slice(-5)))
  })
})

describe('bans and injuries', () => {
  const result = (overrides: Partial<MatchResult>, game = start): MatchResult[] => {
    const results = roundFixtures(game.season).map((fixture): MatchResult => {
      return {
        homeId: fixture.homeId,
        awayId: fixture.awayId,
        homeGoals: 0,
        awayGoals: 0,
        events: [],
        stats: {
          home: {
            goals: 0,
            shots: 0,
            shotsOnTarget: 0,
            possession: 50,
            yellowCards: 0,
            redCards: 0,
          },
          away: {
            goals: 0,
            shots: 0,
            shotsOnTarget: 0,
            possession: 50,
            yellowCards: 0,
            redCards: 0,
          },
        },
        sentOff: [],
        injured: [],
      }
    })
    results[0] = { ...results[0], ...overrides }
    return results
  }
  const [fixture] = roundFixtures(start.season)
  const [first, second] = start.world.clubs[fixture.homeId].playerIds

  it('bans a sent-off player for the next round only', () => {
    const afterRed = applyRound(start, result({ sentOff: [first] }))
    expect(unavailablePlayers(afterRed.season).has(first)).toBe(true)
    const lineup = createRoundMatches(afterRed)
      .flatMap(({ state }) => [...state.home.onPitch, ...state.away.onPitch])
      .map((p) => p.player.id)
    expect(lineup).not.toContain(first)
    const afterBan = playRound(afterRed)
    expect(afterBan.season.suspensions[first]).toBeUndefined()
  })

  it(`bans a player after ${YELLOWS_FOR_SUSPENSION} yellow cards`, () => {
    const yellow = (game: GameState) => {
      const results = result({}, game)
      const index = results.findIndex(
        (r) => r.homeId === fixture.homeId || r.awayId === fixture.homeId,
      )
      results[index] = {
        ...results[index],
        events: [
          { minute: 10, type: 'amarelo', clubId: fixture.homeId, playerId: second, text: '' },
        ],
      }
      return results
    }
    let game = start
    for (let i = 1; i < YELLOWS_FOR_SUSPENSION; i++) {
      game = applyRound(game, yellow(game))
      expect(game.season.suspensions[second]).toBeUndefined()
    }
    game = applyRound(game, yellow(game))
    expect(game.season.suspensions[second]).toBe(1)
    expect(game.season.yellowCards[second]).toBeUndefined()
  })

  it('keeps injured players out for one to five rounds', () => {
    const game = applyRound(start, result({ injured: [first] }))
    expect(game.season.injuries[first]).toBeGreaterThanOrEqual(1)
    expect(game.season.injuries[first]).toBeLessThanOrEqual(5)
  })
})

describe('end of season', () => {
  const summary = seasonSummary(finished)
  const next = startNextSeason(finished)
  const [serieA, serieB] = summary.leagues

  it(`sends the bottom ${PROMOTION_SPOTS} down and the top ${PROMOTION_SPOTS} up`, () => {
    expect(serieA.relegated).toEqual(serieA.table.slice(-PROMOTION_SPOTS))
    expect(serieB.promoted).toEqual(serieB.table.slice(0, PROMOTION_SPOTS))
    expect(serieA.promoted).toEqual([])
    expect(serieB.relegated).toEqual([])
    const [nextA, nextB] = next.world.leagues
    expect(nextA.clubIds).toHaveLength(20)
    expect(nextB.clubIds).toHaveLength(20)
    for (const id of serieB.promoted) {
      expect(nextA.clubIds).toContain(id)
      expect(next.world.clubs[id].division).toBe(1)
    }
    for (const id of serieA.relegated) {
      expect(nextB.clubIds).toContain(id)
      expect(next.world.clubs[id].division).toBe(2)
    }
  })

  it('pays prize money by final position', () => {
    expect(prizeMoney(1, 1, 20)).toBeGreaterThan(prizeMoney(1, 20, 20))
    expect(prizeMoney(1, 20, 20)).toBeGreaterThan(prizeMoney(2, 1, 20) / 4)
    // The user's club makes no deals at the close, so its cash moves by prize and the last wages only.
    const user = finished.world.clubs[finished.userClubId]
    const closingMonths = 12 - monthsInSeason(finished.season.totalRounds)
    expect(next.world.clubs[user.id].cash).toBe(
      user.cash +
        summary.prizes[user.id] +
        closingMonths * (monthlySponsorship(user) - wageBill(finished.world, user)),
    )
    expect(next.history[0].userFinances?.premiacao).toBe(summary.prizes[user.id])
  })

  it('names each division top scorer', () => {
    expect(serieA.topScorer?.goals).toBeGreaterThan(10)
    expect(serieA.topScorer).toEqual(leagueScorers(finished, 'L1')[0])
  })

  it('starts a fresh season with a new calendar', () => {
    expect(next.season).toMatchObject({ year: 2028, round: 1, injuries: {}, suspensions: {} })
    expect(next.world.season).toBe(2028)
    expect(next.history).toEqual([{ ...summary, userFinances: expect.any(Object) }])
    expect(next.ledger).toEqual([])
    expect(roundFixtures(next.season).every((f) => !f.result)).toBe(true)
    const third = playSeason(next)
    expect(leagueStandings(third, 'L1').every((row) => row.played === 38)).toBe(true)
  })
})

describe('lineups', () => {
  const squadOf = (game: GameState) =>
    game.world.clubs[game.userClubId].playerIds.map((id) => game.world.players[id])

  it('plays the user with the lineup they saved', () => {
    const saved = autoLineup(squadOf(start), '5-3-2', 'defensiva')
    const game = { ...start, userLineup: saved }
    const fixture = userFixture(game)!
    const input = matchInput(game, fixture)
    const side = fixture.homeId === game.userClubId ? input.home : input.away
    expect(side.lineup).toEqual(saved)
    expect(clubLineup(game, game.userClubId)).toEqual(saved)
  })

  it('replaces saved starters who are injured', () => {
    const saved = autoLineup(squadOf(start), '4-4-2')
    const hurt = saved.starters[3].playerId
    const game = {
      ...start,
      userLineup: saved,
      season: { ...start.season, injuries: { [hurt]: 2 } },
    }
    const lineup = clubLineup(game, game.userClubId)
    expect(lineup.starters).toHaveLength(11)
    expect(lineup.starters.map((s) => s.playerId)).not.toContain(hurt)
    expect(lineup.bench).not.toContain(hurt)
  })

  it('lets AI clubs pick a full lineup of their own', () => {
    const fixture = userFixture(start)!
    const rival = fixture.homeId === start.userClubId ? fixture.awayId : fixture.homeId
    const lineup = clubLineup(start, rival)
    expect(lineup.starters).toHaveLength(11)
    expect(lineup.posture).toBe('normal')
  })
})
