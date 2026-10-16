import { describe, expect, it } from 'vitest'
import type { MatchResult } from '../model/types.ts'
import { newGame, playMatchDayWithResults } from '../season/season.ts'
import { matchPoints, playerMatches, roundPoints, SCORING, type PlayerMatch } from './scoring.ts'

const line = (patch: Partial<PlayerMatch>): PlayerMatch => ({
  playerId: 'p',
  clubId: 'C1',
  position: 'M',
  minutes: 90,
  rating: SCORING.par,
  goals: 0,
  shotsSaved: 0,
  shotsWide: 0,
  saves: 0,
  conceded: 1,
  yellow: false,
  red: false,
  ...patch,
})

describe('fantasy scoring', () => {
  it('breaks a played round down player by player', () => {
    const { results } = playMatchDayWithResults(newGame(3, 'C1'))
    for (const result of results) {
      const lines = playerMatches(result)
      const ids = [...Object.keys(result.played.home), ...Object.keys(result.played.away)]
      expect(lines.map((l) => l.playerId).sort()).toEqual(ids.sort())
      const goals = (clubId: string) =>
        lines.filter((l) => l.clubId === clubId).reduce((sum, l) => sum + l.goals, 0)
      expect(goals(result.homeId)).toBe(result.homeGoals)
      expect(goals(result.awayId)).toBe(result.awayGoals)
      for (const l of lines) {
        expect(l.minutes).toBeGreaterThanOrEqual(0)
        expect(l.minutes).toBeLessThanOrEqual(90)
        // Whoever was on for the whole match let in every goal of the other side.
        if (l.minutes === 90) {
          expect(l.conceded).toBe(l.clubId === result.homeId ? result.awayGoals : result.homeGoals)
        }
      }
    }
    expect(Object.keys(roundPoints(results)).length).toBeGreaterThan(200)
  })

  it('counts minutes from substitutions and red cards', () => {
    const result = {
      homeId: 'C1',
      awayId: 'C2',
      homeGoals: 1,
      awayGoals: 0,
      events: [
        { minute: 30, type: 'vermelho', clubId: 'C2', playerId: 'b1', text: '' },
        { minute: 50, type: 'gol', clubId: 'C1', playerId: 'a2', text: '' },
        {
          minute: 60,
          type: 'substituicao',
          clubId: 'C1',
          playerId: 'a2',
          otherPlayerId: 'a3',
          text: '',
        },
        { minute: 70, type: 'defesa', clubId: 'C1', playerId: 'a3', text: '' },
      ],
      played: { home: { a1: 'G', a2: 'A', a3: 'A' }, away: { b0: 'G', b1: 'Z' } },
      ratings: { a1: 7, a2: 8, a3: 6, b0: 6, b1: 4 },
    } as unknown as MatchResult
    const by = Object.fromEntries(playerMatches(result).map((l) => [l.playerId, l]))
    expect(by.a2).toMatchObject({ minutes: 60, goals: 1, clubId: 'C1' })
    expect(by.a3).toMatchObject({ minutes: 30, shotsSaved: 1 })
    expect(by.b1).toMatchObject({ minutes: 30, red: true, conceded: 0 })
    expect(by.b0).toMatchObject({ minutes: 90, conceded: 1, saves: 1 })
    expect(by.a1).toMatchObject({ conceded: 0, saves: 0 })
  })

  it('adds the rating to what the player did', () => {
    expect(matchPoints(line({}))).toBe(0)
    expect(matchPoints(line({ rating: SCORING.par + 1 }))).toBe(SCORING.rating)
    // Half a match counts half the rating.
    expect(matchPoints(line({ rating: SCORING.par + 2, minutes: 45 }))).toBe(SCORING.rating)
    expect(matchPoints(line({ position: 'A', goals: 2 }))).toBe(2 * SCORING.goal.A)
    expect(matchPoints(line({ yellow: true }))).toBe(SCORING.yellow)
    // A second yellow is a red, not both.
    expect(matchPoints(line({ yellow: true, red: true }))).toBe(SCORING.red)
    const keeper = line({ position: 'G', conceded: 0, saves: 5 })
    expect(matchPoints(keeper)).toBe(SCORING.cleanSheet.G + 5 * SCORING.save)
    expect(matchPoints({ ...keeper, minutes: 30 })).toBe(5 * SCORING.save)
    expect(matchPoints(line({ position: 'G', conceded: 3 }))).toBe(3 * SCORING.conceded)
  })
})
