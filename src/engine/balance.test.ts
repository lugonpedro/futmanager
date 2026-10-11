import { describe, expect, it } from 'vitest'
import { MARKET } from './transfer/market.ts'
import { FREE_AGENT, RETIRED, type GameState } from './model/types.ts'
import { isSeasonOver, newGame, playRound, seasonReview, startNextSeason } from './season/season.ts'

/** Several seasons with nobody managing; `npm run balance` runs the long version. */
function run(seasons: number): GameState[] {
  let game = newGame(17, 'C40')
  const closes: GameState[] = []
  for (let s = 0; s < seasons; s++) {
    while (!isSeasonOver(game.season)) {
      if (game.career.status !== 'empregado') {
        game = { ...game, career: { ...game.career, status: 'empregado' } }
      }
      game = playRound(game)
    }
    closes.push(game)
    const review = seasonReview(game)
    game = startNextSeason(game, review.fired ? review.offers[0] : undefined)
  }
  return closes
}

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe('a world left to run for years', () => {
  const closes = run(6)

  it('keeps ages, strength and squads where they started', () => {
    for (const game of closes) {
      const { world } = game
      const active = Object.values(world.players).filter(
        (p) => p.clubId !== FREE_AGENT && p.clubId !== RETIRED,
      )
      const strength = (division: number) =>
        average(
          Object.values(world.clubs)
            .filter((c) => c.division === division)
            .flatMap((c) => c.playerIds.map((id) => world.players[id].strength)),
        )
      expect(average(active.map((p) => p.age))).toBeGreaterThan(24)
      expect(average(active.map((p) => p.age))).toBeLessThan(27.5)
      expect(strength(1)).toBeGreaterThan(62)
      expect(strength(1)).toBeLessThan(72)
      expect(strength(2)).toBeGreaterThan(39)
      expect(strength(2)).toBeLessThan(50)
      for (const club of Object.values(world.clubs)) {
        if (club.id === game.userClubId) continue
        expect(club.playerIds.length, club.name).toBeGreaterThanOrEqual(MARKET.minSquad)
      }
    }
  })

  it('keeps AI clubs out of lasting debt', () => {
    for (const game of closes.slice(2)) {
      const ai = Object.values(game.world.clubs).filter((c) => c.id !== game.userClubId)
      expect(ai.filter((c) => c.cash < 0).length).toBeLessThanOrEqual(3)
    }
  })
})
