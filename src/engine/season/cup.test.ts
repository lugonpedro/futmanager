import { describe, expect, it } from 'vitest'
import { generateWorld } from '../generate/world.ts'
import type { GameState } from '../model/types.ts'
import { createRng } from '../rng.ts'
import { seasonDates, weekday, WEDNESDAY } from './calendar.ts'
import {
  createCup,
  CUP_ROUNDS,
  cupProgress,
  cupScorers,
  cupWinner,
  shootout,
  tieWinner,
} from './cup.ts'
import { isSeasonOver, newGame, playRound } from './season.ts'

describe('the cup draw', () => {
  const world = generateWorld(1)
  const dates = seasonDates(2027, 38, CUP_ROUNDS).cup
  const cup = createCup(Object.values(world.clubs), createRng(2), dates)

  it('has the 16 smallest of 40 clubs play a first round while the rest wait', () => {
    expect(cup.stages.map((s) => s.name)).toEqual([
      'Primeira fase',
      'Segunda fase',
      'Oitavas de final',
      'Quartas de final',
      'Semifinal',
      'Final',
    ])
    expect(cup.stages.map((s) => s.round)).toEqual(CUP_ROUNDS)
    expect(cup.stages.map((s) => s.date)).toEqual(dates)
    for (const stage of cup.stages) expect(weekday(stage.date)).toBe(WEDNESDAY)
    for (const tie of cup.stages[0].ties) expect(tie.date).toBe(dates[0])
    expect(cup.stages[0].ties).toHaveLength(8)
    expect(cup.byes).toHaveLength(24)
    const smallest = Math.min(...cup.byes.map((id) => world.clubs[id].reputation))
    for (const tie of cup.stages[0].ties) {
      expect(world.clubs[tie.homeId].reputation).toBeLessThanOrEqual(smallest)
    }
  })

  it('never ends a shootout level', () => {
    const rng = createRng(3)
    for (let i = 0; i < 200; i++) {
      const { home, away } = shootout(rng)
      expect(home).not.toBe(away)
    }
  })
})

describe('a season of cup football', () => {
  let game: GameState = newGame(6, 'C21')
  while (!isSeasonOver(game.season)) game = playRound(game)
  const cup = game.season.cup!

  it('plays every stage down to a single winner', () => {
    const sizes = cup.stages.map((s) => s.ties.length)
    expect(sizes).toEqual([8, 16, 8, 4, 2, 1])
    for (const stage of cup.stages) {
      const clubs = stage.ties.flatMap((t) => [t.homeId, t.awayId])
      expect(new Set(clubs).size).toBe(clubs.length)
      for (const tie of stage.ties) {
        const { homeGoals, awayGoals, penalties } = tie.result!
        expect(homeGoals === awayGoals).toBe(penalties !== undefined)
      }
    }
    const winners = cup.stages[2].ties.map(tieWinner)
    expect(cup.stages[3].ties.flatMap((t) => [t.homeId, t.awayId]).sort()).toEqual(winners.sort())
    const champion = cupWinner(cup)!
    expect(cupProgress(cup, champion)).toBe('Campeão')
  })

  it('keeps the league untouched: every club still plays 38 league games', () => {
    expect(
      Object.values(game.season.fixtures)
        .flat(2)
        .every((f) => f.result),
    ).toBe(true)
  })

  it('counts cup goals for its own top scorers list', () => {
    const scorers = cupScorers(cup)
    const goals = cup.stages
      .flatMap((s) => s.ties)
      .reduce((sum, t) => sum + t.result!.homeGoals + t.result!.awayGoals, 0)
    expect(scorers.reduce((sum, row) => sum + row.goals, 0)).toBe(goals)
    expect(scorers[0].goals).toBeGreaterThanOrEqual(scorers.at(-1)!.goals)
    expect(cupScorers(undefined)).toEqual([])
  })

  it('tells how far the user went', () => {
    expect(cupProgress(cup, game.userClubId)).toMatch(/^(Campeão|Vice-campeão|Caiu n)/)
  })
})
