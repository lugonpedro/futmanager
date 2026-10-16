import { describe, expect, it } from 'vitest'
import type { GameState } from '../model/types.ts'
import {
  canPlayRound,
  isSeasonOver,
  newGame,
  playRound,
  seasonReview,
  startNextSeason,
} from '../season/season.ts'
import {
  BOARD,
  confidenceAfterMatch,
  confidenceAtClose,
  objectiveText,
  seasonTarget,
  takeJob,
} from './board.ts'

const start = newGame(8, 'C12')

describe('the board', () => {
  it('expects a little less than the club reputation suggests', () => {
    const { world } = start
    const byReputation = [...world.leagues[0].clubIds].sort(
      (a, b) => world.clubs[b].reputation - world.clubs[a].reputation || a.localeCompare(b),
    )
    expect(seasonTarget(world, byReputation[0])).toBe(3)
    expect(seasonTarget(world, byReputation[19])).toBe(16)
    expect(objectiveText(world, byReputation[19], 16)).toBe('Escapar do rebaixamento')
    const serieB = world.leagues[1].clubIds[0]
    expect(objectiveText(world, serieB, 3)).toBe('Conquistar o acesso')
    expect(start.career).toMatchObject({ status: 'empregado', confidence: BOARD.startConfidence })
  })

  it('warms to wins and cools on losses and a poor table', () => {
    const career = { ...start.career, target: 5, confidence: 50 }
    expect(confidenceAfterMatch(career, 2, 0, 5, 1)).toBe(50 + BOARD.win)
    expect(confidenceAfterMatch(career, 0, 2, 5, 1)).toBe(50 + BOARD.loss)
    expect(confidenceAfterMatch(career, 1, 1, 15, 10)).toBeLessThan(50)
    expect(confidenceAtClose(career, 4)).toBe(50 + BOARD.targetMet)
    expect(confidenceAtClose(career, 9)).toBeLessThan(50)
  })

  it('sacks a manager out of credit, who can only go on at a club that calls', () => {
    let game: GameState = start
    while (game.career.status === 'empregado') {
      game = playRound({ ...game, career: { ...game.career, confidence: 1 } })
    }
    expect(canPlayRound(game)).toBe(false)
    expect(game.career.jobOffers).toHaveLength(BOARD.offersWhenFired)
    expect(game.career.history.at(-1)).toMatchObject({ clubId: 'C12', fired: true })
    expect(() => takeJob(game, 'C12')).toThrow()

    const [offer] = game.career.jobOffers
    const hired = takeJob(game, offer)
    expect(hired.userClubId).toBe(offer)
    expect(hired.career).toMatchObject({ status: 'empregado', jobOffers: [] })
    expect(hired.ledger).toEqual([])
    expect(canPlayRound(hired)).toBe(true)
  })

  it('reviews the season and lets the manager move clubs at the close', () => {
    // An easy target keeps the manager in the job through the season, whatever the results.
    let game: GameState = { ...start, career: { ...start.career, target: 20 } }
    while (!isSeasonOver(game.season)) game = playRound(game)
    expect(game.career.status).not.toBe('demitido')
    const sacked = { ...game, career: { ...game.career, target: 1, confidence: 0 } }
    const review = seasonReview(sacked)
    expect(review.fired).toBe(true)
    expect(() => startNextSeason(sacked)).toThrow()
    const next = startNextSeason(sacked, review.offers[0])
    expect(next.userClubId).toBe(review.offers[0])
    expect(next.career.confidence).toBe(BOARD.startConfidence)
    expect(next.career.history).toEqual([
      expect.objectContaining({ year: 2027, clubId: 'C12', position: review.position }),
    ])

    const pleased = { ...game, career: { ...game.career, target: 20, confidence: 80 } }
    const stayed = startNextSeason(pleased)
    expect(stayed.userClubId).toBe('C12')
    expect(stayed.career.confidence).toBeGreaterThanOrEqual(BOARD.newSeasonFloor)
    expect(stayed.career.confidence).toBeLessThanOrEqual(BOARD.newSeasonCeiling)
  })
})
