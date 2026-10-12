import { describe, expect, it } from 'vitest'
import type { Fixture } from '../model/types.ts'
import { standings, topScorers } from './standings.ts'

let next = 0
function game(
  homeId: string,
  homeGoals: number,
  awayGoals: number,
  awayId: string,
  options: { homeRed?: number; awayYellow?: number; scorers?: [string, string][] } = {},
): Fixture {
  next++
  return {
    id: `F${next}`,
    leagueId: 'L1',
    round: next,
    date: '2027-04-10',
    homeId,
    awayId,
    result: {
      homeGoals,
      awayGoals,
      goals: (options.scorers ?? []).map(([playerId, clubId]) => ({
        playerId,
        clubId,
        minute: 10,
      })),
      cards: {
        home: { yellow: 0, red: options.homeRed ?? 0 },
        away: { yellow: options.awayYellow ?? 0, red: 0 },
      },
    },
  }
}

const order = (clubs: string[], fixtures: Fixture[]) =>
  standings(clubs, fixtures).map((row) => row.clubId)

describe('standings', () => {
  it('counts games, goals and points', () => {
    const [a, b] = standings(['A', 'B'], [game('A', 3, 1, 'B'), game('B', 2, 2, 'A')])
    expect(a).toMatchObject({
      clubId: 'A',
      played: 2,
      wins: 1,
      draws: 1,
      losses: 0,
      goalsFor: 5,
      goalsAgainst: 3,
      goalDifference: 2,
      points: 4,
      form: ['V', 'E'],
    })
    expect(b).toMatchObject({ points: 1, losses: 1, goalDifference: -2 })
  })

  it('ignores fixtures not yet played and lists clubs with no games', () => {
    const unplayed: Fixture = {
      id: 'X',
      leagueId: 'L1',
      round: 1,
      date: '2027-04-10',
      homeId: 'A',
      awayId: 'B',
    }
    expect(standings(['A', 'B'], [unplayed]).map((row) => row.played)).toEqual([0, 0])
  })

  it('breaks a tie on points by wins, then goal difference, then goals scored', () => {
    // A: 1 win 0 draws = 3 pts; B: 0 wins 3 draws = 3 pts.
    expect(
      order(
        ['B', 'A', 'C', 'D'],
        [game('B', 0, 0, 'C'), game('B', 0, 0, 'D'), game('C', 1, 1, 'B'), game('A', 1, 0, 'D')],
      ),
    ).toEqual(['A', 'B', 'C', 'D'])
    // Same points and wins, A has the better goal difference.
    expect(order(['B', 'A', 'C'], [game('A', 3, 0, 'C'), game('B', 1, 0, 'C')])[0]).toBe('A')
    // Same goal difference, B scored more.
    expect(order(['A', 'B', 'C'], [game('A', 1, 0, 'C'), game('B', 3, 2, 'C')])[0]).toBe('B')
  })

  it('then uses head to head between the tied clubs', () => {
    // A and B both finish 3 pts, 1 win, GD 0, 2 goals; B beat A.
    const fixtures = [game('B', 2, 1, 'A'), game('A', 1, 0, 'C'), game('C', 1, 0, 'B')]
    expect(order(['A', 'B', 'C'], fixtures).slice(0, 2)).toEqual(['B', 'A'])
  })

  it('then fewer red cards, then fewer yellow cards', () => {
    const clubs = ['A', 'B', 'C', 'D']
    expect(order(clubs, [game('A', 1, 1, 'C', { homeRed: 1 }), game('B', 1, 1, 'D')])).toEqual([
      'B',
      'C',
      'D',
      'A',
    ])
    expect(order(clubs, [game('C', 1, 1, 'A', { awayYellow: 2 }), game('D', 1, 1, 'B')])).toEqual([
      'B',
      'C',
      'D',
      'A',
    ])
  })

  it('keeps form to the last five results', () => {
    const fixtures = Array.from({ length: 7 }, (_, i) => game('A', i % 2, 0, 'B'))
    // A draws, wins, draws... and the first two drop out.
    expect(standings(['A', 'B'], fixtures)[0].form).toEqual(['E', 'V', 'E', 'V', 'E'])
  })
})

describe('topScorers', () => {
  it('ranks players by goals', () => {
    const scorers = topScorers([
      game('A', 2, 1, 'B', {
        scorers: [
          ['P1', 'A'],
          ['P2', 'A'],
          ['P3', 'B'],
        ],
      }),
      game('B', 0, 1, 'A', { scorers: [['P2', 'A']] }),
    ])
    expect(scorers[0]).toEqual({ playerId: 'P2', clubId: 'A', goals: 2 })
    expect(scorers.map((row) => row.goals)).toEqual([2, 1, 1])
  })
})
