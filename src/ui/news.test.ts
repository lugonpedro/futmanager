import { describe, expect, it } from 'vitest'
import type { GameState } from '../engine/model/types.ts'
import { dateOf } from '../engine/season/calendar.ts'
import { advanceToNextGame, newGame, playMatchDay, canPlayRound } from '../engine/season/season.ts'
import { foldNews, lastDayNews, MAX_TOASTS, newsBetween, type News } from './news.ts'

const start = newGame(2027, 'C25')
const userPlayer = (game: GameState) => game.world.clubs[game.userClubId].playerIds[0]
const rival = (game: GameState) =>
  Object.keys(game.world.clubs).find((id) => id !== game.userClubId)!

const withOffer = (game: GameState, id: string, expires = dateOf(2027, 1, 20)): GameState => ({
  ...game,
  market: {
    ...game.market,
    offers: [
      ...game.market.offers,
      {
        id,
        playerId: userPlayer(game),
        clubId: rival(game),
        fee: 2_400_000,
        date: game.today,
        expires,
      },
    ],
  },
})

describe('newsBetween', () => {
  it('is quiet when nothing changed', () => {
    expect(newsBetween(start, start)).toEqual([])
  })

  it('announces a new bid, saying whether the player was up for sale', () => {
    const player = start.world.players[userPlayer(start)]
    const [unlisted] = newsBetween(start, withOffer(start, 'o1'))
    expect(unlisted.text).toContain(player.name)
    expect(unlisted.text).toContain('mesmo sem ele estar à venda')
    expect(unlisted.link?.to).toBe('/jogo/mercado/propostas')

    const listed = { ...start, market: { ...start.market, listed: { [player.id]: 1 } } }
    expect(newsBetween(listed, withOffer(listed, 'o1'))[0].text).toContain('que estava à venda')
  })

  it('does not announce a bid twice', () => {
    const before = withOffer(start, 'o1')
    expect(newsBetween(before, { ...before, today: dateOf(2027, 1, 3) })).toEqual([])
  })

  it('warns about a known bid on its last day', () => {
    const before = withOffer(start, 'o1', dateOf(2027, 1, 5))
    const after = { ...before, today: dateOf(2027, 1, 5) }
    expect(newsBetween(before, after).map((n) => n.text)).toEqual([
      expect.stringContaining('vence hoje'),
    ])
    expect(lastDayNews(after)).toHaveLength(1)
  })

  it('warns when the cash goes negative and when the board loses patience', () => {
    const club = start.world.clubs[start.userClubId]
    const after: GameState = {
      ...start,
      world: { ...start.world, clubs: { ...start.world.clubs, [club.id]: { ...club, cash: -1 } } },
      career: { ...start.career, confidence: 20 },
    }
    expect(newsBetween(start, after).map((n) => n.tone)).toEqual(['warning', 'warning'])
  })

  it('announces the transfer window closing and opening', () => {
    const closed = { ...start, today: dateOf(2027, 2, 1) }
    expect(newsBetween(start, closed)[0].text).toContain('fechou')
    expect(newsBetween(closed, { ...start, today: dateOf(2027, 7, 1) })[0].text).toContain(
      'aberta até',
    )
  })

  it('tells who is out after a match day', () => {
    let game = advanceToNextGame(start, false)
    let news: News[] = []
    // Play until one of the user's players gets hurt or suspended.
    for (let i = 0; i < 20 && news.length === 0; i++) {
      const next = playMatchDay(game)
      news = newsBetween(game, next).filter((n) => n.link?.to === '/jogo/time')
      game = advanceToNextGame(next, false)
    }
    expect(news[0].text).toMatch(/lesionou|suspenso/)
  })

  it('gives the verdict when the season ends', () => {
    let game = start
    let verdict: News | undefined
    while (canPlayRound(game)) {
      const next = playMatchDay(game)
      verdict ??= newsBetween(game, next).find((n) =>
        /Campeão|Acesso|Rebaixado|encerrada/.test(n.text),
      )
      game = next
    }
    expect(verdict).toBeDefined()
  })
})

describe('foldNews', () => {
  const item = (text: string): News => ({ tone: 'info', text })
  it('shows a few as they are and folds the rest into one', () => {
    expect(foldNews([item('a'), item('b')]).folded).toEqual([])
    const many = ['a', 'b', 'c', 'd', 'e'].map(item)
    const { shown, folded } = foldNews(many)
    expect(shown.length + 1).toBe(MAX_TOASTS)
    expect(folded.map((n) => n.text)).toEqual(['c', 'd', 'e'])
  })
})
